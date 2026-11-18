import { esc, money, money0, ring, progress, chip, color, shortDate, emptyState, monthName } from '../ui.js';
import { savingsFor, ymOf, monthSpending, shiftMonth, monthIncome, expectedIncome, savingsGoalStatus, budgetStatus } from '../engine.js';

// Today: the one screen to check daily.
export function render(ctx) {
  const { m, snap, data, today } = ctx;
  const { sts, caps, alerts, streaks } = snap;
  const ym = ymOf(today);
  const target = m.settings.plan.savingsTarget;
  const sav = savingsFor(m, ym);
  const day = Number(today.slice(8));
  const prev = monthSpending(m, shiftMonth(ym, -1), day);
  const change = prev > 0 ? (sts.spent - prev) / prev : null;

  if (!data.transactions.length) {
    return `<section class="hero"><div class="wrap"><h1 class="hello">Welcome to Ledger 👋</h1><p class="hero-sub">Connect Chase or import a CSV to get started.</p></div></section>
      <div class="wrap page">${emptyState('🏦', 'No transactions yet', 'Connect your bank in Settings, or import a Chase CSV export.',
        '<button class="btn primary" data-go="settings">Go to Settings</button>')}</div>`;
  }

  // ---- Hero: safe to spend
  let hero;
  if (sts.ready) {
    const over = sts.available < 0;
    hero = `
      <div class="hero-label">Safe to spend today</div>
      <div class="hero-amount ${over ? 'neg' : ''}">${over ? money0(0) : money0(Math.max(0, sts.leftToday))}</div>
      <div class="hero-sub">${over
        ? `You're <b>${money0(-sts.available)}</b> past this month's limit. Hold off on extras until the 1st.`
        : `<b>${money0(sts.available)}</b> left for the month · ${money0(sts.perDay)}/day for ${sts.daysLeft} day${sts.daysLeft > 1 ? 's' : ''}${sts.spentToday > 0 ? ` · ${money0(sts.spentToday)} spent today` : ''}`}</div>
      <button class="link-light" data-explain>How is this calculated?</button>
      <div class="explain hidden" id="explain">
        <div><span>Income${sts.incomeSource === 'average' ? ' (3-month average)' : sts.incomeSource === 'actual' ? ' (received so far)' : ''}</span><b>${money0(sts.income)}</b></div>
        <div><span>Savings goal (paid first)</span><b>−${money0(sts.savings)}</b></div>
        ${sts.sinking ? `<div><span>Set-asides for yearly costs</span><b>−${money0(sts.sinking)}</b></div>` : ''}
        <div><span>Spent so far</span><b>−${money0(sts.spent)}</b></div>
        <div><span>Bills still to come (${sts.bills.length})</span><b>−${money0(sts.upcoming)}</b></div>
        <div class="tot"><span>Left this month</span><b>${money0(sts.available)}</b></div>
      </div>`;
  } else {
    hero = `<div class="hero-label">Spent this month</div><div class="hero-amount">${money0(sts.spent)}</div>
      <div class="hero-sub">Add your monthly income in <a class="link-light" href="#/plan">Plan</a> to unlock your daily safe-to-spend number.</div>`;
  }

  // ---- Savings ring: is this month's goal still protected?
  let ringHtml = '';
  const goal = savingsGoalStatus(m, sts);
  if (goal) {
    ringHtml = `<div class="hero-ring">${ring(goal.pct, { label: money0(goal.onTrack), sub: `of ${money0(goal.target)} goal`, color: goal.ok ? '#34d399' : '#fbbf24' })}
      <div class="lbl">${goal.ok ? '✓ Savings on track' : `${money0(goal.atRisk)} of savings at risk`}<br><span class="dim">if you stay within safe-to-spend</span></div></div>`;
  } else if (!target) {
    ringHtml = `<div class="hero-ring set"><a href="#/plan" class="btn glass">🎯 Set a savings goal</a></div>`;
  }
  const incomeIn = monthIncome(m, ym);
  const incomeExp = expectedIncome(m, ym).amount;

  const kpis = `
    <div class="kpi"><div class="label">Spent in ${monthName(ym, true)}</div><div class="value">${money0(sts.spent)}</div>
      <div class="sub">${change === null ? `${day} days in` : `<span class="${change > 0 ? 'up' : 'down'}">${change > 0 ? '▲' : '▼'} ${Math.abs(Math.round(change * 100))}%</span> vs same day last month`}</div></div>
    <div class="kpi"><div class="label">Bills before the 1st</div><div class="value">${money0(sts.upcoming)}</div><div class="sub">${sts.bills.length} expected</div></div>
    <div class="kpi"><div class="label">No-spend days</div><div class="value">${streaks.noSpendDays}<small>/${streaks.daysSoFar}</small></div>
      <div class="sub">${streaks.currentNoSpend ? `🔥 ${streaks.currentNoSpend}-day streak` : 'Days with no “wants” spending'}</div></div>
    <div class="kpi"><div class="label">Income so far</div><div class="value">${money0(incomeIn)}</div>
      <div class="sub">${incomeExp > 0 ? `of ~${money0(incomeExp)} expected` : 'Deposits this month'}</div></div>`;

  // ---- Weekly caps
  const capsHtml = caps.length ? caps.map((c) => `
    <div class="cap ${c.level}">
      <div class="row"><strong>${esc(c.name)}</strong><span class="num"><b>${money0(c.spent)}</b> / ${money0(c.amount)}</span></div>
      ${progress(c.pct, c.level === 'over' ? 'var(--bad)' : c.level === 'warn' ? 'var(--warn)' : 'var(--accent)')}
      <div class="row small"><span class="${c.level === 'ok' ? 'muted' : c.level}">${c.remaining >= 0 ? `${money0(c.remaining)} left · ${c.daysLeft} day${c.daysLeft > 1 ? 's' : ''} to go` : `${money0(-c.remaining)} over`}</span>
        <span class="muted">${c.streak ? `🔥 ${c.streak} week${c.streak > 1 ? 's' : ''} under` : ''}</span></div>
    </div>`).join('')
    : `<p class="muted small">Weekly caps keep flexible spending in check before the month gets away from you.</p><button class="btn" data-go="plan">+ Add a weekly cap</button>`;

  const alertHtml = alerts.length ? alerts.slice(0, 6).map((a) => `<div class="alert ${a.level}"><span>${a.icon}</span><div>${esc(a.text)}</div>
      ${a.key.startsWith('other:') ? '<button class="link-btn" data-review>Review</button>' : ''}</div>`).join('')
    : '<p class="muted small">✅ Nothing needs your attention.</p>';

  const upcoming = sts.bills.slice(0, 6);
  const billsHtml = upcoming.length ? upcoming.map((b) => `<div class="li">${chip(b.category, 'sm')}<div class="grow"><div>${esc(b.name)}</div>
      <div class="muted small">${shortDate(b.date)} · ${b.cadence}</div></div><b class="num">${money(b.amount)}</b></div>`).join('')
    : '<p class="muted small">No more bills expected this month.</p>';

  const recent = m.txns.slice(0, 6).map((t) => `<button class="li tx" data-txn="${esc(t.id)}">${chip(t.cat, 'sm')}
      <div class="grow"><div class="ellip">${esc(t.name)}</div><div class="muted small">${shortDate(t.date)} · ${esc(t.cat)}</div></div>
      <b class="num ${t.amount < 0 ? 'in' : ''}">${t.amount < 0 ? '+' : ''}${money(Math.abs(t.amount))}</b></button>`).join('');

  return `
  <section class="hero"><div class="wrap">
    <div class="hero-main"><div class="hero-left">${hero}</div>${ringHtml}</div>
    <div class="kpis">${kpis}</div>
  </div></section>
  <div class="wrap page">
    <div class="grid">
      <section class="card"><div class="card-head"><h2>This week</h2><a class="link-btn" href="#/plan">Edit caps</a></div>${capsHtml}</section>
      <section class="card"><div class="card-head"><h2>Heads up</h2></div>${alertHtml}</section>
    </div>
    <div class="grid">
      <section class="card"><div class="card-head"><h2>Coming up</h2><a class="link-btn" href="#/bills">All bills</a></div>${billsHtml}</section>
      <section class="card"><div class="card-head"><h2>Recent</h2><a class="link-btn" href="#/activity">See all</a></div>${recent}</section>
    </div>
    ${budgetPeek(ctx)}
  </div>`;
}

function budgetPeek({ m, snap, today }) {
  const list = Object.keys(m.settings.budgets).length
    ? snapBudgets(m, today).filter((b) => b.budget > 0).sort((a, b) => b.pct - a.pct).slice(0, 4) : [];
  if (!list.length) return '';
  return `<section class="card"><div class="card-head"><h2>Budgets to watch</h2><a class="link-btn" href="#/plan">Plan</a></div>
    <div class="budgets compact">${list.map((b) => `<div class="budget" style="--c:${b.level === 'over' ? 'var(--bad)' : b.level === 'warn' ? 'var(--warn)' : color(b.category)}">
      ${chip(b.category)}<div class="body"><div class="row"><span class="name">${esc(b.category)}</span><span class="spent num">${money0(b.spent)} <span class="muted">/ ${money0(b.available)}</span></span></div>
      ${progress(b.pct, 'var(--c)')}<div class="status ${b.level === 'ok' ? '' : b.level}">${b.remaining >= 0 ? `${money0(b.remaining)} left` : `${money0(-b.remaining)} over`}</div></div></div>`).join('')}</div></section>`;
}

const snapBudgets = (m, today) => budgetStatus(m, ymOf(today));

export function bind(ctx, root) {
  root.querySelector('[data-explain]')?.addEventListener('click', () => root.querySelector('#explain').classList.toggle('hidden'));
  root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => ctx.go(b.dataset.go)));
  root.querySelectorAll('[data-txn]').forEach((b) => b.addEventListener('click', () => ctx.openTxn(b.dataset.txn)));
  root.querySelector('[data-review]')?.addEventListener('click', () => ctx.go('activity', { filters: { category: 'Other' }, month: ymOf(ctx.today) }));
}
