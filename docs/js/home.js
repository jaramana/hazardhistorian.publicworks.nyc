/* The home page: what the collection is, how big it is, and four doors into it.

   The four featured events are picked from the data rather than hard-coded, so
   the list cannot go stale, and each is picked on a different measure so that
   one large storm cannot fill the row.

   Federal assistance is deliberately not one of those measures. Assistance is
   obligated against a disaster declaration, and a declaration can cover a whole
   season: DR-1083 is attached to fourteen events in this archive and carries
   the same total on every one of them. Ranking events by it would say the money
   belonged to a storm, which is exactly what the source does not say. */

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
  // Mounted first, so the box is there to type into while the index is still
  // arriving. It loads the index itself and shares HH.index()'s single fetch
  // with everything below.
  HHSearch.mount('#home-search', { autofocus: true });

  document.getElementById('span').textContent =
    meta.coverage.first + ' to ' + meta.coverage.last;

  HH.index().then(index => {
    document.getElementById('jump-count').textContent =
      HH.num(index.length) + ' events, filtered by date, hazard, borough or a ' +
      'threshold you set';

    const strip = document.getElementById('strip');
    strip.innerHTML = '';
    [[HH.num(meta.events), 'events'],
     [HH.num(meta.event_rows), 'Weather Service records'],
     [meta.coverage.first + '–' + meta.coverage.last, 'years covered'],
     [HH.num(meta.declarations), 'federal declarations'],
     [HH.num(index.filter(e => e.b >= '1995').length), 'inside the radar archive']
    ].forEach(([value, label]) => {
      const d = el('div');
      d.append(el('span', { class: 'metric' }, value),
               el('span', { class: 'metric-label' }, label));
      strip.appendChild(d);
    });

    // Each pick is on its own measure, and each has to be a different event.
    const picks = [];
    const take = (fn, why) => {
      const found = index.slice().sort(fn).find(e => !picks.some(p => p.e.id === e.id));
      if (found) picks.push({ e: found, why: why });
    };
    take((a, b) => (b.d || 0) - (a.d || 0), 'the most deaths recorded');
    take((a, b) => (b.dp || 0) - (a.dp || 0), 'the largest property damage estimate');
    take((a, b) => (b.rt || 0) - (a.rt || 0), 'the most rainfall recorded');
    take((a, b) => (b.st || 0) - (a.st || 0), 'the most snowfall recorded');

    const holder = document.getElementById('notable');
    holder.innerHTML = '';
    picks.forEach(({ e, why }) => {
      const card = el('article', { class: 'panel' });
      card.appendChild(el('p', { class: 'eyebrow' }, why));
      const h = el('h3');
      const a = el('a', { href: 'event.html?id=' + encodeURIComponent(e.id) },
        e.n || ((meta.hazards[e.h[0]] || {}).label || 'Event') + ', ' + HH.date(e.b));
      h.appendChild(a);
      const when = el('p', { class: 'event-date' }, HH.dateRange(e.b, e.e));
      card.append(h, when, HH.hazardList(e.h, meta));
      holder.appendChild(card);
    });
  }).catch(err => HH.fail(document.getElementById('notable'), err, 'The event index'));
});
