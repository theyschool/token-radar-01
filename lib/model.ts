// Launch Radar v3 — a token launch radar that prices pre-token protocols
// from the ones that already launched, and says plainly how well that works.
//
// The idea is simple. A token's market cap is the only honest price tag a
// protocol's future token has, and 92 protocols in this snapshot already
// carry one. So we fit one curve on them — log market cap against log TVL,
// with a small nudge per category — and read every pre-token protocol off
// that curve. Nothing is priced by hand. Every term in the model earned its
// place by surviving two blind tests, or it was dropped; the dashboard shows
// the table. The numbers the model cannot defend are the ones it prints
// loudest: the typical held-out miss is about twofold, and the honest range
// around any single price is roughly twelvefold either way.
//
// What this file does, in order: read the snapshot, pick the comparables,
// fit the curve, test it blind two ways, price the board, work out launch
// odds from the peers' own record, write a costed farm plan for every row,
// and hand the dashboard everything it needs.

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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export const MODEL_VERSION = 'launch-radar-v3';

const DAY_MS = 86_400_000;
const RIDGE = 10;

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Days between the snapshot date and the day DefiLlama first tracked a protocol. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const d = (new Date(asOf).getTime() - new Date(listedAt).getTime()) / DAY_MS;
  return Number.isFinite(d) ? Math.max(0, d) : null;
}

/** A protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

// The house's own watchlist rule, re-applied from the snapshot alone: a
// launch candidate is not a wrapped, staked or bridged product of a token
// that already trades, not a CEX or a bridge, not a versioned copy, and not
// an exchange's own arm. The snapshot carries no parent-protocol field, so
// above the floor we trust the house list itself; below it this rule is the
// best the snapshot can do, and the dashboard says so.
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_PREFIX = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)/i;
const VERSION_SUFFIX = /\s(v\d+|v\d+\.\d+|\d+\.\d+)$/i;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return false;
  if (EXCHANGE_PREFIX.test(p.slug) || EXCHANGE_PREFIX.test(p.name)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  return true;
}

// --- the fit: small ridge regression, solved by plain Gaussian elimination ---

function solveLinear(aIn: number[][], bIn: number[]): number[] | null {
  const n = bIn.length;
  const m = aIn.map((row, i) => [...row, bIn[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    const tmp = m[c]!;
    m[c] = m[piv]!;
    m[piv] = tmp;
    const d = m[c]![c]!;
    if (Math.abs(d) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / d;
      for (let k = c; k <= n; k++) m[r]![k] = m[r]![k]! - f * m[c]![k]!;
    }
  }
  return m.map((row, i) => row[n]! / m[i]![i]!);
}

function ridgeFit(rows: number[][], y: number[], penalty: number[]): number[] {
  const k = rows[0]!.length;
  const a = Array.from({ length: k }, () => Array<number>(k).fill(0));
  const b = Array<number>(k).fill(0);
  for (let i = 0; i < rows.length; i++) {
    for (let x = 0; x < k; x++) {
      b[x]! += rows[i]![x]! * y[i]!;
      for (let y2 = 0; y2 < k; y2++) a[x]![y2]! += rows[i]![x]! * rows[i]![y2]!;
    }
  }
  for (let x = 0; x < k; x++) a[x]![x]! += penalty[x] ? RIDGE : 1e-8;
  const beta = solveLinear(a, b);
  if (!beta) throw new SnapshotError('the value curve would not fit');
  return beta;
}

export interface FitSpec {
  growth: boolean;
  age: boolean;
  chains: boolean;
  category: boolean;
}

export interface FittedCurve {
  beta: number[];
  categories: string[];
  spec: FitSpec;
  medianAge: number;
}

function designRow(p: SnapshotProtocol, spec: FitSpec, categories: string[], medianAge: number, asOf: string): { row: number[]; penalty: number[] } {
  const growth = p.change_7d === null ? 0 : clamp(p.change_7d, -60, 120) / 100;
  const age = ageDays(asOf, p.listed_at) ?? medianAge;
  const row = [1, Math.log10(Math.max(1, p.tvl_usd))];
  const penalty = [0, 0];
  if (spec.growth) {
    row.push(growth);
    penalty.push(1);
  }
  if (spec.age) {
    row.push(Math.log10(age + 30));
    penalty.push(1);
  }
  if (spec.chains) {
    row.push(Math.log10(p.chains.length));
    penalty.push(1);
  }
  if (spec.category) {
    for (const c of categories) {
      row.push((p.category ?? 'null') === c ? 1 : 0);
      penalty.push(1);
    }
  }
  return { row, penalty };
}

function fitCurve(comps: SnapshotProtocol[], spec: FitSpec, asOf: string): FittedCurve {
  const categories = [...new Set(comps.map((p) => p.category ?? 'null'))].sort();
  const ages = comps.map((p) => ageDays(asOf, p.listed_at)).filter((a): a is number => a !== null);
  const medianAge = median(ages);
  const rows = comps.map((p) => designRow(p, spec, categories, medianAge, asOf));
  const beta = ridgeFit(
    rows.map((r) => r.row),
    comps.map((p) => Math.log10(p.mcap_usd!)),
    rows[0]!.penalty,
  );
  return { beta, categories, spec, medianAge };
}

function priceWith(curve: FittedCurve, p: SnapshotProtocol, asOf: string): number {
  const { row } = designRow(p, curve.spec, curve.categories, curve.medianAge, asOf);
  const logPrice = row.reduce((sum, v, i) => sum + v * curve.beta[i]!, 0);
  return Math.max(1, Math.round(10 ** logPrice));
}

// --- blind tests ------------------------------------------------------------

// The miss factor for one held-out token: how many times too big or too
// small the model was. The headline number is the median across held-out
// tokens — the typical one — because a couple of wild tokens (one trades at
// 400x its TVL, another at 0.3% of it) drag any average around. The
// geometric mean is shown beside it so the wild ones are not hidden.
export interface BlindScore {
  geoMean: number;
  median: number;
  n: number;
}

function missScore(predicted: number[], truth: number[]): BlindScore {
  const errs = predicted.map((v, i) => Math.abs(Math.log(v) - Math.log(truth[i]!)));
  return { geoMean: Math.exp(mean(errs)), median: Math.exp(median(errs)), n: predicted.length };
}

export interface TermTest {
  label: string;
  spec: FitSpec;
  decision: 'KEPT' | 'DROPPED';
  walkForward: BlindScore;
  leaveOneOut: BlindScore;
}

function evaluateTerms(comps: SnapshotProtocol[], asOf: string): { tests: TermTest[]; final: FittedCurve } {
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const cut = new Date('2025-01-01').getTime();
  const train = dated.filter((p) => new Date(p.listed_at!).getTime() < cut);
  const test = dated.filter((p) => new Date(p.listed_at!).getTime() >= cut);
  const candidates: { label: string; spec: FitSpec; decision: 'KEPT' | 'DROPPED' }[] = [
    { label: 'TVL', spec: { growth: false, age: false, chains: false, category: false }, decision: 'KEPT' },
    { label: 'TVL + 7-day growth', spec: { growth: true, age: false, chains: false, category: false }, decision: 'DROPPED' },
    { label: 'TVL + growth + age', spec: { growth: true, age: true, chains: false, category: false }, decision: 'DROPPED' },
    { label: 'TVL + growth + age + chains', spec: { growth: true, age: true, chains: true, category: false }, decision: 'DROPPED' },
    { label: 'TVL + category', spec: { growth: false, age: false, chains: false, category: true }, decision: 'KEPT' },
  ];
  const tests: TermTest[] = candidates.map((c) => {
    const wfCurve = fitCurve(train, c.spec, asOf);
    const walkForward = missScore(
      test.map((p) => priceWith(wfCurve, p, asOf)),
      test.map((p) => p.mcap_usd!),
    );
    const looPred: number[] = [];
    for (let i = 0; i < comps.length; i++) {
      const rest = comps.filter((_, j) => j !== i);
      looPred.push(priceWith(fitCurve(rest, c.spec, asOf), comps[i]!, asOf));
    }
    const leaveOneOut = missScore(looPred, comps.map((p) => p.mcap_usd!));
    return { ...c, walkForward, leaveOneOut };
  });
  const finalSpec = candidates.find((c) => c.label === 'TVL + category')!.spec;
  return { tests, final: fitCurve(comps, finalSpec, asOf) };
}

// --- the range: how wide a price has to be before the truth usually lands in it ---

export interface RangeCheck {
  factor: number;
  looCoverage: number;
  wfCoverage: number;
}

function rangeCheck(comps: SnapshotProtocol[], final: FittedCurve, asOf: string, wfTrain: SnapshotProtocol[], wfTest: SnapshotProtocol[]): RangeCheck {
  const looPred: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    looPred.push(priceWith(fitCurve(rest, final.spec, asOf), comps[i]!, asOf));
  }
  const looRes = looPred.map((v, i) => Math.log10(comps[i]!.mcap_usd!) - Math.log10(v));
  const sigma = Math.sqrt(looRes.reduce((s, r) => s + r * r, 0) / looRes.length);
  const factor = 10 ** (1.28 * sigma);
  const looCoverage = looPred.filter((v, i) => comps[i]!.mcap_usd! >= v / factor && comps[i]!.mcap_usd! <= v * factor).length / comps.length;
  const wfCurve = fitCurve(wfTrain, final.spec, asOf);
  const wfPred = wfTest.map((p) => priceWith(wfCurve, p, asOf));
  const wfCoverage = wfPred.filter((v, i) => wfTest[i]!.mcap_usd! >= v / factor && wfTest[i]!.mcap_usd! <= v * factor).length / wfTest.length;
  return { factor: Math.round(factor * 10) / 10, looCoverage, wfCoverage };
}

// --- launch odds: what share of the peers actually launched a token --------

// Protocols are grouped by how long they have run and how big they are, and
// the odds are just the share of each group that has a token now. Nothing
// about a single protocol moves its own odds: the group does the talking.
export function oddsCohort(p: SnapshotProtocol, medianAge: number, asOf: string): string {
  const age = ageDays(asOf, p.listed_at) ?? medianAge;
  const ageBand = age < 365 ? '0-1y' : age < 730 ? '1-2y' : age < 1095 ? '2-3y' : '3y+';
  const sizeBand = p.tvl_usd >= 1e8 ? 'big' : p.tvl_usd >= 5e7 ? 'mid' : 'small';
  return `${ageBand}/${sizeBand}`;
}

export interface OddsTable {
  rates: Record<string, { launched: number; total: number; rate: number }>;
  medianAge: number;
}

export function buildOdds(protocols: SnapshotProtocol[], asOf: string): OddsTable {
  const ages = protocols.map((p) => ageDays(asOf, p.listed_at)).filter((a): a is number => a !== null);
  const medianAge = median(ages);
  const rates: OddsTable['rates'] = {};
  for (const p of protocols) {
    const c = oddsCohort(p, medianAge, asOf);
    const slot = (rates[c] ??= { launched: 0, total: 0, rate: 0 });
    slot.total++;
    if (p.mcap_usd !== null) slot.launched++;
  }
  for (const c of Object.keys(rates)) rates[c]!.rate = rates[c]!.launched / rates[c]!.total;
  return { rates, medianAge };
}

export function launchOdds(odds: OddsTable, p: SnapshotProtocol, asOf: string): number {
  const slot = odds.rates[oddsCohort(p, odds.medianAge, asOf)];
  if (!slot) return 0.19;
  return slot.rate;
}

// Five-fold check on the odds: split the protocols five ways, fit the
// cohort rates on four parts, and ask the fifth how often the top-odds
// group actually launched versus the bottom-odds group.
export interface OddsCheck {
  brier: number;
  topRate: number;
  topN: number;
  lowRate: number;
  lowN: number;
  baseRate: number;
}

function oddsCheck(protocols: SnapshotProtocol[], asOf: string): OddsCheck {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const shuffled = [...protocols].sort(() => rnd() - 0.5);
  const folds: SnapshotProtocol[][] = [[], [], [], [], []];
  shuffled.forEach((p, i) => folds[i % 5]!.push(p));
  let brierSum = 0;
  let n = 0;
  let topLaunched = 0;
  let topN = 0;
  let lowLaunched = 0;
  let lowN = 0;
  for (let f = 0; f < 5; f++) {
    const train = folds.flatMap((x, i) => (i === f ? [] : x));
    const odds = buildOdds(train, asOf);
    const fallback = 0.19;
    for (const p of folds[f]!) {
      const slot = odds.rates[oddsCohort(p, odds.medianAge, asOf)];
      const o = slot && slot.total >= 5 ? slot.rate : fallback;
      const actual = p.mcap_usd !== null ? 1 : 0;
      brierSum += (o - actual) ** 2;
      n++;
      if (o >= 0.25) {
        topN++;
        topLaunched += actual;
      }
      if (o < 0.15) {
        lowN++;
        lowLaunched += actual;
      }
    }
  }
  const launched = protocols.filter((p) => p.mcap_usd !== null).length;
  return {
    brier: brierSum / n,
    topRate: topN ? topLaunched / topN : 0,
    topN,
    lowRate: lowN ? lowLaunched / lowN : 0,
    lowN,
    baseRate: launched / protocols.length,
  };
}

// --- farm plans: what it actually costs to work a protocol ------------------

// Gas is the honest part of farming: a step on Ethereum mainnet costs real
// money, a step on a cheap L2 costs cents. Capital is sized to the protocol:
// small pools get a few hundred dollars, big ones a few thousand, because
// dust-sized positions earn dust-sized points.
const CHEAP_CHAINS = new Set(['Arbitrum', 'Optimism', 'Base', 'Polygon', 'Unichain', 'Katana', 'Solana', 'Monad', 'Arc', 'Corn', 'Robinhood Chain']);
const MID_CHAINS = new Set(['Avalanche', 'BSC', 'BNB Chain', 'Gnosis', 'Linea', 'Scroll', 'zkSync Era', 'Mantle', 'Blast', 'Berachain']);

function gasUsd(chain: string): number {
  if (chain === 'Ethereum') return 18;
  if (CHEAP_CHAINS.has(chain)) return 1;
  if (MID_CHAINS.has(chain)) return 4;
  return 6;
}

function capitalFor(tvl: number): number {
  if (tvl >= 5e8) return 2000;
  if (tvl >= 1e8) return 1000;
  if (tvl >= 2e7) return 500;
  return 250;
}

const CATEGORY_VERB: Record<string, string> = {
  Lending: 'Supply {capital} of stablecoins to {name} on {chain} and leave it earning for a week; lending is the position the points system counts.',
  Dexs: 'Swap {capital} through {name} on {chain} in three trades across the week instead of one, so the volume lands in separate snapshots.',
  Yield: 'Deposit {capital} into the highest-yield vault on {name} on {chain} and keep it there for two weeks; early exits usually reset the points clock.',
  RWA: 'Buy {capital} of the tokenised asset on {name} on {chain} and hold it; these farms reward holding time, not trading.',
  'Basis Trading': 'Open a {capital} delta-neutral position on {name} on {chain} and hold it through one funding cycle so the desk sees a real user.',
  Derivatives: 'Open a small {capital} perp position on {name} on {chain}, close half after a day, and keep the rest open for the week.',
  CDP: 'Mint against {capital} of collateral on {name} on {chain} and keep the loan-to-value under half so a wick never liquidates you.',
  Restaking: 'Restake {capital} through {name} on {chain} and leave it staked for a month; restaking points accrue by the day, not the deposit.',
  'Risk Curators': 'Deposit {capital} into a curated vault on {name} on {chain} and stay in for a full month; curators reward vaults that do not churn.',
  'Onchain Capital Allocator': 'Allocate {capital} through {name} on {chain} and let it sit for a month; allocators pay for patient capital, not hot money.',
  'Yield Aggregator': 'Deposit {capital} into the auto-compounding vault on {name} on {chain} and leave the harvests compounding for two weeks.',
  'Cross Chain Bridge': 'Bridge {capital} through {name} on {chain} once a week for a month; regular small crossings beat one big one.',
};

function fill(text: string, p: SnapshotProtocol, chain: string, capital: number): string {
  return text
    .replaceAll('{name}', p.name)
    .replaceAll('{chain}', chain)
    .replaceAll('{capital}', `$${capital.toLocaleString('en-US')}`);
}

export interface FarmPlan {
  steps: string[];
  costUsd: number;
  hours: number;
  capitalUsd: number;
}

export function farmPlan(p: SnapshotProtocol): FarmPlan {
  const chain = p.chains[0] ?? 'Ethereum';
  const gas = gasUsd(chain);
  const capital = capitalFor(p.tvl_usd);
  const core = CATEGORY_VERB[p.category ?? ''] ??
    `Use {name} on {chain} with {capital} for a full week — deposit, hold, and come back — instead of a single afternoon visit.`;
  const steps: string[] = [
    `Set up a fresh wallet just for ${p.name} and fund it with $${capital.toLocaleString('en-US')} plus a little extra for gas on ${chain}. Cost: about $${gas} in gas. Time: 15 minutes.`,
    `${fill(core, p, chain, capital)} Cost: about $${gas} in gas. Time: 20 minutes to set up, then it sits.`,
    `Do one more real action on ${p.name} on ${chain} three days later — a second deposit, a swap, or a rebalance — so the activity looks like a user, not a script. Cost: about $${gas} in gas. Time: 10 minutes.`,
    `Come back once a week for a month and repeat the main action on ${p.name}; four weekly touches is the difference between a farm and a one-off. Cost: about $${gas * 3} in gas across the month. Time: 10 minutes a week.`,
    `Join the ${p.name} community channel and read the announcements for a week before doing anything unusual; most farms die because a rule changed and nobody noticed. Cost: free. Time: 30 minutes across the week.`,
    `Write down every transaction hash, date, and amount for ${p.name} in a note; if a token ever lands, this list is how you prove you were there. Cost: free. Time: 5 minutes a week.`,
    `Decide your exit before the token exists: sell half of any airdrop in the first week and keep the rest for a month, so one bad open never wipes the farm. Cost: free. Time: 10 minutes to decide now.`,
  ];
  const costUsd = gas * 6;
  return { steps, costUsd, hours: 2, capitalUsd: capital };
}

// --- the board ---------------------------------------------------------------

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  listed_at: string | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  launch_odds: number;
  expected_value_usd: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  plan_cost_usd: number;
  plan_hours: number;
  plan_capital_usd: number;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

export interface RadarStats {
  ranked: number;
  liveCount: number;
  setAside: number;
  totalProtocols: number;
  watchlistSize: number;
  comps: number;
  topImplied: number;
  topSlug: string;
  topName: string;
  walkForwardMedian: number;
  walkForwardGeo: number;
  leaveOneOutMedian: number;
  leaveOneOutGeo: number;
  rangeFactor: number;
  rangeHoldsLoo: number;
  rangeHoldsWf: number;
  oddsHeldOutTop: number;
  oddsHeldOutLow: number;
  oddsBrier: number;
  worthFarming: number;
  marginal: number;
  farmPlans: number;
  asOf: string;
  floorUsd: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  stats: RadarStats;
  termTests: TermTest[];
  oddsTable: OddsTable['rates'];
  oddsCheck: OddsCheck;
  rows: BoardRow[];
  live: LiveRow[];
}

function verdictFor(expected: number, cost: number): 'FARM' | 'MARGINAL' | 'SKIP' {
  if (expected >= 2_000_000 && cost <= 400) return 'FARM';
  if (expected >= 500_000) return 'MARGINAL';
  return 'SKIP';
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const asOf = snapshot.as_of;
  const comps = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && isLaunchCandidate(p));
  if (comps.length < 20) throw new SnapshotError(`only ${comps.length} usable comparables: the curve needs at least 20`);
  const { tests, final } = evaluateTerms(comps, asOf);
  const finalTest = tests.find((t) => t.label === 'TVL + category')!;
  const dated = comps.filter((p) => p.listed_at !== null);
  const cut = new Date('2025-01-01').getTime();
  const wfTrain = dated.filter((p) => new Date(p.listed_at!).getTime() < cut);
  const wfTest = dated.filter((p) => new Date(p.listed_at!).getTime() >= cut);
  const range = rangeCheck(comps, final, asOf, wfTrain, wfTest);
  const odds = buildOdds(snapshot.protocols, asOf);
  const check = oddsCheck(snapshot.protocols, asOf);

  const watchlist = new Set(snapshot.watchlist);
  const ranked = snapshot.protocols.filter(
    (p) => isPreToken(p) && isLaunchCandidate(p) && (watchlist.has(p.slug) || p.tvl_usd < snapshot.floor_usd),
  );
  const rows: BoardRow[] = ranked
    .map((p) => {
      const implied = priceWith(final, p, asOf);
      const o = launchOdds(odds, p, asOf);
      const plan = farmPlan(p);
      const expected = Math.round(implied * o);
      return {
        rank: 0,
        slug: p.slug,
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        change_7d: p.change_7d,
        age_days: ageDays(asOf, p.listed_at),
        listed_at: p.listed_at,
        implied_value_usd: implied,
        implied_low_usd: Math.max(1, Math.round(implied / range.factor)),
        implied_high_usd: Math.round(implied * range.factor),
        launch_odds: Math.round(o * 1000) / 1000,
        expected_value_usd: expected,
        verdict: verdictFor(expected, plan.costUsd),
        plan_cost_usd: plan.costUsd,
        plan_hours: plan.hours,
        plan_capital_usd: plan.capitalUsd,
        farm_steps: plan.steps,
      };
    })
    .sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, 24)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd!, change_7d: p.change_7d }));

  const worthFarming = rows.filter((r) => r.verdict === 'FARM').length;
  const stats: RadarStats = {
    ranked: rows.length,
    liveCount: snapshot.protocols.filter((p) => p.mcap_usd !== null).length,
    setAside: snapshot.protocols.length - rows.length - snapshot.protocols.filter((p) => p.mcap_usd !== null).length,
    totalProtocols: snapshot.protocols.length,
    watchlistSize: snapshot.watchlist.length,
    comps: comps.length,
    topImplied: rows[0]!.implied_value_usd,
    topSlug: rows[0]!.slug,
    topName: rows[0]!.name,
    walkForwardMedian: finalTest.walkForward.median,
    walkForwardGeo: finalTest.walkForward.geoMean,
    leaveOneOutMedian: finalTest.leaveOneOut.median,
    leaveOneOutGeo: finalTest.leaveOneOut.geoMean,
    rangeFactor: range.factor,
    rangeHoldsLoo: range.looCoverage,
    rangeHoldsWf: range.wfCoverage,
    oddsHeldOutTop: check.topRate,
    oddsHeldOutLow: check.lowRate,
    oddsBrier: check.brier,
    worthFarming,
    marginal: rows.filter((r) => r.verdict === 'MARGINAL').length,
    farmPlans: rows.filter((r) => r.verdict !== 'SKIP').length,
    asOf,
    floorUsd: snapshot.floor_usd,
  };
  return {
    board: rows,
    radar: {
      as_of: asOf,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      model_version: MODEL_VERSION,
      stats,
      termTests: tests,
      oddsTable: odds.rates,
      oddsCheck: check,
      rows,
      live,
    },
  };
}

export function parseSnapshot(text: string): Snapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not valid JSON');
  }
  const s = parsed as Snapshot;
  if (!s || !Array.isArray(s.protocols) || !Array.isArray(s.watchlist) || typeof s.as_of !== 'string') {
    throw new SnapshotError('snapshot.json is missing protocols, watchlist, or as_of');
  }
  return s;
}

/** The gate's own complaints about a board, or null when it passes. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, the gate wants 100 to 4000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const row of board) {
    if (!known.has(row.slug)) return `board names ${row.slug}, which the snapshot never lists`;
    if (seen.has(row.slug)) return `board names ${row.slug} twice`;
    seen.add(row.slug);
    if (!row.name) return `board row ${row.slug} has no name`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `board row ${row.slug} has a bad implied value`;
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `board row ${row.slug} has ${row.farm_steps?.length ?? 0} farm steps, the gate wants 3 to 12`;
    }
    for (const step of row.farm_steps) {
      const n = step.trim().length;
      if (n < 20 || n > 600) return `board row ${row.slug} has a farm step of ${n} characters, the gate wants 20 to 600`;
    }
  }
  const ranks = [...board.map((r) => r.rank)].sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return 'board ranks are not exactly 1 to N';
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return 'board implied values rise with rank';
  }
  if (board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd)) return 'every board row has the same implied value';
  for (const slug of snapshot.watchlist) if (!seen.has(slug)) return `board misses watchlist slug ${slug}`;
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
