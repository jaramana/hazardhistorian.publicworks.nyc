/* Shared shell: metadata, fetching, URL state, announcements.
   ------------------------------------------------------------------
   Every page loads meta.json once and nothing else globally. The search index
   is loaded only by the pages that search, because it is the largest shared
   file and an event page does not need it. */

// var, not const: every script shares one global scope, and two top-level
// const declarations of the same name are a syntax error that kills the page.
var HH = window.HH || (window.HH = {});

HH.base = (function () {
  // Works from a subdirectory as well as from the domain root, so a local
  // preview and the published site behave the same.
  const path = window.location.pathname;
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  return dir;
})();

HH.json = function (path) {
  return fetch(HH.base + path, { cache: 'no-cache' }).then(r => {
    if (!r.ok) throw new Error(path + ' answered ' + r.status);
    return r.json();
  });
};

let metaPromise = null;
HH.meta = function () {
  if (!metaPromise) metaPromise = HH.json('data/meta.json');
  return metaPromise;
};

let indexPromise = null;
HH.index = function () {
  if (!indexPromise) indexPromise = HH.json('data/index.json');
  return indexPromise;
};

HH.event = function (id) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return Promise.reject(new Error('bad id'));
  return HH.json('data/events/' + id + '.json');
};

/* ---- Announcements ------------------------------------------------
   A result count that changes without a word said is invisible to anyone not
   watching the screen. Every query change announces its outcome. */

HH.announce = function (text) {
  let live = document.getElementById('live');
  if (!live) {
    live = document.createElement('div');
    live.id = 'live';
    live.className = 'visually-hidden';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    document.body.appendChild(live);
  }
  // Clearing first makes a repeated identical message announce again.
  live.textContent = '';
  window.setTimeout(() => { live.textContent = text; }, 60);
};

/* A script error used to leave a section silently empty, which looks exactly
   like a section with nothing to report. On a site whose whole argument is that
   an empty space must explain itself, that is the worst possible failure mode.
   Anything uncaught now says so on the page. */
window.addEventListener('error', function (e) {
  HH.showScriptError(e.message + ' (' + (e.filename || '').split('/').pop() +
    ':' + e.lineno + ')');
});
window.addEventListener('unhandledrejection', function (e) {
  HH.showScriptError(String(e.reason && e.reason.message || e.reason));
});

HH.showScriptError = function (message) {
  if (document.getElementById('script-error')) return;
  const box = document.createElement('div');
  box.id = 'script-error';
  box.className = 'error';
  box.setAttribute('role', 'alert');
  const h = document.createElement('h3');
  h.textContent = 'Part of this page did not build';
  const p = document.createElement('p');
  p.textContent = 'Something below may be missing rather than empty. This is a ' +
    'fault in the site, not an absence in the data.';
  const detail = document.createElement('p');
  detail.className = 'val-note';
  detail.textContent = message;
  box.append(h, p, detail);
  const main = document.querySelector('main');
  if (main) main.insertBefore(box, main.firstChild);
};

HH.fail = function (container, error, what) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'error';
  const h = document.createElement('h3');
  h.textContent = 'This did not load';
  const p = document.createElement('p');
  p.textContent = (what || 'The data') + ' could not be read. ' +
    'The site is static, so this is usually a network problem or a file that ' +
    'has not been published yet.';
  const detail = document.createElement('p');
  detail.className = 'val-note';
  detail.textContent = String(error && error.message ? error.message : error);
  box.append(h, p, detail);
  container.appendChild(box);
  HH.announce('The data could not be loaded.');
};

/* ---- Scrollable regions --------------------------------------------
   A table that scrolls sideways is unreachable from a keyboard unless the
   scroller itself can take focus, and invisible unless something marks its
   edge. The edge shadow is CSS. This adds the focus, the accessible name and
   the spoken hint, and it adds the tab stop only while there really is more
   table to the right, so a page of narrow tables does not fill up with empty
   stops. */

HH.scrollable = function (wrap, label) {
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', label);
  const sync = () => {
    const over = wrap.scrollWidth > wrap.clientWidth + 2;
    if (over) wrap.setAttribute('tabindex', '0');
    else wrap.removeAttribute('tabindex');
    let hint = wrap.nextElementSibling;
    if (hint && hint.classList.contains('scroll-hint')) hint.remove();
    if (over) {
      hint = document.createElement('p');
      hint.className = 'scroll-hint';
      hint.textContent = 'This table is wider than the screen. Scroll it ' +
        'sideways, or focus it and use the arrow keys.';
      wrap.after(hint);
    }
  };
  sync();
  if ('ResizeObserver' in window) new ResizeObserver(sync).observe(wrap);
  else window.addEventListener('resize', sync);
  return wrap;
};

/* ---- Grain ----------------------------------------------------------
   What one row of the source is, what window was counted, and who published
   it, in one line under the numbers it produced. A station reading, a
   resident's complaint, an insurance claim and a federal declaration are four
   different units of observation and they sit side by side on an event page.

   The line carries no label. It occupies a caption's position and reads as
   one, and "Grain:" printed nine times down a page is furniture. */

HH.grain = function (keys, meta, extra) {
  const el = document.createElement('p');
  el.className = 'grain';
  const list = Array.isArray(keys) ? keys : [keys];
  const parts = list.map(k => (meta.sources[k] || {}).grain).filter(Boolean);
  if (extra) parts.push(extra);
  parts.push(list.map(k => (meta.sources[k] || {}).name).filter(Boolean).join('; '));
  el.textContent = parts.join(' · ');
  return el;
};

/* ---- The secondary menu ---------------------------------------------
   "On this page", built from the sections that are actually on it. A long page
   gets one of these and gets nothing else: a row of jump buttons above the
   content and a rail beside it are the same menu twice. */

HH.buildRail = function (listId) {
  const rail = document.getElementById(listId);
  if (!rail) return;
  const sections = Array.from(document.querySelectorAll('main .section[id]'))
    .filter(s => !s.hidden);
  rail.innerHTML = '';
  sections.forEach(s => {
    const h = s.querySelector('h2');
    if (!h) return;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + s.id;
    a.textContent = h.textContent.trim();
    li.appendChild(a);
    rail.appendChild(li);
  });

  if (!('IntersectionObserver' in window)) return;
  const obs = new IntersectionObserver(entries => {
    entries.forEach(en => {
      const link = rail.querySelector('a[href="#' + en.target.id + '"]');
      if (link && en.isIntersecting) {
        rail.querySelectorAll('a').forEach(a => a.removeAttribute('aria-current'));
        link.setAttribute('aria-current', 'true');
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });
  sections.forEach(s => obs.observe(s));
};

/* ---- URL state ----------------------------------------------------
   The query lives in the address bar. Not a copy of it, the query itself: the
   page reads its state from the URL on load and writes it back on change, so a
   link and the screen can never disagree. */

HH.url = {
  read: function () {
    const p = new URLSearchParams(window.location.search);
    return {
      from: p.get('from') || '',
      to: p.get('to') || '',
      hazards: (p.get('hz') || '').split(',').filter(Boolean),
      boroughs: (p.get('boro') || '').split(',').filter(Boolean),
      text: p.get('q') || '',
      filters: p.getAll('c').map(HH.url.parseFilter).filter(Boolean),
      sort: p.get('sort') || '-date',
      page: Math.max(1, parseInt(p.get('page') || '1', 10) || 1),
      compare: (p.get('e') || '').split(',').filter(Boolean)
    };
  },

  // A characteristic filter is written measure:operator:value, or
  // measure:btw:low,high. Compact enough to read in a shared link.
  parseFilter: function (raw) {
    const parts = String(raw).split(':');
    if (parts.length < 3) return null;
    const [key, op] = parts;
    const values = parts.slice(2).join(':').split(',').map(Number);
    if (values.some(isNaN)) return null;
    if (op === 'btw' && values.length < 2) return null;
    if (!['gte', 'lte', 'btw'].includes(op)) return null;
    return { key: key, op: op, values: values };
  },

  writeFilter: function (f) {
    return f.key + ':' + f.op + ':' + f.values.join(',');
  },

  write: function (state, replace) {
    const p = new URLSearchParams();
    if (state.from) p.set('from', state.from);
    if (state.to) p.set('to', state.to);
    if (state.hazards.length) p.set('hz', state.hazards.join(','));
    if (state.boroughs.length) p.set('boro', state.boroughs.join(','));
    if (state.text) p.set('q', state.text);
    (state.filters || []).forEach(f => p.append('c', HH.url.writeFilter(f)));
    if (state.sort && state.sort !== '-date') p.set('sort', state.sort);
    if (state.page > 1) p.set('page', String(state.page));
    if (state.compare && state.compare.length) p.set('e', state.compare.join(','));
    const qs = p.toString();
    const url = window.location.pathname + (qs ? '?' + qs : '');
    if (replace) window.history.replaceState(state, '', url);
    else window.history.pushState(state, '', url);
    return url;
  },

  // The link back to a result set from an event page. Kept whole, so returning
  // from evidence to the query that found it never loses the query.
  backLink: function () {
    const saved = sessionStorage.getItem('hh:query');
    return saved || 'explore.html';
  },

  remember: function () {
    sessionStorage.setItem('hh:query',
      'explore.html' + window.location.search);
  }
};

/* ---- Copying a link ------------------------------------------------ */

HH.copyLink = function (button) {
  const url = window.location.href;
  const done = () => {
    const original = button.textContent;
    button.textContent = 'Link copied';
    HH.announce('Link copied to the clipboard.');
    window.setTimeout(() => { button.textContent = original; }, 2000);
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url).then(done, () => window.prompt('Copy this link', url));
  } else {
    window.prompt('Copy this link', url);
  }
};

/* ---- Footer --------------------------------------------------------
   A column plan and a closing colophon, which is the shape The Pay Gap and
   Schools Finder both use.

   The left column is the navigation, in the same words as the navigation. A
   footer that renames the pages above it makes a reader hold two maps of one
   site. The sources belong on the method page, where each one is listed with
   its grain, its coverage and its caveat; a bare list of publishers down here
   would be the same links stripped of everything that makes them useful. */

HH.REPO = 'https://github.com/jaramana/hazardhistorian.publicworks.nyc';

HH.footer = function (meta) {
  const el = document.querySelector('[data-chrome="footer"]');
  if (!el) return;
  const links = list => list.map(([href, text]) =>
    '<li><a href="' + href + '">' + text + '</a></li>').join('');

  el.className = 'footer';
  el.innerHTML =
    '<div class="wrap"><div class="footer-grid">' +
      '<div><h4>Views</h4><ul>' + links([
        ['explore.html', 'Explore events'],
        ['compare.html', 'Compare events'],
        ['dataflow.html', 'Data flow']
      ]) + '</ul></div>' +
      '<div><h4>Reference</h4><ul>' + links([
        ['method.html#downloads', 'Download the data'],
        ['method.html', 'Method and limits'],
        ['method.html#fields', 'Data dictionary'],
        ['method.html#sources', 'Sources and freshness']
      ]) + '</ul></div>' +
      '<div><h4>Sources</h4><ul>' + links([
        ['https://www.ncei.noaa.gov/products/storm-events-database', 'NOAA Storm Events'],
        ['https://www.ncei.noaa.gov/products/land-based-station/global-historical-climatology-network-daily', 'GHCN Daily'],
        ['https://tidesandcurrents.noaa.gov/', 'NOAA Tides and Currents'],
        ['https://www.fema.gov/about/openfema/data-sets', 'OpenFEMA']
      ]) + '</ul></div>' +
      '<div><h4>Project</h4><ul>' + links([
        ['about.html', 'About this site'],
        [HH.REPO, 'Source on GitHub'],
        [HH.REPO + '/issues', 'Report an error'],
        // publicworks.nyc is the index the other projects are filed under.
        // A link at the foot is the whole of its presence here.
        ['https://publicworks.nyc', 'publicworks.nyc']
      ]) + '</ul></div>' +
    '</div>' +
    '<p class="built">Built ' + HH.date(meta.built, { long: true }) + '. ' +
      HH.num(meta.events) + ' events, ' + meta.coverage.first + ' to ' +
      meta.coverage.last + '.</p>' +
    '<p class="colophon"><strong>An independent project.</strong> Not ' +
      'affiliated with, endorsed by or produced by New York City Emergency ' +
      'Management or the City of New York. It reconstructs a public record ' +
      'from published federal and city sources. Public data, public method, ' +
      'built with Python and ' +
      '<span class="wink" title="Four kinds of absence, and not one of them is a zero.">' +
      'strong opinions about empty cells</span>.</p>' +
    '</div>';
};

/* ---- Masthead -------------------------------------------------------
   Written once here rather than repeated on every page, which is the shape
   every project under publicworks.nyc uses. The markup and the measurements
   are set out in that repository's README; only --accent differs between
   sites. An event page belongs to the explorer, so it marks Explore. */

HH.pages = [
  { href: 'explore.html', nav: 'Explore' },
  { href: 'compare.html', nav: 'Compare' },
  { href: 'method.html',  nav: 'Method' },
  { href: 'about.html',   nav: 'About' }
];

/* A status line, so the instrument reports what it is showing. Any element
   with data-statusline gets it. The attribute is not data-status, which
   event.js already uses to carry the status of a single measure. */

HH.statusline = function (meta) {
  const nodes = document.querySelectorAll('[data-statusline]');
  if (!nodes.length) return;
  const txt = meta.coverage.first + '–' + meta.coverage.last + ' · ' +
    HH.num(meta.events) + ' events · ' +
    HH.num(meta.event_rows) + ' Weather Service records · built ' +
    HH.date(meta.built, { long: true });
  nodes.forEach(n => { n.textContent = txt; });
};

HH.masthead = function () {
  const head = document.querySelector('[data-chrome="masthead"]');
  if (!head) return;

  let here = window.location.pathname.split('/').pop() || 'index.html';
  if (here === 'event.html') here = 'explore.html';

  const links = HH.pages.map(p =>
    '<a href="' + p.href + '"' +
    (p.href === here ? ' aria-current="page"' : '') + '>' + p.nav + '</a>'
  ).join('');

  head.className = 'masthead';
  head.innerHTML =
    '<div class="wrap masthead-inner">' +
      '<a class="wordmark" href="index.html">NYC Hazard Historian</a>' +
      '<nav class="nav" aria-label="Sections">' + links + '</nav>' +
    '</div>';
};

/* ---- Page bootstrap ------------------------------------------------ */

HH.start = function (run) {
  document.addEventListener('DOMContentLoaded', function () {
    HH.masthead();
    HH.meta().then(meta => {
      HH.footer(meta);
      HH.statusline(meta);
      run(meta);
    }).catch(err => {
      const main = document.querySelector('main');
      if (main) HH.fail(main, err, 'The site metadata');
    });
  });
};
