import { esc, money, money0, chip, shortDate, dayLabel, emptyState } from '../ui.js';
import { upcomingBills, addDays } from '../engine.js';

// Bills & subscriptions found from repeating charges, plus a 30-day calendar.
export function render(ctx) {
  const { m, snap, today } = ctx;
  const rec = snap.rec;
  const subs = rec.filter((r) => r.active && ['Subscriptions', 'Fitness'].includes(r.category));
  const billsList = rec.filter((r) => r.active && !subs.includes(r));
  const stopped = rec.filter((r) => !r.active);
  const yearly = rec.filter((r) => r.active && r.status !== 'cancel').reduce((s, r) => s + r.annual, 0);
  const subsYearly = subs.filter((r) => r.status !== 'cancel').reduce((s, r) => s + r.annual, 0);
  const next30 = upcomingBills(m, today, addDays(today, 30), rec);
  const ignored = Object.entries(m.settings.recurring).filter(([, v]) => v === 'ignore').map(([k]) => k);

  const item = (r) => `<div class="rec ${r.status === 'cancel' ? 'cancelled' : ''}">
    ${chip(r.category)}
    <div class="grow">
      <div class="row"><strong>${esc(r.name)}</strong><b class="num">${money(r.amount)}</b></div>
      <div class="row small muted"><span>${r.cadence} · next ${shortDate(r.next)}${r.active ? '' : ' (stopped?)'}</span><span>${money0(r.annual)}/yr</span></div>
      ${r.priceChange ? `<div class="small ${r.priceChange > 0 ? 'bad' : 'good'}">${r.priceChange > 0 ? '📈 Up' : '📉 Down'} ${Math.abs(r.priceChange)}% from ${money(r.previousAmount)}</div>` : ''}
      <div class="rec-actions">
        <button class="mini ${r.status === 'keep' ? 'on' : ''}" data-rec="${esc(r.key)}" data-v="keep">👍 Keep</button>
        <button class="mini ${r.status === 'cancel' ? 'on' : ''}" data-rec="${esc(r.key)}" data-v="cancel">✂️ Cancelling</button>
        <button class="mini" data-rec="${esc(r.key)}" data-v="ignore" title="Not a recurring charge">Not recurring</button>
      </div>
    </div></div>`;

  const byDay = new Map();
  for (const b of next30) { if (!byDay.has(b.date)) byDay.set(b.date, []); byDay.get(b.date).push(b); }

  return `<div class="wrap page">
    <div class="page-head"><h1>Bills & subscriptions</h1></div>
    <div class="stat-row">
      <div class="stat"><span>Recurring per year</span><b>${money0(yearly)}</b><small>${money0(yearly / 12)}/mo on average</small></div>
      <div class="stat"><span>Subscriptions per year</span><b>${money0(subsYearly)}</b><small>${subs.length} active</small></div>
      <div class="stat"><span>Due in next 30 days</span><b>${money0(next30.reduce((s, b) => s + b.amount, 0))}</b><small>${next30.length} charges</small></div>
    </div>
    ${!rec.length ? emptyState('🔁', 'No repeating charges found yet', 'Ledger needs 2 to 3 months of history to spot bills and subscriptions.') : `
    <div class="grid">
      <section class="card"><div class="card-head"><h2>Next 30 days</h2></div>
        ${[...byDay].map(([d, list]) => `<div class="day"><span>${dayLabel(d)}${d === today ? ' · today' : ''}</span><span>${money(list.reduce((s, b) => s + b.amount, 0))}</span></div>
          ${list.map((b) => `<div class="li">${chip(b.category, 'sm')}<div class="grow">${esc(b.name)}</div><b class="num">${money(b.amount)}</b></div>`).join('')}`).join('') || '<p class="muted small">Nothing expected.</p>'}
      </section>
      <section class="card"><div class="card-head"><h2>Subscriptions</h2></div>
        <p class="muted small">Ask of each one: would I sign up for this today at that price? Mark the ones you're cancelling and they drop out of your plan.</p>
        ${subs.map(item).join('') || '<p class="muted small">None detected.</p>'}
      </section>
    </div>
    <section class="card"><div class="card-head"><h2>Bills</h2></div>${billsList.map(item).join('') || '<p class="muted small">None detected.</p>'}</section>
    ${stopped.length ? `<section class="card"><div class="card-head"><h2>Looks stopped</h2></div><p class="muted small">These used to repeat but haven't charged recently.</p>${stopped.map(item).join('')}</section>` : ''}`}
    ${ignored.length ? `<p class="muted small center">${ignored.length} hidden as not recurring · <button class="link-btn" data-unhide>Show again</button></p>` : ''}
  </div>`;
}

export function bind(ctx, root) {
  root.querySelectorAll('[data-rec]').forEach((b) => b.addEventListener('click', () => {
    const cur = ctx.m.settings.recurring[b.dataset.rec];
    const v = cur === b.dataset.v ? null : b.dataset.v;
    ctx.save({ action: 'setEntry', key: 'recurring', id: b.dataset.rec, value: v });
  }));
  root.querySelector('[data-unhide]')?.addEventListener('click', async () => {
    for (const [k, v] of Object.entries(ctx.m.settings.recurring)) if (v === 'ignore') await ctx.post('/data', { action: 'setEntry', key: 'recurring', id: k, value: null });
    await ctx.reload();
  });
}
