import { esc, money, money0, chip, color, icon, monthName, donut, bars, sparkline, shortDate, progress } from '../ui.js';
import { monthReview, monthSpending, savingsFor, shiftMonth, ymOf, hasData } from '../engine.js';

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Insights: the month-end review, trends, needs vs wants, net worth.
export function render(ctx) {
  const { m, data, month, today } = ctx;
  const r = monthReview(m, month);
  const isCurrent = month === ymOf(today);
  const sav = r.savings;
  const target = r.savingsTarget;

  // Donut
  const entries = r.categories.filter((c) => c.spent > 0);
  const shown = entries.slice(0, 7).map((c) => [c.category, c.spent]);
  const rest = entries.slice(7).reduce((s, c) => s + c.spent, 0);
  if (rest > 0) shown.push(['Everything else', rest, '#cbd5e1']);

  // 6-month trend
  const months = [-5, -4, -3, -2, -1, 0].map((d) => shiftMonth(month, d));
  const trend = months.map((x) => ({ key: x, label: monthName(x, true), value: monthSpending(m, x), attr: `data-goto="${x}"`, title: monthName(x) }));
  const savTrend = months.map((x) => ({ key: x, label: monthName(x, true), value: Math.max(0, savingsFor(m, x).saved), attr: `data-goto="${x}"` }));

  // Net worth
  const nw = (data.networth || []).map((p) => ({ date: p.date, value: p.assets - p.debts }));
  const nwNow = nw.at(-1);
  const nwStart = nw.find((p) => p.date >= shiftMonth(ymOf(today), -1) + '-01') || nw[0];

  const changeTxt = (c) => !c.avg ? 'new' : Math.abs(c.change) < 1 ? 'same as avg' : `${c.change > 0 ? '▲' : '▼'} ${money0(Math.abs(c.change))} vs avg`;
  const maxWd = Math.max(...r.byWeekday, 1);

  return `<div class="wrap page">
    <div class="page-head"><h1>Insights</h1>
      <div class="month-switch"><button class="icon-btn dark" data-month="-1">‹</button><span>${monthName(month)}</span>
      <button class="icon-btn dark" data-month="1" ${isCurrent ? 'disabled' : ''}>›</button></div></div>

    <section class="card review-card">
      <div class="review-top">
        <div><div class="eyebrow">${isCurrent ? 'Month so far' : 'Month in review'}</div>
          <div class="big num">${money0(r.total)}</div>
          <div class="muted">${r.monthsCompared ? `${r.total > r.avgTotal ? '▲' : '▼'} ${money0(Math.abs(r.total - r.avgTotal))} vs your ${r.monthsCompared}-month average of ${money0(r.avgTotal)}` : 'Not enough history to compare yet'}</div></div>
        <div class="review-sav">${r.goalStatus ? `
          <div class="eyebrow">Savings goal</div><div class="big num ${r.goalStatus.ok ? 'good' : 'warn'}">${r.goalStatus.ok ? 'On track' : money0(r.goalStatus.atRisk) + ' at risk'}</div>
          <div class="muted">${money0(r.goalStatus.onTrack)} of ${money0(r.goalStatus.target)} protected if you stay within safe-to-spend</div>
          ${progress(r.goalStatus.pct, r.goalStatus.ok ? 'var(--good)' : 'var(--warn)')}` : `
          <div class="eyebrow">Saved</div><div class="big num ${sav.saved < 0 ? 'bad' : 'good'}">${money0(sav.saved)}</div>
          <div class="muted">${sav.rate !== null ? `${Math.round(sav.rate * 100)}% savings rate` : 'No income recorded'}${target ? ` · goal ${money0(target)}` : ''}</div>
          ${target ? progress(sav.saved / target, sav.saved >= target ? 'var(--good)' : 'var(--accent)') : ''}`}
        </div>
      </div>
      ${r.suggestion ? `<div class="suggest"><span>💡</span><div><b>${isCurrent ? 'So far this month' : 'One change for next month'}</b><br>${esc(r.suggestion)}</div></div>` : ''}
      ${r.drivers.length ? `<div class="drivers">${r.drivers.map((d) => `<div class="driver">${chip(d.category, 'sm')}<div>
        <b>${esc(d.category)}</b> up ${money0(d.change)} vs average${d.merchant ? `<div class="muted small">Biggest driver: ${esc(d.merchant.name)} · ${d.merchant.count} charge${d.merchant.count > 1 ? 's' : ''} · ${money0(d.merchant.total)}</div>` : ''}</div></div>`).join('')}</div>` : ''}
    </section>

    <div class="grid">
      <section class="card"><div class="card-head"><h2>Where it went</h2><span class="muted small">Tap to see transactions</span></div>
        <div class="donut-wrap">${donut(shown, r.total, { center: money0(r.total), sub: `${entries.length} categories` })}
          <div class="legend">${shown.map(([c, v, col]) => `<div class="legend-row" data-cat="${esc(c)}"><span class="dot" style="--c:${col || color(c)}"></span>
            <span class="name">${col ? '' : icon(c) + ' '}${esc(c)}</span><span class="pct">${r.total ? Math.round(v / r.total * 100) : 0}%</span><span class="amt">${money0(v)}</span></div>`).join('') || '<p class="muted">No spending yet.</p>'}</div></div>
      </section>
      <section class="card"><div class="card-head"><h2>Needs vs wants</h2><a class="link-btn" href="#/settings">Edit</a></div>
        <div class="nw-split">
          <div style="flex:${Math.max(r.needs, 1)}" class="needs"><b>${money0(r.needs)}</b><span>Needs</span></div>
          <div style="flex:${Math.max(r.wants, 1)}" class="wants"><b>${money0(r.wants)}</b><span>Wants</span></div>
        </div>
        <p class="muted small">${r.needs + r.wants > 0 ? `${Math.round(r.wants / (r.needs + r.wants) * 100)}% of spending went to wants.` : ''} A common rule of thumb is 50% needs, 30% wants, 20% savings.</p>
        <div class="card-head mt"><h2>Wants by day of week</h2></div>
        <div class="wd">${r.byWeekday.map((v, i) => `<div><div class="wd-bar"><span style="height:${(v / maxWd) * 100}%"></span></div><b>${money0(v)}</b><small>${WD[i]}</small></div>`).join('')}</div>
      </section>
    </div>

    <section class="card"><div class="card-head"><h2>Category by category</h2><span class="muted small">vs ${r.monthsCompared}-month average</span></div>
      <div class="cat-table">${r.categories.map((c) => `<div class="cat-line" data-cat="${esc(c.category)}">${chip(c.category, 'sm')}<span class="grow">${esc(c.category)}</span>
        <span class="small ${c.change > 15 ? 'bad' : c.change < -15 ? 'good' : 'muted'}">${changeTxt(c)}</span><b class="num">${money0(c.spent)}</b></div>`).join('')}</div>
    </section>

    <div class="grid">
      <section class="card"><div class="card-head"><h2>Spending, 6 months</h2></div>${bars(trend, { active: month, avg: null })}</section>
      <section class="card"><div class="card-head"><h2>Saved each month</h2>${target ? `<span class="muted small">goal ${money0(target)}</span>` : ''}</div>${bars(savTrend, { active: month, avg: target || null })}</section>
    </div>

    <div class="grid">
      <section class="card"><div class="card-head"><h2>Net worth</h2>${nwNow ? `<b class="num">${money0(nwNow.value)}</b>` : ''}</div>
        ${nwNow && nwStart && nwStart !== nwNow ? `<p class="small ${nwNow.value >= nwStart.value ? 'good' : 'bad'}">${nwNow.value >= nwStart.value ? '▲' : '▼'} ${money0(Math.abs(nwNow.value - nwStart.value))} since ${shortDate(nwStart.date)}</p>` : ''}
        ${sparkline(nw.slice(-180))}
        <p class="muted small">Linked account balances minus credit card and loan balances. Recorded on each sync.</p></section>
      <section class="card"><div class="card-head"><h2>Biggest purchases</h2></div>
        ${r.biggest.map((t) => `<button class="li tx" data-txn="${esc(t.id)}">${chip(t.cat, 'sm')}<div class="grow"><div class="ellip">${esc(t.name)}</div>
          <div class="muted small">${shortDate(t.date)}</div></div><b class="num">${money(t.amount)}</b></button>`).join('') || '<p class="muted small">None yet.</p>'}
      </section>
    </div>
  </div>`;
}

export function bind(ctx, root) {
  root.querySelectorAll('[data-month]').forEach((b) => b.addEventListener('click', () => ctx.shiftMonth(Number(b.dataset.month))));
  root.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => ctx.setMonth(b.dataset.goto)));
  root.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.cat !== 'Everything else') ctx.go('activity', { filters: { category: b.dataset.cat, search: '', account: '' } });
  }));
  root.querySelectorAll('[data-txn]').forEach((b) => b.addEventListener('click', () => ctx.openTxn(b.dataset.txn)));
}
