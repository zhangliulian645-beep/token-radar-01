// Token Radar browser app: state, hash routing and events around render.js.
// The page is one static file set: data arrives as window.RADAR from ../data.js,
// rendering is render.js's pure functions, and this file only wires them to the DOM.
'use strict';

const R = window.RadarRender;
const data = window.RADAR;
const state = { q: '', tier: 'all', category: '', chain: '', sortKey: 'rank', sortDir: 1, limit: 0 };

/** The route out of the location hash: '' for the board, 'p/<slug>' for a detail. */
function route() {
  const h = window.location.hash.replace(/^#\/?/, '');
  if (h.startsWith('p/')) return { view: 'detail', slug: decodeURIComponent(h.slice(2)) };
  return { view: 'board' };
}

/** Draw the current route into <main>, then rebind the board's controls if it has them. */
function draw() {
  const main = document.getElementById('board');
  const r = route();
  if (r.view === 'detail') {
    main.innerHTML = R.renderDetailView(data, r.slug);
  } else {
    main.innerHTML = R.renderBoardView(data, state);
    bindBoard(main);
  }
  main.setAttribute('aria-busy', 'false');
  window.scrollTo(0, 0);
}

/** Wire the controls and the sortable headers of the board view. */
function bindBoard(main) {
  const on = (id, ev, fn) => {
    const el = main.querySelector('#' + id);
    if (el) el.addEventListener(ev, fn);
  };
  on('q', 'input', (e) => { state.q = e.target.value; refreshTable(main); });
  on('tier', 'change', (e) => { state.tier = e.target.value; draw(); });
  on('category', 'change', (e) => { state.category = e.target.value; draw(); });
  on('chain', 'change', (e) => { state.chain = e.target.value; draw(); });
  main.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const k = th.getAttribute('data-sort');
      if (state.sortKey === k) state.sortDir = state.sortDir === 1 ? -1 : 1;
      else { state.sortKey = k; state.sortDir = k === 'rank' || k === 'name' ? 1 : -1; }
      draw();
    });
  });
  main.querySelectorAll('tr.brow').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      window.location.hash = '#/p/' + tr.getAttribute('data-slug');
    });
  });
}

/** Re-render only the board block (controls, table, live table) after a search keystroke. */
function refreshTable(main) {
  draw();
  const q = main.querySelector('#q');
  if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}

window.addEventListener('hashchange', draw);
draw();
