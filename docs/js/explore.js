/* The explorer: a query in the address bar and a table under it.
   ------------------------------------------------------------------
   Everything is filtered in the browser over one index file. That is the whole
   architecture: about 900 events at a third of a megabyte, so a filter change
   is a pass over an array rather than a request, and the results move as fast
   as the typing.

   The characteristic filter is the part worth reading. A filter is a measure,
   an operator and one or two values, it renders as a removable chip, and it
   writes itself into the URL as measure:operator:value. The mock-ups asked for
   exactly that, and fixed bands could not answer "above a threshold I choose",
   which the brief asks for directly.

   The table carries no federal assistance column. Assistance is obligated
   against a disaster declaration, not against a storm, and a declaration here
   can cover fourteen events at the same total. A sortable money column would
   have ranked storms by a number that is not theirs. The declaration count is
   a fact about the event, so that is the column; the money is on the event page
   and in the comparison, where there is room to say what it belongs to. */

// var, not const: every script shares one global scope, and two top-level
// const declarations of the same name are a syntax error that kills the page.
var HH = window.HH;

let META = null;
let INDEX = [];
let STATE = null;
let RESULTS = [];
let SELECTED = new Set();

/* Which index key each filterable characteristic lives under. The index uses
   short keys because it is downloaded on every visit. */
const KEY = {
  temp_max: 'tx', temp_min: 'tn', rain_daily: 'rd', rain_total: 'rt',
  snow_daily: 'sd', snow_total: 'st', wind_2min: 'wg',
  surge_peak: 'sg', tide_peak: 'tp',
  deaths: 'd', injuries: 'i', damage_property: 'dp',
  fema_pa: 'pa', fema_ia: 'ia', nfip_paid: 'nf',
  complaints_311: 'c3', complaints_flooding: 'cf', complaints_trees: 'ct',
  collisions: 'cc'
};

const HARBOR = 'HARBOR';

const COLUMNS = [
  { id: 'date', label: 'Date', sortable: true, get: e => e.b },
  { id: 'name', label: 'Event', sortable: true, get: e => e.n || '' },
  { id: 'hazards', label: 'Hazards', sortable: false },
  { id: 'places', label: 'Places', sortable: false },
  { id: 'deaths', label: 'Deaths', sortable: true, num: true, get: e => e.d },
  { id: 'rain', label: 'Rain, in', sortable: true, num: true, get: e => e.rt },
  { id: 'snow', label: 'Snow, in', sortable: true, num: true, get: e => e.st },
  { id: 'wind', label: 'Wind, 2-min', sortable: true, num: true, get: e => e.wg },
  { id: 'damage', label: 'Damage', sortable: true, num: true, get: e => e.dp },
  { id: 'declarations', label: 'Declarations', sortable: true, num: true,
    get: e => e.dec }
];

/* ---- Filtering ---------------------------------------------------- */

function matches(e) {
  if (STATE.from && e.e < STATE.from) return false;
  if (STATE.to && e.b > STATE.to + ' 23:59') return false;
  if (STATE.hazards.length && !STATE.hazards.some(h => e.h.includes(h))) return false;
  if (STATE.boroughs.length) {
    const here = STATE.boroughs.some(b =>
      b === HARBOR ? e.hb === 1 : e.p.includes(b));
    if (!here) return false;
  }
  if (STATE.text) {
    // Hazard labels as well as hazard keys, so "heavy snow" finds what
    // "heavy-snow" finds. The source's own event types are not in the index and
    // are not searched: "blizzard" is filed here as a winter storm, and the
    // empty state says which part of a query found nothing.
    if (!haystack(e).includes(STATE.text.toLowerCase())) return false;
  }
  for (const f of STATE.filters) {
    const v = e[KEY[f.key]];
    // An event with no value for a characteristic is excluded from a threshold
    // filter rather than treated as zero. Saying so is the empty state's job.
    if (v === null || v === undefined) return false;
    if (f.op === 'gte' && !(v >= f.values[0])) return false;
    if (f.op === 'lte' && !(v <= f.values[0])) return false;
    if (f.op === 'btw' && !(v >= Math.min(...f.values) && v <= Math.max(...f.values))) return false;
  }
  return true;
}

const HAY = new Map();
function haystack(e) {
  let s = HAY.get(e.id);
  if (s === undefined) {
    s = ((e.n || '') + ' ' + e.h.join(' ') + ' ' +
      e.h.map(h => (META.hazards[h] || {}).label || '').join(' ') + ' ' +
      e.id).toLowerCase();
    HAY.set(e.id, s);
  }
  return s;
}

function sortResults(list) {
  const desc = STATE.sort.startsWith('-');
  const id = desc ? STATE.sort.slice(1) : STATE.sort;
  const col = COLUMNS.find(c => c.id === id) || COLUMNS[0];
  const get = col.get || (e => e.b);
  return list.slice().sort((a, b) => {
    const x = get(a), y = get(b);
    // Absent values sort to the end whichever way the column is pointing.
    if (x === null || x === undefined) return (y === null || y === undefined) ? 0 : 1;
    if (y === null || y === undefined) return -1;
    if (x < y) return desc ? 1 : -1;
    if (x > y) return desc ? -1 : 1;
    return a.b < b.b ? 1 : -1;
  });
}

/* ---- Rendering ---------------------------------------------------- */

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

function placeName(code) {
  return code === HARBOR ? 'New York Harbor'
    : (META.boroughs[code] || {}).name || code;
}

function renderChips() {
  const list = document.getElementById('chips');
  list.innerHTML = '';
  const add = (label, value, onRemove) => {
    const li = el('li', { class: 'chip' });
    li.append(el('b', null, label), document.createTextNode(' ' + value));
    const btn = el('button', {
      type: 'button', 'aria-label': 'Remove the filter ' + label + ' ' + value
    }, '×');
    btn.addEventListener('click', onRemove);
    li.appendChild(btn);
    list.appendChild(li);
  };

  if (STATE.from || STATE.to) {
    add('Dates', (STATE.from || 'any') + ' to ' + (STATE.to || 'any'), () => {
      STATE.from = ''; STATE.to = ''; writeForm(); changed();
    });
  }
  STATE.hazards.forEach(h => {
    add('Hazard', (META.hazards[h] || {}).label || h, () => {
      STATE.hazards = STATE.hazards.filter(x => x !== h); writeForm(); changed();
    });
  });
  STATE.boroughs.forEach(b => {
    add('Place', placeName(b), () => {
      STATE.boroughs = STATE.boroughs.filter(x => x !== b); writeForm(); changed();
    });
  });
  if (STATE.text) {
    add('Text', '"' + STATE.text + '"', () => {
      STATE.text = ''; writeForm(); changed();
    });
  }
  STATE.filters.forEach((f, i) => {
    const c = META.characteristics[f.key] || { label: f.key, unit: '' };
    const op = META.operators[f.op] || { symbol: f.op };
    const value = f.op === 'btw'
      ? f.values[0] + ' to ' + f.values[1] + ' ' + c.unit
      : op.symbol + ' ' + f.values[0] + ' ' + c.unit;
    add(c.label, value.trim(), () => {
      STATE.filters.splice(i, 1); changed();
    });
  });

  const empty = document.getElementById('chips-empty');
  const n = list.children.length;
  empty.hidden = n > 0;
  // The chip list is the query. Saying how many parts it has, in words, is the
  // only version of it a screen reader hears as a summary.
  list.setAttribute('aria-label', n
    ? n + (n === 1 ? ' active filter' : ' active filters')
    : 'Active filters, none set');
}

function renderTable() {
  const wrap = document.getElementById('results');
  wrap.innerHTML = '';

  if (!RESULTS.length) {
    wrap.appendChild(emptyState());
    return;
  }

  const start = (STATE.page - 1) * META.page_size;
  const page = RESULTS.slice(start, start + META.page_size);

  const table = el('table', { class: 'stack' });
  const caption = el('caption', null,
    'Events matching the current query, ' +
    (STATE.sort.startsWith('-') ? 'highest first' : 'lowest first') +
    '. Rain and snow are inches, totalled over the event at one station; ' +
    'wind is the fastest two-minute reading in miles an hour, not a gust.');
  table.appendChild(caption);

  const thead = el('thead');
  const hr = el('tr');
  const th0 = el('th', { scope: 'col' });
  th0.appendChild(el('span', { class: 'visually-hidden' }, 'Select for comparison'));
  hr.appendChild(th0);
  COLUMNS.forEach(c => {
    const th = el('th', { scope: 'col', class: c.num ? 'num' : null });
    if (c.sortable) {
      const active = STATE.sort === c.id || STATE.sort === '-' + c.id;
      const desc = STATE.sort === '-' + c.id;
      if (active) th.setAttribute('aria-sort', desc ? 'descending' : 'ascending');
      const b = el('button', {
        type: 'button', class: 'sort',
        'aria-label': 'Sort by ' + c.label + (active && desc ? ', ascending' : ', descending')
      });
      b.append(document.createTextNode(c.label));
      if (active) b.appendChild(el('span', { class: 'arrow', 'aria-hidden': 'true' }, desc ? '▼' : '▲'));
      b.addEventListener('click', () => {
        STATE.sort = (STATE.sort === '-' + c.id) ? c.id : '-' + c.id;
        STATE.page = 1;
        changed(true);
      });
      th.appendChild(b);
    } else {
      th.textContent = c.label;
    }
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = el('tbody');
  page.forEach(e => {
    const tr = el('tr');

    const tdSel = el('td', { 'data-label': 'Compare' });
    const cb = el('input', {
      type: 'checkbox', id: 'sel-' + e.id,
      'aria-label': 'Add ' + (e.n || HH.date(e.b)) + ' to the comparison'
    });
    cb.checked = SELECTED.has(e.id);
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (SELECTED.size >= META.compare_max) {
          cb.checked = false;
          HH.announce('The comparison holds at most ' + META.compare_max +
            ' events. Remove one before adding another.');
          return;
        }
        SELECTED.add(e.id);
      } else {
        SELECTED.delete(e.id);
      }
      renderCompareBar();
    });
    tdSel.appendChild(cb);
    tr.appendChild(tdSel);

    const tdDate = el('td', { 'data-label': 'Date' });
    tdDate.appendChild(el('span', { class: 'event-date' }, HH.dateRange(e.b, e.e)));
    tr.appendChild(tdDate);

    const tdName = el('td', { 'data-label': 'Event', class: 'primary' });
    const link = el('a', { href: 'event.html?id=' + encodeURIComponent(e.id), class: 'event-link' },
      e.n || describe(e));
    link.addEventListener('click', HH.url.remember);
    tdName.appendChild(link);
    tr.appendChild(tdName);

    const tdHz = el('td', { 'data-label': 'Hazards' });
    tdHz.appendChild(HH.hazardList(e.h, META));
    tr.appendChild(tdHz);

    // An event recorded only in the harbour zone names no borough. That is a
    // real property of the record, not a gap, so it is written out.
    //
    // Most events name every borough, and five borough names in a table cell
    // push the columns to the right of them off the screen while saying
    // nothing a reader could not have guessed. All five is written as all five.
    const places = e.p.map(p => META.boroughs[p].name);
    const all = e.p.length === META.borough_order.length;
    const where = all
      ? 'All five boroughs' + (e.hb ? ' and the harbor' : '')
      : (places.concat(e.hb ? ['New York Harbor'] : []).join(', ') || 'Not stated');
    tr.appendChild(el('td', { 'data-label': 'Places' }, where));

    [['Deaths', e.d, {}], ['Rain, in', e.rt, { digits: 2 }],
     ['Snow, in', e.st, { digits: 1 }], ['Wind, 2-min', e.wg, { digits: 0 }]
    ].forEach(([label, v, opts]) => {
      const td = el('td', { 'data-label': label, class: 'num' });
      td.appendChild(cell(v, opts));
      tr.appendChild(td);
    });

    const tdDmg = el('td', { 'data-label': 'Damage', class: 'num' });
    tdDmg.appendChild(cell(e.dp, { money: true }));
    tr.appendChild(tdDmg);

    // A count of declarations, not their money. Zero declarations is a real
    // zero: it means no disaster was declared, which the record does state.
    const tdDec = el('td', { 'data-label': 'Declarations', class: 'num' });
    tdDec.appendChild(cell(e.dec, {}));
    tr.appendChild(tdDec);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const shell = el('div', { class: 'table-wrap stack-wrap' });
  shell.appendChild(table);
  wrap.appendChild(shell);
  HH.scrollable(shell, 'Results table');
  renderPager(wrap);
}

function cell(value, opts) {
  // Table cells suppress the reason line: the explorer shows ten columns at a
  // time and a sentence under every absent number would drown the numbers.
  // The event page and the comparison sheet both show it in full.
  opts = Object.assign({ hideNote: true }, opts || {});
  if (value === null || value === undefined) {
    return HH.value({ v: null, s: 'missing' }, opts);
  }
  return HH.value({ v: value, s: 'ok', u: opts.money ? '$' : '' }, opts);
}

function describe(e) {
  const names = e.h.map(h => (META.hazards[h] || {}).label || h);
  const first = names[0] || 'Hazard';
  return first + (names.length > 1 ? ' and ' + (names.length - 1) + ' more' : '') +
    ', ' + HH.date(e.b);
}

function renderPager(wrap) {
  const pages = Math.ceil(RESULTS.length / META.page_size);
  if (pages <= 1) return;
  const nav = el('nav', { class: 'pager', 'aria-label': 'Result pages' });
  const prev = el('button', { class: 'btn btn-quiet btn-small', type: 'button' }, 'Previous');
  prev.disabled = STATE.page <= 1;
  prev.addEventListener('click', () => { STATE.page--; changed(true); });
  const next = el('button', { class: 'btn btn-quiet btn-small', type: 'button' }, 'Next');
  next.disabled = STATE.page >= pages;
  next.addEventListener('click', () => { STATE.page++; changed(true); });
  nav.append(prev, el('span', { class: 'page-info' },
    'Page ' + STATE.page + ' of ' + pages), next);
  wrap.appendChild(nav);
}

function emptyState() {
  const box = el('div', { class: 'empty' });
  box.appendChild(el('h3', null, 'No events match this query'));

  /* Which part of the query is doing the excluding, rather than a bare reset.

     Each part is counted on its own against the whole record and the tightest
     one is named. That is the answer to the question a reader actually has,
     and it separates the two ways a query comes back empty: one part matches
     almost nothing, or several parts match plenty and never the same events. */
  const parts = [];
  const count = fn => INDEX.filter(fn).length;
  STATE.filters.forEach(f => {
    const c = META.characteristics[f.key] || { label: f.key, unit: '' };
    const op = META.operators[f.op] || { symbol: f.op };
    const said = (f.op === 'btw'
      ? c.label + ' between ' + f.values[0] + ' and ' + f.values[1] + ' ' + c.unit
      : c.label + ' ' + op.symbol + ' ' + f.values[0] + ' ' + c.unit).trim();
    const have = count(e => {
      const v = e[KEY[f.key]];
      if (v === null || v === undefined) return false;
      if (f.op === 'gte') return v >= f.values[0];
      if (f.op === 'lte') return v <= f.values[0];
      return v >= Math.min(...f.values) && v <= Math.max(...f.values);
    });
    const gap = count(e => e[KEY[f.key]] === null || e[KEY[f.key]] === undefined);
    parts.push({
      n: have, said: said,
      extra: gap > INDEX.length / 10
        ? ' A further ' + HH.num(gap) + ' events carry no value for it at all, ' +
          'and an absence is never matched by a threshold.'
        : ''
    });
  });
  if (STATE.hazards.length) {
    parts.push({ extra: '',
      n: count(e => STATE.hazards.some(h => e.h.includes(h))),
      said: STATE.hazards.map(h => (META.hazards[h] || {}).label || h).join(' or ') });
  }
  if (STATE.boroughs.length) {
    parts.push({ extra: '',
      n: count(e => STATE.boroughs.some(b => b === HARBOR ? e.hb === 1 : e.p.includes(b))),
      said: STATE.boroughs.map(placeName).join(' or ') });
  }
  if (STATE.from || STATE.to) {
    parts.push({ extra: '',
      n: count(e => !(STATE.from && e.e < STATE.from) &&
                    !(STATE.to && e.b > STATE.to + ' 23:59')),
      said: 'that date range' });
  }
  if (STATE.text) {
    parts.push({ extra: '',
      n: count(e => haystack(e).includes(STATE.text.toLowerCase())),
      said: 'the text "' + STATE.text + '"' });
  }

  parts.sort((a, b) => a.n - b.n);
  const tightest = parts[0];
  if (!tightest) {
    box.appendChild(el('p', null,
      'Nothing in the record matches every part of this query at once.'));
  } else if (tightest.n === 0) {
    box.appendChild(el('p', null, 'Nothing in the record matches ' +
      tightest.said + ' on its own.' + tightest.extra));
  } else if (parts.length > 1) {
    box.appendChild(el('p', null, 'Every part of this query matches something ' +
      'on its own. The narrowest is ' + tightest.said + ', with ' +
      HH.num(tightest.n) + ' events. No event matches all of them at once.' +
      tightest.extra));
  } else {
    box.appendChild(el('p', null, tightest.said + ' matches ' +
      HH.num(tightest.n) + ' events, none of them inside the rest of this ' +
      'query.' + tightest.extra));
  }
  if (STATE.from && STATE.from < '1996-01-01') {
    box.appendChild(el('p', null, 'Before 1996 the Weather Service recorded ' +
      'tornado, hail and wind only, so a date range reaching into that period ' +
      'holds far fewer events than the weather would suggest.'));
  }

  const actions = el('div', { class: 'suggestions' });
  if (STATE.filters.length) {
    const b = el('button', { class: 'btn btn-quiet btn-small', type: 'button' },
      STATE.filters.length === 1 ? 'Remove the threshold' : 'Remove the thresholds');
    b.addEventListener('click', () => { STATE.filters = []; changed(); });
    actions.appendChild(b);
  }
  if (STATE.hazards.length) {
    const b = el('button', { class: 'btn btn-quiet btn-small', type: 'button' },
      'Remove the hazard filter');
    b.addEventListener('click', () => {
      STATE.hazards = []; writeForm(); changed();
    });
    actions.appendChild(b);
  }
  if (STATE.from || STATE.to) {
    const b = el('button', { class: 'btn btn-quiet btn-small', type: 'button' },
      'Remove the dates');
    b.addEventListener('click', () => {
      STATE.from = ''; STATE.to = ''; writeForm(); changed();
    });
    actions.appendChild(b);
  }
  const reset = el('button', { class: 'btn btn-small', type: 'button' }, 'Clear the whole query');
  reset.addEventListener('click', clearAll);
  actions.appendChild(reset);
  box.appendChild(actions);
  return box;
}

function renderCount() {
  const n = RESULTS.length;
  const head = document.getElementById('count');
  head.innerHTML = '';
  head.append(
    document.createTextNode(HH.num(n) + (n === 1 ? ' event' : ' events')),
    el('span', null, ' of ' + HH.num(INDEX.length))
  );
}

function renderCompareBar() {
  const bar = document.getElementById('compare-bar');
  bar.innerHTML = '';
  if (!SELECTED.size) { bar.hidden = true; return; }
  bar.hidden = false;
  const ids = Array.from(SELECTED);
  bar.append(el('span', null, ids.length + ' of ' + META.compare_max +
    ' selected for comparison'));
  const go = el('a', { class: 'btn btn-small', href: 'compare.html?e=' + ids.join(',') },
    ids.length === 1 ? 'Compare, add another there' : 'Compare these ' + ids.length);
  const clear = el('button', { class: 'btn btn-quiet btn-small', type: 'button' },
    'Clear the selection');
  clear.addEventListener('click', () => {
    SELECTED.clear(); renderTable(); renderCompareBar();
    HH.announce('Selection cleared.');
  });
  bar.append(go, clear);
}

/* ---- The filter builder -------------------------------------------- */

function buildFilterForm() {
  const holder = document.getElementById('builder');
  holder.innerHTML = '';
  const row = el('div', { class: 'filter-row' });

  const cSel = el('select', { id: 'f-char', 'aria-label': 'Measure' });
  Object.entries(META.characteristics).forEach(([k, c]) => {
    cSel.appendChild(el('option', { value: k }, c.label));
  });

  const oSel = el('select', { id: 'f-op', 'aria-label': 'Operator' });
  Object.entries(META.operators).forEach(([k, o]) => {
    oSel.appendChild(el('option', { value: k }, o.label));
  });

  const v1 = el('input', { type: 'number', id: 'f-v1', 'aria-label': 'Value', step: 'any' });
  const v2 = el('input', { type: 'number', id: 'f-v2', 'aria-label': 'Second value', step: 'any' });
  v2.hidden = true;

  const unit = el('span', { class: 'filter-unit', id: 'f-unit' });
  const note = document.getElementById('char-note');
  const sync = () => {
    const c = META.characteristics[cSel.value] || {};
    unit.textContent = c.unit || '';
    v1.step = c.step || 'any';
    v2.step = c.step || 'any';
    v2.hidden = oSel.value !== 'btw';
    // How the chosen number was produced, from the pipeline's own manifest. A
    // threshold means nothing without it: six inches of snow at one station
    // over four days is not six inches across the city in a night.
    note.textContent = c.note || '';
  };
  cSel.addEventListener('change', sync);
  oSel.addEventListener('change', sync);

  const add = el('button', { class: 'btn btn-small', type: 'button' }, 'Add threshold');
  add.addEventListener('click', () => {
    const values = [Number(v1.value)];
    if (oSel.value === 'btw') values.push(Number(v2.value));
    if (v1.value === '' || values.some(v => isNaN(v))) {
      HH.announce('Enter a number for the threshold.');
      v1.focus();
      return;
    }
    STATE.filters.push({ key: cSel.value, op: oSel.value, values: values });
    STATE.page = 1;
    v1.value = ''; v2.value = '';
    changed(true);
    document.getElementById('chips').focus?.();
  });

  const wrapCol = (labelText, control) => {
    const d = el('div');
    const l = el('label', { for: control.id }, labelText);
    d.append(l, control);
    return d;
  };

  // The unit belongs beside the number, not in a column of its own. On a phone
  // a column of its own put "F" on a line by itself under an empty box.
  const values = el('div', { class: 'filter-values' });
  values.append(el('label', { for: 'f-v1' }, 'Value'), v1, v2, unit);

  row.append(wrapCol('Measure', cSel), wrapCol('Operator', oSel), values, add);
  holder.appendChild(row);
  sync();
}

/* ---- Wiring -------------------------------------------------------- */

function readForm() {
  STATE.from = document.getElementById('from').value;
  STATE.to = document.getElementById('to').value;
  STATE.text = document.getElementById('q').value.trim();
  STATE.hazards = Array.from(document.querySelectorAll('input[name="hz"]:checked')).map(i => i.value);
  STATE.boroughs = Array.from(document.querySelectorAll('input[name="boro"]:checked')).map(i => i.value);
  STATE.page = 1;
}

function writeForm() {
  document.getElementById('from').value = STATE.from;
  document.getElementById('to').value = STATE.to;
  document.getElementById('q').value = STATE.text;
  document.querySelectorAll('input[name="hz"]').forEach(i => {
    i.checked = STATE.hazards.includes(i.value);
  });
  document.querySelectorAll('input[name="boro"]').forEach(i => {
    i.checked = STATE.boroughs.includes(i.value);
  });
}

function changed(keepScroll) {
  HH.url.write(STATE);
  run(keepScroll);
}

function run(keepScroll) {
  RESULTS = sortResults(INDEX.filter(matches));
  const pages = Math.max(1, Math.ceil(RESULTS.length / META.page_size));
  if (STATE.page > pages) STATE.page = pages;
  renderChips();
  renderCount();
  renderTable();
  renderCompareBar();
  HH.announce(HH.num(RESULTS.length) +
    (RESULTS.length === 1 ? ' event matches' : ' events match') + ' the query.');
  if (!keepScroll && window.scrollY > 400) {
    document.getElementById('results').scrollIntoView({ block: 'start' });
  }
}

function clearAll() {
  STATE = { from: '', to: '', hazards: [], boroughs: [], text: '', filters: [],
            sort: '-date', page: 1, compare: [] };
  writeForm();
  changed();
}

/* The hazard list is the normalised hazard values that actually occur, with the
   number of events holding each. It used to be grouped under Water, Winter,
   Temperature and Wind, which no source publishes. A count is a fact; a group
   was a claim. */
function buildFacets() {
  const counts = {};
  INDEX.forEach(e => e.h.forEach(h => { counts[h] = (counts[h] || 0) + 1; }));

  const hz = document.getElementById('hz-list');
  hz.innerHTML = '';
  Object.keys(META.hazards)
    .filter(k => counts[k])
    .sort((a, b) => counts[b] - counts[a])
    .forEach(k => {
      const id = 'hz-' + k;
      const row = el('div');
      const cb = el('input', { type: 'checkbox', name: 'hz', value: k, id: id });
      cb.addEventListener('change', () => { readForm(); changed(true); });
      const lab = el('label', { for: id, style: 'display:inline; font-weight:400' },
        ' ' + META.hazards[k].label + ' ');
      lab.appendChild(el('span', { class: 'val-note',
        style: 'display:inline; font-family:var(--mono)' }, HH.num(counts[k])));
      row.append(cb, lab);
      hz.appendChild(row);
    });

  const boro = document.getElementById('boro-list');
  boro.innerHTML = '';
  const places = META.borough_order.map(code => [code, META.boroughs[code].name]);
  // The harbour is a place in this record and holds events that name no
  // borough. Leaving it out of the list made those events unreachable here.
  places.push([HARBOR, 'New York Harbor']);
  places.forEach(([code, name]) => {
    const id = 'boro-' + code;
    const row = el('div');
    const cb = el('input', { type: 'checkbox', name: 'boro', value: code, id: id });
    cb.addEventListener('change', () => { readForm(); changed(true); });
    const n = code === HARBOR ? INDEX.filter(e => e.hb === 1).length
      : INDEX.filter(e => e.p.includes(code)).length;
    const lab = el('label', { for: id, style: 'display:inline; font-weight:400' },
      ' ' + name + ' ');
    lab.appendChild(el('span', { class: 'val-note',
      style: 'display:inline; font-family:var(--mono)' }, HH.num(n)));
    row.append(cb, lab);
    boro.appendChild(row);
  });
}

HH.start(function (meta) {
  META = meta;
  STATE = HH.url.read();
  buildFilterForm();
  writeForm();

  ['from', 'to'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => { readForm(); changed(true); });
  });
  let typing;
  document.getElementById('q').addEventListener('input', () => {
    window.clearTimeout(typing);
    typing = window.setTimeout(() => { readForm(); changed(true); }, 250);
  });
  document.getElementById('clear').addEventListener('click', clearAll);
  document.getElementById('copy').addEventListener('click', function () { HH.copyLink(this); });
  document.getElementById('download').addEventListener('click', downloadResults);
  document.getElementById('query-form').addEventListener('submit', e => e.preventDefault());

  window.addEventListener('popstate', () => {
    STATE = HH.url.read();
    writeForm();
    run(true);
  });

  HH.index().then(index => {
    INDEX = index;
    document.getElementById('loading').remove();
    // Facets need the counts, so they are built once the index is here rather
    // than left as an empty list until then.
    buildFacets();
    writeForm();
    // A query arriving with hazards or places set should not hide them behind
    // a closed disclosure.
    if (STATE.hazards.length || STATE.boroughs.length) {
      document.getElementById('facets-disclosure').open = true;
    }
    run(true);
  }).catch(err => HH.fail(document.getElementById('results'), err, 'The event index'));
});

/* The download is the current result set, not the visible page, and it carries
   the same column names the full download uses. */
function downloadResults() {
  const cols = ['event_id', 'name', 'begin', 'end', 'hazards', 'boroughs',
    'harbor', 'deaths_direct', 'rain_event_total_in', 'snow_event_total_in',
    'wind_fastest_2min_mph', 'damage_property_nominal_usd',
    'fema_declarations_count', 'fema_pa_declaration_usd',
    'fema_ia_declaration_usd', 'nfip_paid_usd', 'peak_water_level_ft_mllw',
    'peak_surge_ft'];
  const rows = [cols.join(',')];
  const q = v => v === null || v === undefined ? '' :
    ('"' + String(v).replace(/"/g, '""') + '"');
  RESULTS.forEach(e => {
    rows.push([e.id, e.n || '', e.b, e.e, e.h.join(';'), e.p.join(';'), e.hb,
      e.d, e.rt, e.st, e.wg, e.dp, e.dec, e.pa, e.ia, e.nf, e.tp, e.sg]
      .map(q).join(','));
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'hazard-historian-query.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  HH.announce('Downloaded ' + RESULTS.length + ' events as CSV.');
}
