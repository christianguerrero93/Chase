import { prepare, snapshot, ymOf, shiftMonth } from './engine.js';
import { esc, money, icon, categoryOptions, chip, dayLabel } from './ui.js';
import { chaseRows, accountFromFilename } from './csv.js';
import * as today from './pages/today.js';
import * as activity from './pages/activity.js';
import * as plan from './pages/plan.js';
import * as bills from './pages/bills.js';
import * as insights from './pages/insights.js';
import * as goals from './pages/goals.js';
import * as settings from './pages/settings.js';
import * as more from './pages/more.js';

const PAGES = { today, activity, plan, bills, insights, goals, settings, more };
const NAV = [
  ['today', 'Today', '🏠'], ['activity', 'Activity', '🧾'], ['plan', 'Plan', '🗂️'],
  ['bills', 'Bills', '🗓️'], ['insights', 'Insights', '📊'], ['goals', 'Goals', '🎯'], ['settings', 'Settings', '⚙️'],
];
const TABS = ['today', 'activity', 'plan', 'insights', 'more'];

const $ = (id) => document.getElementById(id);
const state = { data: null, m: null, snap: null, month: null, filters: { search: '', category: '', account: '' }, page: 'today' };

// ------------------------------------------------------------------ api
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    credentials: 'same-origin',
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
  });
  const body = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => ({})) : {};
  if (res.status === 401 && !path.startsWith('/auth/')) { showLogin(); throw new Error('Please sign in again'); }
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}
const post = (path, body = {}) => api(path, { method: 'POST', body: JSON.stringify(body) });

// --------------------------------------------------------------- toast
let toastTimer;
export function toast(msg, action) {
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

// --------------------------------------------------------------- model
function rebuild() {
  state.m = prepare(state.data);
  state.snap = snapshot(state.m);
  if (!state.month) state.month = ymOf(state.data.today);
}

async function reload() {
  state.data = await api('/data');
  rebuild();
  render();
}

// Save a settings change, update locally, re-render.
async function save(payload, { quiet = true } = {}) {
  const r = await post('/data', payload);
  if (r.settings) state.data.settings = r.settings;
  rebuild();
  render();
  if (!quiet) toast('Saved');
  return r;
}

// ----------------------------------------------------------- rendering
function render() {
  if (!state.data) return;
  const page = PAGES[state.page] ? state.page : 'today';
  document.body.dataset.page = page;
  for (const a of document.querySelectorAll('[data-nav]')) a.classList.toggle('active', a.dataset.nav === page || (page !== 'today' && a.dataset.nav === 'more' && !TABS.includes(page)));
  const ctx = context();
  const view = $('view');
  view.innerHTML = PAGES[page].render(ctx);
  PAGES[page].bind?.(ctx, view);
  const alerts = state.snap.alerts.filter((a) => a.level !== 'info').length;
  for (const b of document.querySelectorAll('[data-badge="today"]')) b.textContent = alerts || '';
}

function context() {
  return {
    data: state.data, m: state.m, snap: state.snap, today: state.data.today,
    month: state.month, filters: state.filters,
    setMonth: (ym) => { state.month = ym; render(); },
    shiftMonth: (d) => { const n = shiftMonth(state.month, d); if (n <= ymOf(state.data.today)) { state.month = n; render(); } },
    setFilter: (k, v) => { state.filters[k] = v; render(); },
    go, save, post, api, toast, reload, render,
    openTxn, setCategory, connectBank, importFiles, exportCsv, exportBackup, sync,
    passkeys: { register: registerPasskey },
  };
}

function go(page, extra = {}) {
  Object.assign(state.filters, extra.filters || {});
  if (extra.month) state.month = extra.month;
  if (location.hash !== '#/' + page) location.hash = '#/' + page;
  else { state.page = page; render(); }
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', () => {
  state.page = (location.hash.replace(/^#\/?/, '') || 'today').split('?')[0];
  render();
  window.scrollTo({ top: 0 });
});

// --------------------------------------------------- category changes
async function setCategory(id, category) {
  const t = state.m.txns.find((x) => x.id === id);
  await save({ action: 'setOverride', id, category });
  toast(`${icon(category)} Moved to ${category}`, {
    label: `Always for “${t.name}”`,
    run: async () => {
      await save({ action: 'addRule', match: t.name, category });
      const n = state.m.txns.filter((x) => `${x.name} ${x.description}`.toLowerCase().includes(t.name.toLowerCase())).length;
      toast(`Rule saved. ${n} transaction${n === 1 ? '' : 's'} now in ${category}.`);
    },
  });
}

// ------------------------------------------------- transaction sheet
function openTxn(id) {
  const t = state.m.txns.find((x) => x.id === id);
  if (!t) return;
  const s = state.data.settings;
  const cats = state.data.categories;
  const acct = state.data.accounts[t.account];
  const parts = t.split ? t.alloc.map((a) => ({ category: a.c, amount: a.amount })) : [{ category: t.cat, amount: t.amount }, { category: 'Other', amount: 0 }];
  const sheet = $('sheet');
  sheet.innerHTML = `<div class="sheet-card" role="dialog" aria-modal="true">
    <button class="sheet-close" data-close aria-label="Close">×</button>
    <div class="sheet-head">${chip(t.cat, 'lg')}
      <div><div class="sheet-title">${esc(t.name)}</div>
      <div class="muted small">${dayLabel(t.date, { weekday: 'long', month: 'long', day: 'numeric' })} · ${esc(acct ? `${acct.name} ••${acct.mask || ''}` : t.account)}</div></div>
      <div class="sheet-amt ${t.amount < 0 ? 'in' : ''}">${t.amount < 0 ? '+' : ''}${money(Math.abs(t.amount))}</div></div>
    ${t.description && t.description !== t.name ? `<p class="muted small mono">${esc(t.description)}</p>` : ''}

    <label class="field">Category
      <select id="sheetCat" ${t.split ? 'disabled' : ''}>${categoryOptions(cats, t.cat)}</select></label>
    ${t.split ? '<p class="muted small">This purchase is split. Edit the split below, or remove it to pick one category.</p>' : ''}

    <details class="split" ${t.split ? 'open' : ''}><summary>✂️ Split across categories</summary>
      <div id="splitRows">${parts.map((p, i) => splitRow(cats, p, i)).join('')}</div>
      <div class="split-foot"><button class="link-btn" id="addSplit">+ Add part</button><span id="splitLeft" class="muted small"></span></div>
      <div class="row-btns"><button class="btn primary" id="saveSplit">Save split</button>${t.split ? '<button class="btn" id="clearSplit">Remove split</button>' : ''}</div>
    </details>

    <label class="field">Note<textarea id="sheetNote" rows="2" placeholder="What was this for?">${esc(s.notes[t.id] || '')}</textarea></label>

    <div class="field">Receipt
      <div class="receipt">${s.receipts?.[t.id]
        ? `<a href="/api/receipt?id=${encodeURIComponent(t.id)}" target="_blank" rel="noopener"><img src="/api/receipt?id=${encodeURIComponent(t.id)}" alt="Receipt"></a><button class="link-btn danger" id="delReceipt">Remove photo</button>`
        : `<label class="btn"><input type="file" accept="image/*" capture="environment" id="receiptFile" hidden>📷 Add photo</label>`}</div>
    </div>
  </div>`;
  sheet.classList.remove('hidden');
  document.body.classList.add('no-scroll');

  const close = () => { sheet.classList.add('hidden'); document.body.classList.remove('no-scroll'); };
  sheet.onclick = (e) => { if (e.target === sheet || e.target.closest('[data-close]')) close(); };
  document.onkeydown = (e) => { if (e.key === 'Escape') close(); };

  $('sheetCat').onchange = async (e) => { close(); await setCategory(t.id, e.target.value); };
  $('sheetNote').onchange = async (e) => { await save({ action: 'setEntry', key: 'notes', id: t.id, value: e.target.value.trim() || null }); toast('Note saved'); };

  const updateLeft = () => {
    const sum = [...sheet.querySelectorAll('.split-amt')].reduce((a, i) => a + Number(i.value || 0), 0);
    const left = Math.round((t.amount - sum) * 100) / 100;
    $('splitLeft').textContent = left === 0 ? '✓ Adds up' : `${money(left)} left to assign`;
    $('splitLeft').className = left === 0 ? 'good small' : 'muted small';
  };
  sheet.querySelector('#splitRows').oninput = updateLeft; updateLeft();
  $('addSplit').onclick = () => {
    $('splitRows').insertAdjacentHTML('beforeend', splitRow(cats, { category: 'Other', amount: 0 }, Date.now()));
    updateLeft();
  };
  $('saveSplit').onclick = async () => {
    const value = [...sheet.querySelectorAll('.split-row')].map((r) => ({
      category: r.querySelector('select').value, amount: Number(r.querySelector('input').value || 0),
    })).filter((p) => p.amount !== 0);
    const sum = value.reduce((a, p) => a + p.amount, 0);
    if (value.length < 2) return toast('Add at least two parts');
    if (Math.abs(sum - t.amount) > 0.01) return toast(`Parts must add up to ${money(t.amount)}`);
    await save({ action: 'setEntry', key: 'splits', id: t.id, value });
    close(); toast('✂️ Split saved');
  };
  const clear = $('clearSplit');
  if (clear) clear.onclick = async () => { await save({ action: 'setEntry', key: 'splits', id: t.id, value: null }); close(); toast('Split removed'); };

  const file = $('receiptFile');
  if (file) file.onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      toast('Uploading…');
      const dataUrl = await shrinkImage(f);
      await post('/receipt', { id: t.id, dataUrl });
      state.data.settings.receipts = { ...(state.data.settings.receipts || {}), [t.id]: true };
      toast('📷 Receipt saved'); openTxn(t.id);
    } catch (err) { toast(err.message); }
  };
  const del = $('delReceipt');
  if (del) del.onclick = async () => {
    await api(`/receipt?id=${encodeURIComponent(t.id)}`, { method: 'DELETE' });
    delete state.data.settings.receipts[t.id];
    toast('Receipt removed'); openTxn(t.id);
  };
}

function splitRow(cats, p, i) {
  return `<div class="split-row" data-i="${i}"><select>${categoryOptions(cats, p.category)}</select>
    <input class="split-amt" type="number" step="0.01" value="${p.amount || ''}" placeholder="0.00"></div>`;
}

// Resize photos in the browser so uploads stay small (max 1600px JPEG)
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = URL.createObjectURL(file);
  });
}

// --------------------------------------------------------------- sync
async function sync() {
  if (!state.data.connections.length) return toast('No bank connected yet.');
  const r = await post('/sync');
  await reload();
  toast(r.errors?.length ? `Sync issue: ${r.errors[0].error}` : `Synced: ${r.added} new, ${r.modified} updated, ${r.removed} removed.`);
}

// ---------------------------------------------------------- Plaid Link
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
    if (receivedRedirectUri) history.replaceState({}, '', '/' + location.hash);
  };
  window.Plaid.create({
    token,
    receivedRedirectUri: receivedRedirectUri || undefined,
    onSuccess: async (public_token, metadata) => {
      finish();
      try {
        if (itemId) { await post('/sync'); toast('Reconnected and synced.'); }
        else {
          toast('Connected. Pulling transactions…');
          const r = await post('/exchange', { public_token, institution: metadata.institution });
          toast(`Imported ${r.summary.added} transactions. Older history can take a few hours to arrive.`);
        }
        await reload();
      } catch (e) { toast(e.message); }
    },
    onExit: (err) => { finish(); if (err) toast(err.display_message || err.error_message || 'Connection cancelled'); },
  }).open();
}

// ---------------------------------------------------------- CSV in/out
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

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportCsv(txns = state.m.txns, name = 'ledger-transactions.csv') {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Date', 'Merchant', 'Description', 'Category', 'Amount', 'Account', 'Note'].join(',')];
  for (const t of txns) {
    const acct = state.data.accounts[t.account]?.name || t.account;
    for (const a of t.alloc) {
      lines.push([t.date, q(t.name), q(t.description), q(a.c), (-a.amount).toFixed(2), q(acct), q(state.data.settings.notes[t.id])].join(','));
    }
  }
  download(name, lines.join('\n'), 'text/csv');
}

function exportBackup() {
  const { settings, transactions } = state.data;
  download(`ledger-backup-${state.data.today}.json`, JSON.stringify({ exported: new Date().toISOString(), settings, transactions }, null, 2), 'application/json');
}

// ---------------------------------------------------------------- auth
function showLogin(passkeys = Number(localStorage.getItem('ledger_pk') || 0)) {
  $('app').classList.add('hidden');
  $('login').classList.remove('hidden');
  $('passkeyBtn').classList.toggle('hidden', !passkeys || !window.PublicKeyCredential);
  setTimeout(() => $('pw').focus(), 50);
}

async function enterApp() {
  await reload();
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  const pending = localStorage.getItem('et_link_token');
  if (pending && new URLSearchParams(location.search).has('oauth_state_id')) {
    openLink(pending, window.location.href, localStorage.getItem('et_link_item'));
  }
}

async function passkeyLogin() {
  try {
    const optionsJSON = await post('/auth/passkey/login-options');
    const response = await window.SimpleWebAuthnBrowser.startAuthentication({ optionsJSON });
    await post('/auth/passkey/login-verify', { response });
    await enterApp();
  } catch (e) {
    $('loginErr').textContent = e.name === 'NotAllowedError' ? 'Passkey cancelled' : e.message;
  }
}

async function registerPasskey() {
  const optionsJSON = await post('/auth/passkey/register-options');
  const response = await window.SimpleWebAuthnBrowser.startRegistration({ optionsJSON });
  const name = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'This device';
  await post('/auth/passkey/register-verify', { response, name });
  localStorage.setItem('ledger_pk', '1');
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginErr').textContent = '';
  try {
    await post('/auth/login', { password: $('pw').value });
    $('pw').value = '';
    await enterApp();
  } catch (err) { $('loginErr').textContent = err.message; }
});
$('passkeyBtn').onclick = passkeyLogin;

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  try {
    if (a === 'sync') { el.disabled = true; await sync(); el.disabled = false; }
    if (a === 'lock') { await post('/auth/logout'); state.data = null; showLogin(); }
  } catch (err) { el.disabled = false; toast(err.message); }
});

// --------------------------------------------------------------- boot
function buildNav() {
  $('topnav').innerHTML = NAV.map(([id, label]) =>
    `<a href="#/${id}" data-nav="${id}">${label}${id === 'today' ? '<span class="badge" data-badge="today"></span>' : ''}</a>`).join('');
  $('tabbar').innerHTML = TABS.map((id) => {
    const [, label, emoji] = id === 'more' ? ['more', 'More', '☰'] : NAV.find((n) => n[0] === id);
    return `<a href="#/${id}" data-nav="${id}"><span class="ti">${emoji}</span>${label}${id === 'today' ? '<span class="badge" data-badge="today"></span>' : ''}</a>`;
  }).join('');
}

(async () => {
  buildNav();
  state.page = (location.hash.replace(/^#\/?/, '') || 'today').split('?')[0];
  try {
    const s = await api('/auth/session');
    localStorage.setItem('ledger_pk', String(s.passkeys || 0));
    if (s.authenticated) await enterApp();
    else showLogin(s.passkeys);
  } catch (e) {
    showLogin();
    $('loginErr').textContent = e.message;
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
