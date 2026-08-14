/* Comparing events.
   ------------------------------------------------------------------
   Measures are rows and events are columns, the way a specification sheet
   reads. The two axes grow differently: a comparison stops at four events and
   the measures do not stop at all, so putting events across the top keeps the
   sheet from running sideways without end.

   Absence is the point of this page as much as the numbers are. A blank cell
   in a comparison is where a reader is most likely to infer a zero, so every
   cell states its status in words. */

// var, not const: every script shares one global scope, and two top-level
// const declarations of the same name are a syntax error that kills the page.
var HH = window.HH;
let META = null, EVENTS = [];

function el(tag, attrs, text) {
  const n = document.createElement(tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') n.className = v;
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  });
  if (text !== undefined) n.textContent = text;
  return n;
}

/* Rows are declared as data so the order is one list to read, and so a measure
   cannot appear on the event page and quietly not here. */
function rows(meta) {
  const base = meta.cpi.base_year;
  return [
    ['group', 'The event'],
    ['text', 'Dates', e => HH.dateRange(e.begin, e.end)],
    ['text', 'Duration', e => HH.duration(e.begin, e.end)],
    ['text', 'Hazards', e => e.hazards.map(h => meta.hazards[h].label).join(', ')],
    ['text', 'Places named', e => e.places.map(p => meta.boroughs[p].name)
      .concat(e.harbor ? ['New York Harbor'] : []).join(', ') || 'Not stated'],
    ['text', 'Weather Service records', e => String((e.evidence || []).length)],

    ['group', 'People, as the Weather Service recorded them'],
    ['m', 'Deaths, direct', e => e.deaths_direct],
    ['m', 'Deaths, indirect', e => e.deaths_indirect],
    ['m', 'Injuries, direct', e => e.injuries_direct],

    ['group', 'Conditions, from daily station summaries'],
    ['m', 'Highest temperature', e => e.weather.temp_max, { digits: 0 }],
    ['m', 'Lowest temperature', e => e.weather.temp_min, { digits: 0 }],
    ['m', 'Rainfall, total at one station', e => e.weather.rain_total, { digits: 2 }],
    ['m', 'Snowfall, total at one station', e => e.weather.snow_total, { digits: 1 }],
    ['m', 'Fastest two-minute wind', e => e.weather.wind_2min, { digits: 0 }],
    ['tide', 'Peak water level', e => e.tide, 'peak_level'],
    ['tide', 'Peak surge, derived here', e => e.tide, 'peak_surge'],

    ['group', 'Damage, estimated for this event'],
    ['m', 'Property damage, as published', e => e.damage_property, { full: true }],
    ['m', 'Property damage, ' + base + ' dollars', e => e.damage_property_real, { full: true }],

    // Assistance is a property of a declaration, not of a storm, and a
    // comparison table is exactly where that gets forgotten: four columns of
    // dollars invite a reader to rank the storms by them. The group is named
    // for what the figures belong to, and the declaration row sits at the top
    // of it rather than at the bottom of the money.
    ['group', 'Obligated against the federal declaration, not against the storm'],
    ['text', 'Declarations matched', e => (e.disasters || [])
      .map(d => 'DR-' + d.number).join(', ') || 'None'],
    ['text', 'Events sharing those declarations', e => (e.disasters || []).length
      ? String((e.disasters || []).reduce((n, d) => Math.max(n, d.events_covered || 1), 1))
      : 'Not applicable'],
    ['m', 'Public assistance obligated', e => e.assistance.pa, { full: true, hideNote: true }],
    ['m', 'Public assistance, ' + base + ' dollars', e => e.assistance.pa_real, { full: true }],
    ['m', 'Housing assistance approved', e => e.assistance.ia, { full: true, hideNote: true }],

    ['group', 'Joined to this event by date of loss'],
    ['m', 'Flood insurance paid', e => (e.assistance.nfip || {}).paid, { full: true }],
    ['m', 'Flood insurance claims', e => (e.assistance.nfip || {}).claims],

    ['group', 'Recorded in city data afterwards'],
    ['m', 'No heat or hot water, 311', e => e.consequences['no-heat'].total],
    ['m', 'Flooding complaints, 311', e => e.consequences.flooding.total],
    ['m', 'Tree emergencies, 311', e => e.consequences.trees.total],
    ['m', 'Vehicle collisions', e => e.consequences.collisions.total],
    ['m', 'People injured in collisions', e => e.consequences.collisions.injured]
  ];
}

function render() {
  const holder = document.getElementById('sheet');
  holder.innerHTML = '';

  if (!EVENTS.length) {
    const box = el('div', { class: 'empty empty-centred' });
    box.appendChild(el('h3', null, 'Nothing selected yet'));
    box.appendChild(el('p', null,
      'Tick up to ' + META.compare_max + ' events in the explorer and they ' +
      'appear here side by side, measure by measure. The comparison is a link, ' +
      'so it can be sent to someone else exactly as it stands.'));
    const actions = el('div', { class: 'suggestions' });
    actions.appendChild(el('a', { class: 'btn btn-small', href: 'explore.html' },
      'Go to the explorer'));
    actions.appendChild(el('a', { class: 'btn btn-quiet btn-small',
      href: 'compare.html?e=E20121029-sandy,E20210901-163555,E20121107-69984' },
      'Or see an example'));
    box.appendChild(actions);
    holder.appendChild(box);
    return;
  }

  const table = el('table', { class: 'compare' });
  table.appendChild(el('caption', null,
    'Measures down the side, events across the top. Every cell that holds no ' +
    'number says why it holds none.'));

  const thead = el('thead');
  const hr = el('tr');
  hr.appendChild(el('th', { scope: 'col' }, 'Measure'));
  EVENTS.forEach(e => {
    const th = el('th', { scope: 'col' });
    const a = el('a', { href: 'event.html?id=' + encodeURIComponent(e.event_id) },
      title(e));
    th.appendChild(a);
    th.appendChild(el('span', { class: 'val-note' },
      HH.dateRange(e.begin, e.end)));
    // With four events the chip list is above the fold and the column is not.
    // Removing a column from its own head is the shorter reach.
    const drop = el('button', {
      type: 'button', class: 'btn btn-quiet btn-small',
      style: 'margin-top:.4rem; font-weight:400',
      'aria-label': 'Remove ' + title(e) + ' from the comparison'
    }, 'Remove');
    drop.addEventListener('click', () => remove(e.event_id));
    th.appendChild(drop);
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = el('tbody');
  rows(META).forEach(spec => {
    const [kind, label, get, extra] = spec;
    const tr = el('tr');
    if (kind === 'group') {
      tr.className = 'group';
      const th = el('th', { scope: 'colgroup', colspan: String(EVENTS.length + 1) }, label);
      tr.appendChild(th);
      tbody.appendChild(tr);
      return;
    }
    tr.appendChild(el('th', { scope: 'row' }, label));
    EVENTS.forEach(e => {
      const td = el('td');
      if (kind === 'text') {
        td.textContent = get(e) || '';
        td.style.fontFamily = 'var(--sans)';
        td.style.textAlign = 'left';
      } else if (kind === 'tide') {
        const t = get(e);
        if (t && t.status === 'ok' && t[extra]) {
          td.appendChild(HH.value({ v: t[extra].v, s: 'ok', u: 'ft' }, { digits: 2 }));
        } else {
          // Two different absences. The gauge was asked and had nothing, or the
          // gauge was never asked because no coastal hazard is on the event.
          // Neither is "not collected then", which is about a period.
          td.appendChild(HH.value(
            { v: null, s: t ? 'missing' : 'na',
              n: t ? 'the gauge published no reading for this window'
                   : 'water levels are read only where a coastal hazard is on the event' },
            { absentText: t ? 'no reading' : 'not read here' }));
        }
      } else {
        td.appendChild(HH.value(get(e), extra || {}));
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const wrap = el('div', { class: 'table-wrap compare-wrap' });
  wrap.appendChild(table);
  holder.appendChild(wrap);
  HH.scrollable(wrap, 'Comparison of ' + EVENTS.length + ' events');

  const caveat = el('p', { class: 'val-note', style: 'margin-top:1rem' });
  caveat.textContent = 'Comparing across decades compares the record as much ' +
    'as the weather. The 311 datasets begin in 2004, collisions in July 2012, ' +
    'and before 1996 the Weather Service recorded only tornado, hail and wind. ' +
    'A cell reading "not collected then" is a fact about the data, not about ' +
    'the storm. The rows are grouped by what each figure is a figure of, ' +
    'because they are not all figures of the same thing.';
  holder.appendChild(caveat);
}

function title(e) {
  return e.name ||
    ((META.hazards[e.hazards[0]] || {}).label || 'Event') + ', ' + HH.date(e.begin);
}

function remove(id) {
  EVENTS = EVENTS.filter(x => x.event_id !== id);
  const ids = EVENTS.map(x => x.event_id);
  window.history.replaceState(null, '',
    'compare.html' + (ids.length ? '?e=' + ids.join(',') : ''));
  renderPicked();
  render();
  HH.announce('Removed. ' + EVENTS.length +
    (EVENTS.length === 1 ? ' event' : ' events') + ' in the comparison.');
}

function renderPicked() {
  const bar = document.getElementById('picked');
  bar.innerHTML = '';
  EVENTS.forEach(e => {
    const li = el('li', { class: 'chip' });
    li.append(el('b', null, title(e)));
    const btn = el('button', { type: 'button',
      'aria-label': 'Remove ' + title(e) + ' from the comparison' }, '×');
    btn.addEventListener('click', () => remove(e.event_id));
    li.appendChild(btn);
    bar.appendChild(li);
  });
  const room = META.compare_max - EVENTS.length;
  const note = document.getElementById('picked-note');
  if (note) {
    note.textContent = EVENTS.length
      ? EVENTS.length + ' of ' + META.compare_max + ' places used' +
        (room ? ', room for ' + room + ' more.' : '. Remove one to add another.')
      : '';
  }
}

HH.start(function (meta) {
  META = meta;
  const ids = (new URLSearchParams(window.location.search).get('e') || '')
    .split(',').filter(Boolean).slice(0, meta.compare_max);
  document.getElementById('copy').addEventListener('click', function () { HH.copyLink(this); });

  if (!ids.length) {
    document.getElementById('loading').remove();
    render();
    return;
  }
  Promise.all(ids.map(id => HH.event(id).catch(() => null))).then(list => {
    document.getElementById('loading').remove();
    const missing = ids.filter((id, i) => !list[i]);
    EVENTS = list.filter(Boolean);
    if (missing.length) {
      const warn = el('p', { class: 'error' });
      warn.textContent = missing.length + ' of the events in this link could ' +
        'not be found: ' + missing.join(', ') + '. The rest are shown.';
      document.getElementById('sheet').before(warn);
    }
    renderPicked();
    render();
    HH.announce(EVENTS.length + ' events compared across ' +
      rows(meta).filter(r => r[0] !== 'group').length + ' measures.');
  });
});
