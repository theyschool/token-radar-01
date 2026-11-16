// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, filters, a per-protocol detail view with the model's own factors
// and farm plan, the live-token set the board sets aside, and the method behind the ranking.
// No network: every byte it shows is in data.js. Farm plans travel with the rows, byte for byte
// the same strings board.json carries; implied values are recomputed here from the row's factors
// and checked against the board, so the page's code and the board's data visibly agree.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchOnly: false, earlyOnly: false, tab: 'board', sort: 'implied', dir: -1, selected: null };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (Math.round(n * 10000) / 10000).toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0'); }

  // The model in one function: the page recomputes a row from its factors and checks the number
  // board.json carries, so a stale dataset would show up here instead of passing quietly.
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var breadth = Math.min(m.breadth_cap, 1 + m.breadth_per_log * Math.log(Math.max(1, (row.chains || []).length)));
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * breadth));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('watch') === '1') state.watchOnly = true;
    if (params.get('early') === '1') state.earlyOnly = true;
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.watchOnly) params.set('watch', '1');
    if (state.earlyOnly) params.set('early', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || '(no category)') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchOnly && !r.on_watchlist) return false;
      if (state.earlyOnly && r.on_watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function anchorFor(category) {
    var found = null;
    DATA.anchors.forEach(function (a) { if (a.category === (category || '(no category)')) found = a; });
    return found;
  }
  function chainList() {
    var counts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { counts[c] = (counts[c] || 0) + 1; }); });
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 24);
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'DefiLlama protocol index'),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    var top = DATA.rows[0];
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Pre-token protocols, ranked by what a token would be worth' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The radar adds ' + DATA.early_size + ' early finds below and above that floor — protocols the rule keeps, the floor leaves out. Implied value is this entry\u2019s model, not a promise and not a price.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every watchlist slug is ranked' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.early_size + ' early finds beyond the watchlist' })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' }), el('small', { text: top ? top.name : '' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token set aside' }), el('b', { text: String(DATA.live_size) }), el('small', { text: 'their market caps anchor the model' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || '(no category)'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || '(no category)') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chainList().map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var wBox = el('input', { type: 'checkbox', id: 'watch', checked: state.watchOnly ? 'checked' : null });
    wBox.addEventListener('change', function () { state.watchOnly = wBox.checked; writeHash(); render(); });
    var eBox = el('input', { type: 'checkbox', id: 'early', checked: state.earlyOnly ? 'checked' : null });
    eBox.addEventListener('change', function () { state.earlyOnly = eBox.checked; writeHash(); render(); });
    function tabBtn(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    var shown = state.tab === 'board' ? filteredRows().length : state.tab === 'live' ? DATA.live.length : DATA.anchors.length;
    var countText = state.tab === 'board' ? shown + ' of ' + DATA.board_size + ' rows shown' : state.tab === 'live' ? shown + ' live-token protocols' : shown + ' category anchors';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'checks' },
        el('label', { for: 'watch' }, wBox, 'Watchlist only'),
        el('label', { for: 'early' }, eBox, 'Early finds only')
      ),
      el('div', { class: 'tabs' }, tabBtn('board', 'Board'), tabBtn('live', 'Live token'), tabBtn('method', 'Method')),
      el('span', { class: 'count', text: countText })
    );
  }

  function sortHeader(key, label, numeric) {
    return el('th', { scope: 'col', class: numeric ? 'num' : null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  function badge(row) {
    if (row.on_watchlist) return el('span', { class: 'badge watch', text: 'Watchlist' });
    return el('span', { class: 'badge early', text: 'Early find' });
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { class: 'sub', text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; state.earlyOnly = false; writeHash(); render(); } })
      ));
    }
    var max = DATA.rows[0] ? DATA.rows[0].implied_value_usd : 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, badge(r))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank', true),
            sortHeader('name', 'Protocol', false),
            sortHeader('tvl', 'TVL', true),
            sortHeader('growth', '7d', true),
            sortHeader('age', 'Age', true),
            sortHeader('implied', 'Implied value', true),
            el('th', { scope: 'col', text: 'Board' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      var anchor = anchorFor(r.category);
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_tvl === null ? 'n/a' : r.mcap_tvl.toFixed(2) + '×' }),
        el('td', { class: 'num', text: anchor ? anchor.multiple.toFixed(2) + '×' : 'n/a' }),
        el('td', null, el('span', { class: 'badge live', text: 'Already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and their market-cap-to-TVL ratios are the anchor the model prices pre-token protocols by.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }),
            el('th', { scope: 'col', class: 'num', text: '7d' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' }),
            el('th', { scope: 'col', class: 'num', text: 'Mcap / TVL' }), el('th', { scope: 'col', class: 'num', text: 'Category anchor' }),
            el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function methodPanel() {
    var m = DATA.model;
    var tbody = el('tbody');
    DATA.anchors.forEach(function (a) {
      tbody.appendChild(el('tr', null,
        el('td', { text: a.category }),
        el('td', { class: 'num', text: a.multiple.toFixed(2) + '×' }),
        el('td', { class: 'num', text: String(a.comparables) }),
        el('td', { class: 'num', text: a.median_mcap_tvl === null ? 'n/a' : a.median_mcap_tvl.toFixed(2) + '×' })
      ));
    });
    return el('div', { class: 'panel pad' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function scores every row. No protocol name is special-cased and no row is hand-picked; change any input and the ranking moves.' }),
      el('div', { class: 'formula' }, 'implied = round( tvl_usd × anchor(category) × growth × maturity × breadth )'),
      el('p', { class: 'sub', text: 'anchor(category): the median market-cap-to-TVL of the live protocols in the same category (at least ' + m.anchor_min_comparables + ' comparables, shrunk toward the all-category median ' + DATA.global_median_mcap_tvl.toFixed(2) + '×), clamped to [' + m.anchor_floor + ', ' + m.anchor_cap + ']. growth: 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + '. maturity: ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + ', where age is the time since first listing and an unknown age counts as ' + m.unknown_age_days + ' days. breadth: min(' + m.breadth_cap + ', 1 + ' + m.breadth_per_log + ' × ln(chains)).' }),
      el('h3', { text: 'Category anchors, from the live market' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', class: 'num', text: 'Anchor' }),
            el('th', { scope: 'col', class: 'num', text: 'Comparables' }), el('th', { scope: 'col', class: 'num', text: 'Median mcap / TVL' }))),
          tbody
        )
      ),
      el('h3', { text: 'How the farm plans are built' }),
      el('p', { class: 'sub', text: 'Seven steps per protocol, derived from its own record: the category picks the action, the TVL picks the capital, the chains pick the gas cost and the second action, the age picks the hold. Every step states what it costs and how long it takes.' }),
      el('div', { class: 'caveats' },
        el('b', { text: 'Read this before farming anything. ' }),
        '“No token on record” is not “has no token”: DefiLlama\u2019s record may miss a token, and a protocol on this board may already have one. The watchlist is a floor, never a ceiling, and a board row is not a prediction that a token will launch, or when. Implied value is this entry\u2019s own claim from a frozen snapshot dated ' + DATA.as_of + '; it is not a price, not a valuation and not financial advice. Never pay to claim an airdrop, and only ever follow claim links the protocol itself publishes.'
      )
    );
  }

  function detailPanel() {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
    if (!row) return null;
    var recomputed = impliedOf(row);
    var same = recomputed === row.implied_value_usd;
    var comps = DATA.live.filter(function (l) { return (l.category || '(no category)') === (row.category || '(no category)'); }).slice(0, 5);
    var compRows = comps.length === 0
      ? el('p', { class: 'sub', text: 'No live-token protocol in this category is in the live set, so the anchor falls back to the all-category median of ' + DATA.global_median_mcap_tvl.toFixed(2) + '×.' })
      : el('div', { class: 'table-wrap' },
          el('table', { class: 'factors' },
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Live comparable' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' }), el('th', { scope: 'col', class: 'num', text: 'Mcap / TVL' }))),
            el('tbody', null, comps.map(function (l) {
              return el('tr', null,
                el('td', { text: l.name }),
                el('td', { class: 'num', text: fmtUsd(l.tvl_usd) }),
                el('td', { class: 'num', text: fmtUsd(l.mcap_usd) }),
                el('td', { class: 'num', text: l.mcap_tvl === null ? 'n/a' : l.mcap_tvl.toFixed(2) + '×' }));
            }))
          ));
    return el('section', { class: 'panel detail', id: 'detail', 'aria-labelledby': 'detail-title' },
      el('div', { class: 'detail-head' },
        el('div', null,
          el('span', { class: 'rankline', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? ' · Watchlist' : ' · Early find') }),
          el('h2', { id: 'detail-title', text: row.name }),
          el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · first listed ' + (row.listed_at || 'date unknown') })
        ),
        el('button', { class: 'button', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { state.selected = null; writeHash(); render(); } })
      ),
      el('div', { class: 'detail-body' },
        el('h3', { text: 'Implied value — the model, factor by factor' }),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'factors' },
            el('tbody', null,
              el('tr', null, el('td', { text: 'TVL (snapshot)' }), el('td', { text: fmtUsd(row.tvl_usd) })),
              el('tr', null, el('td', { text: 'Category anchor (' + (row.category || 'no category') + ', ' + row.comparables + ' live comparable' + (row.comparables === 1 ? '' : 's') + ')' }), el('td', { text: '× ' + fmtMult(row.category_multiple) })),
              el('tr', null, el('td', { text: 'Seven-day growth (' + fmtPct(row.change_7d) + ')' }), el('td', { text: '× ' + fmtMult(row.growth_multiplier) })),
              el('tr', null, el('td', { text: 'Maturity (' + fmtAge(row.age_days) + ' with no token on record)' }), el('td', { text: '× ' + fmtMult(row.maturity_multiplier) })),
              el('tr', null, el('td', { text: 'Chain breadth (' + (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + ')' }), el('td', { text: '× ' + fmtMult(row.breadth_multiplier) })),
              el('tr', { class: 'total' }, el('td', { text: 'Implied value' }), el('td', { text: fmtUsd(row.implied_value_usd) }))
            )
          )
        ),
        el('p', { class: same ? 'check' : 'sub', text: same
          ? 'The page recomputes this row as ' + fmtUsd(recomputed) + ' — the same number board.json carries.'
          : 'The page recomputes this row as ' + fmtUsd(recomputed) + ', which differs from the board: the data would be stale.' }),
        el('p', { class: 'sub', text: 'This is an estimate from a frozen snapshot, not a price. The protocol records no token; that is not proof it has none.' }),
        el('h3', { text: 'What the market pays for this kind of protocol' }),
        compRows,
        el('h3', { text: 'Farm plan — seven steps' }),
        el('ol', { class: 'steps' }, (row.farm_steps || []).map(function (s) {
          var at = s.indexOf(' Cost: ');
          var action = at >= 0 ? s.slice(0, at) : s;
          var tail = at >= 0 ? s.slice(at + 1) : '';
          return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
        }))
      )
    );
  }

  function openDetail(slug) {
    state.selected = slug;
    writeHash();
    render();
    var d = document.getElementById('detail');
    if (d && d.scrollIntoView) d.scrollIntoView();
  }

  function footer() {
    return el('p', { class: 'foot' },
      el('b', { text: 'Token Radar · model ' + DATA.model_version + ' · ' }),
      'Snapshot ' + DATA.as_of + ' from the DefiLlama protocol index. ' + DATA.board_size + ' pre-token protocols ranked; ' + DATA.live_size + ' live-token protocols set aside. Implied values are this entry\u2019s own model from the snapshot\u2019s figures — not a price, not a valuation, not financial advice.'
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.selected) {
      var detail = detailPanel();
      if (detail) shell.appendChild(detail);
    }
    if (state.tab === 'board') shell.appendChild(boardTable());
    else if (state.tab === 'live') shell.appendChild(liveTable());
    else shell.appendChild(methodPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) { state.selected = null; writeHash(); render(); }
  });
})();
