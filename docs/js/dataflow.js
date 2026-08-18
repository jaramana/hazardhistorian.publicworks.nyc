/* Data flow page.
   ------------------------------------------------------------------
   The FLOW block below is the whole content of the diagram. Editing it is how
   this page changes: nothing about a source, stage or rule is written into the
   markup. It mirrors the CONFIG block in tools/make_dataflow_diagram.py, which
   generates the static SVG for the README.

   Live counts come from data/meta.json, so the page cannot drift from the build
   the way a hand-written figure does. */

const FLOW = {
  sources: [
    { name: 'NOAA Storm Events', grain: 'Event type, place, window',
      span: '1950 to present, all types from 1996',
      href: 'https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/',
      role: 'The spine of the archive. Every event begins as a row here.' },
    { name: 'GHCN Daily', grain: 'Station, day',
      span: 'Central Park from 1869',
      href: 'https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/',
      role: 'Temperature, rain, snow and wind gust, from four city stations.' },
    { name: 'NOAA CO-OPS', grain: 'Station, six minutes',
      span: 'The Battery from 1920',
      href: 'https://api.tidesandcurrents.noaa.gov/',
      role: 'Observed and predicted water level. Storm surge is the difference.' },
    { name: 'IEM Radar', grain: 'Radar tile, five minutes',
      span: 'N0R from the 1990s, N0Q from 2011',
      href: 'https://mesonet.agron.iastate.edu/',
      role: 'Composite reflectivity tiles.', bypass: true },
    { name: 'HURDAT2', grain: 'Storm, six hours',
      span: '1851 to 2025',
      href: 'https://www.nhc.noaa.gov/data/',
      role: 'Best-track positions for named tropical systems.' },
    { name: 'OpenFEMA', grain: 'Project, claim, disaster',
      span: 'PA from 1998, NFIP from 1978',
      href: 'https://www.fema.gov/about/openfema/data-sets',
      role: 'Public assistance, individual assistance and flood-insurance claims.' },
    { name: 'NYC Open Data', grain: 'Service request, collision',
      span: '311 from 2004, collisions from July 2012',
      href: 'https://data.cityofnewyork.us/',
      role: 'What the city logged while the weather was happening.' },
    { name: 'BLS CPI-U', grain: 'Month',
      span: 'New York area, 1953 to present',
      href: 'https://www.bls.gov/cpi/',
      role: 'The index behind every adjusted dollar on the site.' }
  ],

  stages: [
    {
      id: '01', name: 'fetch',
      summary: 'Downloads each source and checks that what arrived is what the next stage needs.',
      rule: 'A moved file and an outage both answer with HTTP 200 and an HTML error page.',
      detail: [
        { h: 'The check that matters',
          p: 'A naive fetch writes an HTML error page to disk and hands it on as if it were data. Every response is checked against the shape the next stage expects, so a failure stops here rather than becoming a wrong number later.' },
        { h: 'Names are read, never constructed',
          p: 'NOAA file names carry a processing stamp that changes when a year is reprocessed. The stage reads the directory listing and removes the stale copy of a reprocessed year, rather than guessing at a filename. HURDAT2, reissued every season, is found the same way.' },
        { h: 'Versions are part of the identity',
          p: 'OpenFEMA carries a dataset version in the path. NfipClaims v3 is used here because v2 is deprecated from 15 October 2026. A sudden 404 from FEMA is a version change until proven otherwise.' }
      ]
    },
    {
      id: '02', name: 'normalize',
      summary: 'Produces the canonical tables the rest of the build reads.',
      rule: 'Join on codes, never on names.',
      tables: [
        ['event_rows', 'One NOAA event: one hazard type, one place, one window'],
        ['events', 'One weather system: the site’s unit of exploration'],
        ['weather', 'One station, day, measure'],
        ['tracks', 'One storm, six-hour best-track position']
      ],
      detail: [
        { h: 'Why codes and not names',
          p: 'NOAA writes the same marine zone as both NEW YORK HARBOR and New York Harbor in different years. A join on names would silently drop half the record, and silently is the problem: the build would still finish.' },
        { h: 'An event is an episode',
          p: 'The Weather Service groups rows into an episode, which is one weather system, and that is what an event means here. Merging episodes automatically by time overlap was tried and rejected: 982 events at zero tolerance, 614 at six hours, far too sensitive a hinge for the primary unit of the site.' },
        { h: 'So merges are declared by hand',
          p: 'Sandy is the case that forces it: the Weather Service filed it as two episodes, a coastal flood and a high wind, that plainly belong to one storm. It is merged by episode id in EVENT_MERGES, and any merged event says so at the top of its page. There are very few of them.' },
        { h: 'Where the city is',
          p: 'The source files a location as either a county or a forecast zone, depending on event type. Counties alone would lose most winter, heat and wind events. Twelve codes in all. The zone scheme also changed partway through: Queens later split in two, so borough is the only grain that is honest across the whole record.' }
      ]
    },
    {
      id: '03', name: 'enrich',
      summary: 'Attaches 311 counts, collisions, water levels and federal assistance to events that can have them.',
      rule: 'The only stage that returns to the network after the event list exists, and the slow one.',
      detail: [
        { h: 'Not applicable is the common case',
          p: 'Collision records begin in July 2012 and 311 records in 2004, against an event record that begins in 1958. Most events in this archive cannot have most consequences, and that is recorded as not applicable, which is a different fact from a missing value and a very different fact from a zero.' }
      ],
      subs: [
        {
          name: '311 service requests',
          note: 'Eight datasets, three complaint families, one applicability gate.',
          steps: [
            ['Stitch eight datasets', 'The record is split across eight Socrata datasets, one per year for 2004–2009, then 2010–2019 and 2020 onward. Each event’s window selects the dataset that covers it.'],
            ['Match on complaint text', 'complaint_type is the only key 311 offers, and the wording moves between the splits. So each family lists every spelling seen rather than one value: "HEAT/HOT WATER", "HEATING" and "HEAT" are all the same family.'],
            ['Three families', 'No heat or hot water; street and sewer flooding; tree emergencies.'],
            ['Gate on hazard', 'A family is only attached to hazards it can plausibly follow: no-heat to cold, winter storms and heavy snow; flooding to the flood and rain hazards and tropical cyclones; trees to wind, thunderstorm, tropical cyclone, winter storm and tornado. A tree complaint during a heat wave is not evidence about the heat wave.'],
            ['Count, never collect', 'Counts are fetched as aggregates, so the pipeline never handles 22 million rows.'],
            ['Before 2004', 'Not applicable. Not zero.']
          ]
        },
        {
          name: 'FEMA assistance',
          note: 'Two guards, both learned from a wrong number reaching a page.',
          steps: [
            ['The join is by date, not by name', 'Assistance is reported against a disaster declaration, not against a storm, so a declaration is matched to an event by its incident period, within a three-day tolerance.'],
            ['Guard one: it must be weather', 'A declaration must carry a weather incident type: hurricane, flood, snowstorm, coastal storm and so on.'],
            ['Guard two: it must be short', 'An incident period longer than 45 days cannot belong to one storm.'],
            ['Why both exist', 'The COVID-19 declarations carry an incident period from January 2020 to May 2023. Matching on overlap alone attached them, and their billions in public assistance, to every storm in three years: Ida briefly showed 10.7 billion dollars, almost all of it pandemic money.'],
            ['A failed test drops the declaration', 'It is attached to no event, and it is not silently redistributed either.']
          ]
        },
        {
          name: 'Water levels and surge',
          note: 'The one figure this project calculates rather than reads.',
          steps: [
            ['Two calls per event, per station', 'Observed water level and predicted tide are fetched for the event window. This is most of the forty minutes a first run takes.'],
            ['Surge is derived', 'Storm surge is not published anywhere. It is the observed level minus the predicted tide, calculated here, and labeled as derived every place it appears.'],
            ['Only where it could matter', 'Fetched for coastal flooding, tropical cyclones, coastal hazards, high winds and flash flooding, because each event costs API calls.'],
            ['A peak is a peak, not an average', 'An event peak is the highest single reading over the window.']
          ]
        },
        {
          name: 'Vehicle collisions',
          note: 'The simplest of the four, and still has a boundary.',
          steps: [
            ['One dataset', 'NYPD motor vehicle collisions, counted over the event window across the five boroughs.'],
            ['Before July 2012', 'Not applicable: the dataset does not go back further, and the archive does.']
          ]
        }
      ]
    },
    {
      id: '04', name: 'validate',
      summary: 'Tests the grains rather than trusting them, and refuses to publish a build that fails.',
      rule: 'It fails, rather than warns, when a figure would be wrong.',
      detail: [
        { h: 'Grains are tested, not assumed',
          p: 'Each table is checked against the grain it claims, one row per event, per station-day, per track position, and referential integrity is checked in both directions rather than one.' },
        { h: 'The value model is enforced',
          p: 'A build is refused where a measure is marked absent while carrying a value, or marked ok without one. A failed lookup must produce no value rather than a number.' },
        { h: 'Absence must still exist',
          p: 'Validation fails if not one measure in the entire build is marked not applicable. If that distinction ever vanished, it would mean the four kinds of absence had collapsed back into zero somewhere upstream, which is the exact failure this project exists to correct.' },
        { h: 'Known facts are checked against the published record',
          p: 'A pipeline can be internally consistent and still wrong. So a small set of facts is checked against the outside world: Sandy must be present, must merge two episodes, must be classified as coastal flooding, must carry a direct death count in the range the published record supports, and must show a peak water level in the twelve-to-sixteen-foot range.' }
      ]
    },
    {
      id: '05', name: 'export',
      summary: 'Writes the site JSON and the public CSV files, then moves them into place in one step.',
      rule: 'Refuses to run at all if validation did not pass.',
      detail: [
        { h: 'Staged, then moved',
          p: 'Everything is written into build/staging/ first and moved into place as one step, so a bad build leaves the live files untouched rather than half-replacing them.' },
        { h: 'Statuses travel with the data',
          p: 'The four absence statuses are written into the downloads as their own columns. A figure that leaves this site keeps the context that makes it checkable.' },
        { h: 'Shaped for one request',
          p: 'The index carries every event in a compact form so the explorer can filter in memory; per-event detail is written to one file per event, loaded only when that event is opened.' }
      ]
    }
  ],

  outputs: [
    { name: 'docs/data/index.json', desc: 'Every event, compactly keyed. The file the explorer filters against.' },
    { name: 'docs/data/events/', desc: 'One file per event, fetched only when that event is opened.' },
    { name: 'docs/data/meta.json', desc: 'Vocabulary, coverage and build date. This page reads its counts from here.' },
    { name: 'docs/downloads/*.csv', desc: 'The public extracts, statuses carried as their own columns.' }
  ],

  site: [
    { name: 'Explore', href: 'explore.html',
      desc: 'Filters the whole archive in memory. The query lives in the address bar and is written back on every change, so a link and the screen cannot disagree.' },
    { name: 'Event page', href: 'explore.html',
      desc: 'One event in full, loaded on demand. Measures first, the source narrative behind a disclosure, and a note when the event is a merge.' },
    { name: 'Compare', href: 'compare.html',
      desc: 'Events side by side, on the measures they can both support.' },
    { name: 'Method', href: 'method.html',
      desc: 'How every figure was produced, what each source publishes, and the CSV extracts.' },
    { name: 'Radar overlay', href: null, bypass: true,
      desc: 'Reflectivity tiles read live from the Iowa Environmental Mesonet and drawn over MapLibre GL. The only data on the site that never passes through the pipeline.' }
  ]
};

/* ---- Rendering --------------------------------------------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function renderSources() {
  const list = $('#df-sources');
  FLOW.sources.forEach(s => {
    const li = el('li', 'df-card' + (s.bypass ? ' is-bypass' : ''));
    const head = el('p', 'df-card-name');
    if (s.href) {
      const a = el('a', null, s.name);
      a.href = s.href;
      a.rel = 'noopener';
      head.append(a);
    } else {
      head.textContent = s.name;
    }
    li.append(head);
    li.append(el('p', 'df-card-grain', s.grain));
    li.append(el('p', 'df-card-desc', s.role));
    li.append(el('p', 'df-card-span', s.span));
    if (s.bypass) li.append(el('p', 'df-tag', 'bypasses the pipeline'));
    list.append(li);
  });
}

function stageBody(stage) {
  const body = el('div', 'df-stage-body');

  if (stage.tables) {
    const t = el('table', 'df-table');
    const cap = el('caption', null, 'Canonical tables, and the grain of each');
    t.append(cap);
    const thead = el('thead');
    const hr = el('tr');
    hr.append(el('th', null, 'Table'), el('th', null, 'One row per'));
    thead.append(hr);
    t.append(thead);
    const tb = el('tbody');
    stage.tables.forEach(([name, grain]) => {
      const tr = el('tr');
      const th = el('th', null, name);
      th.scope = 'row';
      tr.append(th, el('td', null, grain));
      tb.append(tr);
    });
    t.append(tb);
    body.append(t);
  }

  (stage.detail || []).forEach(d => {
    const block = el('div', 'df-note');
    block.append(el('h4', null, d.h));
    block.append(el('p', null, d.p));
    body.append(block);
  });

  if (stage.subs) {
    const subs = el('div', 'df-subs');
    subs.append(el('h4', 'df-subs-title', 'What each source costs to attach'));
    stage.subs.forEach(sub => {
      const box = el('section', 'df-sub');
      box.append(el('h5', null, sub.name));
      box.append(el('p', 'df-sub-note', sub.note));
      const ol = el('ol', 'df-steps');
      sub.steps.forEach(([label, text]) => {
        const li = el('li');
        li.append(el('b', null, label));
        li.append(document.createTextNode('. ' + text));
        ol.append(li);
      });
      box.append(ol);
      subs.append(box);
    });
    body.append(subs);
  }

  return body;
}

function renderStages() {
  const list = $('#df-stages');
  FLOW.stages.forEach(stage => {
    const li = el('li', 'df-stage');
    const details = el('details', 'df-details');
    details.dataset.stage = stage.id;

    const summary = el('summary', 'df-summary');
    const head = el('span', 'df-stage-head');
    head.append(el('span', 'df-stage-id', stage.id));
    head.append(el('span', 'df-stage-name', stage.name + '.py'));
    summary.append(head);
    summary.append(el('span', 'df-stage-summary', stage.summary));
    summary.append(el('span', 'df-stage-rule', stage.rule));
    // Label text comes from CSS so it can follow the open/closed state.
    summary.append(el('span', 'df-more'));
    details.append(summary);
    details.append(stageBody(stage));

    li.append(details);
    list.append(li);
  });
}

function renderOutputs() {
  const list = $('#df-outputs');
  FLOW.outputs.forEach(o => {
    const li = el('li', 'df-card');
    li.append(el('p', 'df-card-name df-mono', o.name));
    li.append(el('p', 'df-card-desc', o.desc));
    list.append(li);
  });
}

function renderSite() {
  const list = $('#df-site');
  FLOW.site.forEach(p => {
    const li = el('li', 'df-card' + (p.bypass ? ' is-bypass' : ''));
    const head = el('p', 'df-card-name');
    if (p.href) {
      const a = el('a', null, p.name);
      a.href = p.href;
      head.append(a);
    } else {
      head.textContent = p.name;
    }
    li.append(head);
    li.append(el('p', 'df-card-desc', p.desc));
    if (p.bypass) li.append(el('p', 'df-tag', 'live from the browser'));
    list.append(li);
  });
}

/* ---- Live counts from the current build -------------------------- */

function setStat(key, value) {
  const node = document.querySelector(`[data-stat="${key}"]`);
  if (node) node.textContent = value;
}

async function loadStats() {
  try {
    const res = await fetch('data/meta.json');
    if (!res.ok) throw new Error(res.status);
    const meta = await res.json();
    setStat('events', meta.events.toLocaleString());
    setStat('event_rows', meta.event_rows.toLocaleString());
    setStat('coverage', `${meta.coverage.first}–${meta.coverage.last}`);
    setStat('built', meta.built);
  } catch {
    // The diagram is the point; the counts are a bonus. Say so rather than
    // leaving four em dashes that look like a bug.
    document.querySelectorAll('[data-stat]').forEach(n => { n.textContent = 'unavailable'; });
    $('#df-stats').classList.add('is-absent');
  }
}

/* ---- Open and close --------------------------------------------- */

function wireControls() {
  const all = () => document.querySelectorAll('.df-details');
  $('#df-expand').addEventListener('click', () => {
    all().forEach(d => { d.open = true; });
  });
  $('#df-collapse').addEventListener('click', () => {
    all().forEach(d => { d.open = false; });
  });
}

renderSources();
renderStages();
renderOutputs();
renderSite();
wireControls();
loadStats();
