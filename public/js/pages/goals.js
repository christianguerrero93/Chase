import { esc, money0, progress, ring, shortDate, emptyState } from '../ui.js';
import { savingsFor, ymOf, shiftMonth, monthsBetween } from '../engine.js';

const EMOJI = ['🎯', '🛟', '✈️', '🏠', '🚗', '💍', '🎓', '💻', '🏖️', '📈'];

// Goals: savings goals you contribute to, plus your monthly savings record.
export function render(ctx) {
  const { m, snap, today } = ctx;
  const list = snap.goals;
  const target = m.settings.plan.savingsTarget;
  const ym = ymOf(today);

  // Monthly savings record: how many of the last 6 full months hit the goal
  const past = [1, 2, 3, 4, 5, 6].map((i) => shiftMonth(ym, -i)).filter((x) => m.txns.some((t) => t.date.startsWith(x)));
  const hits = target ? past.filter((x) => savingsFor(m, x).saved >= target).length : 0;
  let streak = 0;
  for (const x of past) { if (target && savingsFor(m, x).saved >= target) streak++; else break; }

  const goalCard = (g) => {
    const behind = g.date && g.perMonth && target && g.perMonth > target;
    return `<section class="card goal ${g.done ? 'done' : ''}" data-goal="${esc(g.id)}">
      <div class="goal-head"><span class="goal-emoji">${esc(g.emoji || '🎯')}</span>
        <div class="grow"><h2>${esc(g.name)}</h2><div class="muted small">${g.date ? `By ${shortDate(g.date)} ${new Date(g.date).getFullYear()}` : 'No deadline'}</div></div>
        ${ring(g.pct, { size: 76, stroke: 8, label: `${Math.round(g.pct * 100)}%`, sub: '', color: g.done ? '#059669' : '#2563eb', track: 'var(--line)', textColor: 'var(--text)', subColor: 'var(--muted)' })}</div>
      ${progress(g.pct, g.done ? 'var(--good)' : 'var(--accent)')}
      <div class="row"><span><b class="num">${money0(g.saved)}</b> <span class="muted">of ${money0(g.target)}</span></span>
        <span class="small ${behind ? 'warn' : 'muted'}">${g.done ? '🎉 Reached!' : g.perMonth ? `${money0(g.perMonth)}/mo to finish on time` : `${money0(g.remaining)} to go`}</span></div>
      <div class="goal-actions">
        <div class="money-input sm"><span>$</span><input type="number" step="10" placeholder="Amount" class="contrib"></div>
        <button class="btn primary" data-add="${esc(g.id)}">Add</button>
        <button class="btn" data-withdraw="${esc(g.id)}">Withdraw</button>
        <details class="more-menu"><summary>Edit</summary>
          <label class="field">Name<input class="g-name" value="${esc(g.name)}"></label>
          <label class="field">Target<div class="money-input"><span>$</span><input class="g-target" type="number" value="${g.target}"></div></label>
          <label class="field">Target date<input class="g-date" type="date" value="${g.date || ''}"></label>
          <div class="emoji-pick">${EMOJI.map((e) => `<button class="mini ${e === g.emoji ? 'on' : ''}" data-emoji="${e}">${e}</button>`).join('')}</div>
          <div class="row-btns"><button class="btn primary" data-save="${esc(g.id)}">Save</button><button class="btn danger" data-del="${esc(g.id)}">Delete goal</button></div>
          ${(g.contributions || []).length ? `<div class="muted small">History: ${g.contributions.slice(-6).reverse().map((c) => `${shortDate(c.date)} ${c.amount > 0 ? '+' : ''}${money0(c.amount)}`).join(' · ')}</div>` : ''}
        </details>
      </div>
    </section>`;
  };

  return `<div class="wrap page">
    <div class="page-head"><h1>Goals</h1><button class="btn primary" data-new>+ New goal</button></div>
    <section class="card savings-record">
      <div><div class="eyebrow">Monthly savings goal</div><div class="big num">${target ? money0(target) : 'Not set'}</div>
        ${target ? `<div class="muted">Hit in ${hits} of the last ${past.length} month${past.length === 1 ? '' : 's'}${streak ? ` · 🔥 ${streak} in a row` : ''}</div>` : '<a class="link-btn" href="#/plan">Set it in Plan</a>'}</div>
      <div class="months">${past.slice().reverse().map((x) => { const s = savingsFor(m, x).saved; const ok = target && s >= target;
        return `<div class="mo ${ok ? 'ok' : 'miss'}" title="${x}: ${money0(s)}"><span>${ok ? '✓' : '·'}</span><small>${new Date(x + '-02').toLocaleDateString('en-US', { month: 'short' })}</small><small>${money0(s)}</small></div>`; }).join('')}</div>
    </section>
    ${list.length ? `<div class="goals">${list.map(goalCard).join('')}</div>` :
      emptyState('🎯', 'No goals yet', 'An emergency fund (3 months of expenses) is a great first goal. Then a trip, a car, anything.', '<button class="btn primary" data-new>Create a goal</button>')}
    <p class="muted small center">Record what you move into savings for each goal. Ledger doesn't move money; it keeps score.</p>
  </div>`;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function bind(ctx, root) {
  const goals = () => ctx.m.settings.goals.map((g) => ({ ...g, contributions: [...(g.contributions || [])] }));
  const saveGoals = (list) => ctx.save({ action: 'setSetting', key: 'goals', value: list });

  root.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', () => {
    const name = prompt('What are you saving for?', 'Emergency fund');
    if (!name) return;
    const target = Number(prompt('Target amount ($):', '5000') || 0);
    saveGoals([...goals(), { id: uid(), name, target, emoji: name.toLowerCase().includes('emergency') ? '🛟' : '🎯', date: null, contributions: [] }]);
  }));
  const contribute = (id, sign) => {
    const card = root.querySelector(`[data-goal="${id}"]`);
    const amt = Number(card.querySelector('.contrib').value || 0);
    if (!amt) return ctx.toast('Enter an amount');
    const list = goals();
    list.find((g) => g.id === id).contributions.push({ date: ctx.today, amount: sign * Math.abs(amt) });
    saveGoals(list).then(() => ctx.toast(sign > 0 ? `🎉 ${money0(amt)} added` : `${money0(amt)} withdrawn`));
  };
  root.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => contribute(b.dataset.add, 1)));
  root.querySelectorAll('[data-withdraw]').forEach((b) => b.addEventListener('click', () => contribute(b.dataset.withdraw, -1)));
  root.querySelectorAll('[data-emoji]').forEach((b) => b.addEventListener('click', () => {
    b.parentElement.querySelectorAll('.mini').forEach((x) => x.classList.remove('on')); b.classList.add('on');
  }));
  root.querySelectorAll('[data-save]').forEach((b) => b.addEventListener('click', () => {
    const card = root.querySelector(`[data-goal="${b.dataset.save}"]`);
    const list = goals();
    const g = list.find((x) => x.id === b.dataset.save);
    g.name = card.querySelector('.g-name').value;
    g.target = Number(card.querySelector('.g-target').value || 0);
    g.date = card.querySelector('.g-date').value || null;
    g.emoji = card.querySelector('.emoji-pick .on')?.dataset.emoji || g.emoji;
    saveGoals(list).then(() => ctx.toast('Goal saved'));
  }));
  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    if (confirm('Delete this goal and its history?')) saveGoals(goals().filter((g) => g.id !== b.dataset.del));
  }));
}
