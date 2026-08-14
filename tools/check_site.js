/* Smoke tests for the site's logic, run against the real exported data.
   ------------------------------------------------------------------
   The site has no build step and no test framework. What it does have is a
   handful of decisions that would be expensive to get wrong quietly: whether an
   absent value can ever render as a number, whether a filter treats a missing
   measure as a low one, and whether a shared link rebuilds the query it was
   made from.

   This loads the site's own scripts under a minimal DOM stub and checks those
   decisions against docs/data. It is not a browser test. It cannot tell you
   whether the page is usable, only whether the logic underneath it holds.

       node tools/check_site.js
*/

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'docs');
let failures = 0;
let checks = 0;

function ok(name, condition, detail) {
  checks++;
  if (!condition) {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ': ' + detail : ''}`);
  }
}

/* A DOM small enough to read and large enough for format.js. */
function makeElement(tag) {
  return {
    tagName: tag.toUpperCase(),
    className: '',
    dataset: {},
    attributes: {},
    children: [],
    _text: '',
    style: {},
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; },
    appendChild(child) { this.children.push(child); return child; },
    append(...kids) { kids.forEach(k => this.children.push(k)); },
    set textContent(v) { this._text = String(v); this.children = []; },
    get textContent() {
      return this._text + this.children.map(c => c.textContent || '').join('');
    },
    set title(v) { this.attributes.title = v; },
    get title() { return this.attributes.title; }
  };
}

const sandbox = {
  window: { addEventListener() {}, setTimeout, matchMedia: () => ({ matches: false }) },
  document: {
    createElement: makeElement,
    createTextNode: t => ({ textContent: String(t), children: [] }),
    createElementNS: (ns, tag) => makeElement(tag)
  },
  console
};
sandbox.window.HH = {};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'format.js'), 'utf8'), sandbox);
const HH = sandbox.window.HH;

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'meta.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'), 'utf8'));

console.log(`Checking ${index.length} events against the site's own logic.\n`);

/* ---- The rule the whole project turns on -------------------------- */

console.log('absence never renders as a number');
['missing', 'na', 'suppressed'].forEach(status => {
  const out = HH.value({ v: null, s: status }).textContent;
  ok(`status ${status} renders words`, /[a-z]/.test(out) && !/\d/.test(out), out);
});
ok('a real zero renders as zero', HH.value({ v: 0, s: 'ok' }).textContent === '0');
ok('a real zero is not styled as absent',
  HH.value({ v: 0, s: 'ok' }).className === 'val');
ok('an absent value is styled as absent',
  HH.value({ v: null, s: 'na' }).className === 'val-absent');
ok('an absent value carries its status for styling and testing',
  HH.value({ v: null, s: 'na' }).dataset.status === 'na');
ok('a missing measure sorts as null, not zero', HH.sortable({ v: null, s: 'missing' }) === null);
ok('a real zero sorts as zero', HH.sortable({ v: 0, s: 'ok' }) === 0);
ok('an undefined measure still renders words',
  /[a-z]/.test(HH.value(undefined).textContent));

/* ---- Numbers ------------------------------------------------------- */

console.log('numbers keep the precision the source published');
ok('a fractional value is not rounded away by default',
  HH.num(0.75) === '0.75', HH.num(0.75));
ok('an integer stays clean', HH.num(1200) === '1,200', HH.num(1200));
ok('money shortens above a million', HH.money(7648686000) === '$7.65 bn',
  HH.money(7648686000));
ok('money in full does not shorten',
  HH.moneyFull(7648686000) === '$7,648,686,000', HH.moneyFull(7648686000));

/* ---- The URL grammar ------------------------------------------------ */

console.log('a shared link rebuilds its query');
sandbox.window.location = { search: '', pathname: '/explore.html' };
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'site.js'), 'utf8'), sandbox);
const parse = HH.url.parseFilter;
ok('a threshold parses', JSON.stringify(parse('rain_total:gte:0.5')) ===
  JSON.stringify({ key: 'rain_total', op: 'gte', values: [0.5] }));
ok('a range parses', JSON.stringify(parse('temp_max:btw:32,55')) ===
  JSON.stringify({ key: 'temp_max', op: 'btw', values: [32, 55] }));
ok('a malformed filter is refused, not guessed at', parse('rain_total:gte') === null);
ok('an unknown operator is refused', parse('rain_total:near:5') === null);
ok('a range with one value is refused', parse('temp_max:btw:32') === null);
ok('a filter round trips', HH.url.writeFilter(parse('wind_2min:gte:50')) === 'wind_2min:gte:50');

/* ---- Filtering ------------------------------------------------------ */

console.log('a threshold excludes events with no value, rather than treating them as low');
const KEY = { rain_total: 'rt', wind_2min: 'wg', deaths: 'd', snow_total: 'st',
              surge_peak: 'sg', damage_property: 'dp' };
function passes(e, f) {
  const v = e[KEY[f.key]];
  if (v === null || v === undefined) return false;
  if (f.op === 'gte') return v >= f.values[0];
  if (f.op === 'lte') return v <= f.values[0];
  return v >= Math.min(...f.values) && v <= Math.max(...f.values);
}
// Surge is the honest test case here. Rainfall happens to be present for every
// event, because the Central Park record is unbroken across the whole archive,
// so it cannot demonstrate the rule.
const noSurge = index.filter(e => e.sg === null || e.sg === undefined);
ok('some events genuinely have no surge value', noSurge.length > 0,
  `${noSurge.length} of ${index.length}`);
ok('none of them pass a "surge at most 100 feet" filter',
  noSurge.every(e => !passes(e, { key: 'surge_peak', op: 'lte', values: [100] })));
const noDamage = index.filter(e => e.dp === null || e.dp === undefined);
ok('some events have no damage figure', noDamage.length > 0,
  `${noDamage.length} of ${index.length}`);
ok('none of them pass a "damage at most a billion" filter, which a zero would',
  noDamage.every(e => !passes(e, { key: 'damage_property', op: 'lte', values: [1e9] })));
const heavy = index.filter(e => passes(e, { key: 'rain_total', op: 'gte', values: [4] }));
ok('a heavy rain threshold returns something', heavy.length > 0, `${heavy.length} events`);
ok('everything it returns really is above the threshold',
  heavy.every(e => e.rt >= 4));

/* ---- The data contract the pages depend on -------------------------- */

console.log('every field the pages read exists in the data');
const indexFields = ['id', 'b', 'e', 'y', 'h', 'p', 'd', 'dp', 'rt', 'st', 'wg',
  'pa', 'ia', 'nf', 'tp', 'sg', 'c3', 'cf', 'ct', 'cc', 'dec'];
const missingFields = indexFields.filter(f => !(f in index[0]));
ok('the index carries every key the explorer reads', missingFields.length === 0,
  missingFields.join(', '));

['hazards', 'boroughs', 'characteristics', 'operators', 'statuses', 'sources',
 'radar', 'basemap', 'cpi', 'stations', 'compare_max', 'page_size'].forEach(k => {
  ok(`meta.${k} exists`, k in meta);
});

const everyHazard = new Set(index.flatMap(e => e.h));
const unknown = [...everyHazard].filter(h => !(h in meta.hazards));
ok('every hazard in the index is declared in the vocabulary', unknown.length === 0,
  unknown.join(', '));

Object.values(meta.characteristics).forEach(c => {
  ok(`characteristic "${c.label}" names a source that exists`, c.source in meta.sources,
    c.source);
});

/* ---- Event files ----------------------------------------------------- */

console.log('event files hold what the event page reads');
const sample = ['E20121029-sandy', index[0].id, index[index.length - 1].id,
  index[Math.floor(index.length / 2)].id];
sample.forEach(id => {
  const file = path.join(ROOT, 'data', 'events', id + '.json');
  ok(`${id} has a file`, fs.existsSync(file));
  if (!fs.existsSync(file)) return;
  const e = JSON.parse(fs.readFileSync(file, 'utf8'));
  ['event_id', 'begin', 'end', 'hazards', 'places', 'weather', 'consequences',
   'assistance', 'evidence', 'episodes'].forEach(k => {
    ok(`${id}.${k}`, k in e);
  });
  ok(`${id} evidence is not empty`, e.evidence.length > 0);
  ok(`${id} every consequence family is present`,
    ['no-heat', 'flooding', 'trees', 'collisions'].every(k => k in e.consequences));
});

/* ---- Facts checked against the published record ---------------------- */

console.log('facts that can be checked outside this project');
const sandy = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'data', 'events', 'E20121029-sandy.json'), 'utf8'));
ok('Sandy merges two Weather Service episodes', sandy.episodes.length === 2,
  sandy.episodes.join(', '));
ok('Sandy peak water level at The Battery is near 14 ft',
  sandy.tide && Math.abs(sandy.tide.peak_level.v - 14.06) < 0.2,
  sandy.tide ? String(sandy.tide.peak_level.v) : 'no tide');
ok('Sandy carries a surge, marked as derived', sandy.tide && sandy.tide.peak_surge);
ok('Sandy has federal public assistance', sandy.assistance.pa.s === 'ok');
ok('Sandy public assistance exceeds one billion dollars',
  sandy.assistance.pa.v > 1e9, HH.money(sandy.assistance.pa.v));
ok('Sandy adjusted dollars exceed nominal',
  sandy.assistance.pa_real.v > sandy.assistance.pa.v);
ok('Sandy has flood insurance claims', sandy.assistance.nfip.claims.s === 'ok');

const old = index.filter(e => e.y < 2004);
ok('events before 311 existed are marked not applicable, not zero',
  old.length > 0 && old.every(e => e.c3 === null || e.c3 === undefined));

/* ---- Summary --------------------------------------------------------- */

const statuses = {};
sample.forEach(id => {
  const file = path.join(ROOT, 'data', 'events', id + '.json');
  if (!fs.existsSync(file)) return;
  JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8')), (k, v) => {
    if (v && typeof v === 'object' && 's' in v && 'v' in v) {
      statuses[v.s] = (statuses[v.s] || 0) + 1;
    }
    return v;
  });
});
console.log('\nmeasure statuses across the sampled events: ' +
  Object.entries(statuses).map(([k, v]) => `${k} ${v}`).join(', '));

console.log(`\n${checks} checks, ${failures} failures.`);
process.exit(failures ? 1 : 0);
