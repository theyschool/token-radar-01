// Token Radar, model radar-2: one sealed snapshot in, one ranked board out.
//
// The board ranks only protocols that could plausibly launch a token of their own. A protocol is
// rankable when DefiLlama's record carries no token for it (no market cap, no CoinGecko id, no
// symbol) AND it is not one of the products the house's watchlist rule already sets aside: a bridge,
// a liquid-staking or restaking product, a CEX, a versioned pool (a name ending in V2, v2, 2.0 ...),
// a name carrying the whole word wrapped, staked or staking, or a product named after an exchange.
// That is the watchlist's own rule with the TVL floor removed, so the board holds the 40 watchlist
// protocols plus the early finds below the floor. Live-token protocols are never ranked: they are
// set aside with the market's own values, and they are also the model's anchor.
//
// Implied value is anchored in what the market already pays for each kind of protocol:
//
//   anchor     = median mcap / TVL of the live protocols in the same category
//                (at least 3 comparables; fewer, and the all-category median is used),
//                shrunk toward the all-category median and clamped to [0.05, 1.00]
//   growth     = clamp(change_7d, -50, 100) per cent
//   growthMult = 1 + (growth / 100) x 0.5
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age unknown: 365 days)
//   proven     = 1 when the protocol has run at least 90 days, 0.8 + 0.2 x age / 90
//                below that, 0.9 when its listing date is unknown: a track record
//                shorter than one quarter is discounted, because a young protocol's
//                TVL is the least proven — its size may be new money, a migration or
//                a mislabelled pool rather than sticky usage
//   breadth    = min(1.15, 1 + 0.03 x ln(chains))
//   implied    = max(1, round(tvl_usd x anchor x growthMult x maturity x proven x breadth))
//
// Every factor comes from the snapshot's own figures; no protocol name is ever special-cased and
// no row is hand-picked. The page recomputes each row from the same factors and shows the
// comparables the anchor came from, so the board, the dashboard and the model visibly agree.

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
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  proven_floor: number;
  proven_days: number;
  proven_unknown: number;
  breadth_per_log: number;
  breadth_cap: number;
  anchor_min_comparables: number;
  anchor_shrink: number;
  anchor_floor: number;
  anchor_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  proven_floor: 0.8,
  proven_days: 90,
  proven_unknown: 0.9,
  breadth_per_log: 0.03,
  breadth_cap: 1.15,
  anchor_min_comparables: 3,
  anchor_shrink: 4,
  anchor_floor: 0.05,
  anchor_cap: 1.0,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 48;

/** Categories the watchlist rule sets aside: bridges, staking products and exchanges. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name carrying the whole word wrapped, staked or staking. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name beginning with an exchange's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** A farm step: the action, what it costs, and how long it takes. */
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
    category_multiple: number;
    comparables: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    proven_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
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
  category_multiple: number;
  comparables: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  proven_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** One category's market anchor: the multiple and how many live protocols set it. */
export interface CategoryAnchor {
  category: string;
  multiple: number;
  comparables: number;
  median_mcap_tvl: number | null;
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
  mcap_tvl: number | null;
}

/** One category's share of the board: how many pre-token rows it holds, their TVL and implied value, and its best row. */
export interface CategoryStat {
  category: string;
  rows: number;
  tvl_usd: number;
  implied_value_usd: number;
  top_slug: string;
  top_name: string;
  top_implied_usd: number;
  anchor_multiple: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_median_mcap_tvl: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  anchors: CategoryAnchor[];
  category_stats: CategoryStat[];
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
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list, or null. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol's record carries no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: it records no token, and it is not a bridge, a
 * staking product, an exchange, a versioned pool, a wrapped or staked product, or an exchange's
 * own product. Those are the watchlist rule's exclusions, with the TVL floor removed.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The market anchors: one multiple per category, from the live protocols' own mcap / TVL. */
export function categoryAnchors(snapshot: Snapshot, model: ModelConstants = MODEL): { anchors: CategoryAnchor[]; globalMedian: number } {
  const live = snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const globalMedian = median(live.map((p) => (p.mcap_usd as number) / p.tvl_usd)) ?? 0.2;
  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? '(no category)';
    const list = byCategory.get(key) ?? [];
    list.push((p.mcap_usd as number) / p.tvl_usd);
    byCategory.set(key, list);
  }
  const anchors: CategoryAnchor[] = [];
  for (const [category, ratios] of [...byCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const med = median(ratios) as number;
    const multiple =
      ratios.length >= model.anchor_min_comparables
        ? (ratios.length * med + model.anchor_shrink * globalMedian) / (ratios.length + model.anchor_shrink)
        : globalMedian;
    anchors.push({
      category,
      multiple: round4(Math.min(model.anchor_cap, Math.max(model.anchor_floor, multiple))),
      comparables: ratios.length,
      median_mcap_tvl: round4(med),
    });
  }
  return { anchors, globalMedian: round4(globalMedian) };
}

/** The anchor multiple for one protocol's category, from the anchor table. */
function anchorFor(anchors: CategoryAnchor[], category: string | null, globalMedian: number): { multiple: number; comparables: number } {
  const key = category ?? '(no category)';
  const found = anchors.find((a) => a.category === key);
  if (found === undefined) return { multiple: globalMedian, comparables: 0 };
  return { multiple: found.multiple, comparables: found.comparables };
}

/** The six factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  anchors: CategoryAnchor[],
  globalMedian: number,
  model: ModelConstants,
): { implied: number; categoryMultiple: number; comparables: number; growthPct: number; growthMult: number; maturityMult: number; provenMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, comparables } = anchorFor(anchors, protocol.category, globalMedian);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const provenMult = provenMultiplier(age, model);
  const breadthMult = Math.min(model.breadth_cap, 1 + model.breadth_per_log * Math.log(Math.max(1, protocol.chains.length)));
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult * provenMult * breadthMult));
  return { implied, categoryMultiple: multiple, comparables, growthPct, growthMult, maturityMult, provenMult, breadthMult, age };
}

/**
 * The track-record factor: 1 once a protocol has run 90 days, rising from the floor to 1 over its
 * first 90 days, and the unknown-age value when DefiLlama records no listing date. It is separate
 * from maturity on purpose: maturity rewards waiting long with no token, proven discounts a TVL
 * too young to have proved it is sticky.
 */
export function provenMultiplier(age: number | null, model: ModelConstants): number {
  if (age === null) return model.proven_unknown;
  if (age >= model.proven_days) return 1;
  return model.proven_floor + (1 - model.proven_floor) * (Math.max(0, age) / model.proven_days);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const { anchors, globalMedian } = categoryAnchors(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  // The watchlist is the floor: every slug it names. The early radar is every other rankable
  // protocol, below the floor or above it: the rule, not the floor, decides what may rank.
  const chosen = snapshot.protocols.filter((p) => isRankable(p));
  // A watchlist slug the snapshot no longer carries cannot be scored; the gate's coverage row is
  // never gambled on, so a missing one would fail loudly in boardIssue instead of silently.
  for (const slug of snapshot.watchlist) {
    if (!index.has(slug)) throw new SnapshotError(`watchlist slug ${slug} is not in the snapshot`);
  }
  const scored = chosen.map((p) => {
    const v = impliedValue(p, snapshot.as_of, anchors, globalMedian, model);
    return { p, v };
  });
  scored.sort(
    (a, b) =>
      b.v.implied - a.v.implied ||
      b.p.tvl_usd - a.p.tvl_usd ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
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
    token_status: 'pre-token',
    on_watchlist: watchlist.has(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      category_multiple: round4(s.v.categoryMultiple),
      comparables: s.v.comparables,
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      proven_multiplier: round4(s.v.provenMult),
      breadth_multiplier: round4(s.v.breadthMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? (p.chains[0] as string) : 'its main chain';
}

/** What one transaction costs on a chain, from the chain's own fee level. */
function gasOn(chain: string): string {
  const c = chain.toLowerCase();
  if (c.includes('ethereum')) return 'about $5 to $15 of gas per transaction';
  if (c.includes('solana')) return 'about $0.01 of gas per transaction';
  if (c.includes('base') || c.includes('arbitrum') || c.includes('optimism') || c.includes('blast') || c.includes('linea') || c.includes('scroll') || c.includes('zksync') || c.includes('mode')) {
    return 'about $0.10 to $1 of gas per transaction';
  }
  if (c.includes('bnb') || c.includes('bsc') || c.includes('polygon')) return 'about $0.10 to $0.50 of gas per transaction';
  if (c.includes('avalanche')) return 'about $0.50 to $2 of gas per transaction';
  return 'about $1 to $3 of gas per transaction';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 25_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open, borrowing a small amount against it once.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain}, in the pair it routes most volume through, and keep the position open.`;
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares for the full hold.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position, then close it the same week.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}, then settle it rather than leaving it open.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it for the full hold.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it for the full hold.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy for the full hold.`;
  if (c.includes('restak') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('launchpad') || c.includes('locker')) return `Lock $${capital} of the supported asset through ${name} on ${chain} for the shortest lock it offers.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The risk one category carries, as a step of its own: the concrete way this kind of protocol can lose a farmer money, and the check that prices it before the capital goes in. */
function riskFor(p: SnapshotProtocol, capital: number, chain: string): FarmStep {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      text: `Price the liquidation risk before you borrow: work out the collateral price at which ${name} liquidates your position, and keep your borrow at most half the maximum so a one-day dip does not close it.`,
      cost: 'nothing to check, and the buffer costs yield on the unused half',
      time: '15 minutes',
    };
  }
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('liquidity manager')) {
    return {
      text: `Price the impermanent loss before you provide liquidity: compare the pool's 30-day range with your entry prices, and size the $${capital} so a 20% move in either token costs you no more than you can accept.`,
      cost: 'nothing to check, and a 20% move costs part of the position',
      time: '15 minutes',
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('basis')) {
    return {
      text: `Price the liquidation and funding before you trade: read ${name}'s funding rate and maintenance margin on ${chain}, and keep the position small enough that a 10% move against you does not liquidate it.`,
      cost: 'nothing to check, and funding is charged by the hour while open',
      time: '15 minutes',
    };
  }
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator') || c.includes('aggregator')) {
    return {
      text: `Read what the vault actually holds before you deposit: open ${name}'s strategy or holdings page and check the underlying protocols, then confirm the vault's own audit or review is linked from its own site.`,
      cost: 'nothing to check',
      time: '20 minutes',
    };
  }
  if (c.includes('prediction')) {
    return {
      text: `Read the market's resolution rule before you place a position: check who resolves it, what source they use, and what happens to your $${capital} if the market resolves against the wording you read.`,
      cost: 'nothing to check, and a wrong read costs the whole position',
      time: '15 minutes',
    };
  }
  if (c.includes('rwa')) {
    return {
      text: `Check redemption before you mint: read how the underlying asset is redeemed, who the custodian is, and how long a redemption takes, so the $${capital} is not locked past the point you need it.`,
      cost: 'nothing to check, and redemption can take days',
      time: '20 minutes',
    };
  }
  if (c.includes('stable')) {
    return {
      text: `Check the peg before you hold the stable asset: read how it is backed, what keeps it at $1, and how far it has traded from $1 in the last 90 days, before the $${capital} goes in.`,
      cost: 'nothing to check, and a depeg costs part of the position',
      time: '15 minutes',
    };
  }
  if (c.includes('insurance')) {
    return {
      text: `Read the cover's exclusions before you buy it: check exactly which events the policy pays for, what it excludes, and how a claim is filed, so the $${capital} of cover pays when you need it.`,
      cost: 'nothing to check',
      time: '20 minutes',
    };
  }
  return {
    text: `Read ${name}'s own docs and audit before you deposit: check the contract the app points at, what the protocol's own site says it does, and whether an audit or review is linked from its own site.`,
    cost: 'nothing to check',
    time: '20 minutes',
  };
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const secondChain = p.chains.length > 1 ? (p.chains[1] as string) : null;
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasOn(chain);
  const second: FarmStep =
    secondChain !== null
      ? {
          text: `Use the protocol a second time on ${secondChain}: repeat the main action there with $${Math.max(25, Math.round(capital / 2))} so the activity spans two chains.`,
          cost: `$${Math.max(25, Math.round(capital / 2))} of capital and ${gasOn(secondChain)}`,
          time: '15 minutes',
        }
      : {
          text: `Repeat the main action with a second, smaller position of $${Math.max(25, Math.round(capital / 2))} from a different day, so the activity is not a single transaction.`,
          cost: `$${Math.max(25, Math.round(capital / 2))} of capital and ${gas}`,
          time: '15 minutes',
        };
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline, never in a screenshot or a chat.`,
      cost: 'nothing to set up',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    second,
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and vary the size a little each time.`,
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    riskFor(p, capital, chain),
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and do not withdraw and re-deposit to game it.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you claim anything, open the protocol's own points or rewards page from its own site and check the contract address matches; never pay to claim, and never follow a claim link from a direct message.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log, then unwind in stages over a week and keep enough gas on ${chain} to exit.`,
      cost: 'nothing but the log',
      time: '5 minutes to log, a week to unwind',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
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
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js: the farm plan travels with the row, byte for byte. */
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
    category_multiple: row.model.category_multiple,
    comparables: row.model.comparables,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    proven_multiplier: row.model.proven_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** One category's share of the board, from the ranked rows and the anchor table. */
export function categoryStats(board: BoardRow[], anchors: CategoryAnchor[]): CategoryStat[] {
  const anchorByCategory = new Map(anchors.map((a) => [a.category, a.multiple]));
  const byCategory = new Map<string, CategoryStat>();
  for (const row of board) {
    const key = row.category ?? '(no category)';
    const stat = byCategory.get(key) ?? {
      category: key,
      rows: 0,
      tvl_usd: 0,
      implied_value_usd: 0,
      top_slug: row.slug,
      top_name: row.name,
      top_implied_usd: row.implied_value_usd,
      anchor_multiple: anchorByCategory.get(key) ?? null,
    };
    stat.rows += 1;
    stat.tvl_usd += row.tvl_usd;
    stat.implied_value_usd += row.implied_value_usd;
    if (row.implied_value_usd > stat.top_implied_usd) {
      stat.top_slug = row.slug;
      stat.top_name = row.name;
      stat.top_implied_usd = row.implied_value_usd;
    }
    byCategory.set(key, stat);
  }
  return [...byCategory.values()].sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.category < b.category ? -1 : 1));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const { anchors, globalMedian } = categoryAnchors(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.on_watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_median_mcap_tvl: globalMedian,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    anchors,
    category_stats: categoryStats(board, anchors),
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

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if ((byRank[i] as BoardRow).implied_value_usd > (byRank[i - 1] as BoardRow).implied_value_usd) {
      return `rank ${i + 1} outranks rank ${i} on implied value`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
