import { esc, money, money0, chip, color, icon, progress, monthName, categoryOptions } from '../ui.js';
import { monthPlan, budgetStatus, sinkingFunds, ymOf, shiftMonth, spendingByCategory, inMonth } from '../engine.js';

// Plan: give every dollar a job. Income -> savings -> set-asides -> budgets.
export function render(ctx) {
  const { m, data, month, today } = ctx;
  const plan = monthPlan(m, month);
  const budgets = budgetStatus(m, month);
  const funds = sinkingFunds(m);
  const caps = ctx.snap.caps;
  const left = plan.leftToAssign;
  const isCurrent = month === ymOf(today);

  // 3-month average per category, to suggest budgets
  const avg = {};
  for (let i = 1; i <= 3; i++) {
    for (const [c, v] of Object.entries(spendingByCategory(inMonth(m, shiftMonth(month, -i)), m))) avg[c] = (avg[c] || 0) + v / 3;
  }
  const unbudgeted = data.categories.filter((c) => m.isSpending(c) && !m.settings.budgets[c]);

  const flow = [
    ['Income', plan.income, '#059669'],
    ['Savings', plan.savings, '#2563eb'],
    ['Set-asides', plan.sinking, '#7c3aed'],
    ['Bills', plan.bills, '#0891b2'],
    ['Budgets', plan.budgets, '#f59e0b'],
  ];
  const flowBar = plan.income > 0 ? `<div class="flowbar">${flow.slice(1).map(([l, v, c]) =>
      v > 0 ? `<span style="width:${Math.min(100, (v / plan.income) * 100)}%;background:${c}" title="${l}: ${money0(v)}"></span>` : '').join('')}</div>` : '';

  return `<div class="wrap page">
    <div class="page-head"><h1>Plan</h1>
      <div class="month-switch"><button class="icon-btn dark" data-month="-1">‹</button><span>${monthName(month)}</span>
      <button class="icon-btn dark" data-month="1" ${isCurrent ? 'disabled' : ''}>›</button></div></div>

    <section class="card plan-top">
      <div class="plan-grid">
        <label class="field">Monthly take-home income
          <div class="money-input"><span>$</span><input type="number" min="0" step="50" id="income" value="${m.settings.plan.income || ''}" placeholder="${plan.incomeSource === 'average' ? Math.round(plan.income) + ' (3-mo avg)' : '0'}"></div>
          <small class="muted">${m.settings.plan.income ? 'Using the amount you entered.' : plan.incomeSource === 'average' ? `Blank = use your 3-month average (${money0(plan.income)}).` : 'Enter what you take home each month.'}</small></label>
        <label class="field">Pay yourself first: monthly savings goal
          <div class="money-input"><span>$</span><input type="number" min="0" step="25" id="savings" value="${m.settings.plan.savingsTarget || ''}" placeholder="800"></div>
          <small class="muted">Taken out before anything else, so it's protected in your safe-to-spend number.</small></label>
      </div>
      ${flowBar}
      <div class="plan-sum">
        ${flow.map(([l, v, c]) => `<div><span class="dot" style="--c:${c}"></span>${l}<b>${money0(v)}</b></div>`).join('')}
        <div class="left ${left < 0 ? 'bad' : left > 0 ? 'warn' : 'good'}">${left === 0 ? '✓ Every dollar has a job' : left > 0 ? `${money0(left)} left to assign` : `${money0(-left)} over-planned`}</div>
      </div>
      ${plan.billCount ? `<p class="muted small">Bills = ${plan.billCount} recurring charge${plan.billCount > 1 ? 's' : ''} Ledger detected (see <a href="#/bills">Bills</a>), averaged per month. Give a category a budget and its bills count there instead.</p>` : ''}
      ${left > 0 && plan.income > 0 ? `<p class="muted small">Unassigned money tends to get spent. Give it a budget, add it to savings, or put it toward a goal.</p>` : ''}
      ${left < 0 ? `<p class="small bad">Your plan uses more than you earn. Trim a budget or lower the savings goal so the plan is realistic.</p>` : ''}
    </section>

    <section class="card">
      <div class="card-head"><h2>Weekly caps</h2><button class="btn" data-add-cap>+ Add cap</button></div>
      <p class="muted small">A weekly limit for flexible spending. Weeks run Monday to Sunday.</p>
      ${caps.map((c) => `<div class="cap-edit" data-cap="${esc(c.id)}">
        <div class="row"><input class="cap-name" value="${esc(c.name)}" aria-label="Cap name">
          <div class="money-input sm"><span>$</span><input class="cap-amt" type="number" min="0" step="5" value="${c.amount}"></div>
          <button class="link-btn danger" data-del-cap="${esc(c.id)}">Delete</button></div>
        <details class="cap-cats"><summary>${c.categories.length ? c.categories.map((x) => `${icon(x)} ${esc(x)}`).join(', ') : 'Pick categories'} <span class="link-btn">Edit</span></summary>
        <div class="cat-picks">${data.categories.filter((x) => m.isSpending(x)).map((x) =>
          `<label class="pick ${c.categories.includes(x) ? 'on' : ''}" style="--c:${color(x)}"><input type="checkbox" value="${esc(x)}" ${c.categories.includes(x) ? 'checked' : ''}>${icon(x)} ${esc(x)}</label>`).join('')}</div></details>
        ${progress(c.pct, c.level === 'over' ? 'var(--bad)' : c.level === 'warn' ? 'var(--warn)' : 'var(--accent)')}
        <div class="small muted">This week: ${money0(c.spent)} of ${money0(c.amount)}${c.streak ? ` · 🔥 ${c.streak}-week streak` : ''}</div>
      </div>`).join('') || '<p class="muted small">No weekly caps yet. A good first one: Shopping + Clothing.</p>'}
    </section>

    <section class="card">
      <div class="card-head"><h2>Monthly budgets</h2>
        <select id="addBudget" class="small-select"><option value="">+ Add a budget</option>${unbudgeted.map((c) => `<option value="${esc(c)}">${icon(c)} ${esc(c)}${avg[c] ? ` (avg ${money0(avg[c])})` : ''}</option>`).join('')}</select></div>
      <p class="muted small">Turn on <b>Roll over</b> to carry what's left (or overspent) into next month.</p>
      <div class="budgets">${budgets.map((b) => `<div class="budget" style="--c:${b.level === 'over' ? 'var(--bad)' : b.level === 'warn' ? 'var(--warn)' : color(b.category)}">
        ${chip(b.category)}
        <div class="body">
          <div class="row"><span class="name">${esc(b.category)}</span><span class="spent num">${money0(b.spent)}</span></div>
          ${progress(b.budget ? b.pct : 0, 'var(--c)')}
          <div class="row"><span class="status ${b.level === 'ok' || b.level === 'none' ? '' : b.level}">${!b.budget ? (avg[b.category] ? `Avg ${money0(avg[b.category])}/mo` : 'No budget yet')
            : b.remaining >= 0 ? `${money0(b.remaining)} left` : `${money0(-b.remaining)} over`}${b.carry ? ` · ${b.carry > 0 ? '+' : ''}${money0(b.carry)} carried` : ''}</span>
            <span class="of">$<input type="number" min="0" step="10" data-budget="${esc(b.category)}" value="${b.budget || ''}" placeholder="${avg[b.category] ? Math.round(avg[b.category] / 10) * 10 : 'set'}"></span></div>
          ${b.budget ? `<label class="toggle small"><input type="checkbox" data-roll="${esc(b.category)}" ${b.rollover ? 'checked' : ''}> Roll over</label>` : ''}
        </div></div>`).join('')}</div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Set-asides for yearly costs</h2><button class="btn" data-add-fund>+ Add</button></div>
      <p class="muted small">Holidays, travel, annual subscriptions, car registration. Each one is divided by 12 and held back every month, so it's already covered when it comes up.</p>
      ${funds.map((f) => `<div class="fund" data-fund="${esc(f.id)}">
        <input class="fund-name" value="${esc(f.name)}" aria-label="Name">
        <div class="money-input sm"><span>$</span><input class="fund-annual" type="number" min="0" step="50" value="${f.annual}" aria-label="Per year"></div>
        <span class="muted small">/yr = <b>${money0(f.monthly)}</b>/mo</span>
        <select class="fund-cat small-select"><option value="">Linked category…</option>${categoryOptions(data.categories.filter((x) => m.isSpending(x)), f.category)}</select>
        <span class="small">${f.category ? `Saved up: <b class="${f.saved < 0 ? 'bad' : ''}">${money0(f.saved)}</b>` : ''}</span>
        <button class="link-btn danger" data-del-fund="${esc(f.id)}">Delete</button>
      </div>`).join('') || '<p class="muted small">None yet.</p>'}
      ${funds.length ? `<p class="muted small">Link a category and spending there is taken from the set-aside instead of being a surprise.</p>` : ''}
    </section>
  </div>`;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function bind(ctx, root) {
  const { m, save, toast } = ctx;
  root.querySelectorAll('[data-month]').forEach((b) => b.addEventListener('click', () => ctx.shiftMonth(Number(b.dataset.month))));

  const savePlan = () => save({ action: 'setSetting', key: 'plan', value: {
    income: Number(root.querySelector('#income').value || 0), savingsTarget: Number(root.querySelector('#savings').value || 0),
  } }).then(() => toast('Plan updated'));
  root.querySelector('#income').addEventListener('change', savePlan);
  root.querySelector('#savings').addEventListener('change', savePlan);

  // Budgets
  root.querySelectorAll('[data-budget]').forEach((i) => i.addEventListener('change', () =>
    save({ action: 'setBudget', category: i.dataset.budget, amount: Number(i.value || 0) })));
  root.querySelector('#addBudget').addEventListener('change', (e) => {
    const c = e.target.value; if (!c) return;
    const guess = e.target.selectedOptions[0].textContent.match(/avg \$([\d,]+)/);
    const amt = prompt(`Monthly budget for ${c}:`, guess ? Math.round(Number(guess[1].replace(/,/g, '')) / 10) * 10 : '200');
    if (amt && Number(amt) > 0) save({ action: 'setBudget', category: c, amount: Number(amt) });
    else e.target.value = '';
  });
  root.querySelectorAll('[data-roll]').forEach((i) => i.addEventListener('change', () =>
    save({ action: 'setEntry', key: 'rollover', id: i.dataset.roll, value: i.checked ? ymOf(ctx.today) : null })
      .then(() => toast(i.checked ? 'Rollover on from this month' : 'Rollover off'))));

  // Weekly caps
  const caps = () => [...root.querySelectorAll('[data-cap]')].map((el) => ({
    id: el.dataset.cap, name: el.querySelector('.cap-name').value, amount: Number(el.querySelector('.cap-amt').value || 0),
    categories: [...el.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.value),
  }));
  const saveCaps = (list = caps()) => save({ action: 'setSetting', key: 'weeklyCaps', value: list });
  root.querySelectorAll('[data-cap] input').forEach((i) => i.addEventListener('change', () => saveCaps()));
  root.querySelector('[data-add-cap]').addEventListener('click', () => saveCaps([...caps(), { id: uid(), name: 'Shopping', amount: 75, categories: ['Shopping', 'Clothing'] }]));
  root.querySelectorAll('[data-del-cap]').forEach((b) => b.addEventListener('click', () => saveCaps(caps().filter((c) => c.id !== b.dataset.delCap))));

  // Set-asides
  const funds = () => [...root.querySelectorAll('[data-fund]')].map((el) => {
    const prev = m.settings.sinking.find((f) => f.id === el.dataset.fund) || {};
    return { id: el.dataset.fund, name: el.querySelector('.fund-name').value, annual: Number(el.querySelector('.fund-annual').value || 0),
      category: el.querySelector('.fund-cat').value || null, start: prev.start || ymOf(ctx.today) };
  });
  const saveFunds = (list = funds()) => save({ action: 'setSetting', key: 'sinking', value: list });
  root.querySelectorAll('[data-fund] input, [data-fund] select').forEach((i) => i.addEventListener('change', () => saveFunds()));
  root.querySelector('[data-add-fund]').addEventListener('click', () => saveFunds([...funds(), { id: uid(), name: 'Holiday gifts', annual: 600, category: 'Gifts & Donations', start: ymOf(ctx.today) }]));
  root.querySelectorAll('[data-del-fund]').forEach((b) => b.addEventListener('click', () => saveFunds(funds().filter((f) => f.id !== b.dataset.delFund))));
}
