/* One event, in one place.
   ------------------------------------------------------------------
   The tool this replaces put each dataset on its own page, thirteen of them,
   reached from a long menu. Here an event is one workspace, and it is ordered
   the way it is read: what was measured, then what the Weather Service wrote,
   then what city and federal records hold afterwards, then the source records
   themselves. The Weather Service's own account opens the page, because it is
   the source's description of the event and not this project's summary of it.

   Nothing leads off the page except a link back to the query that found it. */

// var, not const: every script shares one global scope, and two top-level
// const declarations of the same name are a syntax error that kills the page.
var HH = window.HH;
let META = null, EVENT = null;

function el(tag, attrs, text) {
  const n = document.createElement(tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  });
  if (text !== undefined) n.textContent = text;
  return n;
}

/* Draw one section, and let it fail alone.

   Without this, a browser with WebGL turned off threw inside the radar map and
   took the evidence table, the storm track and the page navigation down with
   it. The reader saw empty headings, which on this site of all sites reads as
   "nothing was recorded" rather than "the page broke". */
function safely(name, fn) {
  try {
    fn();
  } catch (err) {
    console.error(name, err);
    HH.showScriptError(name + ': ' + (err && err.message ? err.message : err));
  }
}

/* A map is the one thing here that can fail for reasons outside the data:
   no WebGL, a blocked tile host, a browser with hardware acceleration off.
   Every map says what happened and leaves its table in place. */
function withMap(container, build) {
  if (typeof maplibregl === 'undefined') {
    return mapUnavailable(container, 'The map library did not load.');
  }
  try {
    return build();
  } catch (err) {
    return mapUnavailable(container,
      'This browser could not open a map. ' +
      (String(err).indexOf('WebGL') > -1
        ? 'Maps here need WebGL, which is turned off or unavailable.'
        : String(err && err.message ? err.message : err)));
  }
}

function mapUnavailable(container, why) {
  const box = el('div', { class: 'empty' });
  box.appendChild(el('h3', null, 'No map here'));
  box.appendChild(el('p', null, why + ' Everything the map would show is in the ' +
    'table below it.'));
  container.innerHTML = '';
  container.appendChild(box);
  return null;
}

function stat(label, measure, opts) {
  const row = el('div', { class: 'stat' });
  const dt = el('dt', null, label);
  const dd = el('dd');
  dd.appendChild(HH.value(measure, opts));
  row.append(dt, dd);
  return row;
}

function windowText(sourceKey) {
  const w = (META.windows || {})[sourceKey];
  return w ? 'Counted over ' + w.label : '';
}

/* ---- Time ----------------------------------------------------------
   Event times are published in local New York time. Radar frames are named in
   UTC. The offset is worked out from the United States daylight saving rule in
   force since 2007, and stated on the page, rather than trusting the reader's
   own clock, which may be anywhere. */

function nyOffsetHours(date) {
  const y = date.getUTCFullYear();
  const secondSundayMarch = nthSunday(y, 2, 2);
  const firstSundayNovember = nthSunday(y, 10, 1);
  const t = date.getTime();
  return (t >= secondSundayMarch && t < firstSundayNovember) ? 4 : 5;
}

function nthSunday(year, monthIndex, n) {
  const d = new Date(Date.UTC(year, monthIndex, 1, 2));
  let count = 0;
  while (true) {
    if (d.getUTCDay() === 0) { count++; if (count === n) return d.getTime(); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function localToUtc(iso) {
  const naive = new Date(iso.replace(' ', 'T') + 'Z');
  return new Date(naive.getTime() + nyOffsetHours(naive) * 3600000);
}

function utcStamp(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) +
    p(d.getUTCHours()) + p(Math.floor(d.getUTCMinutes() / 5) * 5);
}

/* ---- Head ---------------------------------------------------------- */

function renderHead() {
  const head = document.getElementById('head');
  head.innerHTML = '';

  const back = el('a', { class: 'back', href: HH.url.backLink() }, '← Back to the results');
  const name = EVENT.name ||
    (EVENT.hazards.map(h => META.hazards[h].label).join(', ') + ', ' +
     HH.date(EVENT.begin));
  const title = el('h1', null, name);
  // Most events are unnamed, and a browser tab reading "Event" for nine hundred
  // of them makes a second open tab useless.
  document.title = name + ' | NYC Hazard Historian';

  const meta = el('div', { class: 'event-meta' });
  meta.appendChild(el('span', { class: 'event-date' },
    HH.dateTime(EVENT.begin) + ' to ' + HH.dateTime(EVENT.end) + ' local time'));
  meta.appendChild(el('span', null, HH.duration(EVENT.begin, EVENT.end)));
  meta.appendChild(HH.hazardList(EVENT.hazards, META));
  const places = EVENT.places.map(p => META.boroughs[p].name);
  if (EVENT.harbor) places.push('New York Harbor');
  meta.appendChild(el('span', null, places.length ? places.join(', ') : 'Location not stated'));
  meta.appendChild(el('span', { class: 'event-date' },
    (EVENT.evidence || []).length + ' Weather Service record' +
    ((EVENT.evidence || []).length === 1 ? '' : 's')));

  head.append(back, title, meta);

  if (EVENT.merged) {
    const note = el('p', { class: 'notice' });
    note.textContent = 'Two Weather Service episodes, joined here by hand as ' +
      'one storm. The join is declared in this project\'s configuration. Every ' +
      'other event on this site is a single episode.';
    head.appendChild(note);
  }
  if (EVENT.year < 1996) {
    const note = el('p', { class: 'notice' });
    note.textContent = 'Before 1996 the Weather Service recorded tornado, hail ' +
      'and wind only. Anything else in this period is absent from the record ' +
      'rather than absent from the weather.';
    head.appendChild(note);
  }
}

/* The source's own account of the event, as the opening paragraph of the page.

   It is not this project's writing and it is not a summary of the measures
   below it, so it carries a citation and nothing else. */
function renderNarrative() {
  const holder = document.getElementById('narrative');
  holder.innerHTML = '';
  if (!EVENT.narrative) {
    holder.appendChild(el('p', { class: 'val-absent', 'data-status': 'missing' },
      'The Weather Service wrote no narrative for this event.'));
    return;
  }

  const box = el('div', { class: 'narrative' });
  // The source separates paragraphs with a double pipe, not a blank line.
  EVENT.narrative.split(/\|\||\n{2,}/)
    .map(p => p.trim()).filter(Boolean)
    .forEach(p => box.appendChild(el('p', null, p)));

  // Reproduced exactly, including the characters NOAA lost before publishing
  // it. A replacement character in the middle of a word is what the file says.
  box.appendChild(el('p', { class: 'attribution' },
    'National Weather Service, Storm Events Database. The account covers the ' +
    'whole forecast area, which is wider than the city.'));
  holder.appendChild(box);
}

/* ---- Panels -------------------------------------------------------- */

function renderImpact() {
  const holder = document.getElementById('impact');
  holder.innerHTML = '';

  const human = el('section', { class: 'panel' });
  human.appendChild(el('h3', null, 'People'));
  const dl = el('dl', { style: 'margin:0' });
  dl.appendChild(stat('Deaths, direct', EVENT.deaths_direct));
  dl.appendChild(stat('Deaths, indirect', EVENT.deaths_indirect));
  dl.appendChild(stat('Injuries, direct', EVENT.injuries_direct));
  human.appendChild(dl);
  human.appendChild(el('p', { class: 'val-note' },
    'Direct and indirect are different measures and are never added together.'));
  human.appendChild(HH.grain('ncei-storm-events', META));

  const money = el('section', { class: 'panel' });
  money.appendChild(el('h3', null, 'Damage'));
  const dl2 = el('dl', { style: 'margin:0' });
  dl2.appendChild(stat('Property, as published', EVENT.damage_property, { full: true }));
  dl2.appendChild(stat('Property, in ' + META.cpi.base_year + ' dollars',
    EVENT.damage_property_real, { full: true }));
  dl2.appendChild(stat('Crops, as published', EVENT.damage_crops, { full: true }));
  money.appendChild(dl2);
  money.appendChild(el('p', { class: 'val-note' },
    'A Weather Service estimate, summed over this event\'s records. Adjusted ' +
    'with the Bureau of Labor Statistics index for the New York area, series ' +
    META.cpi.series + ': the national index would understate a New York loss.'));
  money.appendChild(HH.grain(['ncei-storm-events', 'bls-cpi'], META));

  const weather = el('section', { class: 'panel' });
  weather.appendChild(el('h3', null, 'Conditions'));
  const dl3 = el('dl', { style: 'margin:0' });
  const w = EVENT.weather || {};
  dl3.appendChild(stat('Highest temperature', w.temp_max, { digits: 0 }));
  dl3.appendChild(stat('Lowest temperature', w.temp_min, { digits: 0 }));
  dl3.appendChild(stat('Rainfall, station total', w.rain_total, { digits: 2 }));
  dl3.appendChild(stat('Snowfall, station total', w.snow_total, { digits: 1 }));
  dl3.appendChild(stat('Fastest two-minute wind', w.wind_2min, { digits: 0 }));
  weather.appendChild(dl3);
  const stations = (w._stations || []).map(s => META.stations.weather[s].name);
  weather.appendChild(el('p', { class: 'val-note' }, stations.length
    ? 'Reporting: ' + stations.join(', ') + '. A high or a low is the most ' +
      'extreme single daily reading at one station, not a citywide average, ' +
      'and a total is summed at one station rather than across them. The wind ' +
      'is a two-minute mean, the fastest figure these stations publish, and ' +
      'not a gust.'
    : 'No station reported during this window.'));
  weather.appendChild(HH.grain('ghcn-daily', META));

  holder.append(human, money, weather);
}

function renderConsequences() {
  const holder = document.getElementById('consequences');
  holder.innerHTML = '';
  const cons = EVENT.consequences || {};

  const cards = [
    ['no-heat', 'No heat or hot water', 'nyc-311',
     'Resident-reported complaints. They measure reporting as much as impact: a ' +
     'block that calls 311 more will appear to suffer more.'],
    ['flooding', 'Street and sewer flooding', 'nyc-311',
     'Complaints routed to the water and sewer system, not a measurement of ' +
     'flooding.'],
    ['trees', 'Tree emergencies', 'nyc-311',
     'Tree conditions reported to 311 during the event and just after it.'],
    ['collisions', 'Vehicle collisions', 'nyc-collisions',
     'Collisions reported to the police, timestamped when they happened.']
  ];

  cards.forEach(([key, label, source, note]) => {
    const c = cons[key];
    if (!c) return;
    const panel = el('section', { class: 'panel' });
    panel.appendChild(el('h3', null, label));
    const dl = el('dl', { style: 'margin:0' });
    dl.appendChild(stat('Total', c.total));
    if (key === 'collisions') {
      dl.appendChild(stat('People injured', c.injured));
      dl.appendChild(stat('People killed', c.killed));
    }
    if (c.by_borough) {
      META.borough_order.forEach(b => {
        if (c.by_borough[b]) dl.appendChild(stat(META.boroughs[b].name, c.by_borough[b]));
      });
    }
    panel.appendChild(dl);
    if (c.series && c.series.length > 1 && c.total && c.total.s === 'ok' && c.total.v > 0) {
      panel.appendChild(sparkline(c.series, label));
    }
    panel.appendChild(el('p', { class: 'val-note' }, note));
    panel.appendChild(HH.grain(source, META, windowText(source)));
    holder.appendChild(panel);
  });

  // What is missing from the record as a whole is a property of the record, not
  // of this event, and it is set out on the method page. Repeating four
  // paragraphs of it under every one of nine hundred events made the absence
  // look like a finding about the storm.
  const pointer = el('p', { class: 'val-note', style: 'margin-top:1rem' });
  pointer.appendChild(document.createTextNode(
    'School attendance, power outages, sanitation operations and pre-2020 ' +
    'subway ridership are not published at a grain this record can use, for ' +
    'any event. '));
  pointer.appendChild(el('a', { href: 'method.html#not-here' },
    'What is not here, and why'));
  pointer.appendChild(document.createTextNode('.'));
  holder.parentNode.appendChild(pointer);
}

function renderAssistance() {
  const holder = document.getElementById('assistance');
  const scopeLine = document.getElementById('assistance-scope');
  holder.innerHTML = '';
  const a = EVENT.assistance || {};

  /* The sentence that governs this whole section. Public and housing
     assistance are obligated against a declared disaster. A declaration can
     cover a season, and one of them here covers fourteen events, each of which
     would otherwise print the same total as though it were its own. */
  const covered = (EVENT.disasters || []).reduce(
    (n, d) => Math.max(n, d.events_covered || 1), 1);
  scopeLine.textContent = !(EVENT.disasters || []).length
    ? 'No federal disaster was declared for this event, so there is no public ' +
      'or housing assistance to report. Flood insurance claims are joined by ' +
      'date of loss and can still exist.'
    : 'These figures belong to the declaration, not to the storm. They are the ' +
      'amounts obligated under the declarations below for New York City' +
      (covered > 1
        ? ', and the same totals appear on the ' + (covered - 1) + ' other ' +
          'event' + (covered > 2 ? 's' : '') + ' this project matched to them.'
        : '.');

  if (EVENT.disasters && EVENT.disasters.length) {
    const decl = el('section', { class: 'panel panel-wide' });
    decl.appendChild(el('h3', null, 'Declarations matched to this event'));
    const table = el('table');
    const thead = el('thead');
    thead.innerHTML = '<tr><th scope="col">Number</th><th scope="col">Title</th>' +
      '<th scope="col">Type</th><th scope="col">Declared</th>' +
      '<th scope="col">Incident period</th>' +
      '<th scope="col" class="num">Events here</th></tr>';
    const tbody = el('tbody');
    EVENT.disasters.forEach(d => {
      const tr = el('tr');
      tr.append(el('td', { 'data-label': 'Number' }, 'DR-' + d.number),
        el('td', { 'data-label': 'Title' }, d.title || ''),
        el('td', { 'data-label': 'Type' }, d.type || ''),
        el('td', { 'data-label': 'Declared' }, HH.date(d.declared)),
        el('td', { 'data-label': 'Incident period' },
          HH.date(d.incident[0]) + ' to ' + HH.date(d.incident[1])),
        el('td', { 'data-label': 'Events here', class: 'num' },
          String(d.events_covered || 1)));
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    const wrap = el('div', { class: 'table-wrap' });
    wrap.appendChild(table);
    decl.appendChild(wrap);
    HH.scrollable(wrap, 'Federal declarations matched to this event');
    decl.appendChild(el('p', { class: 'val-note' },
      'Matched on overlapping incident period, weather incident types only. ' +
      '"Events here" is the number of events in this archive the same ' +
      'declaration was matched to.'));
    decl.appendChild(HH.grain('fema-declarations', META));
    holder.appendChild(decl);
  }

  const pa = el('section', { class: 'panel' });
  pa.appendChild(el('h3', null, 'Public assistance'));
  const dl = el('dl', { style: 'margin:0' });
  dl.appendChild(stat('Federal share obligated', a.pa, { full: true }));
  dl.appendChild(stat('In ' + META.cpi.base_year + ' dollars', a.pa_real, { full: true }));
  if (a.pa_projects) dl.appendChild(stat('Project worksheets', a.pa_projects));
  pa.appendChild(dl);
  if (a.pa_by_category) {
    const list = el('dl', { style: 'margin:.5rem 0 0' });
    Object.entries(a.pa_by_category).slice(0, 6).forEach(([cat, v]) => {
      list.appendChild(stat(cat, { v: v, s: 'ok', u: '$' }, { full: true }));
    });
    pa.appendChild(el('h4', { style: 'margin-top:.9rem' }, 'By damage category'));
    pa.appendChild(list);
  }
  pa.appendChild(el('p', { class: 'val-note' },
    'Obligated to the declaration for New York City counties, not spent, and ' +
    'not a measure of loss. Obligations continue for years: this total is true ' +
    'as at ' + HH.date(META.built, { long: true }) + ' and will grow.'));
  pa.appendChild(HH.grain('fema-pa', META));

  const ia = el('section', { class: 'panel' });
  ia.appendChild(el('h3', null, 'Housing assistance'));
  const dl2 = el('dl', { style: 'margin:0' });
  dl2.appendChild(stat('Approved under the declaration', a.ia, { full: true }));
  dl2.appendChild(stat('In ' + META.cpi.base_year + ' dollars', a.ia_real, { full: true }));
  ia.appendChild(dl2);
  ia.appendChild(el('p', { class: 'val-note' },
    'Individuals and Households Program amounts approved for New York City ZIP ' +
    'codes. Owners and renters are separate programmes covering separate ' +
    'populations; this is their sum, and it is a declaration total.'));
  ia.appendChild(HH.grain(['fema-ia-owners', 'fema-ia-renters'], META));

  const nf = el('section', { class: 'panel' });
  nf.appendChild(el('h3', null, 'Flood insurance claims'));
  const dl3 = el('dl', { style: 'margin:0' });
  dl3.appendChild(stat('Paid on claims', (a.nfip || {}).paid, { full: true }));
  dl3.appendChild(stat('In ' + META.cpi.base_year + ' dollars', a.nfip_real, { full: true }));
  dl3.appendChild(stat('Claims', (a.nfip || {}).claims));
  if (a.nfip && a.nfip.by_borough) {
    META.borough_order.forEach(b => {
      if (a.nfip.by_borough[b]) {
        dl3.appendChild(stat(META.boroughs[b].name, a.nfip.by_borough[b], { full: true }));
      }
    });
  }
  nf.appendChild(dl3);
  nf.appendChild(el('p', { class: 'val-note' },
    'Unlike the two panels beside it, this one is joined to the event itself: ' +
    'a claim carries a date of loss, so claims exist for events that were ' +
    'never declared.'));
  nf.appendChild(HH.grain('fema-nfip', META, windowText('fema-nfip')));

  holder.append(pa, ia, nf);
}

/* ---- Water --------------------------------------------------------- */

function renderTide() {
  const section = document.getElementById('tide-section');
  const holder = document.getElementById('tide');
  const t = EVENT.tide;
  if (!t) {
    // No coastal question was asked of this event, so there is nothing to show
    // and no gap to explain. The comparison page still states the reason in its
    // cell, where a blank would be read as a zero.
    section.hidden = true;
    return;
  }
  if (t.status !== 'ok') {
    section.hidden = false;
    holder.innerHTML = '';
    holder.appendChild(el('p', { class: 'val-absent', 'data-status': 'missing' },
      'The gauge published no reading for this window.'));
    return;
  }
  section.hidden = false;
  holder.innerHTML = '';

  const panel = el('section', { class: 'panel panel-wide' });
  const dl = el('dl', { style: 'margin:0 0 1rem' });
  dl.appendChild(stat('Peak water level',
    { v: t.peak_level.v, s: 'ok', u: 'ft ' + t.datum,
      n: 'at ' + HH.dateTime(t.peak_level.t) + ' UTC' },
    { digits: 2 }));
  if (t.peak_surge) {
    dl.appendChild(stat('Peak surge, derived here',
      { v: t.peak_surge.v, s: 'ok', u: 'ft',
        n: 'observed level minus predicted tide, not a published measurement' },
      { digits: 2 }));
  }
  panel.appendChild(dl);
  panel.appendChild(tideChart(t));
  panel.appendChild(el('p', { class: 'val-note' },
    'Read at ' + t.station_name + ', station ' + t.station + ', on the ' +
    t.datum + ' datum, at ' + t.interval + ' intervals, in UTC.'));
  panel.appendChild(HH.grain('coops', META));
  holder.appendChild(panel);
}

function tideChart(t) {
  const W = 720, H = 210, L = 40, R = 10, TOP = 10, B = 26;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('tabindex', '0');

  const svgEl = (name, attrs) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    return n;
  };

  const obs = t.series.filter(p => p.o !== null);
  const values = obs.map(p => p.o).concat(t.series.filter(p => p.p !== null).map(p => p.p));
  const lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
  const x = i => L + (i / Math.max(1, obs.length - 1)) * (W - L - R);
  const y = v => H - B - ((v - lo) / Math.max(0.1, hi - lo)) * (H - B - TOP);

  const path = (key, color, dash) => {
    const d = obs.map((p, i) => (p[key] === null || p[key] === undefined) ? null
      : (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(p[key]).toFixed(1))
      .filter(Boolean).join(' ');
    const n = svgEl('path', { d: d.replace(/^L/, 'M'), fill: 'none',
      stroke: color, 'stroke-width': '1.8' });
    if (dash) n.setAttribute('stroke-dasharray', '4 3');
    return n;
  };

  // Value axis: three labeled gridlines, with the unit named once.
  [lo, (lo + hi) / 2, hi].forEach(v => {
    svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: y(v), y2: y(v),
      stroke: '#d8dde4' }));
    const label = svgEl('text', { x: L - 6, y: y(v) + 4, 'font-size': '11',
      fill: '#5c636e', 'text-anchor': 'end' });
    label.textContent = v.toFixed(1);
    svg.appendChild(label);
  });
  const unit = svgEl('text', { x: 0, y: 10, 'font-size': '10', fill: '#5c636e' });
  unit.textContent = 'ft ' + t.datum;
  svg.appendChild(unit);

  svg.appendChild(path('p', '#757e8a', true));
  svg.appendChild(path('o', '#1d4f77', false));

  // Time axis: the chart used to carry no time at all, so a peak could be read
  // off it without knowing when it happened.
  const stampText = s => s.slice(5, 16).replace(' ', ' ');
  [0, Math.floor(obs.length / 2), obs.length - 1].forEach((i, n) => {
    if (!obs[i]) return;
    const label = svgEl('text', {
      x: x(i), y: H - 8, 'font-size': '11', fill: '#5c636e',
      'text-anchor': n === 0 ? 'start' : (n === 2 ? 'end' : 'middle') });
    label.textContent = stampText(obs[i].t);
    svg.appendChild(label);
  });

  // The peak, marked, because it is the number in the panel above.
  const peakIndex = obs.reduce((best, p, i) => p.o > obs[best].o ? i : best, 0);
  svg.appendChild(svgEl('circle', { cx: x(peakIndex), cy: y(obs[peakIndex].o),
    r: 3.5, fill: '#1d4f77', stroke: '#fff', 'stroke-width': '1.5' }));

  const cursor = svgEl('line', { x1: 0, x2: 0, y1: TOP, y2: H - B,
    stroke: '#1d4f77', 'stroke-width': '1', opacity: '0' });
  svg.appendChild(cursor);

  const first = obs[0], last = obs[obs.length - 1];
  svg.setAttribute('aria-label',
    'Water level at ' + t.station_name + ' from ' + first.t + ' to ' + last.t +
    ' UTC. The observed level runs between ' + lo.toFixed(1) + ' and ' +
    hi.toFixed(1) + ' feet ' + t.datum + ', peaking at ' + t.peak_level.v +
    ' feet at ' + t.peak_level.t + '. The predicted tide is shown as a dashed ' +
    'line. Every reading is in the table below this chart.');

  const wrap = el('div');
  wrap.appendChild(svg);

  const legend = el('div', { class: 'chart-legend' });
  legend.innerHTML = '<span><i style="background:#1d4f77"></i>Observed level</span>' +
    '<span><i style="background:#757e8a"></i>Predicted tide</span>' +
    '<span><i style="background:#1d4f77; border-radius:50%"></i>Peak</span>';
  wrap.appendChild(legend);

  // Inspection: the reading under the pointer, in words, under the chart. It
  // is a line of text rather than a floating tooltip so that it is reachable
  // from a keyboard and readable at a large zoom.
  const readout = el('p', { class: 'chart-readout' },
    'Peak ' + obs[peakIndex].o.toFixed(2) + ' ft at ' + obs[peakIndex].t + ' UTC.');
  wrap.appendChild(readout);

  const show = i => {
    const p = obs[i];
    if (!p) return;
    cursor.setAttribute('x1', x(i)); cursor.setAttribute('x2', x(i));
    cursor.setAttribute('opacity', '.5');
    readout.textContent = p.t + ' UTC: observed ' + p.o.toFixed(2) + ' ft' +
      (p.p === null || p.p === undefined ? '' :
        ', predicted ' + p.p.toFixed(2) + ' ft, difference ' +
        (p.o - p.p).toFixed(2) + ' ft');
  };
  const fromEvent = ev => {
    const box = svg.getBoundingClientRect();
    const at = ((ev.clientX - box.left) / box.width) * W;
    return Math.round(((at - L) / (W - L - R)) * (obs.length - 1));
  };
  svg.addEventListener('mousemove', ev => show(fromEvent(ev)));
  svg.addEventListener('mouseleave', () => {
    cursor.setAttribute('opacity', '0');
    readout.textContent = 'Peak ' + obs[peakIndex].o.toFixed(2) + ' ft at ' +
      obs[peakIndex].t + ' UTC.';
  });
  let at = peakIndex;
  svg.addEventListener('keydown', ev => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    at = Math.max(0, Math.min(obs.length - 1, at + (ev.key === 'ArrowRight' ? 1 : -1)));
    show(at);
  });
  svg.addEventListener('focus', () => show(at));

  // The table is under every chart, open. A reader who cannot use the picture
  // should not have to find a control first.
  const tw = el('div', { class: 'table-wrap', style: 'margin-top:1rem; max-height:16rem; overflow:auto' });
  const table = el('table');
  table.innerHTML = '<thead><tr><th scope="col">Time, UTC</th>' +
    '<th scope="col" class="num">Observed, ft</th>' +
    '<th scope="col" class="num">Predicted, ft</th></tr></thead>';
  const tbody = el('tbody');
  obs.forEach(p => {
    const tr = el('tr');
    tr.append(el('td', null, p.t),
      el('td', { class: 'num' }, p.o === null ? '' : p.o.toFixed(2)),
      el('td', { class: 'num' }, p.p === null || p.p === undefined ? '' : p.p.toFixed(2)));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tw.appendChild(table);
  wrap.appendChild(tw);
  HH.scrollable(tw, 'Water level readings');
  return wrap;
}

function sparkline(series, label) {
  const W = 320, H = 60;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('style', 'height:60px; margin-top:.5rem');
  svg.setAttribute('role', 'img');
  const max = Math.max.apply(null, series.map(p => p.n)) || 1;
  const bw = W / series.length;
  // Room is reserved above the bars for the scale label and below them for the
  // dates, so a tall bar cannot print through either.
  const TOP = 14, BOTTOM = 13, PLOT = H - TOP - BOTTOM;
  series.forEach((p, i) => {
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', (i * bw + 1).toFixed(1));
    r.setAttribute('width', Math.max(1, bw - 2).toFixed(1));
    r.setAttribute('y', (H - BOTTOM - (p.n / max) * PLOT).toFixed(1));
    r.setAttribute('height', ((p.n / max) * PLOT).toFixed(1));
    r.setAttribute('fill', '#1d4f77');
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = HH.date(p.d) + ': ' + p.n;
    r.appendChild(title);
    svg.appendChild(r);
  });
  // A bar chart with no scale and no dates is decoration. These are the two
  // labels that make it readable at a glance.
  const day = (d, anchor, at) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    n.setAttribute('x', at); n.setAttribute('y', H - 2);
    n.setAttribute('font-size', '10'); n.setAttribute('fill', '#5c636e');
    n.setAttribute('text-anchor', anchor);
    n.textContent = d;
    return n;
  };
  svg.appendChild(day(HH.date(series[0].d), 'start', 1));
  if (series.length > 1) {
    svg.appendChild(day(HH.date(series[series.length - 1].d), 'end', W - 1));
  }
  const peak = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  peak.setAttribute('x', W - 1); peak.setAttribute('y', 10);
  peak.setAttribute('font-size', '10'); peak.setAttribute('fill', '#5c636e');
  peak.setAttribute('text-anchor', 'end');
  peak.textContent = 'peak ' + HH.num(max) + ' a day';
  svg.appendChild(peak);

  svg.setAttribute('aria-label', label + ' by day: ' +
    series.map(p => HH.date(p.d) + ', ' + p.n).join('; ') + '.');
  return svg;
}

/* ---- Radar ---------------------------------------------------------- */

function renderRadar() {
  const holder = document.getElementById('radar');
  const cfg = META.radar;

  const start = localToUtc(EVENT.begin);
  const end = localToUtc(EVENT.end);
  const product = cfg.products.find(p => EVENT.begin >= p.from) ||
    cfg.products[cfg.products.length - 1];

  if (EVENT.begin < cfg.products[cfg.products.length - 1].from) {
    holder.innerHTML = '';
    holder.appendChild(el('p', { class: 'val-absent', 'data-status': 'na' },
      'The radar archive does not reach ' + EVENT.year + '. It begins in ' +
      cfg.products[cfg.products.length - 1].from.slice(0, 4) + '.'));
    return;
  }

  // Fit the frames to the event: five minutes for a short storm, a coarser step
  // for a long one, so a two-week drought does not ask for four thousand tiles.
  const span = Math.max(3600000, end - start);
  let step = cfg.step_minutes * 60000;
  while (span / step > cfg.max_frames) step += cfg.step_minutes * 60000;
  const frames = [];
  for (let t = start.getTime(); t <= end.getTime() && frames.length < cfg.max_frames; t += step) {
    frames.push(new Date(t));
  }
  if (!frames.length) frames.push(start);

  holder.innerHTML = '';
  const trouble = el('p', { class: 'notice', role: 'status' });
  trouble.hidden = true;
  holder.appendChild(trouble);

  const mapEl = el('div', {
    class: 'map', id: 'radar-map', role: 'application',
    'aria-label': 'Radar reflectivity over New York City during this event, ' +
      'as an interactive map'
  });
  holder.appendChild(mapEl);

  const controls = el('div', { class: 'map-controls' });
  const play = el('button', { class: 'btn btn-quiet btn-small', type: 'button',
    'aria-label': 'Play the radar loop' }, 'Play');
  const slider = el('input', { type: 'range', min: '0', max: String(frames.length - 1),
    value: '0', id: 'radar-time', 'aria-label': 'Radar frame' });
  const time = el('span', { class: 'map-time', id: 'radar-stamp' });
  const opacityLabel = el('label', { for: 'radar-opacity',
    style: 'display:inline; font-size:.82rem; margin:0' }, 'Opacity');
  const opacity = el('input', { type: 'range', min: '20', max: '100', value: '75',
    id: 'radar-opacity', style: 'max-width:7rem' });
  controls.append(play, slider, time, opacityLabel, opacity);
  holder.appendChild(controls);

  const note = el('p', { class: 'val-note' },
    product.label + ', national composite, ' + frames.length + ' frames at ' +
    (step / 60000) + ' minute steps, in UTC. The composite blends every radar ' +
    'in the network, so it is not one station\'s view of the city. Tiles are ' +
    'read live from the archive as you scrub, and are not stored here.');
  holder.appendChild(note);
  holder.appendChild(HH.grain('iem-radar', META));

  const tileUrl = t => cfg.template
    .replace('{layer}', product.layer.replace('{ts}', utcStamp(t)));

  const map = withMap(mapEl, () => new maplibregl.Map({
    container: "radar-map",
    style: {
      version: 8,
      sources: {
        base: {
          type: 'raster', tileSize: 256,
          tiles: [META.basemap.tiles.replace('{s}', 'a').replace('{r}', '')],
          attribution: META.basemap.attribution
        },
        radar: { type: 'raster', tileSize: 256, tiles: [tileUrl(frames[0])],
          attribution: cfg.attribution }
      },
      layers: [
        { id: 'base', type: 'raster', source: 'base' },
        { id: 'radar', type: 'raster', source: 'radar',
          paint: { 'raster-opacity': 0.75 } }
      ]
    },
    center: META.basemap.center,
    zoom: META.basemap.zoom,
    attributionControl: { compact: true }
  }));
  if (!map) {
    // The controls would drive a map that does not exist. The frame list and
    // the source note above still stand on their own.
    controls.remove();
    return;
  }

  /* The radar layer is the one thing on this site fetched live at read time,
     from someone else's archive, and it can simply not answer. Without this,
     the failure looks like clear weather over the city, which is the worst
     possible way for this particular site to be wrong.

     One tile over the city is loaded directly rather than waiting for the map
     to report, because a raster tile that 404s or times out inside MapLibre is
     a console message and an empty layer, not an event this page can rely on.
     What the probe cannot tell is whether the archive holds an image for this
     particular minute: the server answers 200 with a transparent tile either
     way. So the notice says the archive is not answering, which is the thing
     that was actually established. */
  const cityTile = url => {
    const z = 8, n = Math.pow(2, z);
    const lon = META.basemap.center[0], lat = META.basemap.center[1] * Math.PI / 180;
    const x = Math.floor((lon + 180) / 360 * n);
    const y = Math.floor((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * n);
    return url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  };
  const probe = new Image();
  probe.onerror = () => {
    trouble.hidden = false;
    trouble.textContent = 'The radar archive is not answering. The ' +
      'reflectivity layer is missing, not empty.';
    HH.announce('The radar archive is not answering. The reflectivity layer ' +
      'is missing, not empty.');
  };
  probe.src = cityTile(tileUrl(frames[0]));

  map.on('error', ev => {
    if (!ev || ev.sourceId !== 'base' || !trouble.hidden) return;
    trouble.hidden = false;
    trouble.textContent = 'The basemap is not answering. The map is blank ' +
      'behind the radar layer.';
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }));
  map.keyboard.enable();

  let i = 0, timer = null;
  const show = n => {
    i = Math.max(0, Math.min(frames.length - 1, n));
    slider.value = String(i);
    time.textContent = frames[i].toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    const src = map.getSource('radar');
    if (src && src.setTiles) src.setTiles([tileUrl(frames[i])]);
  };
  map.on('load', () => show(0));
  slider.addEventListener('input', () => show(Number(slider.value)));
  opacity.addEventListener('input', () => {
    map.setPaintProperty('radar', 'raster-opacity', Number(opacity.value) / 100);
  });
  const stop = () => {
    window.clearInterval(timer); timer = null;
    play.textContent = 'Play';
    play.setAttribute('aria-label', 'Play the radar loop');
  };
  play.addEventListener('click', () => {
    if (timer) return stop();
    // Respect a stated preference for less motion by not autoplaying at all,
    // and by stepping slowly when asked directly.
    const slow = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    play.textContent = 'Pause';
    play.setAttribute('aria-label', 'Pause the radar loop');
    timer = window.setInterval(() => {
      if (i >= frames.length - 1) { show(0); } else { show(i + 1); }
    }, slow ? 1400 : 500);
  });
}

function renderTrack() {
  const section = document.getElementById('track-section');
  if (!EVENT.tracks || !EVENT.tracks.length) { section.hidden = true; return; }
  section.hidden = false;
  const holder = document.getElementById('track');
  holder.innerHTML = '';
  const names = EVENT.tracks.map(t => t.name + ' (' + t.id + ')').join(', ');
  const mapEl = el('div', {
    class: 'map map-small', id: 'track-map', role: 'application',
    'aria-label': 'Best track of ' + names + ', as an interactive map'
  });
  holder.appendChild(mapEl);

  holder.appendChild(el('p', { class: 'val-note' },
    'Best track for ' + names + '. A best track is a reanalysis published ' +
    'after the season, not what was observed at the time, and the whole track ' +
    'is drawn, most of it far from New York.'));
  holder.appendChild(HH.grain('hurdat2', META));

  const features = EVENT.tracks.map(t => ({
    type: 'Feature',
    properties: { name: t.name },
    geometry: { type: 'LineString', coordinates: t.points.map(p => [p.lon, p.lat]) }
  }));
  const points = EVENT.tracks.flatMap(t => t.points.map(p => ({
    type: 'Feature',
    properties: { wind: p.wind || 0, status: p.status, t: p.t },
    geometry: { type: 'Point', coordinates: [p.lon, p.lat] }
  })));

  const map = withMap(mapEl, () => new maplibregl.Map({
    container: 'track-map',
    style: {
      version: 8,
      sources: {
        base: { type: 'raster', tileSize: 256,
          tiles: [META.basemap.tiles.replace('{s}', 'a').replace('{r}', '')],
          attribution: META.basemap.attribution },
        line: { type: 'geojson', data: { type: 'FeatureCollection', features: features } },
        pts: { type: 'geojson', data: { type: 'FeatureCollection', features: points } }
      },
      layers: [
        { id: 'base', type: 'raster', source: 'base' },
        { id: 'line', type: 'line', source: 'line',
          paint: { 'line-color': '#8f4415', 'line-width': 2.5 } },
        { id: 'pts', type: 'circle', source: 'pts',
          paint: {
            'circle-radius': 4,
            'circle-color': ['interpolate', ['linear'], ['get', 'wind'],
              0, '#9fb3c8', 34, '#5b8db8', 64, '#c07a3a', 96, '#8f4415'],
            'circle-stroke-color': '#fff', 'circle-stroke-width': 1
          } }
      ]
    },
    center: META.basemap.center, zoom: 4.2,
    attributionControl: { compact: true }
  }));
  if (!map) { appendTrackTable(holder); return; }
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('load', () => {
    const coords = features.flatMap(f => f.geometry.coordinates);
    if (coords.length) {
      const b = coords.reduce((acc, c) => [
        Math.min(acc[0], c[0]), Math.min(acc[1], c[1]),
        Math.max(acc[2], c[0]), Math.max(acc[3], c[1])
      ], [180, 90, -180, -90]);
      map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, duration: 0 });
    }
  });
  map.on('click', 'pts', e => {
    const p = e.features[0].properties;
    new maplibregl.Popup().setLngLat(e.lngLat)
      .setHTML('<strong>' + p.t + ' UTC</strong><br>' + p.status +
        (p.wind ? ', ' + p.wind + ' kt' : ''))
      .addTo(map);
  });

  appendTrackTable(holder);
}

// The same track as a table, since a map alone excludes anyone not using one,
// and it is the only view left when a browser cannot open a map at all.
function appendTrackTable(holder) {
  const tw = el('div', { class: 'table-wrap', style: 'margin-top:1rem; max-height:16rem; overflow:auto' });
  const table = el('table');
  table.innerHTML = '<thead><tr><th scope="col">Time, UTC</th><th scope="col">Status</th>' +
    '<th scope="col" class="num">Wind, kt</th><th scope="col" class="num">Latitude</th>' +
    '<th scope="col" class="num">Longitude</th></tr></thead>';
  const tbody = el('tbody');
  EVENT.tracks.forEach(t => t.points.forEach(p => {
    const tr = el('tr');
    tr.append(el('td', null, p.t), el('td', null, p.status),
      el('td', { class: 'num' }, p.wind === null ? '' : String(p.wind)),
      el('td', { class: 'num' }, String(p.lat)), el('td', { class: 'num' }, String(p.lon)));
    tbody.appendChild(tr);
  }));
  table.appendChild(tbody);
  tw.appendChild(table);
  holder.appendChild(tw);
  HH.scrollable(tw, 'Best track positions');
}

/* ---- Evidence -------------------------------------------------------- */

function renderEvidence() {
  const holder = document.getElementById('evidence');
  holder.innerHTML = '';
  const table = el('table', { class: 'stack' });
  table.appendChild(el('caption', null,
    'Every National Weather Service record inside this event. One row is one ' +
    'hazard type in one place over one window, which is the grain the source ' +
    'publishes.'));
  const thead = el('thead');
  thead.innerHTML = '<tr><th scope="col">Record</th><th scope="col">Hazard</th>' +
    '<th scope="col">Place</th><th scope="col">Window</th>' +
    '<th scope="col" class="num">Deaths</th><th scope="col" class="num">Injuries</th>' +
    '<th scope="col" class="num">Damage</th><th scope="col">Reported by</th></tr>';
  const tbody = el('tbody');

  (EVENT.evidence || []).forEach(r => {
    const tr = el('tr');
    tr.appendChild(el('td', { 'data-label': 'Record', class: 'primary' }, r.event_row_id));
    const hz = el('td', { 'data-label': 'Hazard' });
    hz.appendChild(HH.hazardTag(r.hazard, META));
    hz.appendChild(el('span', { class: 'val-note' }, r.ncei_type));
    tr.appendChild(hz);
    tr.appendChild(el('td', { 'data-label': 'Place' },
      r.place === 'HARBOR' ? 'New York Harbor' : (META.boroughs[r.place] || {}).name || r.place));
    tr.appendChild(el('td', { 'data-label': 'Window' },
      HH.dateTime(r.begin) + ' to ' + HH.dateTime(r.end)));
    [['Deaths', r.deaths_direct, {}], ['Injuries', r.injuries_direct, {}],
     ['Damage', r.damage_property, { full: true }]].forEach(([label, m, o]) => {
      const td = el('td', { 'data-label': label, class: 'num' });
      td.appendChild(HH.value(m, o));
      tr.appendChild(td);
    });
    tr.appendChild(el('td', { 'data-label': 'Reported by' }, r.report_source || 'Not stated'));
    tbody.appendChild(tr);

    if (r.event_narrative || r.note) {
      const nr = el('tr');
      const td = el('td', { colspan: '8', style: 'color:var(--ink-soft); font-size:.86rem' });
      if (r.note) {
        td.appendChild(el('span', { class: 'flag' }, r.note));
        td.appendChild(document.createTextNode(' '));
      }
      td.appendChild(document.createTextNode(r.event_narrative || ''));
      nr.appendChild(td);
      tbody.appendChild(nr);
    }
  });
  table.append(thead, tbody);
  const wrap = el('div', { class: 'table-wrap stack-wrap' });
  wrap.appendChild(table);
  holder.appendChild(wrap);
  HH.scrollable(wrap, 'Weather Service records inside this event');

  const ids = el('p', { class: 'val-note' });
  ids.textContent = 'This event is ' + EVENT.event_id + ' here, and Weather ' +
    'Service episode ' + EVENT.episodes.join(', ') + ' at the source.' +
    (EVENT.episode_declared ? '' :
      ' The source published no episode identifier for these records, which is ' +
      'normal before 1996, so each record stands as its own event.');
  holder.appendChild(ids);
}

/* ---- Boot ------------------------------------------------------------ */

HH.start(function (meta) {
  META = meta;
  const id = new URLSearchParams(window.location.search).get('id');
  const main = document.getElementById('main-content');
  if (!id) {
    HH.fail(main, new Error('No event was named in the address.'), 'This page');
    return;
  }
  // Two arguments rather than .then().catch(): a failure to fetch the event and
  // a failure while drawing it need different answers, and a single catch
  // reports a rendering bug as "no event with that identifier", which sends
  // whoever is debugging it to the wrong place entirely.
  const hideLoading = () => {
    const l = document.getElementById('loading');
    if (l) l.remove();
  };
  HH.event(id).then(event => {
    EVENT = event;
    hideLoading();
    document.getElementById('body').hidden = false;
    // Each section draws on its own. One that fails must not empty the others,
    // because an empty heading on this site reads as "nothing was recorded".
    safely('the heading', renderHead);
    safely('the impact panels', renderImpact);
    safely('the narrative', renderNarrative);
    safely('the consequences', renderConsequences);
    safely('the water level', renderTide);
    safely('the federal assistance', renderAssistance);
    safely('the radar', renderRadar);
    safely('the storm track', renderTrack);
    safely('the evidence table', renderEvidence);
    safely('the page navigation', () => HH.buildRail('rail-list'));
    document.getElementById('copy').addEventListener('click', function () { HH.copyLink(this); });
    HH.announce((EVENT.name || 'Event') + ' loaded.');
  }, err => {
    hideLoading();
    const box = el('div', { class: 'empty' });
    box.appendChild(el('h3', null, 'No event with that identifier'));
    box.appendChild(el('p', null,
      'The address asked for ' + id + ', and the site has no record under that ' +
      'identifier. Identifiers change if the underlying Weather Service ' +
      'episode is reprocessed.'));
    const actions = el('div', { class: 'suggestions' });
    actions.appendChild(el('a', { class: 'btn btn-small', href: 'explore.html' },
      'Search the record instead'));
    box.appendChild(actions);
    main.appendChild(box);
  });
});
