/* Expense Tracker front end. No build step required. */
(() => {
  const $ = (id) => document.getElementById(id);
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const fmt0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const money = (n) => fmt.format(n);

  const state = {
    password: sessionStorage.getItem('et_pw') || '',
    data: null,
    month: ymNow(),
    search: '',
    filter: '',
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
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = '…';
    try { return await fn(); }
    catch (e) { toast(e.message); }
    finally { btn.disabled = false; btn.textContent = label; }
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

  function monthTxns(ym) {
    return state.data.transactions.filter((t) => t.date.startsWith(ym));
  }
  function spentIn(ym, throughDay = 31) {
    return monthTxns(ym).reduce((sum, t) =>
      (isSpending(categoryOf(t)) && Number(t.date.slice(8, 10)) <= throughDay ? sum + t.amount : sum), 0);
  }

  // ---------- render ----------
  function render() {
    $('monthLabel').textContent = monthName(state.month);
    $('nextMonth').disabled = state.month >= ymNow();
    renderKpis();
    renderCategories();
    renderTrend();
    renderMerchants();
    renderTxns();
    renderConnections();
    renderRules();
  }

  function renderKpis() {
    const txns = monthTxns(state.month);
    const spent = spentIn(state.month);
    // Current month is partial, so compare against the same point last month
    const isCurrent = state.month === ymNow();
    const today = new Date().getDate();
    const prev = spentIn(shiftMonth(state.month, -1), isCurrent ? today : 31);
    const prevLabel = `${isCurrent ? 'same point in ' : ''}${monthName(shiftMonth(state.month, -1), true)}`;
    const income = txns.reduce((s, t) => (categoryOf(t) === 'Income' ? s - t.amount : s), 0);
    const budgets = state.data.settings.budgets;
    const totalBudget = Object.values(budgets).reduce((a, b) => a + b, 0);
    const remaining = totalBudget - spent;
    const change = prev > 0 ? ((spent - prev) / prev) * 100 : null;

    // Pace: how far through the month we are vs how much budget is used
    let paceText = '';
    if (state.month === ymNow() && totalBudget > 0) {
      const d = new Date();
      const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const pctMonth = Math.round((d.getDate() / days) * 100);
      const pctBudget = Math.round((spent / totalBudget) * 100);
      paceText = `${pctBudget}% of budget used, ${pctMonth}% of month gone`;
    }

    $('kpis').innerHTML = `
      <div class="kpi"><div class="label">Spent</div><div class="value">${fmt0.format(spent)}</div>
        <div class="sub">${change === null ? 'No prior month data' : `<span class="${change > 0 ? 'up' : 'down'}">${change > 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(0)}%</span> vs ${prevLabel}`}</div></div>
      <div class="kpi"><div class="label">Budget</div><div class="value">${totalBudget ? fmt0.format(totalBudget) : '—'}</div>
        <div class="sub">${totalBudget ? paceText || `${Object.keys(budgets).length} categories` : 'Set budgets below'}</div></div>
      <div class="kpi"><div class="label">${remaining >= 0 ? 'Remaining' : 'Over budget'}</div>
        <div class="value ${remaining < 0 ? 'up' : ''}">${totalBudget ? fmt0.format(Math.abs(remaining)) : '—'}</div>
        <div class="sub">${totalBudget ? `${Math.max(0, Math.round((remaining / totalBudget) * 100))}% left` : ''}</div></div>
      <div class="kpi"><div class="label">Income</div><div class="value">${fmt0.format(income)}</div>
        <div class="sub">${income > 0 ? `Net ${income - spent >= 0 ? '+' : '−'}${fmt0.format(Math.abs(income - spent))}` : 'Deposits this month'}</div></div>`;
  }

  function renderCategories() {
    const budgets = state.data.settings.budgets;
    const totals = {};
    for (const t of monthTxns(state.month)) {
      const c = categoryOf(t);
      if (isSpending(c)) totals[c] = (totals[c] || 0) + t.amount;
    }
    const cats = state.data.categories.filter((c) => isSpending(c) && ((totals[c] || 0) !== 0 || budgets[c]));
    cats.sort((a, b) => (totals[b] || 0) - (totals[a] || 0));

    $('categories').innerHTML = cats.length
      ? cats.map((c) => {
          const spent = totals[c] || 0;
          const budget = budgets[c] || 0;
          const pct = budget ? Math.min(100, (spent / budget) * 100) : 0;
          const cls = budget && spent > budget ? 'over' : budget && spent > budget * 0.85 ? 'warn' : '';
          const meta = budget
            ? spent > budget ? `${money(spent - budget)} over` : `${money(budget - spent)} left`
            : 'No budget set';
          return `<div class="cat-row">
            <div class="cat-name">${esc(c)}</div>
            <div class="cat-amt">${money(spent)} / <input type="number" min="0" step="10" data-budget="${esc(c)}" value="${budget || ''}" placeholder="budget" /></div>
            <div class="bar ${cls}"><span style="width:${budget ? pct : 0}%"></span></div>
            <div class="cat-meta">${meta}</div>
          </div>`;
        }).join('')
      : '<p class="muted">Nothing spent this month yet.</p>';

    const sel = $('addBudgetCat');
    sel.innerHTML = '<option value="">+ Add budget</option>' +
      state.data.categories.filter((c) => isSpending(c) && !cats.includes(c))
        .map((c) => `<option>${esc(c)}</option>`).join('');
  }

  function renderTrend() {
    const months = [-5, -4, -3, -2, -1, 0].map((d) => shiftMonth(state.month, d));
    const vals = months.map(spentIn);
    const max = Math.max(...vals, 1);
    $('trend').innerHTML = months.map((m, i) => `
      <div class="col ${m === state.month ? 'active' : ''}" title="${monthName(m)}: ${money(vals[i])}">
        <div class="v">${vals[i] ? fmt0.format(vals[i]) : ''}</div>
        <div class="b" style="height:${(Math.max(vals[i], 0) / max) * 100}%"></div>
        <div class="m">${monthName(m, true)}</div>
      </div>`).join('');
  }

  function renderMerchants() {
    const totals = {};
    for (const t of monthTxns(state.month)) {
      if (isSpending(categoryOf(t)) && t.amount > 0) totals[t.name] = (totals[t.name] || 0) + t.amount;
    }
    const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6);
    $('merchants').innerHTML = top.length
      ? top.map(([n, v]) => `<div class="merchant"><span>${esc(n)}</span><span>${money(v)}</span></div>`).join('')
      : '<p class="muted">—</p>';
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
      .sort((a, b) => b.t.date.localeCompare(a.t.date));

    const options = state.data.categories.map((c) => `<option>${esc(c)}</option>`).join('');
    $('txnBody').innerHTML = rows.map(({ t, c }) => `
      <tr>
        <td>${t.date.slice(5).replace('-', '/')}</td>
        <td><div>${esc(t.name)}${t.pending ? '<span class="tag">pending</span>' : ''}</div>
            ${t.description && t.description !== t.name ? `<div class="desc">${esc(t.description)}</div>` : ''}</td>
        <td class="muted">${esc(accountLabel(t))}</td>
        <td><select data-txn="${esc(t.id)}">${options.replace(`<option>${esc(c)}</option>`, `<option selected>${esc(c)}</option>`)}</select></td>
        <td class="num ${t.amount < 0 ? 'inflow' : ''}">${t.amount < 0 ? '+' : ''}${money(Math.abs(t.amount))}</td>
      </tr>`).join('');
    $('txnEmpty').classList.toggle('hidden', rows.length > 0);
  }

  function renderConnections() {
    const conns = state.data.connections;
    const csvAccounts = [...new Set(state.data.transactions.filter((t) => t.source === 'csv').map((t) => t.account))];
    let html = conns.map((c) => `
      <div class="conn">
        <div>
          <div><strong>${esc(c.institution)}</strong> <span class="muted small">${c.accounts.map((a) => esc(`${a.name} ••${a.mask || ''}`)).join(', ')}</span></div>
          <div class="muted small">${c.last_sync ? 'Synced ' + new Date(c.last_sync).toLocaleString() : 'Not synced yet'}</div>
          ${c.error ? `<div class="err">${esc(c.error)}${c.error === 'ITEM_LOGIN_REQUIRED' ? ' (Chase needs you to log in again)' : ''}</div>` : ''}
        </div>
        <div style="display:flex;gap:12px">
          ${c.error ? `<button class="link-btn" data-reconnect="${esc(c.item_id)}">Reconnect</button>` : ''}
          <button class="link-btn danger" data-remove="${esc(c.item_id)}">Remove</button>
        </div>
      </div>`).join('');
    html += csvAccounts.map((a) => `
      <div class="conn">
        <div><strong>${esc(a)}</strong> <span class="muted small">CSV import</span></div>
        <button class="link-btn danger" data-delcsv="${esc(a)}">Delete imported</button>
      </div>`).join('');
    $('connections').innerHTML = html || '<p class="muted">No accounts yet. Tap “Connect Chase” or import a Chase CSV.</p>';
  }

  function renderRules() {
    const rules = state.data.settings.rules;
    $('rules').innerHTML = rules.length
      ? rules.map((r, i) => `<div class="rule"><span>“${esc(r.match)}” → <strong>${esc(r.category)}</strong></span>
          <button class="link-btn danger" data-rule="${i}">Delete</button></div>`).join('')
      : '<p class="muted small">No rules yet.</p>';
  }

  // ---------- actions ----------
  async function reload() {
    state.data = await api('/data');
    const sel = $('catFilter');
    const cur = sel.value;
    sel.innerHTML = '<option value="">All categories</option>' + state.data.categories.map((c) => `<option>${esc(c)}</option>`).join('');
    sel.value = cur;
    render();
  }

  async function setCategory(id, category) {
    const t = state.data.transactions.find((x) => x.id === id);
    state.data.settings.overrides[id] = category;
    render();
    try {
      await post('/data', { action: 'setOverride', id, category });
      toast(`Moved to ${category}.`, {
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
      toast(`Rule saved: “${match}” → ${category}`);
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
    toast(`Imported ${added} new of ${total} rows.`);
    await reload();
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
    // Resume Chase OAuth if we were redirected back here
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
  $('logoutBtn').onclick = lock;
  $('prevMonth').onclick = () => { state.month = shiftMonth(state.month, -1); render(); };
  $('nextMonth').onclick = () => { if (state.month < ymNow()) { state.month = shiftMonth(state.month, 1); render(); } };
  $('connectBtn').onclick = (e) => busy(e.currentTarget, () => connectBank());
  $('syncBtn').onclick = (e) => busy(e.currentTarget, async () => {
    if (!state.data.connections.length) return toast('No bank connected yet.');
    const r = await api('/sync', { method: 'POST' });
    await reload();
    toast(r.errors.length ? `Sync issue: ${r.errors[0].error}` : `Synced: ${r.added} new, ${r.modified} updated, ${r.removed} removed.`);
  });
  $('importBtn').onclick = () => $('csvFile').click();
  $('csvFile').onchange = async (e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) await importFiles(files); };
  $('search').oninput = (e) => { state.search = e.target.value; renderTxns(); };
  $('catFilter').onchange = (e) => { state.filter = e.target.value; renderTxns(); };
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
