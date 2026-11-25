// Launch Radar v3 — plain page logic. Reads window.RADAR (written by
// main.ts), renders the board, and routes the detail view by hash so a
// single link opens one protocol: #detail=<slug>, #verdict=FARM.
var DATA = window.RADAR;
var S = DATA.stats;

function money(v) {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'K';
  return '$' + Math.round(v);
}
function pct(x) { return Math.round(x * 100) + '%'; }
function miss(x) { return '\u00d7' + x.toFixed(2); }
function $(id) { return document.getElementById(id); }

function fillCards() {
  $('meta-ranked').textContent = S.ranked;
  $('meta-line').textContent = 'Snapshot ' + DATA.as_of.slice(0, 10) + ' \u00b7 ' + S.totalProtocols + ' protocols \u00b7 all ' + S.watchlistSize + ' watchlist names ranked';
  $('c-ranked').textContent = S.ranked;
  $('c-top').textContent = money(S.topImplied);
  $('c-top-sub').textContent = S.topName + ' \u2014 the biggest name on the board';
  $('c-wf').textContent = miss(S.walkForwardMedian);
  $('c-range').textContent = pct(S.rangeHoldsLoo);
  $('c-odds').textContent = pct(S.oddsHeldOutTop);
  $('c-farm').textContent = S.worthFarming;
  $('c-farm-sub').textContent = S.marginal + ' more are marginal \u2014 thin, but not nothing';
  $('p-wf').textContent = miss(S.walkForwardMedian) + ' typical';
  $('p-wf-geo').textContent = '(' + miss(S.walkForwardGeo) + ' on average, dragged by the wild ones)';
  $('p-loo').textContent = miss(S.leaveOneOutMedian) + ' typical';
  $('p-loo-geo').textContent = '(' + miss(S.leaveOneOutGeo) + ' on average)';
  $('p-range').textContent = '\u00d7' + S.rangeFactor.toFixed(1) + ' either way';
  $('p-range-d').textContent = 'Any single price on this board is a guess with a wide skirt. The range printed under each price is ' + S.rangeFactor.toFixed(1) + 'x either way, and even that wide, the truth landed inside it ' + pct(S.rangeHoldsLoo) + ' of the time when tokens were hidden one at a time, and ' + pct(S.rangeHoldsWf) + ' on the newer-listings test.';
  $('p-odds').textContent = pct(S.oddsHeldOutTop) + ' of the top group';
  $('p-odds-d').textContent = 'Five-fold check: the protocols given the highest odds had launched ' + pct(S.oddsHeldOutTop) + ' of the time (' + Math.round(DATA.oddsCheck.topRate * DATA.oddsCheck.topN) + ' of ' + DATA.oddsCheck.topN + '), the lowest-odds group ' + pct(S.oddsHeldOutLow) + ' (' + Math.round(DATA.oddsCheck.lowRate * DATA.oddsCheck.lowN) + ' of ' + DATA.oddsCheck.lowN + '). The base rate is ' + pct(DATA.oddsCheck.baseRate) + '. Brier score ' + S.oddsBrier.toFixed(3) + ' \u2014 modest, and we would rather print modest than pretend.';
  $('m-ranked').textContent = S.ranked;
  $('m-aside').textContent = S.setAside;
  $('m-live').textContent = S.liveCount;
}

function fillTerms() {
  $('terms').innerHTML = DATA.termTests.map(function (t) {
    var cls = t.decision === 'KEPT' ? 'keep' : 'drop';
    return '<tr><td>' + t.label + '</td><td>' + miss(t.walkForward.median) + '</td><td>' + miss(t.leaveOneOut.median) + '</td><td class="' + cls + '">' + t.decision + '</td></tr>';
  }).join('');
}

function planLine(r) {
  return money(r.plan_cost_usd) + ' gas \u00b7 ~' + r.plan_hours + 'h \u00b7 ' + money(r.plan_capital_usd) + ' in';
}

var current = DATA.rows.slice();
function renderBoard() {
  var q = ($('q').value || '').toLowerCase();
  var v = $('verdict').value;
  var sort = $('sort').value;
  var rows = DATA.rows.filter(function (r) {
    if (v && r.verdict !== v) return false;
    if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
  var by = {
    rank: function (a, b) { return a.rank - b.rank; },
    implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
    tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
    odds: function (a, b) { return b.launch_odds - a.launch_odds; },
    ev: function (a, b) { return b.expected_value_usd - a.expected_value_usd; },
    cost: function (a, b) { return a.plan_cost_usd - b.plan_cost_usd; }
  }[sort] || function (a, b) { return a.rank - b.rank; };
  rows.sort(by);
  current = rows;
  $('row-count').textContent = rows.length + ' of ' + DATA.rows.length + ' shown';
  $('rows').innerHTML = rows.map(function (r) {
    var g = r.change_7d === null ? '\u2014' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%';
    return '<tr data-slug="' + r.slug + '"><td>' + r.rank + '</td><td><strong>' + r.name + '</strong><br><span style="color:#5b6675;font-size:12px">' + (r.category || 'no category') + ' \u00b7 ' + r.chains.slice(0, 2).join(', ') + '</span></td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + g + '</td>' +
      '<td class="num"><strong>' + money(r.implied_value_usd) + '</strong><br><span style="color:#5b6675;font-size:12px">' + money(r.implied_low_usd) + ' \u2013 ' + money(r.implied_high_usd) + '</span></td>' +
      '<td class="num">' + pct(r.launch_odds) + '</td>' +
      '<td><span class="badge ' + r.verdict + '">' + r.verdict + '</span></td>' +
      '<td style="font-size:13px">' + planLine(r) + '</td></tr>';
  }).join('');
}

function showDetail(slug) {
  var r = DATA.rows.find(function (x) { return x.slug === slug; });
  var box = $('detail');
  if (!r) { box.hidden = true; document.body.classList.remove('detail-only'); return; }
  box.hidden = false;
  document.body.classList.add('detail-only');
  $('d-name').textContent = '#' + r.rank + ' \u2014 ' + r.name;
  $('d-sub').textContent = (r.category || 'No category') + ' \u00b7 ' + r.chains.join(', ') + ' \u00b7 TVL ' + money(r.tvl_usd) + ' \u00b7 ' + (r.age_days === null ? 'tracked since an unknown date' : 'tracked for about ' + Math.round(r.age_days / 30) + ' months');
  $('d-implied').textContent = money(r.implied_value_usd);
  $('d-range').textContent = 'Honest range: ' + money(r.implied_low_usd) + ' \u2013 ' + money(r.implied_high_usd);
  $('d-odds').textContent = pct(r.launch_odds);
  $('d-odds-sub').textContent = 'share of similar protocols that have a token now';
  $('d-ev').textContent = money(r.expected_value_usd);
  $('d-verdict').innerHTML = '<span class="badge ' + r.verdict + '">' + r.verdict + '</span>';
  $('d-why').textContent = r.verdict === 'FARM' ? 'The expected value clears $2M and the plan is cheap. This is the short list.' : r.verdict === 'MARGINAL' ? 'Worth a look, not a leap. Something is thin \u2014 the odds, the size, or both.' : 'The numbers do not pay for your time. Skip it, and spend the evenings elsewhere.';
  $('d-cost').textContent = money(r.plan_cost_usd) + ' gas';
  $('d-plan').textContent = '~' + r.plan_hours + ' hours across a month \u00b7 ' + money(r.plan_capital_usd) + ' working capital';
  $('d-steps').innerHTML = r.farm_steps.map(function (s) { return '<li>' + s + '</li>'; }).join('');
  box.scrollIntoView();
}

function fillLive() {
  $('live-rows').innerHTML = DATA.live.map(function (p) {
    return '<tr><td><strong>' + p.name + '</strong><br><span style="color:#5b6675;font-size:12px">' + (p.category || 'no category') + '</span></td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td>' +
      '<td class="num">' + (p.mcap_usd / p.tvl_usd).toFixed(2) + '\u00d7</td></tr>';
  }).join('');
}

function route() {
  var hash = window.location.hash.replace(/^#/, '');
  var params = new URLSearchParams(hash.replace(/;/g, '&'));
  var slug = params.get('detail');
  var verdict = params.get('verdict');
  if (verdict && ['FARM', 'MARGINAL', 'SKIP'].indexOf(verdict) >= 0) $('verdict').value = verdict;
  renderBoard();
  if (slug) showDetail(slug); else { $('detail').hidden = true; document.body.classList.remove('detail-only'); }
}

$('q').addEventListener('input', renderBoard);
$('verdict').addEventListener('change', renderBoard);
$('sort').addEventListener('change', renderBoard);
$('rows').addEventListener('click', function (e) {
  var tr = e.target.closest('tr[data-slug]');
  if (!tr) return;
  window.location.hash = 'detail=' + tr.getAttribute('data-slug');
});
$('back-link').addEventListener('click', function (e) {
  e.preventDefault();
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  $('detail').hidden = true;
  document.body.classList.remove('detail-only');
  window.scrollTo(0, 0);
});
window.addEventListener('hashchange', route);

fillCards();
fillTerms();
fillLive();
route();
