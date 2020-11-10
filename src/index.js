import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import versor from 'versor';
import moment from 'moment';

import './style.scss';

/* Based on https://codepen.io/jorin/pen/YNajXZ */

/* Globals */

const graticule = d3.geoGraticule10();
let land, countries, currentCountry, covidCountryList, countryList, covidCountryCache = {};

/* Canvas */

const $countryName = d3.select('.country-name').text('Country:');
const $countryConfirmed = d3.select('.country-confirmed').text('Confirmed:');;
const $countryRecovered = d3.select('.country-recovered').text('Recovered:');
const $countryDeaths = d3.select('.country-deaths').text('Deaths:');
const $countryLastUpdated = d3.select('.country-last-updated').text('Last Updated:');

const { width, height } = document.querySelector('.canvas-container').getBoundingClientRect();
const canvas = d3.select('.canvas-container').append('canvas')
    .attr('width', width)
    .attr('height', height);

const context = canvas.node().getContext('2d');
const projection = d3.geoOrthographic().precision(0.1);

const path = d3.geoPath()
    .projection(projection)
    .context(context);

/* Render */

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

const scale = () => {
  projection
    .scale((0.9 * Math.min(width, height)) / 2.1)
    .translate([width / 2, height / 2]);
}

const render = () => {
    context.clearRect(0, 0, width, height);

    const sphere = { type: 'Sphere' };

    addStroke(sphere, 'black');
    addFill(sphere, '#2a2a2a');

    addStroke(land, 'black');
    addFill(land, '#737368');

    addStroke(countries, '#2a2a2a');

    addStroke(graticule, '#ccc');

    !!currentCountry && addStroke(currentCountry, 'black');
    !!currentCountry && addFill(currentCountry, 'darkred');
};

/* Rotation */

let now, diff, rotation, lastTime, v0, r0, q0, autorotate = null;
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

const startRotation = delay => {
    if (!autorotate) {
        autorotate = d3.timer(rotate);
    }
    autorotate.restart(rotate, delay || 0);
};

const stopRotation = () => {
    autorotate.stop();
};

/* Drag */

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

/* Hover */

const updateCountryInfo = (countryName = '', countryConfirmed = '', countryRecovered = '', countryDeaths = '', countryLastUpdated = '') => {
    $countryName.text(`Country: ${countryName}`);
    $countryConfirmed.text(`Confirmed: ${countryConfirmed}`);
    $countryRecovered.text(`Recovered: ${countryRecovered}`);
    $countryDeaths.text(`Deaths: ${countryDeaths}`);
    $countryLastUpdated.text(`Last Updated: ${countryLastUpdated}`);
};

function mousemove() {
    if (!countries) return;

    const country = getCountry(this);
    if (country === currentCountry) return;

    if (!country) {
        const shouldRender = currentCountry !== null;

        currentCountry = null;
        updateCountryInfo();
        !!shouldRender && render();
    } else {
        currentCountry = country;
        render();
        enter(country);
    }
}

function enter(country) {
    const enteredCountry = countryList.find(c => parseInt(c.id, 10) === parseInt(country.id, 10));
    const covidCountry = covidCountryList.find(c => parseInt(c.numericCode, 10) === parseInt(country.id, 10));

    if (!enteredCountry || !enteredCountry.name || !covidCountry.name) return;

    const getValue = key => !!key.value ? key.value.toLocaleString() : 0;

    if (!!covidCountryCache[covidCountry.alpha2Code]) {
        const { confirmed, recovered, deaths, lastUpdate } = covidCountryCache[covidCountry.alpha2Code];
        updateCountryInfo(enteredCountry.name, getValue(confirmed) || 0, getValue(recovered) || 0, getValue(deaths) || 0, !!moment(lastUpdate).isValid() ? moment(lastUpdate).format('LLLL') : '');
        return;
    }

    fetch('https://covid19.mathdro.id/api/countries/' + covidCountry.alpha2Code)
        .then(res => res.json())
        .then(({ confirmed = {}, recovered = {}, deaths = {}, lastUpdate = '' }) => {
            covidCountryCache[covidCountry.alpha2Code] = { confirmed, recovered, deaths, lastUpdate };

            updateCountryInfo(enteredCountry.name, getValue(confirmed) || 0, getValue(recovered) || 0, getValue(deaths) || 0, moment(lastUpdate).isValid() ? moment(lastUpdate).format('LLLL') : '');
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

                  scale();
                  render();
                  startRotation();

                  canvas
                    .call(d3.drag()
                      .on('start', dragstarted)
                      .on('drag', dragged)
                     )
                    .on('mousemove', mousemove);
              });
        })
        .catch(err => console.error(err));

    fetch('https://restcountries.eu/rest/v2/all')
        .then(res => res.json())
        .then(res => covidCountryList = res);
};

init();
