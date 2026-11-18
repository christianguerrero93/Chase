/* Ledger: expense tracker front end. No build step required. */
(() => {
  const $ = (id) => document.getElementById(id);
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const fmt0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const money = (n) => fmt.format(n);

  // Color + icon for each category
  const META = {
    Groceries: ['#16a34a', '🛒'], Dining: ['#ea580c', '🍽️'], Coffee: ['#92400e', '☕'],
    'Food Delivery': ['#f97316', '🛵'], Shopping: ['#db2777', '🛍️'], Clothing: ['#c026d3', '👟'],
    Transportation: ['#0891b2', '🚇'], Gas: ['#475569', '⛽'], Travel: ['#0284c7', '✈️'],
    Rent: ['#4f46e5', '🏠'], 'Bills & Utilities': ['#ca8a04', '💡'], 'Phone & Internet': ['#6366f1', '📶'],
    Insurance: ['#64748b', '🛡️'], Subscriptions: ['#7c3aed', '🔁'], Entertainment: ['#e11d48', '🎟️'],
    Fitness: ['#059669', '🏋️'], Health: ['#dc2626', '💊'], 'Personal Care': ['#ec4899', '💈'],
    Home: ['#a16207', '🛋️'], Pets: ['#b45309', '🐾'], Education: ['#2563eb', '🎓'],
    'Gifts & Donations': ['#be185d', '🎁'], 'Venmo & Zelle': ['#0ea5e9', '💸'], 'Cash & ATM': ['#15803d', '🏧'],
    Fees: ['#b91c1c', '⚠️'], 'Debt Payments': ['#7f1d1d', '🏦'], Other: ['#94a3b8', '❔'],
    Income: ['#059669', '💰'], Transfer: ['#64748b', '🔄'], 'Credit Card Payment': ['#334155', '💳'],
  };
  const color = (c) => (META[c] || META.Other)[0];
  const icon = (c) => (META[c] || META.Other)[1];

  const state = {
    password: sessionStorage.getItem('et_pw') || '',
    data: null,
    month: ymNow(),
    search: '',
    filter: '',
    limit: 60,
  };

  // ---------- utils ----------
  function ymNow() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  function monthName(ym, short = false) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', short ? { month: 'short' } : { month: 'long', year: 'numeric' });
  }
  function dayLabel(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let toastTimer;
  function toast(msg, action) {
    const el = $('toast');
    el.innerHTML = `<span>${esc(msg)}</span>`;
    if (action) {
      const b = document.createElement('button');
      b.textContent = action.label;
      b.onclick = () => { el.classList.add('hidden'); action.run(); };
      el.appendChild(b);
    }
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), action ? 8000 : 3500);
  }

  async function api(path, opts = {}) {
    const res = await fetch('/api' + path, {
      ...opts,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + state.password },
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) { lock(); throw new Error('Wrong password'); }
    if (!res.ok) throw new Error(body.error || res.statusText);
    return body;
  }
  const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });

  async function busy(btn, fn) {
    const label = btn.innerHTML;
    btn.disabled = true; btn.textContent = '…';
    try { return await fn(); }
    catch (e) { toast(e.message); }
    finally { btn.disabled = false; btn.innerHTML = label; }
  }

  // ---------- categorization ----------
  function categoryOf(t) {
    const s = state.data.settings;
    if (s.overrides[t.id]) return s.overrides[t.id];
    const hay = `${t.name} ${t.description}`.toLowerCase();
    const rule = s.rules.find((r) => hay.includes(r.match.toLowerCase()));
    return rule ? rule.category : t.auto;
  }
  const isSpending = (cat) => !state.data.nonSpending.includes(cat);
  const monthTxns = (ym) => state.data.transactions.filter((t) => t.date.startsWith(ym));
  function spentIn(ym, throughDay = 31) {
    return monthTxns(ym).reduce((sum, t) =>
      (isSpending(categoryOf(t)) && Number(t.date.slice(8, 10)) <= throughDay ? sum + t.amount : sum), 0);
  }
  function categoryTotals(ym) {
    const totals = {};
    for (const t of monthTxns(ym)) {
      const c = categoryOf(t);
      if (isSpending(c)) totals[c] = (totals[c] || 0) + t.amount;
    }
    return totals;
  }

  // ---------- render ----------
  function render() {
    $('monthLabel').textContent = monthName(state.month);
    $('nextMonth').disabled = state.month >= ymNow();
    renderHero();
    renderReview();
    renderDonut();
    renderTrend();
    renderMerchants();
    renderBudgets();
    renderTxns();
    renderConnections();
    renderRules();
  }

  function renderHero() {
    const txns = monthTxns(state.month);
    const spent = spentIn(state.month);
    const isCurrent = state.month === ymNow();
    const today = new Date().getDate();
    const prevYm = shiftMonth(state.month, -1);
    const prev = spentIn(prevYm, isCurrent ? today : 31);
    const income = txns.reduce((s, t) => (categoryOf(t) === 'Income' ? s - t.amount : s), 0);
    const budgets = state.data.settings.budgets;
    const totalBudget = Object.values(budgets).reduce((a, b) => a + b, 0);
    const remaining = totalBudget - spent;
    const change = prev > 0 ? ((spent - prev) / prev) * 100 : null;
    const purchases = txns.filter((t) => t.amount > 0 && isSpending(categoryOf(t))).length;

    $('heroSpent').textContent = fmt0.format(spent);
    $('heroSub').innerHTML = change === null
      ? `${purchases} purchases`
      : `<span class="pill ${change > 0 ? 'bad' : 'good'}">${change > 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(0)}%</span>
         vs ${isCurrent ? 'same point in ' : ''}${monthName(prevYm, true)} · ${purchases} purchases`;

    // Budget ring
    if (totalBudget > 0) {
      const pct = Math.max(0, spent / totalBudget);
      const r = 64, circ = 2 * Math.PI * r;
      const stroke = pct > 1 ? '#f87171' : pct > 0.85 ? '#fbbf24' : '#60a5fa';
      let pace = '';
      if (isCurrent) {
        const d = new Date();
        const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        pace = ` · ${Math.round((d.getDate() / days) * 100)}% of month gone`;
      }
      $('heroMeter').innerHTML = `
        <svg width="150" height="150" viewBox="0 0 150 150">
          <circle cx="75" cy="75" r="${r}" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="12"/>
          <circle cx="75" cy="75" r="${r}" fill="none" stroke="${stroke}" stroke-width="12" stroke-linecap="round"
            stroke-dasharray="${Math.min(pct, 1) * circ} ${circ}" transform="rotate(-90 75 75)"/>
          <text x="75" y="72" text-anchor="middle" fill="#fff" font-size="26" font-weight="800">${Math.round(pct * 100)}%</text>
          <text x="75" y="94" text-anchor="middle" fill="rgba(255,255,255,.75)" font-size="12">of budget</text>
        </svg>
        <div class="lbl">${fmt0.format(totalBudget)} budget${pace}</div>`;
    } else {
      $('heroMeter').innerHTML = '';
    }

    const avgDay = isCurrent ? spent / Math.max(today, 1) : spent / new Date(...state.month.split('-').map(Number), 0).getDate();
    $('kpis').innerHTML = `
      <div class="kpi"><div class="label">${remaining >= 0 ? 'Left to spend' : 'Over budget'}</div>
        <div class="value">${totalBudget ? fmt0.format(Math.abs(remaining)) : '—'}</div>
        <div class="sub">${totalBudget ? `of ${fmt0.format(totalBudget)}` : 'Set budgets below'}</div></div>
      <div class="kpi"><div class="label">Income</div><div class="value">${fmt0.format(income)}</div>
        <div class="sub">${income > 0 ? `Net ${income - spent >= 0 ? '+' : '-'}${fmt0.format(Math.abs(income - spent))}` : 'Deposits this month'}</div></div>
      <div class="kpi"><div class="label">Daily average</div><div class="value">${fmt0.format(avgDay)}</div>
        <div class="sub">${isCurrent ? `over ${today} days so far` : 'per day'}</div></div>
      <div class="kpi"><div class="label">Biggest category</div>${(() => {
        const top = Object.entries(categoryTotals(state.month)).sort((a, b) => b[1] - a[1])[0];
        return top ? `<div class="value">${icon(top[0])} ${fmt0.format(top[1])}</div><div class="sub">${esc(top[0])}</div>`
                   : '<div class="value">—</div><div class="sub">No spending yet</div>';
      })()}</div>`;
  }

  function renderReview() {
    const others = monthTxns(state.month).filter((t) => categoryOf(t) === 'Other');
    const el = $('review');
    if (!others.length) { el.classList.add('hidden'); return; }
    const sum = others.reduce((s, t) => s + Math.max(t.amount, 0), 0);
    el.innerHTML = `<div class="icon">🧐</div>
      <div class="txt"><strong>${others.length} purchase${others.length > 1 ? 's' : ''} need a category</strong>
        ${money(sum)} is sitting in Other. Sort them once and tap “Always” so they’re automatic next time.</div>
      <button class="btn" id="reviewBtn">Review</button>`;
    el.classList.remove('hidden');
    $('reviewBtn').onclick = () => {
      state.filter = 'Other'; $('catFilter').value = 'Other'; renderTxns();
      $('txnList').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  }

  function renderDonut() {
    const entries = Object.entries(categoryTotals(state.month)).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    // Keep the chart readable: top 7, then "Everything else"
    const shown = entries.slice(0, 7);
    const rest = entries.slice(7).reduce((s, [, v]) => s + v, 0);
    if (rest > 0) shown.push(['Everything else', rest]);

    const r = 80, circ = 2 * Math.PI * r;
    let offset = 0;
    const segs = total ? shown.map(([c, v]) => {
      const len = (v / total) * circ;
      const gap = shown.length > 1 ? 2 : 0;
      const seg = `<circle class="seg" data-cat="${esc(c)}" cx="100" cy="100" r="${r}" fill="none" stroke="${c === 'Everything else' ? '#cbd5e1' : color(c)}"
        stroke-width="24" stroke-dasharray="${Math.max(len - gap, 0)} ${circ}" stroke-dashoffset="${-offset}"><title>${esc(c)}: ${money(v)}</title></circle>`;
      offset += len;
      return seg;
    }).join('') : `<circle cx="100" cy="100" r="${r}" fill="none" stroke="var(--line)" stroke-width="24"/>`;

    $('donut').innerHTML = `<svg width="200" height="200" viewBox="0 0 200 200">${segs}</svg>
      <div class="center"><b>${fmt0.format(total)}</b><span>${entries.length} categories</span></div>`;
    $('legend').innerHTML = shown.length
      ? shown.map(([c, v]) => `<div class="legend-row" data-cat="${esc(c)}">
          <span class="dot" style="--c:${c === 'Everything else' ? '#cbd5e1' : color(c)}"></span>
          <span class="name">${c === 'Everything else' ? '' : icon(c) + ' '}${esc(c)}</span>
          <span class="pct">${Math.round((v / total) * 100)}%</span><span class="amt">${fmt0.format(v)}</span></div>`).join('')
      : '<p class="muted">No spending this month yet.</p>';
    $('donutNote').textContent = 'Tap a category to filter';
  }

  function renderTrend() {
    const months = [-5, -4, -3, -2, -1, 0].map((d) => shiftMonth(state.month, d));
    const vals = months.map((m) => spentIn(m));
    const max = Math.max(...vals, 1);
    const prior = vals.slice(0, 5).filter((v) => v > 0);
    $('avgNote').textContent = prior.length ? `Avg ${fmt0.format(prior.reduce((a, b) => a + b, 0) / prior.length)}/mo` : '';
    $('trend').innerHTML = months.map((m, i) => `
      <div class="col ${m === state.month ? 'active' : ''}" data-month="${m}" title="${monthName(m)}: ${money(vals[i])}">
        <div class="v">${vals[i] ? fmt0.format(vals[i]) : ''}</div>
        <div class="b" style="height:${(Math.max(vals[i], 0) / max) * 100}%"></div>
        <div class="m">${monthName(m, true)}</div>
      </div>`).join('');
  }

  function renderMerchants() {
    const totals = {};
    for (const t of monthTxns(state.month)) {
      const c = categoryOf(t);
      if (isSpending(c) && t.amount > 0) {
        totals[t.name] = totals[t.name] || { v: 0, n: 0, c };
        totals[t.name].v += t.amount; totals[t.name].n++;
      }
    }
    const top = Object.entries(totals).sort((a, b) => b[1].v - a[1].v).slice(0, 5);
    $('merchants').innerHTML = top.length
      ? top.map(([n, o]) => `<div class="merchant"><span class="chip" style="--c:${color(o.c)}">${icon(o.c)}</span>
          <span class="name">${esc(n)} <span class="muted small">× ${o.n}</span></span><span class="amt">${money(o.v)}</span></div>`).join('')
      : '<p class="muted">Nothing yet.</p>';
  }

  function renderBudgets() {
    const budgets = state.data.settings.budgets;
    const totals = categoryTotals(state.month);
    const cats = state.data.categories.filter((c) => isSpending(c) && (totals[c] > 0 || budgets[c]));
    cats.sort((a, b) => (budgets[b] ? 1 : 0) - (budgets[a] ? 1 : 0) || (totals[b] || 0) - (totals[a] || 0));

    $('categories').innerHTML = cats.length
      ? cats.map((c) => {
          const spent = totals[c] || 0;
          const budget = budgets[c] || 0;
          const pct = budget ? Math.min(100, (spent / budget) * 100) : 0;
          const cls = budget && spent > budget ? 'over' : budget && spent > budget * 0.85 ? 'warn' : '';
          const status = budget
            ? spent > budget ? `${money(spent - budget)} over budget` : `${money(budget - spent)} left · ${Math.round(pct)}% used`
            : 'No budget yet';
          return `<div class="budget" style="--c:${cls === 'over' ? 'var(--bad)' : cls === 'warn' ? 'var(--warn)' : color(c)}">
            <span class="chip" style="--c:${color(c)}">${icon(c)}</span>
            <div class="body">
              <div class="row"><span class="name">${esc(c)}</span><span class="spent">${money(spent)}</span></div>
              <div class="bar"><span style="width:${budget ? pct : 0}%"></span></div>
              <div class="row"><span class="status ${cls}">${status}</span>
                <span class="of">of $<input type="number" min="0" step="10" data-budget="${esc(c)}" value="${budget || ''}" placeholder="set" /></span></div>
            </div>
          </div>`;
        }).join('')
      : '<p class="muted">Nothing spent this month yet.</p>';

    $('addBudgetCat').innerHTML = '<option value="">+ Add a budget</option>' +
      state.data.categories.filter((c) => isSpending(c) && !cats.includes(c))
        .map((c) => `<option value="${esc(c)}">${icon(c)} ${esc(c)}</option>`).join('');
  }

  function accountLabel(t) {
    const a = state.data.accounts[t.account];
    if (a) return `${a.name}${a.mask ? ' ••' + a.mask : ''}`;
    return t.account || '';
  }

  function renderTxns() {
    const q = state.search.toLowerCase();
    const rows = monthTxns(state.month)
      .map((t) => ({ t, c: categoryOf(t) }))
      .filter(({ t, c }) => (!state.filter || c === state.filter) &&
        (!q || `${t.name} ${t.description}`.toLowerCase().includes(q)))
      .sort((a, b) => b.t.date.localeCompare(a.t.date) || b.t.amount - a.t.amount);

    const total = rows.reduce((s, { t, c }) => s + (isSpending(c) ? t.amount : 0), 0);
    $('txnCount').textContent = rows.length ? `· ${rows.length}${state.filter || q ? ` · ${money(total)}` : ''}` : '';

    const options = state.data.categories.map((c) => `<option value="${esc(c)}">${icon(c)} ${esc(c)}</option>`).join('');
    let html = '', lastDay = '';
    const visible = rows.slice(0, state.limit);
    for (const { t, c } of visible) {
      if (t.date !== lastDay) {
        const dayTotal = rows.filter((r) => r.t.date === t.date && isSpending(r.c)).reduce((s, r) => s + r.t.amount, 0);
        html += `<div class="day"><span>${dayLabel(t.date)}</span><span>${dayTotal > 0 ? money(dayTotal) : ''}</span></div>`;
        lastDay = t.date;
      }
      const sel = options.replace(`value="${esc(c)}"`, `value="${esc(c)}" selected`);
      html += `<div class="txn">
        <span class="chip" style="--c:${color(c)}">${icon(c)}</span>
        <div class="info">
          <div class="merch">${esc(t.name)}${t.pending ? '<span class="tag">pending</span>' : ''}</div>
          <div class="meta">${esc(accountLabel(t))}${t.source !== 'csv' && t.description && t.description !== t.name ? ' · ' + esc(t.description) : ''}</div>
        </div>
        <select class="cat ${c === 'Other' ? 'other' : ''}" style="--c:${color(c)}" data-txn="${esc(t.id)}" aria-label="Category">${sel}</select>
        <div class="amt ${t.amount < 0 ? 'in' : ''}">${t.amount < 0 ? '+' : ''}${money(Math.abs(t.amount))}</div>
      </div>`;
    }
    if (rows.length > state.limit) html += `<button class="btn more" id="moreBtn">Show ${Math.min(60, rows.length - state.limit)} more</button>`;
    $('txnList').innerHTML = html;
    $('txnEmpty').classList.toggle('hidden', rows.length > 0);
    const more = $('moreBtn');
    if (more) more.onclick = () => { state.limit += 60; renderTxns(); };
  }

  function renderConnections() {
    const conns = state.data.connections;
    const csvAccounts = [...new Set(state.data.transactions.filter((t) => t.source === 'csv').map((t) => t.account))];
    let html = conns.map((c) => `
      <div class="conn">
        <div>
          <div><strong>🏦 ${esc(c.institution)}</strong> <span class="muted small">${c.accounts.map((a) => esc(`${a.name} ••${a.mask || ''}`)).join(', ')}</span></div>
          <div class="muted small">${c.last_sync ? 'Synced ' + new Date(c.last_sync).toLocaleString() : 'Not synced yet'}</div>
          ${c.error ? `<div class="err">${esc(c.error)}${c.error === 'ITEM_LOGIN_REQUIRED' ? ' (Chase needs you to log in again)' : ''}</div>` : ''}
        </div>
        <div style="display:flex;gap:12px">
          ${c.error ? `<button class="link-btn" data-reconnect="${esc(c.item_id)}">Reconnect</button>` : ''}
          <button class="link-btn danger" data-remove="${esc(c.item_id)}">Remove</button>
        </div>
      </div>`).join('');
    html += csvAccounts.map((a) => {
      const n = state.data.transactions.filter((t) => t.account === a).length;
      return `<div class="conn">
        <div><strong>📄 ${esc(a)}</strong> <span class="muted small">CSV import · ${n} transactions</span></div>
        <button class="link-btn danger" data-delcsv="${esc(a)}">Delete</button>
      </div>`;
    }).join('');
    $('connections').innerHTML = html || '<p class="muted">No accounts yet. Tap “Connect Chase” or import a Chase CSV.</p>';
  }

  function renderRules() {
    const rules = state.data.settings.rules;
    $('rules').innerHTML = rules.length
      ? rules.map((r, i) => `<div class="rule"><span>“${esc(r.match)}” → ${icon(r.category)} <strong>${esc(r.category)}</strong></span>
          <button class="link-btn danger" data-rule="${i}">Delete</button></div>`).join('')
      : '<p class="muted small">No rules yet.</p>';
  }

  // ---------- actions ----------
  async function reload() {
    state.data = await api('/data');
    const sel = $('catFilter');
    const cur = state.filter;
    sel.innerHTML = '<option value="">All categories</option>' +
      state.data.categories.map((c) => `<option value="${esc(c)}">${icon(c)} ${esc(c)}</option>`).join('');
    sel.value = cur;
    render();
  }

  async function setCategory(id, category) {
    const t = state.data.transactions.find((x) => x.id === id);
    state.data.settings.overrides[id] = category;
    render();
    try {
      await post('/data', { action: 'setOverride', id, category });
      toast(`${icon(category)} Moved to ${category}`, {
        label: `Always for “${t.name}”`,
        run: () => addRule(t.name, category),
      });
    } catch (e) { toast(e.message); }
  }

  async function addRule(match, category) {
    try {
      const { settings } = await post('/data', { action: 'addRule', match, category });
      state.data.settings = settings;
      render();
      const n = state.data.transactions.filter((t) => `${t.name} ${t.description}`.toLowerCase().includes(match.toLowerCase())).length;
      toast(`Rule saved. ${n} transaction${n === 1 ? '' : 's'} now in ${category}.`);
    } catch (e) { toast(e.message); }
  }

  async function setBudget(category, amount) {
    try {
      const { settings } = await post('/data', { action: 'setBudget', category, amount });
      state.data.settings = settings;
      render();
    } catch (e) { toast(e.message); }
  }

  // ---------- Plaid Link ----------
  async function connectBank(itemId) {
    if (!window.Plaid) return toast('Plaid failed to load. Check your connection or ad blocker.');
    const { link_token } = await post('/link-token', itemId ? { item_id: itemId } : {});
    localStorage.setItem('et_link_token', link_token);
    if (itemId) localStorage.setItem('et_link_item', itemId); else localStorage.removeItem('et_link_item');
    openLink(link_token, null, itemId);
  }

  function openLink(token, receivedRedirectUri, itemId) {
    const finish = () => {
      localStorage.removeItem('et_link_token');
      localStorage.removeItem('et_link_item');
      if (receivedRedirectUri) history.replaceState({}, '', '/');
    };
    const handler = Plaid.create({
      token,
      receivedRedirectUri: receivedRedirectUri || undefined,
      onSuccess: async (public_token, metadata) => {
        finish();
        try {
          if (itemId) {
            await api('/sync', { method: 'POST' });
            toast('Reconnected and synced.');
          } else {
            toast('Connected. Pulling transactions…');
            const r = await post('/exchange', { public_token, institution: metadata.institution });
            toast(`Imported ${r.summary.added} transactions. Older history can take a few minutes; tap Sync later.`);
          }
          await reload();
        } catch (e) { toast(e.message); }
      },
      onExit: (err) => {
        finish();
        if (err) toast(err.display_message || err.error_message || 'Connection cancelled');
      },
    });
    handler.open();
  }

  // ---------- Chase CSV import ----------
  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') inQ = false;
        else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some((f) => f.trim() !== '')) rows.push(row);
        row = [];
      } else field += ch;
    }
    row.push(field);
    if (row.some((f) => f.trim() !== '')) rows.push(row);
    return rows;
  }

  const toIso = (mdy) => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((mdy || '').trim());
    return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
  };

  // Supports Chase credit card and Chase checking/savings exports.
  function chaseRows(text) {
    const rows = parseCsv(text.replace(/^﻿/, ''));
    if (rows.length < 2) throw new Error('CSV looks empty');
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name) => head.indexOf(name);
    const iDate = col('transaction date') >= 0 ? col('transaction date') : col('posting date');
    const iDesc = col('description');
    const iAmt = col('amount');
    const iCat = col('category');
    const iType = col('type');
    if (iDate < 0 || iDesc < 0 || iAmt < 0) {
      throw new Error('Not a Chase CSV (need Date, Description and Amount columns)');
    }
    return rows.slice(1).map((r) => ({
      date: toIso(r[iDate]),
      description: (r[iDesc] || '').trim(),
      amount: -Number(String(r[iAmt]).replace(/[$,\s]/g, '')), // Chase: negative = money out
      category: iCat >= 0 ? (r[iCat] || '').trim() : '',
      type: iType >= 0 ? (r[iType] || '').trim() : '',
    })).filter((r) => r.date && Number.isFinite(r.amount));
  }

  function accountFromFilename(name) {
    const m = /Chase(\d{4})/i.exec(name);
    return m ? `Chase ••${m[1]}` : name.replace(/\.csv$/i, '');
  }

  async function importFiles(files) {
    let added = 0, total = 0;
    for (const f of files) {
      try {
        const rows = chaseRows(await f.text());
        const r = await post('/data', { action: 'importCsv', rows, account: accountFromFilename(f.name) });
        added += r.added; total += r.total;
      } catch (e) { toast(`${f.name}: ${e.message}`); return; }
    }
    await reload();
    toast(`Imported ${added} new of ${total} rows.`);
  }

  // ---------- lock / unlock ----------
  function lock() {
    state.password = '';
    sessionStorage.removeItem('et_pw');
    $('app').classList.add('hidden');
    $('login').classList.remove('hidden');
    $('pw').focus();
  }

  async function unlock() {
    await reload();
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    const pending = localStorage.getItem('et_link_token');
    if (pending && new URLSearchParams(location.search).has('oauth_state_id')) {
      openLink(pending, window.location.href, localStorage.getItem('et_link_item'));
    }
  }

  // ---------- events ----------
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    state.password = $('pw').value;
    $('loginErr').textContent = '';
    try {
      await unlock();
      sessionStorage.setItem('et_pw', state.password);
      $('pw').value = '';
    } catch (err) {
      $('loginErr').textContent = err.message;
      state.password = '';
    }
  });
  const goMonth = (m) => { state.month = m; state.limit = 60; render(); };
  $('logoutBtn').onclick = lock;
  $('prevMonth').onclick = () => goMonth(shiftMonth(state.month, -1));
  $('nextMonth').onclick = () => { if (state.month < ymNow()) goMonth(shiftMonth(state.month, 1)); };
  $('connectBtn').onclick = (e) => busy(e.currentTarget, () => connectBank());
  $('syncBtn').onclick = (e) => busy(e.currentTarget, async () => {
    if (!state.data.connections.length) return toast('No bank connected yet.');
    const r = await api('/sync', { method: 'POST' });
    await reload();
    toast(r.errors.length ? `Sync issue: ${r.errors[0].error}` : `Synced: ${r.added} new, ${r.modified} updated, ${r.removed} removed.`);
  });
  $('importBtn').onclick = () => $('csvFile').click();
  $('csvFile').onchange = async (e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) await importFiles(files); };
  $('search').oninput = (e) => { state.search = e.target.value; state.limit = 60; renderTxns(); };
  $('catFilter').onchange = (e) => { state.filter = e.target.value; state.limit = 60; renderTxns(); };
  $('addBudgetCat').onchange = (e) => {
    const c = e.target.value; e.target.value = '';
    if (!c) return;
    const amt = prompt(`Monthly budget for ${c}:`, '200');
    if (amt && Number(amt) > 0) setBudget(c, Number(amt));
  };

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.txn) setCategory(el.dataset.txn, el.value);
    if (el.dataset.budget !== undefined) setBudget(el.dataset.budget, Number(el.value));
  });

  document.addEventListener('click', async (e) => {
    const catEl = e.target.closest('[data-cat]');
    if (catEl && catEl.dataset.cat !== 'Everything else') {
      state.filter = catEl.dataset.cat; $('catFilter').value = state.filter; state.limit = 60; renderTxns();
      $('txnList').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const monthEl = e.target.closest('[data-month]');
    if (monthEl) { goMonth(monthEl.dataset.month); return; }

    const el = e.target.closest('button');
    if (!el) return;
    try {
      if (el.dataset.rule !== undefined) {
        const { settings } = await post('/data', { action: 'deleteRule', index: Number(el.dataset.rule) });
        state.data.settings = settings; render();
      } else if (el.dataset.reconnect) {
        await connectBank(el.dataset.reconnect);
      } else if (el.dataset.remove) {
        if (!confirm('Disconnect this bank? This revokes access at Plaid.')) return;
        const wipe = confirm('Also delete its transactions from the tracker? (Cancel keeps them.)');
        await post('/data', { action: 'removeConnection', item_id: el.dataset.remove, deleteTransactions: wipe });
        await reload(); toast('Disconnected.');
      } else if (el.dataset.delcsv) {
        if (!confirm(`Delete all transactions imported for ${el.dataset.delcsv}?`)) return;
        const r = await post('/data', { action: 'deleteImported', account: el.dataset.delcsv });
        await reload(); toast(`Deleted ${r.deleted} transactions.`);
      }
    } catch (err) { toast(err.message); }
  });

  // ---------- boot ----------
  if (state.password) unlock().catch(lock);
  else lock();
})();
