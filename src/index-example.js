import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import versor from 'versor';

// https://codepen.io/jorin/pen/YNajXZ

const SIZE = 960;
const SPHERE = { type: 'Sphere' };
// ms to wait after dragging before auto-rotating
var rotationDelay = 3000
// scale of the globe (not the canvas element)
var scaleFactor = 0.9
// autorotation speed
var degPerSec = 6
// start angles
var angles = { x: -20, y: 40, z: 0}
// colors
var colorWater = '#fff'
var colorLand = '#111'
var colorGraticule = '#ccc'
var colorCountry = '#a00'

var covidCountries;


//
// Handler
//

function enter(country) {
  var country = countryList.find(function(c) {
    return c.id === country.id
  })

  if (!country || !country.name || !covidCountries[country.name]) return

  // console.log(country, covidCountries)
  fetch('https://covid19.mathdro.id/api/countries/' + covidCountries[country.name])
    .then(res => res.json())
    .then(res => {
        const countryText = country && country.name;
        !!countryText ?
            current.text(`${countryText} - Confirmed: ${res.confirmed ? res.confirmed.value : 0}, Recovered: ${res.recovered ? res.recovered.value : 0}, Deaths: ${res.deaths ? res.deaths.value : 0}`) :
            current.text('');
    })
}

function leave(country) {
  current.text('')
}

//
// Variables
//

var current = d3.select('body').append('div').style('height', '10px')
const canvas = d3.select('body').append('canvas')
    .attr('width', 960)
    .attr('height', 960);
var context = canvas.node().getContext('2d')
var water = {type: 'Sphere'}
var projection = d3.geoOrthographic().precision(0.1)
var graticule = d3.geoGraticule10()
var path = d3.geoPath(projection).context(context)
var v0 // Mouse position in Cartesian coordinates at start of drag gesture.
var r0 // Projection rotation as Euler angles at start.
var q0 // Projection rotation as versor at start.
var lastTime = d3.now()
var degPerMs = degPerSec / 1000
var width, height
var land, countries
var countryList
var autorotate, now, diff, roation
var currentCountry
var rotation;

//
// Functions
//

function setAngles() {
  var rotation = projection.rotate()
  rotation[0] = angles.y
  rotation[1] = angles.x
  rotation[2] = angles.z
  projection.rotate(rotation)
}

function scale() {
  width = document.documentElement.clientWidth
  height = document.documentElement.clientHeight
  canvas.attr('width', width).attr('height', height)
  projection
    .scale((scaleFactor * Math.min(width, height)) / 2.1)
    .translate([width / 2, height / 2])
  render()
}

function startRotation(delay) {
  autorotate.restart(rotate, delay || 0)
}

function stopRotation() {
  autorotate.stop()
}

function dragstarted() {
  v0 = versor.cartesian(projection.invert(d3.mouse(this)))
  r0 = projection.rotate()
  q0 = versor(r0)
  stopRotation()
}

function dragged() {
  var v1 = versor.cartesian(projection.rotate(r0).invert(d3.mouse(this)))
  var q1 = versor.multiply(q0, versor.delta(v0, v1))
  var r1 = versor.rotation(q1)
  projection.rotate(r1)
  render()
}

function dragended() {
  startRotation(rotationDelay)
}

// function render() {
//   context.clearRect(0, 0, width, height)
//   addFill(water, colorWater)
//   addStroke(graticule, colorGraticule)
//   addFill(land, colorLand)
//   if (currentCountry) {
//     addFill(currentCountry, colorCountry)
//   }
// }

const render = () => {
    context.clearRect(0, 0, SIZE, SIZE);

    addStroke(SPHERE, '#000');
    addFill(SPHERE, '#2a2a2a');

    addStroke(land, '#000');
    addFill(land, '#737368');

    // addStroke(countries, '#000')

    // addStroke(graticule, colorGraticule)
    // addFill(land, colorLand)

    !!currentCountry && addFill(currentCountry, '#a00');
};

const addFill = (obj, color) => {
    context.beginPath();
    path(obj);
    context.fillStyle = color;
    context.fill();
};

const addStroke = (obj, color) => {
    context.beginPath();
    path(obj);
    context.strokeStyle = color;
    context.lineWidth = .5;
    context.stroke();
};

function rotate(elapsed) {
  now = d3.now()
  diff = now - lastTime
  if (diff < elapsed) {
    rotation = projection.rotate()
    rotation[0] += diff * degPerMs
    projection.rotate(rotation)
    render()
  }
  lastTime = now
}

// https://github.com/d3/d3-polygon
function polygonContains(polygon, point) {
  var n = polygon.length
  var p = polygon[n - 1]
  var x = point[0], y = point[1]
  var x0 = p[0], y0 = p[1]
  var x1, y1
  var inside = false
  for (var i = 0; i < n; ++i) {
    p = polygon[i];
    x1 = p[0];
    y1 = p[1];
    if (((y1 > y) !== (y0 > y)) && (x < (x0 - x1) * (y - y1) / (y0 - y1) + x1)) inside = !inside
    x0 = x1;
    y0 = y1;
  }
  return inside
}

function mousemove() {
  const country = getCountry(this);

  if (!country) {
    if (currentCountry) {
      leave(currentCountry)
      currentCountry = null;
      render();
    }
    return
  }
  if (country === currentCountry) {
    return;
  }

  currentCountry = country;
  render();
  enter(country);
}

const getCountry = event => {
    if (!countries) return null;
    const pos = projection.invert(d3.mouse(event));

    return countries.features.find(f => (
        f.geometry.coordinates.find(c1 => (
            polygonContains(c1, pos) || c1.find(c2 => polygonContains(c2, pos))
        ))
    ))
}

const init = () => {
    d3.json('https://unpkg.com/world-atlas@1/world/110m.json')
    .then(function(world) {
        d3.tsv('https://gist.githubusercontent.com/mbostock/4090846/raw/07e73f3c2d21558489604a0bc434b3a5cf41a867/world-country-names.tsv')
        .then(cList => {
          land = topojson.feature(world, world.objects.land)
          countries = topojson.feature(world, world.objects.countries)
          countryList = cList

          // window.addEventListener('resize', scale)
          // scale()
          autorotate = d3.timer(rotate)
        })
    });

    fetch('https://covid19.mathdro.id/api/countries')
      .then(res => res.json())
      .then(res => {
          covidCountries = res.countries
      });

        canvas
          .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended)
           )
          .on('mousemove', mousemove)
};

init();
