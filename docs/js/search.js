/* The front-page search box.
   ------------------------------------------------------------------
   HHSearch.mount(host, { autofocus, placeholder, label })

   The same component The Pay Gap and Schools Finder open with, answering the
   question this record is actually asked. Those two sites search a list of
   named things: a civil service title, a school. This one cannot. Of the 906
   events here exactly one carries a name, because the Weather Service names
   almost nothing. So what a visitor can name is the hazard, the borough, the
   year, and Sandy.

   Those are the four things this box suggests, each with the number of events
   behind it, and each one leads to Explore with that query already in the
   address bar. Nothing is answered here: the box is a way into the query, not
   a second, smaller version of the explorer.

   Wrapped in a function of its own because every script on a page shares one
   global scope, and home.js already has an `el` of its own. */

(function () {
  'use strict';

  var HH = window.HH;

  const MIN_QUERY = 2;
  const MAX_RESULTS = 10;
  const HARBOR = 'HARBOR';       // the same place code the explorer uses

  /* One flat list of everything the box can offer, built once from the index
     and the metadata. Each entry carries the query it stands for, so a pick is
     a link and never a filter applied in here. */
  let catalogue = null;

  function build() {
    if (catalogue) return catalogue;
    catalogue = Promise.all([HH.meta(), HH.index()]).then(([meta, index]) => {
      const rows = [];

      const hazardCount = {};
      const boroughCount = {};
      const yearCount = {};
      let harbor = 0;
      index.forEach(e => {
        e.h.forEach(h => { hazardCount[h] = (hazardCount[h] || 0) + 1; });
        e.p.forEach(p => { boroughCount[p] = (boroughCount[p] || 0) + 1; });
        if (e.hb === 1) harbor++;
        yearCount[e.y] = (yearCount[e.y] || 0) + 1;
      });

      Object.keys(meta.hazards).forEach(key => {
        if (!hazardCount[key]) return;      // a hazard with no events is not a door
        rows.push({ kind: 'Hazard', label: meta.hazards[key].label,
          n: hazardCount[key], href: 'explore.html?hz=' + encodeURIComponent(key) });
      });

      meta.borough_order.forEach(code => {
        if (!boroughCount[code]) return;
        rows.push({ kind: 'Place', label: meta.boroughs[code].name,
          n: boroughCount[code], href: 'explore.html?boro=' + encodeURIComponent(code) });
      });
      // The harbour holds events that name no borough, so it is a place here
      // exactly as it is in the explorer's own facet list.
      if (harbor) {
        rows.push({ kind: 'Place', label: 'New York Harbor', n: harbor,
          href: 'explore.html?boro=' + HARBOR });
      }

      index.filter(e => e.n).forEach(e => {
        rows.push({ kind: 'Event', label: e.n, n: null, note: HH.date(e.b),
          href: 'explore.html?q=' + encodeURIComponent(e.n) });
      });

      return { rows: rows, years: yearCount, index: index, meta: meta };
    });
    return catalogue;
  }

  /* The same text a query typed into Explore is matched against, so the count
     this box promises is the count that page then shows. */
  const HAY = new Map();
  function haystack(e, meta) {
    let s = HAY.get(e.id);
    if (s === undefined) {
      s = ((e.n || '') + ' ' + e.h.join(' ') + ' ' +
        e.h.map(h => (meta.hazards[h] || {}).label || '').join(' ') + ' ' +
        e.id).toLowerCase();
      HAY.set(e.id, s);
    }
    return s;
  }

  // Prefix beats the start of a later word beats a match buried inside one,
  // then the larger group first. Typing "flo" should reach Flash flooding
  // before Coastal flooding.
  function rank(label, q) {
    const name = label.toLowerCase();
    const at = name.indexOf(q);
    if (at === -1) return null;
    return { at: at, rank: at === 0 ? 0 : /[\s\-\/]/.test(name.charAt(at - 1)) ? 1 : 2 };
  }

  function suggest(data, raw) {
    const q = raw.toLowerCase();
    const out = [];

    data.rows.forEach(row => {
      const r = rank(row.label, q);
      if (r) out.push(Object.assign({ _rank: r.rank, _at: r.at }, row));
    });
    out.sort((a, b) => a._rank - b._rank || a._at - b._at || (b.n || 0) - (a.n || 0));

    // A bare year is unambiguous, so it goes to the top rather than competing
    // with the text of a hazard name.
    if (/^\d{4}$/.test(raw) && data.years[raw]) {
      out.unshift({ kind: 'Year', label: raw, n: data.years[raw],
        href: 'explore.html?from=' + raw + '-01-01&to=' + raw + '-12-31' });
    }

    const list = out.slice(0, MAX_RESULTS - 1);

    // And the query as typed, always last: whatever the suggestions above did
    // or did not cover, the words themselves are a query this record answers.
    const n = data.index.filter(e => haystack(e, data.meta).includes(q)).length;
    if (n) {
      list.push({ kind: 'Text', label: '“' + raw + '” anywhere in the record',
        n: n, href: 'explore.html?q=' + encodeURIComponent(raw) });
    }
    return list;
  }

  function mount(host, opts) {
    host = typeof host === 'string' ? document.querySelector(host) : host;
    if (!host) return null;
    const o = opts || {};
    let active = -1;
    const id = 'hh-search-' + Math.random().toString(36).slice(2, 8);

    host.classList.add('search-shell');
    host.innerHTML =
      '<div class="search-row">' +
        '<label class="visually-hidden" for="' + id + '-input">' +
          (o.label || 'Search the record by hazard, place or year') + '</label>' +
        '<input id="' + id + '-input" type="search" autocomplete="off" ' +
               'spellcheck="false" role="combobox" aria-expanded="false" ' +
               'aria-autocomplete="list" aria-controls="' + id + '" ' +
               'placeholder="' + (o.placeholder || 'Loading the record…') + '">' +
      '</div>' +
      '<ul class="results" role="listbox" id="' + id + '" ' +
          'aria-label="Suggestions"></ul>';

    const input = host.querySelector('input');
    const results = host.querySelector('.results');

    build().then(data => {
      input.placeholder = o.placeholder || ('Search ' + HH.num(data.index.length) +
        ' events by hazard, place or year…');
    }).catch(err => HH.fail(host, err, 'The event index'));

    function el(tag, cls, text) {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined) n.textContent = text;
      return n;
    }

    function render(list) {
      results.innerHTML = '';
      active = -1;
      input.setAttribute('aria-expanded', list.length ? 'true' : 'false');
      input.removeAttribute('aria-activedescendant');
      list.forEach((row, i) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.id = id + '-opt-' + i;
        const b = document.createElement('button');
        b.type = 'button';
        const meta = row.n === null || row.n === undefined
          ? row.kind + ' · ' + row.note
          : row.kind + ' · ' + HH.num(row.n) +
            (row.n === 1 ? ' event' : ' events');
        b.append(el('span', 'r-name', row.label), el('span', 'meta mono', meta));
        b.addEventListener('click', () => { location.href = row.href; });
        li.appendChild(b);
        results.appendChild(li);
      });
    }

    /* A search that finds nothing says so. Everywhere else on this site an
       empty space has to account for itself, and a dropdown that simply does
       not appear is the one place that would have been allowed not to. */
    function renderEmpty(raw) {
      results.innerHTML = '';
      active = -1;
      input.setAttribute('aria-expanded', 'true');
      const li = document.createElement('li');
      li.className = 'empty';
      // Not an option: there is nothing to choose. The listbox holds only
      // things a reader can pick, and the sentence is spoken by HH.announce.
      li.setAttribute('role', 'presentation');
      li.append(el('span', null, 'No hazard, place, year or event text matches ' +
        '“' + raw + '”.'));
      results.appendChild(li);
    }

    function run() {
      const raw = input.value.trim();
      if (raw.length < MIN_QUERY) { render([]); return; }
      build().then(data => {
        const list = suggest(data, raw);
        if (list.length) render(list);
        else renderEmpty(raw);
        HH.announce(list.length
          ? list.length + (list.length === 1 ? ' suggestion' : ' suggestions')
          : 'Nothing matches ' + raw + '.');
      });
    }

    function move(step) {
      const items = results.querySelectorAll('li:not(.empty)');
      if (!items.length) return;
      if (active >= 0) {
        items[active].classList.remove('active');
        items[active].setAttribute('aria-selected', 'false');
      }
      active = (active + step + items.length) % items.length;
      items[active].classList.add('active');
      items[active].setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', items[active].id);
      items[active].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('input', run);
    input.addEventListener('keydown', e => {
      const items = results.querySelectorAll('li:not(.empty)');
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (active >= 0 && items[active]) items[active].querySelector('button').click();
        else {
          // Enter on a query nobody has stepped into is still a query. It goes
          // to Explore as typed rather than guessing at the first suggestion,
          // which on this record is usually a hazard the reader did not ask for.
          const raw = input.value.trim();
          if (raw.length >= MIN_QUERY) {
            location.href = 'explore.html?q=' + encodeURIComponent(raw);
          }
        }
      } else if (e.key === 'Escape') { render([]); }
    });

    document.addEventListener('click', e => {
      if (!host.contains(e.target)) render([]);
    });

    if (o.autofocus && window.matchMedia('(hover: hover)').matches) input.focus();

    return {
      focus: function () { input.focus(); },
      clear: function () { input.value = ''; render([]); },
      setValue: function (v) { input.value = v; if (v) run(); }
    };
  }

  window.HHSearch = { mount: mount };
})();
