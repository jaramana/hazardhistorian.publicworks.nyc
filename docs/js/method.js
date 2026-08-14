/* The method page, which is also the data page.

   Method and data were two pages saying the same things twice: what a source
   publishes, what a status means, what a dollar is adjusted to. They are one
   page now. The parts that must not drift from the build, the status
   vocabulary, the source manifest and the last build's warnings, are rendered
   from the metadata the pipeline wrote rather than typed into the markup. */

// var, not const: every script shares one global scope, and two top-level
// const declarations of the same name are a syntax error that kills the page.
var HH = window.HH;

function el(tag, attrs, text) {
  const n = document.createElement(tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') n.className = v; else n.setAttribute(k, v);
  });
  if (text !== undefined) n.textContent = text;
  return n;
}

HH.start(function (meta) {
  document.getElementById('built').textContent = HH.date(meta.built, { long: true });
  document.getElementById('n-events').textContent = HH.num(meta.events);
  document.getElementById('n-rows').textContent = HH.num(meta.event_rows);
  document.getElementById('base-year').textContent = meta.cpi.base_year;
  document.getElementById('cpi-series').textContent = meta.cpi.series;

  // Statuses, straight from the pipeline's own vocabulary.
  const dl = document.getElementById('status-list');
  Object.entries(meta.statuses).forEach(([code, label]) => {
    const row = el('div', { class: 'stat' });
    const dt = el('dt');
    dt.appendChild(el('code', null, code));
    const dd = el('dd', null, label);
    dd.style.textAlign = 'left';
    row.append(dt, dd);
    dl.appendChild(row);
  });

  const tbody = document.getElementById('sources-body');
  Object.entries(meta.sources).forEach(([key, s]) => {
    const tr = el('tr');
    const th = el('th', { scope: 'row' });
    const a = el('a', { href: s.url, rel: 'noopener' }, s.name);
    th.appendChild(a);
    th.appendChild(el('span', { class: 'val-note' }, s.publisher));
    tr.appendChild(th);
    tr.appendChild(el('td', null, s.grain));
    tr.appendChild(el('td', null, s.coverage));
    tr.appendChild(el('td', null, s.caveat || 'None recorded.'));
    tbody.appendChild(tr);
  });
  HH.scrollable(document.getElementById('sources-wrap'),
    'Sources the build read');
  HH.buildRail('rail-list');

  // Warnings the last build raised. Published rather than hidden, because a
  // warning a reader cannot see is a warning nobody acts on.
  const warns = document.getElementById('warnings');
  const list = (meta.validation && meta.validation.warnings) || [];
  if (!list.length) {
    warns.appendChild(el('p', null, 'The last build raised no warnings.'));
  } else {
    const ul = el('ul');
    list.forEach(([check, detail]) => {
      const li = el('li');
      li.append(el('b', null, check + '. '), document.createTextNode(detail));
      ul.appendChild(li);
    });
    warns.appendChild(ul);
  }
});
