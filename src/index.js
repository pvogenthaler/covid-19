import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import versor from 'versor';

// Based on https://codepen.io/jorin/pen/YNajXZ

const SIZE = 960;
const SPHERE = { type: 'Sphere' };
let land, countries, currentCountry, covidCountries, countryList;

const current = d3.select('body').append('div').style('height', '10px');
const canvas = d3.select('body').append('canvas')
    .attr('width', SIZE)
    .attr('height', SIZE);

const context = canvas.node().getContext('2d');
const projection = d3.geoOrthographic().precision(0.1);

const path = d3.geoPath()
    .projection(projection)
    .context(context);

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

const render = () => {
    context.clearRect(0, 0, SIZE, SIZE);

    addStroke(SPHERE, '#000');
    addFill(SPHERE, '#2a2a2a');

    addStroke(land, '#000');
    addFill(land, '#737368');

    // This breaks drag
    // addStroke(countries, '#000')

    !!currentCountry && addFill(currentCountry, '#a00');
};

/* Handle Drag and Rotation */

let now, diff, rotation, lastTime, rotationDelay, v0, r0, q0;
const degPerMs = 6 / 1000;

const rotate = elapsed => {
    now = d3.now();
    diff = now - lastTime;
    if (diff < elapsed) {
        rotation = projection.rotate();
        rotation[0] += diff * degPerMs;
        projection.rotate(rotation);
        render();
    }
    lastTime = now;
};

const autorotate = d3.timer(rotate);

const startRotation = delay => {
    autorotate.restart(rotate, delay || 0);
};

const stopRotation = () => {
    autorotate.stop();
};

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
    render();
}

const dragended = () => {
  // startRotation(rotationDelay);
};

/* Handle Hover */

function mousemove() {
    if (!countries) return;

    const country = getCountry(this);
    if (country === currentCountry) return;

    if (!country) {
        currentCountry = null;
        current.text('');
        render();
    } else {
        currentCountry = country;
        render();
        enter(country);
    }
}

function enter(country) {
  const enteredCountry = countryList.find(c => parseInt(c.id, 10) === parseInt(country.id, 10));
  const covidCountry = covidCountries.find(c => parseInt(c.numericCode, 10) === parseInt(country.id, 10));

  if (!enteredCountry || !enteredCountry.name || !covidCountry.name) return;

  fetch('https://covid19.mathdro.id/api/countries/' + covidCountry.alpha2Code)
    .then(res => res.json())
    .then(res => {
        const countryText = !!enteredCountry && enteredCountry.name;
        !!countryText ?
            current.text(`${countryText} - Confirmed: ${res.confirmed ? res.confirmed.value : 0}, Recovered: ${res.recovered ? res.recovered.value : 0}, Deaths: ${res.deaths ? res.deaths.value : 0}`) :
            current.text('');
    });
}

const getCountry = event => {
    const pos = projection.invert(d3.mouse(event));

    return countries.features.find(f => (
        f.geometry.coordinates.find(c1 => (
            polygonContains(c1, pos) || c1.find(c2 => polygonContains(c2, pos))
        ))
    ));
}

// https://github.com/d3/d3-polygon
function polygonContains(polygon, point) {
  var n = polygon.length;
  var p = polygon[n - 1];
  var x = point[0], y = point[1];
  var x0 = p[0], y0 = p[1];
  var x1, y1;
  var inside = false;
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


/* Init */

const init = () => {
    d3.json('https://unpkg.com/world-atlas@1/world/110m.json')
        .then(world => {
            d3.tsv('https://gist.githubusercontent.com/mbostock/4090846/raw/07e73f3c2d21558489604a0bc434b3a5cf41a867/world-country-names.tsv')
                .then(cList => {
                  land = topojson.feature(world, world.objects.land);
                  countries = topojson.feature(world, world.objects.countries);
                  countryList = cList;

                  render();
              })
        })
        .catch(err => console.error(err));

        canvas
          .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended)
           )
          .on('mousemove', mousemove);

    fetch('https://restcountries.eu/rest/v2/all')
        .then(res => res.json())
        .then(res => covidCountries = res);
};

init();
