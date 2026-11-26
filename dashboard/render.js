// Token Radar dashboard rendering: pure functions from data to HTML strings.
// The browser app (app.js) and the screenshot prerenderer both call these, so what a
// screenshot shows is exactly what this code renders in the page. No DOM, no network.
'use strict';

/** Escape a value for HTML text or an attribute. */
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** $1.17B, $63.4M, $812K, $940: a dollar figure at three significant digits. */
function money(n) {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n);
}

/** A signed percent with one decimal, or an em dash when the snapshot reports none. */
function pct(n) {
  if (n == null || !isFinite(n)) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
}

/** CSS class for a percent: gains green, losses red, unreported muted. */
function pctClass(n) {
  if (n == null) return 'mut';
  return n > 0 ? 'up' : n < 0 ? 'down' : 'mut';
}

/** Days as a count with a year hint past two years: "312 days", "1,024 days (2.8y)". */
function ageText(days) {
  if (days == null) return 'not recorded';
  const d = Math.round(days).toLocaleString('en-US');
  return days >= 730 ? `${d} days (${(days / 365).toFixed(1)}y)` : `${d} days`;
}

/** The chains a row names, first two plus a count of the rest. */
function chainText(chains) {
  if (!chains || chains.length === 0) return '—';
  if (chains.length <= 2) return chains.join(', ');
  return `${chains[0]}, ${chains[1]} +${chains.length - 2}`;
}

/** Distinct sorted values of a field across rows, for the filter menus. */
function distinct(rows, pick) {
  const set = new Set();
  for (const r of rows) for (const v of pick(r)) if (v) set.add(v);
  return [...set].sort();
}

/** Rows after the state's search, tier, category and chain filters, then its sort. */
function applyState(rows, state) {
  let out = rows.filter((r) => {
    if (state.tier === 'watchlist' && !r.on_watchlist) return false;
    if (state.tier === 'early' && r.on_watchlist) return false;
    if (state.category && r.category !== state.category) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (state.q) {
      const q = state.q.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.slug.includes(q)) return false;
    }
    return true;
  });
  const key = state.sortKey || 'rank';
  const dir = state.sortDir || 1;
  const val = (r) => {
    switch (key) {
      case 'tvl': return r.tvl_usd;
      case 'growth': return r.change_7d == null ? -Infinity : r.change_7d;
      case 'age': return r.age_days == null ? -1 : r.age_days;
      case 'implied': return r.implied_value_usd;
      case 'name': return r.name.toLowerCase();
      default: return r.rank;
    }
  };
  out = out.slice().sort((a, b) => {
    const va = val(a), vb = val(b);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return a.rank - b.rank;
  });
  return out;
}

/** The page header: what this is, the snapshot it reads, and the screen's account of itself. */
function renderHeader(d) {
  const s = d.screen;
  return `<header class="mast">
    <div class="mast-top">
      <h1>Token Radar <span class="ver">${esc(d.model_version)}</span></h1>
      <p class="sub">Pre-token protocols ranked by implied launch value, each with the steps to farm it.</p>
    </div>
    <p class="src">Snapshot: DefiLlama protocol universe as of ${esc(d.as_of)} · ${esc(d.source)}</p>
    <div class="stats">
      <div class="stat"><b>${d.board_size}</b><span>protocols ranked</span></div>
      <div class="stat"><b>${s.watchlist}</b><span>watchlist covered, all of them</span></div>
      <div class="stat"><b>${s.ranked_early}</b><span>early finds below the $50M floor</span></div>
      <div class="stat"><b>${s.set_aside_below_floor + s.set_aside_above_floor}</b><span>set aside by the screen: bridges, staking wrappers and wrapped products that can never issue their own token</span></div>
    </div>
    <div class="model-box">
      <h2>The model, stated in full</h2>
      <p class="formula">implied = 186 × TVL<sup>0.72</sup> × growth × maturity<br>
      growth = 1 + 0.85 × g / (60 + |g|), g = 7-day TVL change clamped to [−80, +400]<br>
      maturity = 0.75 + 0.5 × min(days with no token, 1460) / 1460</p>
      <p class="model-note">Three inputs only, all from the snapshot: TVL, its 7-day change, and how long the
      protocol has run with no token. The TVL curve compresses size (a $7M protocol is credited 2.3× its TVL,
      a $2.7B one 0.43×) and growth saturates, so one hot week lifts a row but never launches it past fifty
      stagnant giants. Every candidate first passes the launch-plausibility screen: no bridges, no liquid
      staking or restaking wrappers, no wrapped or staked products, no versioned pools, no exchange house
      brands — the same rule the snapshot's watchlist was built with, applied to every row. Protocols whose
      token already trades are never ranked; they sit in their own table at the market's own prices.</p>
    </div>
  </header>`;
}

/** The filter and sort controls. In the page they are live; the values shown are the state's. */
function renderControls(d, state, shown, total) {
  const cats = distinct(d.rows, (r) => [r.category]);
  const chains = distinct(d.rows, (r) => r.chains);
  const opt = (v, cur, label) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label || v)}</option>`;
  return `<div class="controls">
    <label>Search <input id="q" type="search" value="${esc(state.q || '')}" placeholder="name or slug"></label>
    <label>Tier <select id="tier">${opt('all', state.tier, 'All ranked')}${opt('watchlist', state.tier, 'Watchlist only')}${opt('early', state.tier, 'Early finds only')}</select></label>
    <label>Category <select id="category">${opt('', state.category, 'All categories')}${cats.map((c) => opt(c, state.category)).join('')}</select></label>
    <label>Chain <select id="chain">${opt('', state.chain, 'All chains')}${chains.map((c) => opt(c, state.chain)).join('')}</select></label>
    <span class="count">Showing ${shown} of ${total} ranked</span>
  </div>`;
}

/** One board row as a table row. */
function boardRowHtml(r) {
  return `<tr data-slug="${esc(r.slug)}" class="brow" tabindex="0">
    <td class="rank">${r.rank}</td>
    <td class="name"><a href="#/p/${esc(r.slug)}">${esc(r.name)}</a>
      <span class="cat">${esc(r.category || 'Uncategorised')}</span></td>
    <td class="chains">${esc(chainText(r.chains))}</td>
    <td class="num">${money(r.tvl_usd)}</td>
    <td class="num ${pctClass(r.change_7d)}">${pct(r.change_7d)}</td>
    <td class="num">${r.age_days == null ? '—' : Math.round(r.age_days).toLocaleString('en-US') + 'd'}</td>
    <td class="num implied">${money(r.implied_value_usd)}</td>
    <td><span class="chip ${r.on_watchlist ? 'watch' : 'early'}">${r.on_watchlist ? 'WATCHLIST' : 'EARLY'}</span></td>
  </tr>`;
}

/** The ranked board: controls plus the table, capped at state.limit rows when set. */
function renderBoard(d, state) {
  const rows = applyState(d.rows, state);
  const shown = state.limit ? rows.slice(0, state.limit) : rows;
  const arrow = (k) => (state.sortKey === k ? (state.sortDir === 1 ? ' ▾' : ' ▴') : '');
  return `${renderControls(d, state, shown.length, d.rows.length)}
  <table class="board">
    <thead><tr>
      <th data-sort="rank">#${arrow('rank')}</th>
      <th data-sort="name">Protocol${arrow('name')}</th>
      <th>Chains</th>
      <th data-sort="tvl" class="num">TVL${arrow('tvl')}</th>
      <th data-sort="growth" class="num">7d${arrow('growth')}</th>
      <th data-sort="age" class="num">No-token age${arrow('age')}</th>
      <th data-sort="implied" class="num">Implied value${arrow('implied')}</th>
      <th>Tier</th>
    </tr></thead>
    <tbody>${shown.map(boardRowHtml).join('')}</tbody>
  </table>
  ${rows.length > shown.length ? `<p class="more">First ${shown.length} of ${rows.length} matching rows shown; the full board is in the page.</p>` : ''}`;
}

/** The already-trading table: the market's own values, kept apart from the ranked board. */
function renderLive(d) {
  return `<section class="live">
    <h2>Already trading — not ranked</h2>
    <p class="model-note">These protocols have a token; the radar claims nothing about them. Values are the
    market's own market caps from the same snapshot, shown so a reader can size the ranked board against reality.</p>
    <table class="board live-table">
      <thead><tr><th>Protocol</th><th>Token</th><th>Chains</th><th class="num">TVL</th><th class="num">7d</th><th class="num">Market cap</th></tr></thead>
      <tbody>${d.live.map((r) => `<tr>
        <td class="name">${esc(r.name)} <span class="cat">${esc(r.category || '')}</span></td>
        <td>${esc(r.symbol || '—')}</td>
        <td class="chains">${esc(chainText(r.chains))}</td>
        <td class="num">${money(r.tvl_usd)}</td>
        <td class="num ${pctClass(r.change_7d)}">${pct(r.change_7d)}</td>
        <td class="num">${money(r.mcap_usd)}</td></tr>`).join('')}</tbody>
    </table>
  </section>`;
}

/** A protocol's detail view: its record, the value arithmetic, and its farm plan. */
function renderDetail(d, r) {
  const g = r.change_7d == null ? 0 : Math.max(-80, Math.min(400, r.change_7d));
  return `<article class="detail">
    <p class="back"><a href="#/">← Back to the board</a></p>
    <h2>${esc(r.name)} <span class="chip ${r.on_watchlist ? 'watch' : 'early'}">${r.on_watchlist ? 'WATCHLIST' : 'EARLY FIND'}</span></h2>
    <p class="sub">${esc(r.category || 'Uncategorised')} · rank #${r.rank} of ${d.board_size} · pre-token</p>
    <div class="detail-cols">
      <section class="panel">
        <h3>The record</h3>
        <dl class="facts">
          <dt>TVL</dt><dd>${money(r.tvl_usd)}</dd>
          <dt>7-day TVL change</dt><dd class="${pctClass(r.change_7d)}">${pct(r.change_7d)}</dd>
          <dt>Chains</dt><dd>${esc(r.chains.join(', ') || '—')}</dd>
          <dt>Tracked since</dt><dd>${esc(r.listed_at || 'not recorded')}</dd>
          <dt>Time with no token</dt><dd>${esc(ageText(r.age_days))}</dd>
          <dt>DefiLlama slug</dt><dd>${esc(r.slug)}</dd>
        </dl>
        <h3>How the implied value is built</h3>
        <table class="breakdown">
          <tr><td>Size curve: 186 × TVL<sup>0.72</sup> on ${money(r.tvl_usd)}</td><td class="num">${money(r.base_value_usd)}</td></tr>
          <tr><td>Growth: 1 + 0.85 × ${g.toFixed(1)} / (60 + ${Math.abs(g).toFixed(1)})</td><td class="num">× ${r.growth_multiplier.toFixed(3)}</td></tr>
          <tr><td>Maturity: ${r.age_days == null ? 'age unrecorded, scored as 365 days' : `${Math.round(r.age_days).toLocaleString('en-US')} days with no token`}</td><td class="num">× ${r.maturity_multiplier.toFixed(3)}</td></tr>
          <tr class="total"><td>Implied launch value</td><td class="num implied">${money(r.implied_value_usd)}</td></tr>
        </table>
        <p class="model-note">That is a multiple of ${(r.implied_value_usd / Math.max(r.tvl_usd, 1)).toFixed(2)}× its TVL.
        Recompute it from the formula in the header: every figure above is the snapshot's own.</p>
      </section>
      <section class="panel">
        <h3>The farm plan</h3>
        <ol class="steps">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      </section>
    </div>
  </article>`;
}

/** The whole board view: header, board, then the already-trading table. */
function renderBoardView(d, state) {
  return `${renderHeader(d)}${renderBoard(d, state)}${renderLive(d)}
  <footer class="foot">Token Radar ${esc(d.model_version)} · implied values are the model's claim, computed from the snapshot alone · no network, no tracking, one static page.</footer>`;
}

/** The whole detail view for one slug. */
function renderDetailView(d, slug) {
  const r = d.rows.find((x) => x.slug === slug);
  if (!r) return `${renderHeader(d)}<p class="sub">No ranked protocol named ${esc(slug)}.</p>`;
  return `${renderHeader(d)}${renderDetail(d, r)}`;
}

const RadarRender = {
  esc, money, pct, pctClass, ageText, chainText, distinct, applyState,
  renderHeader, renderControls, renderBoard, renderLive, renderDetail,
  renderBoardView, renderDetailView,
};
if (typeof window !== 'undefined') window.RadarRender = RadarRender;
if (typeof module !== 'undefined' && module.exports) module.exports = RadarRender;
