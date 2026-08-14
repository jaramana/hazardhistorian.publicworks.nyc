/* Rendering values, and rendering their absence.
   ------------------------------------------------------------------
   Every number on this site passes through here. The pipeline gives each
   measure a status, and this file is the only place that decides what a status
   looks like. That is deliberate: the failure this project exists to fix is a
   missing value picking up a zero somewhere between the data and the screen,
   and it can only happen once if there is only one place it could happen. */

// var, not const: every script shares one global scope, and two top-level
// const declarations of the same name are a syntax error that kills the page.
var HH = window.HH || (window.HH = {});

HH.STATUS_TEXT = {
  ok: 'Reported',
  missing: 'Not reported',
  na: 'Not collected then',
  suppressed: 'Withheld',
  censored: 'A bound, not a value'
};

/* Short text shown in place of a number. Written out rather than left blank,
   because a blank cell reads as an oversight and an em dash reads as a zero. */
HH.ABSENT_TEXT = {
  missing: 'not reported',
  na: 'not collected then',
  suppressed: 'withheld',
  censored: 'bound only'
};

HH.num = function (value, digits) {
  if (value === null || value === undefined) return '';
  const n = Number(value);
  if (digits === undefined) {
    // Without an explicit precision, keep whatever the source published up to
    // two places. Rounding 0.75 inches of rain to "1 in" by default would be a
    // quiet falsification of a measured value.
    digits = Number.isInteger(n) ? 0 : 2;
  }
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
};

HH.money = function (value) {
  if (value === null || value === undefined) return '';
  const n = Number(value);
  // Whole dollars below a million, then short forms, because a nine figure
  // obligation read digit by digit tells a reader nothing.
  if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + ' bn';
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + ' m';
  return '$' + HH.num(Math.round(n));
};

HH.moneyFull = function (value) {
  if (value === null || value === undefined) return '';
  return '$' + HH.num(Math.round(Number(value)));
};

/* The core renderer. Give it a measure and get back an element, never a string,
   so the absence carries its own markup and its own accessible text. */
HH.value = function (measure, opts) {
  opts = opts || {};
  const el = document.createElement('span');
  if (!measure) {
    el.className = 'val-absent';
    el.dataset.status = 'missing';
    el.textContent = HH.ABSENT_TEXT.missing;
    el.title = 'This measure was not built for this event.';
    return el;
  }
  if (measure.s !== 'ok') {
    el.className = 'val-absent';
    el.dataset.status = measure.s;
    // A caller may name the absence more exactly than the status can. "Not
    // collected then" is about a period; a water level that was never asked for
    // is not about a period at all.
    el.textContent = opts.absentText || HH.ABSENT_TEXT[measure.s] || measure.s;
    const why = measure.n ? ' ' + measure.n : '';
    el.title = (HH.STATUS_TEXT[measure.s] || measure.s) + '.' + why;
    // Screen readers get the reason, not just the phrase.
    el.setAttribute('aria-label', (HH.STATUS_TEXT[measure.s] || measure.s) + why);
    if (measure.n && !opts.hideNote) {
      // The reason is shown, not only offered on hover. "Not collected then"
      // and "no federal declaration for this event" are different facts, and a
      // reader should not have to find a mouse to tell them apart.
      const wrap = document.createElement('span');
      const note = document.createElement('span');
      note.className = 'val-note';
      note.textContent = measure.n;
      wrap.appendChild(el);
      wrap.appendChild(note);
      return wrap;
    }
    return el;
  }

  el.className = 'val';
  const unit = opts.unit !== undefined ? opts.unit : (measure.u || '');
  let text;
  if (unit === '$') {
    text = opts.full ? HH.moneyFull(measure.v) : HH.money(measure.v);
  } else {
    text = HH.num(measure.v, opts.digits) + (unit ? ' ' + unit : '');
  }
  el.textContent = text;
  if (measure.n && !opts.hideNote) {
    const note = document.createElement('span');
    note.className = 'val-note';
    note.textContent = measure.n;
    const wrap = document.createElement('span');
    wrap.appendChild(el);
    wrap.appendChild(note);
    return wrap;
  }
  return el;
};

/* A plain-text form, for table cells that are sorted and for CSV-like output. */
HH.valueText = function (measure, opts) {
  if (!measure || measure.s !== 'ok') {
    return measure ? (HH.ABSENT_TEXT[measure.s] || measure.s) : '';
  }
  opts = opts || {};
  const unit = opts.unit !== undefined ? opts.unit : (measure.u || '');
  if (unit === '$') return HH.moneyFull(measure.v);
  return HH.num(measure.v, opts.digits) + (unit ? ' ' + unit : '');
};

HH.sortable = function (measure) {
  // Absent values sort last in both directions rather than sorting as zero.
  return (measure && measure.s === 'ok') ? measure.v : null;
};

/* Dates. The record spans 1958 to now, so a two-digit year is never used. */
HH.date = function (iso, opts) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T'));
  if (isNaN(d)) return iso;
  const fmt = (opts && opts.long)
    ? { day: 'numeric', month: 'long', year: 'numeric' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  return d.toLocaleDateString('en-GB', fmt);
};

HH.dateTime = function (iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T'));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

/* A range, written as short as it can be without losing anything.

   "6 Sept 2008 to 7 Sept 2008" was the widest string in the results table and
   the first thing to overflow a phone. A range inside one month keeps one
   month and one year; a range inside one year keeps one year. Nothing is
   dropped that is not repeated. */
HH.dateRange = function (a, b) {
  const d1 = HH.date(a), d2 = HH.date(b);
  if (d1 === d2) return d1;
  const p1 = d1.split(' '), p2 = d2.split(' ');
  if (p1.length === 3 && p2.length === 3) {
    if (p1[1] === p2[1] && p1[2] === p2[2]) {
      return p1[0] + '–' + p2[0] + ' ' + p2[1] + ' ' + p2[2];
    }
    if (p1[2] === p2[2]) {
      return p1[0] + ' ' + p1[1] + ' to ' + p2[0] + ' ' + p2[1] + ' ' + p2[2];
    }
  }
  return d1 + ' to ' + d2;
};

HH.duration = function (a, b) {
  const ms = new Date(b.replace(' ', 'T')) - new Date(a.replace(' ', 'T'));
  if (!(ms >= 0)) return '';
  // A tornado or a lightning strike is filed with the same begin and end time.
  // "0 hours" reads as a missing duration; it is a real instant.
  if (ms === 0) return 'recorded at one moment';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return minutes + (minutes === 1 ? ' minute' : ' minutes');
  const hours = Math.round(ms / 3600000);
  if (hours < 48) return hours + (hours === 1 ? ' hour' : ' hours');
  const days = Math.round(hours / 24);
  return days + (days === 1 ? ' day' : ' days');
};

/* A hazard chip, carrying the normalised hazard value the pipeline publishes.

   There was once a colour on these, one per presentation group: Water, Winter,
   Temperature, Wind. No source publishes those groups. They were this site's
   own invention, they put drought under Temperature and tropical cyclones under
   Wind, and a colour is a claim as much as a word is. Both the groups and the
   colours are gone, and the chip is just the name. */
HH.hazardTag = function (key, meta) {
  const h = (meta.hazards || {})[key] || { label: key };
  const el = document.createElement('span');
  el.className = 'hz-tag';
  el.textContent = h.label;
  return el;
};

HH.hazardList = function (keys, meta) {
  const wrap = document.createElement('span');
  wrap.className = 'hz';
  (keys || []).forEach(k => wrap.appendChild(HH.hazardTag(k, meta)));
  return wrap;
};

HH.boroughNames = function (codes, meta) {
  if (!codes || !codes.length) return 'Not stated';
  return codes.map(c => (meta.boroughs[c] || {}).name || c).join(', ');
};
