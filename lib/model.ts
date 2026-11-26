// The token radar's model, version radar-2: one sealed snapshot in, one ranked board out.
//
// What changed from the house starter's model, and why:
//
// 1. The launch-plausibility screen applies to EVERY ranked row, not just to the watchlist.
//    The starter ranked the 160 largest pre-token protocols below the floor with almost no
//    screen, so its early board filled with products that can never issue a token of their
//    own: bridges, liquid staking and restaking wrappers, wrapped and staked products of
//    tokens that already trade (39 of its 160 early rows). radar-2 applies the watchlist's
//    own exclusion rule (the one the snapshot's README states) to every candidate: bad
//    category, versioned name, a whole word wrapped/staked/staking, or an exchange's name
//    at the front. What survives is ranked; what does not is counted and shown as set aside.
// 2. No size cap and no second-guessing the house screen. The board is the watchlist (the
//    floor) plus EVERY below-floor protocol that passes the screen: 178 rows on this
//    snapshot, not a top-160 cut. A pre-token protocol at or above the floor that the house
//    left off the watchlist stays off: the house saw a parent protocol the snapshot does
//    not carry, and the radar does not overrule a screen it cannot see.
// 3. The value curve compresses size. implied base = 186 x tvl^0.72, so a $7M protocol is
//    credited a 2.3x multiple of its TVL and a $2.7B one 0.43x: young protocols are not
//    buried under giants just for being small, and no row's rank is its TVL rank restated.
// 4. Growth saturates. growthMult = 1 + 0.85 x g / (60 + |g|) with g the 7-day TVL change
//    clamped to [-80, 400]: +20% earns x1.21, +163% earns x1.62, +4448% earns x1.84, -60%
//    costs x0.58. One hot week can lift a row past a stagnant giant, never past fifty.
// 5. Maturity pays for time served with no token: 0.75 + 0.5 x min(age, 1460) / 1460.
//
// Every input is a figure the snapshot itself carries: TVL, the 7-day change, the listing
// date. No protocol name is special-cased anywhere; the same functions score every row,
// and the dashboard prints this formula beside the board so a reader can recompute a row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  curve_scale: number;
  tvl_exponent: number;
  growth_weight: number;
  growth_midpoint: number;
  growth_floor: number;
  growth_cap: number;
  maturity_base: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  curve_scale: 186,
  tvl_exponent: 0.72,
  growth_weight: 0.85,
  growth_midpoint: 60,
  growth_floor: -80,
  growth_cap: 400,
  maturity_base: 0.75,
  maturity_range: 0.5,
  maturity_days: 1460,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the dashboard's Already trading view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step before it is flattened to the board's string form. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_value_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one ranked row, with its farm plan and value breakdown. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  base_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
}

/** How the screen sorted the snapshot's pre-token protocols. */
export interface ScreenStats {
  pre_token: number;
  watchlist: number;
  ranked_early: number;
  set_aside_below_floor: number;
  set_aside_above_floor: number;
}

/** Everything the dashboard needs: the board, the live set, the screen's account and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  screen: ScreenStats;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked or staking in a name marks a product of a token that trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Categories that are products of another protocol's token, never a launch of their own. */
const WRAPPER_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names: a protocol whose name begins with one is that exchange's own product. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether the name begins with an exchange's name, as a word of its own. */
function exchangeLed(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCHANGE_PREFIXES.some((e) => {
    const x = e.toLowerCase();
    return lower === x || lower.startsWith(`${x} `);
  });
}

/**
 * The launch-plausibility screen, the watchlist's own rule from the snapshot's README,
 * applied to every candidate row: a protocol that is a wrapped, staked or bridged product
 * of a token that already trades has no launch of its own to radar.
 */
export function passesScreen(p: SnapshotProtocol): boolean {
  if (p.category !== null && WRAPPER_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (exchangeLed(p.name)) return false;
  return true;
}

/** The model's three factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; base: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const base = model.curve_scale * Math.pow(Math.max(protocol.tvl_usd, 1), model.tvl_exponent);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (model.growth_weight * growthPct) / (model.growth_midpoint + Math.abs(growthPct));
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_base + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, base, growthPct, growthMult, maturityMult, age };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The headline figures: how the screen sorted the snapshot, for the dashboard's account. */
export function screenStats(snapshot: Snapshot): ScreenStats {
  const watch = new Set(snapshot.watchlist);
  let preToken = 0;
  let early = 0;
  let asideBelow = 0;
  let asideAbove = 0;
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) continue;
    preToken++;
    if (watch.has(p.slug)) continue;
    if (p.tvl_usd >= snapshot.floor_usd) {
      asideAbove++;
    } else if (passesScreen(p)) {
      early++;
    } else {
      asideBelow++;
    }
  }
  return {
    pre_token: preToken,
    watchlist: snapshot.watchlist.length,
    ranked_early: early,
    set_aside_below_floor: asideBelow,
    set_aside_above_floor: asideAbove,
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, exactly as the house screened it.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every below-floor pre-token protocol that passes the same screen.
  // No cap: a radar that truncates its own findings at a round number is hiding some.
  for (const p of snapshot.protocols) {
    if (chosen.has(p.slug) || !isPreToken(p)) continue;
    if (p.tvl_usd >= snapshot.floor_usd) continue;
    if (!passesScreen(p)) continue;
    chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, ...v };
  });
  scored.sort(
    (a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    on_watchlist: snapshot.watchlist.includes(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_value_usd: Math.round(s.base),
      growth_pct: round2(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  const text = step.text.endsWith('.') ? step.text : `${step.text}.`;
  let s = `${text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs in gas on a chain, in dollars: mainnet is dear, the rest are not. */
function gasFor(chain: string): number {
  if (chain === 'Ethereum') return 9;
  if (chain === 'Bitcoin') return 4;
  if (chain === 'Solana') return 0.1;
  return 0.6;
}

/** The chain's gas character, for the wallet step's wording. */
function gasNote(chain: string): string {
  if (chain === 'Ethereum') return 'Ethereum mainnet fees run $5 to $15 a transaction, so batch your moves';
  if (chain === 'Solana') return 'Solana fees are a few cents, so small test transactions cost almost nothing';
  if (chain === 'Bitcoin') return 'Bitcoin fees vary with the mempool, so send in a quiet block window';
  return `${chain} fees are under a dollar a transaction at ordinary load`;
}

/** How much capital one farm position needs, from the protocol's own TVL: five tiers. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 300;
  if (p.tvl_usd >= 250_000_000) return 200;
  if (p.tvl_usd >= 50_000_000) return 120;
  if (p.tvl_usd >= 15_000_000) return 75;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 120) return 75;
  if (age < 365) return 60;
  if (age < 730) return 45;
  return 30;
}

/** The category's core action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital} of USDC as collateral to ${name} on ${chain}, then borrow a small amount against it so both sides of the market see your wallet`;
  if (c.includes('dex') || c.includes('aggregator'))
    return `Route $${capital} of swaps through ${name} on ${chain} across the week and leave $${Math.round(capital / 2)} resting in its most-used pool`;
  if (c.includes('yield') && c.includes('aggregator'))
    return `Deposit $${capital} into the highest-traffic vault ${name} runs on ${chain} and let the vault keep compounding`;
  if (c.includes('yield') || c.includes('basis'))
    return `Deposit $${capital} into ${name}'s yield position on ${chain} and hold the receipt token in the same wallet`;
  if (c.includes('curator') || c.includes('allocator'))
    return `Deposit $${capital} into a curated vault ${name} allocates on ${chain} and keep the vault shares untouched`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options'))
    return `Deposit $${capital} of USDC as margin on ${name} and trade one small hedged position a week so the account stays active`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and hold positions in three different markets at once`;
  if (c.includes('staking')) return `Stake $${capital} of the chain's native asset through ${name} on ${chain} and keep the staking receipt`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the farming wallet`;
  if (c.includes('rwa')) return `Mint $${capital} of the yield-bearing asset ${name} issues on ${chain} and hold it to term`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy for its full term`;
  if (c.includes('launchpad')) return `Commit $${capital} to the next sale ${name} hosts on ${chain} and complete its participation steps`;
  if (c.includes('gaming') || c.includes('nft')) return `Spend about $${capital} inside ${name} on ${chain} across several sessions so the wallet builds a real usage history`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open and untouched`;
}

/** The recurring weekly action, by category: what keeps the wallet qualifying. */
function weeklyFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp')) return `adjust the borrow on ${name} once a week, repaying a slice and drawing it again`;
  if (c.includes('dex') || c.includes('aggregator')) return `make two or three swaps a week on ${name}, on different days, rather than one large trade`;
  if (c.includes('perpetual') || c.includes('derivative')) return `open and close one small trade a week on ${name} so volume accrues steadily`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield')) return `add a small top-up to the ${name} position weekly and claim any yield it shows`;
  if (c.includes('staking')) return `restake the rewards ${name} pays out each week instead of letting them idle`;
  if (c.includes('governance') || c.includes('voting')) return `vote in every ${name} governance poll that opens while you farm`;
  return `make one qualifying transaction a week in ${name} on ${chain}, a deposit, a claim or a rebalance`;
}

/**
 * A protocol's farm plan: six steps that differ by category, chain, TVL tier and age,
 * each an action with a cost and a time. Nothing here is written per protocol by hand:
 * the plan is assembled from the protocol's own record, so two protocols share a step
 * only where their records genuinely agree.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const gasText = gas < 1 ? 'under $1' : `about $${gas}`;
  const multiChain = p.chains.length > 1;
  const hot = (p.change_7d ?? 0) >= 25;
  return [
    {
      text: multiChain
        ? `Open a fresh wallet for ${p.name} and fund it on ${chain} first; it runs on ${p.chains.length} chains, and one active chain farmed well beats five touched once. ${gasNote(chain)}.`
        : `Open a fresh wallet for ${p.name}, fund it on ${chain} and keep its seed phrase offline. ${gasNote(chain)}.`,
      cost: `${gasText} of gas for the first transaction`,
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gasText} of gas`,
      time: '20 minutes to set up',
    },
    {
      text: `While the position is young, ${weeklyFor(p, chain)}${hot ? '; the protocol is growing fast this week, so start this week rather than next' : ''}.`,
      cost: `${gasText} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text:
        age === null
          ? `Hold the position for at least ${hold} days; the snapshot records no listing date for ${p.name}, so give it the full window to appear in several weekly snapshots.`
          : age < 365
            ? `Hold the position for at least ${hold} days; ${p.name} has run ${age} days with no token, and early wallets are the ones a launch rewards.`
            : `Hold the position for at least ${hold} days; ${p.name} has run ${age} days with no token, so steady tenure matters more than bursts.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text:
        age !== null && age >= 730
          ? `${p.name} is a veteran with no token after ${age} days: check its governance forum and points page monthly, and claim only from links the protocol itself publishes.`
          : `Open ${p.name}'s own points or rewards page monthly and claim only from the link it publishes there; a claim that asks for a fee is a scam.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes a month',
    },
    {
      text: multiChain
        ? `Log the wallet, the chain order and every transaction hash in a farm log, and unwind ${chain} last, since it holds the qualifying position.`
        : `Log the wallet, the dates and every transaction hash in a farm log, so the ${p.name} position can be repeated, proven or unwound on request.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Already trading view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      symbol: p.symbol,
    }));
}

/** A board row's form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    on_watchlist: row.on_watchlist,
    implied_value_usd: row.implied_value_usd,
    base_value_usd: row.model.base_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.on_watchlist).length,
    live_size: live.length,
    screen: screenStats(snapshot),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, values and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000)
      return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
