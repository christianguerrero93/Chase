import { esc, money, chip, color, icon, dayLabel, monthName, categoryOptions, emptyState } from '../ui.js';
import { inMonth, ymOf } from '../engine.js';

let limit = 80;

export function render(ctx) {
  const { m, data, month, filters } = ctx;
  const q = filters.search.toLowerCase();
  const all = inMonth(m, month);
  const rows = all.filter((t) =>
    (!filters.category || t.alloc.some((a) => a.c === filters.category)) &&
    (!filters.account || t.account === filters.account) &&
    (!q || `${t.name} ${t.description} ${m.settings.notes[t.id] || ''}`.toLowerCase().includes(q)));
  const others = all.filter((t) => t.cat === 'Other');
  const spent = rows.reduce((s, t) => s + t.alloc.reduce((a, x) => a + (m.isSpending(x.c) && (!filters.category || x.c === filters.category) ? x.amount : 0), 0), 0);
  const accounts = [...new Set(all.map((t) => t.account))];
  const acctName = (id) => { const a = data.accounts[id]; return a ? `${a.name}${a.mask ? ' ••' + a.mask : ''}` : id; };

  let list = '', lastDay = '';
  for (const t of rows.slice(0, limit)) {
    if (t.date !== lastDay) {
      const dayTotal = rows.filter((r) => r.date === t.date).reduce((s, r) => s + r.alloc.reduce((a, x) => a + (m.isSpending(x.c) ? x.amount : 0), 0), 0);
      list += `<div class="day"><span>${dayLabel(t.date)}</span><span>${dayTotal > 0 ? money(dayTotal) : ''}</span></div>`;
      lastDay = t.date;
    }
    const note = m.settings.notes[t.id];
    list += `<div class="txn" data-open="${esc(t.id)}">
      ${chip(t.cat)}
      <div class="info">
        <div class="merch">${esc(t.name)}${t.pending ? '<span class="tag">pending</span>' : ''}${t.split ? '<span class="tag">split</span>' : ''}${m.settings.receipts?.[t.id] ? ' 📷' : ''}</div>
        <div class="meta"><span class="mcat">${t.split ? '✂️ Split' : `${icon(t.cat)} ${esc(t.cat)}`} · </span>${esc(acctName(t.account))}${note ? ` · 📝 ${esc(note)}` : ''}</div>
      </div>
      ${t.split ? `<span class="pill-cat" style="--c:${color(t.alloc[0].c)}">✂️ ${t.alloc.length} categories</span>`
        : `<select class="cat ${t.cat === 'Other' ? 'other' : ''}" style="--c:${color(t.cat)}" data-cat-id="${esc(t.id)}" aria-label="Category">${categoryOptions(data.categories, t.cat)}</select>`}
      <div class="amt ${t.amount < 0 ? 'in' : ''}">${t.amount < 0 ? '+' : ''}${money(Math.abs(t.amount))}</div>
    </div>`;
  }
  if (rows.length > limit) list += `<button class="btn more" data-more>Show ${Math.min(80, rows.length - limit)} more</button>`;

  return `<div class="wrap page">
    <div class="page-head">
      <h1>Activity</h1>
      <div class="month-switch"><button class="icon-btn dark" data-month="-1" aria-label="Previous month">‹</button>
        <span>${monthName(month)}</span><button class="icon-btn dark" data-month="1" ${month >= ymOf(ctx.today) ? 'disabled' : ''} aria-label="Next month">›</button></div>
    </div>
    ${others.length && filters.category !== 'Other' ? `<div class="review"><div class="icon">🧐</div><div class="txt"><strong>${others.length} need${others.length === 1 ? "s" : ""} a category</strong>Sort them once and tap “Always” so it's automatic next time.</div><button class="btn" data-filter-other>Review</button></div>` : ''}
    <section class="card">
      <div class="toolbar">
        <input id="search" type="search" placeholder="Search merchants or notes" value="${esc(filters.search)}">
        <select id="catFilter"><option value="">All categories</option>${categoryOptions(data.categories, filters.category)}</select>
        ${accounts.length > 1 ? `<select id="acctFilter"><option value="">All accounts</option>${accounts.map((a) => `<option value="${esc(a)}"${a === filters.account ? ' selected' : ''}>${esc(acctName(a))}</option>`).join('')}</select>` : ''}
        <button class="btn" data-export title="Download these as CSV">⬇ Export</button>
      </div>
      <div class="summary-line">${rows.length} transaction${rows.length === 1 ? '' : 's'}${filters.category || filters.search || filters.account ? ` · ${money(spent)} spent` : ''}
        ${filters.category || filters.search || filters.account ? '<button class="link-btn" data-clear>Clear filters</button>' : ''}</div>
      <div class="txn-list">${list || emptyState('🔍', 'Nothing here', 'No transactions match this month and filter.')}</div>
    </section>
    <p class="muted small center">Tap any transaction to split it, add a note, or attach a receipt photo.</p>
  </div>`;
}

export function bind(ctx, root) {
  root.querySelectorAll('[data-month]').forEach((b) => b.addEventListener('click', () => { limit = 80; ctx.shiftMonth(Number(b.dataset.month)); }));
  const search = root.querySelector('#search');
  search.addEventListener('input', debounce(() => { limit = 80; ctx.filters.search = search.value; ctx.render(); const s = document.getElementById('search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }, 200));
  root.querySelector('#catFilter').addEventListener('change', (e) => { limit = 80; ctx.setFilter('category', e.target.value); });
  root.querySelector('#acctFilter')?.addEventListener('change', (e) => { limit = 80; ctx.setFilter('account', e.target.value); });
  root.querySelector('[data-clear]')?.addEventListener('click', () => { Object.assign(ctx.filters, { search: '', category: '', account: '' }); ctx.render(); });
  root.querySelector('[data-filter-other]')?.addEventListener('click', () => ctx.setFilter('category', 'Other'));
  root.querySelector('[data-more]')?.addEventListener('click', () => { limit += 80; ctx.render(); });
  root.querySelector('[data-export]').addEventListener('click', () => {
    const q = ctx.filters.search.toLowerCase();
    const rows = inMonth(ctx.m, ctx.month).filter((t) => (!ctx.filters.category || t.alloc.some((a) => a.c === ctx.filters.category)) &&
      (!ctx.filters.account || t.account === ctx.filters.account) && (!q || `${t.name} ${t.description}`.toLowerCase().includes(q)));
    ctx.exportCsv(rows, `ledger-${ctx.month}.csv`);
  });
  root.querySelectorAll('[data-cat-id]').forEach((s) => {
    s.addEventListener('click', (e) => e.stopPropagation());
    s.addEventListener('change', (e) => ctx.setCategory(s.dataset.catId, e.target.value).catch((err) => ctx.toast(err.message)));
  });
  root.querySelectorAll('[data-open]').forEach((r) => r.addEventListener('click', () => ctx.openTxn(r.dataset.open)));
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
