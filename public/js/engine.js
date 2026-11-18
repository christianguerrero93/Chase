// Budget engine: pure calculations, no DOM. Used by the dashboard (browser)
// and by the server (weekly email + alerts) so the numbers always match.
//
// Amounts: positive = money out, negative = money in.
// Dates are 'YYYY-MM-DD' strings in your local timezone.

export const NEEDS_DEFAULT = [
  'Groceries', 'Rent', 'Bills & Utilities', 'Phone & Internet', 'Insurance', 'Health',
  'Transportation', 'Gas', 'Debt Payments', 'Education', 'Fees',
];

// ---------------------------------------------------------------- dates
const pad = (n) => String(n).padStart(2, '0');
export const ymOf = (iso) => iso.slice(0, 7);
export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
}
export const weekday = (iso) => (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7; // 0 = Monday
export const weekStart = (iso) => addDays(iso, -weekday(iso));
export function monthsBetween(a, b) { // ym strings, b - a
  const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}
function addMonthsIso(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = shiftMonth(`${y}-${pad(m)}`, n);
  return `${target}-${pad(Math.min(d, daysInMonth(target)))}`;
}
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const round2 = (n) => Math.round(n * 100) / 100;

// ------------------------------------------------------- categorization
/**
 * Builds the model every other function uses.
 * ctx: { transactions, settings, nonSpending, today }
 * Each transaction gets .cat (main category) and .alloc ([{c, amount}],
 * which differs from .cat only for split transactions).
 * Precedence: split > your one-off change > your rules > automatic.
 */
export function prepare(ctx) {
  const s = normalizeSettings(ctx.settings);
  const rules = s.rules.map((r) => ({ ...r, m: r.match.toLowerCase() }));
  const nonSpending = new Set(ctx.nonSpending || ['Income', 'Transfer', 'Credit Card Payment']);
  const needs = new Set(s.needs);

  const txns = ctx.transactions.map((t) => {
    let cat = s.overrides[t.id];
    if (!cat) {
      const hay = `${t.name} ${t.description}`.toLowerCase();
      const rule = rules.find((r) => hay.includes(r.m));
      cat = rule ? rule.category : t.auto;
    }
    let alloc = [{ c: cat, amount: t.amount }];
    const split = s.splits[t.id];
    if (Array.isArray(split) && split.length > 1) {
      const sum = split.reduce((a, p) => a + Number(p.amount || 0), 0);
      if (Math.abs(sum - t.amount) < 0.011) alloc = split.map((p) => ({ c: p.category, amount: Number(p.amount) }));
    }
    return { ...t, cat, alloc, split: alloc.length > 1 };
  }).sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);

  return {
    ...ctx,
    settings: s,
    txns,
    today: ctx.today,
    isSpending: (c) => !nonSpending.has(c),
    isNeed: (c) => needs.has(c),
  };
}

export function normalizeSettings(raw = {}) {
  return {
    budgets: {}, overrides: {}, rules: [], splits: {}, notes: {}, receipts: {},
    rollover: {}, weeklyCaps: [], sinking: [], goals: [], recurring: {},
    needs: NEEDS_DEFAULT,
    timezone: 'America/New_York',
    ...raw,
    plan: { income: 0, savingsTarget: 0, ...(raw.plan || {}) },
    email: { weekly: true, alerts: true, ...(raw.email || {}) },
  };
}

// ----------------------------------------------------------- basic sums
export const inMonth = (m, ym) => m.txns.filter((t) => t.date.startsWith(ym));
export const inRange = (m, from, to) => m.txns.filter((t) => t.date >= from && t.date <= to);

export function spendingByCategory(txns, m) {
  const out = {};
  for (const t of txns) for (const a of t.alloc) if (m.isSpending(a.c)) out[a.c] = (out[a.c] || 0) + a.amount;
  return out;
}
export function totalSpending(txns, m) {
  let s = 0;
  for (const t of txns) for (const a of t.alloc) if (m.isSpending(a.c)) s += a.amount;
  return s;
}
export function totalIncome(txns) {
  let s = 0;
  for (const t of txns) for (const a of t.alloc) if (a.c === 'Income') s -= a.amount;
  return s;
}
// Month total, optionally only through a given day of the month
export function monthSpending(m, ym, throughDay = 31) {
  return totalSpending(inMonth(m, ym).filter((t) => Number(t.date.slice(8)) <= throughDay), m);
}
export const monthIncome = (m, ym) => totalIncome(inMonth(m, ym));

export function hasData(m, ym) { return m.txns.some((t) => t.date.startsWith(ym)); }

// Planned income, or the average of the last 3 months that had income
export function expectedIncome(m, ym) {
  if (m.settings.plan.income > 0) return { amount: m.settings.plan.income, source: 'plan' };
  const past = [1, 2, 3].map((i) => monthIncome(m, shiftMonth(ym, -i))).filter((v) => v > 0);
  if (past.length) return { amount: round2(past.reduce((a, b) => a + b, 0) / past.length), source: 'average' };
  return { amount: monthIncome(m, ym), source: 'actual' };
}

// ----------------------------------------------------- recurring charges
const CADENCES = [
  { id: 'weekly', days: 7, min: 6, max: 8, perYear: 52 },
  { id: 'biweekly', days: 14, min: 13, max: 16, perYear: 26 },
  { id: 'monthly', days: 30, min: 26, max: 35, perYear: 12 },
  { id: 'quarterly', days: 91, min: 84, max: 98, perYear: 4 },
  { id: 'yearly', days: 365, min: 350, max: 380, perYear: 1 },
];
const BILL_LIKE = new Set(['Subscriptions', 'Phone & Internet', 'Insurance', 'Bills & Utilities', 'Rent', 'Debt Payments', 'Fitness']);
const VARIABLE = new Set(['Bills & Utilities']);

export const merchantKey = (name = '') =>
  name.toUpperCase().replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ') || name;

function nextDate(last, cadence) {
  return cadence.id === 'monthly' ? addMonthsIso(last, 1)
    : cadence.id === 'quarterly' ? addMonthsIso(last, 3)
    : cadence.id === 'yearly' ? addMonthsIso(last, 12)
    : addDays(last, cadence.days);
}

/** Detects subscriptions and bills from repeating charges. */
export function recurring(m) {
  const groups = new Map();
  for (const t of m.txns) {
    if (t.amount <= 0 || t.pending || !m.isSpending(t.cat)) continue;
    const key = merchantKey(t.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const out = [];
  for (const [key, list] of groups) {
    // one charge per day, oldest first
    const byDay = new Map();
    for (const t of list) byDay.set(t.date, (byDay.get(t.date) || 0) + t.amount);
    const days = [...byDay.keys()].sort();
    const cat = list[0].cat;
    if (days.length < 2 || (days.length < 3 && !BILL_LIKE.has(cat))) continue;
    const gaps = days.slice(1).map((d, i) => daysBetween(days[i], d));
    const g = median(gaps);
    const cadence = CADENCES.find((c) => g >= c.min && g <= c.max);
    if (!cadence) continue;
    const fit = gaps.filter((x) => x >= cadence.min * 0.85 && x <= cadence.max * 1.15).length / gaps.length;
    if (fit < 0.6) continue;
    const amounts = days.map((d) => byDay.get(d));
    const med = median(amounts);
    const spread = median(amounts.map((a) => Math.abs(a - med))) / med;
    if (spread > 0.25 && !VARIABLE.has(cat)) continue;

    const last = days[days.length - 1];
    const sinceLast = daysBetween(last, m.today);
    const active = sinceLast <= cadence.max * 1.5;
    const lastAmount = amounts[amounts.length - 1];
    // When did the current price start? Compare with the last different price.
    let changeIdx = -1;
    if (!VARIABLE.has(cat)) {
      for (let i = amounts.length - 2; i >= 0; i--) {
        if (Math.abs(amounts[i] - lastAmount) / lastAmount > 0.01) { changeIdx = i; break; }
      }
    }
    const prevAmount = changeIdx >= 0 ? amounts[changeIdx] : amounts[amounts.length - 2];
    const changedOn = changeIdx >= 0 ? days[changeIdx + 1] : null;
    const recentChange = changedOn && daysBetween(changedOn, m.today) <= cadence.days * 3 + 5;
    const change = recentChange && prevAmount > 0 ? (lastAmount - prevAmount) / prevAmount : 0;
    let next = nextDate(last, cadence);
    while (active && next < m.today && daysBetween(next, m.today) > 3) next = nextDate(next, cadence);

    out.push({
      key,
      name: list[0].name,
      category: cat,
      cadence: cadence.id,
      count: days.length,
      amount: round2(lastAmount),
      typical: round2(med),
      annual: round2(med * cadence.perYear),
      last,
      next,
      active,
      priceChange: Math.abs(change) >= 0.03 ? round2(change * 100) : 0,
      previousAmount: round2(prevAmount),
      changedOn,
      status: m.settings.recurring[key] || null, // 'keep' | 'cancel' | 'ignore'
      _cadence: cadence,
    });
  }
  return out.filter((r) => r.status !== 'ignore').sort((a, b) => a.next.localeCompare(b.next));
}

/** Expected bills between two dates (inclusive). */
export function upcomingBills(m, from, to, rec = recurring(m)) {
  const out = [];
  for (const r of rec) {
    if (!r.active || r.status === 'cancel') continue;
    let d = r.next;
    let guard = 0;
    while (d <= to && guard++ < 60) {
      if (d >= from) out.push({ ...r, date: d, amount: r.cadence === 'monthly' || r.cadence === 'yearly' ? r.amount : r.typical });
      d = nextDate(d, r._cadence);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ------------------------------------------------------------- planning
export function sinkingFunds(m) {
  const nowYm = ymOf(m.today);
  return m.settings.sinking.map((f) => {
    const monthly = round2(Number(f.annual || 0) / 12);
    const start = f.start || nowYm;
    const months = Math.max(0, monthsBetween(start, nowYm) + 1);
    const used = f.category
      ? totalSpending(m.txns.filter((t) => ymOf(t.date) >= start), { isSpending: (c) => c === f.category })
      : 0;
    const saved = round2(monthly * months - used);
    return { ...f, monthly, saved, used: round2(used), months };
  });
}

export const sinkingMonthly = (m) => round2(sinkingFunds(m).reduce((s, f) => s + f.monthly, 0));

function carryInto(m, c, ym, depth = 0) {
  const start = m.settings.rollover[c];
  if (!start || ym <= start || depth > 36) return 0;
  const prev = shiftMonth(ym, -1);
  const budget = Number(m.settings.budgets[c] || 0);
  const spentPrev = spendingByCategory(inMonth(m, prev), m)[c] || 0;
  return round2(budget + carryInto(m, c, prev, depth + 1) - spentPrev);
}

/** Budget status for each category with a budget (or spending) in a month. */
export function budgetStatus(m, ym) {
  const spent = spendingByCategory(inMonth(m, ym), m);
  const cats = new Set([...Object.keys(m.settings.budgets), ...Object.keys(spent).filter((c) => spent[c] > 0)]);
  return [...cats].filter((c) => m.isSpending(c)).map((c) => {
    const budget = Number(m.settings.budgets[c] || 0);
    const carry = budget ? carryInto(m, c, ym) : 0;
    const available = round2(budget + carry);
    const s = round2(spent[c] || 0);
    const pct = available > 0 ? s / available : budget ? 1 : 0;
    return {
      category: c, budget, carry, available, spent: s,
      remaining: round2(available - s), pct,
      rollover: Boolean(m.settings.rollover[c]),
      level: !budget ? 'none' : pct > 1 ? 'over' : pct >= 0.85 ? 'warn' : 'ok',
    };
  }).sort((a, b) => (b.budget > 0) - (a.budget > 0) || b.spent - a.spent);
}

/** The monthly plan: income -> savings -> set-asides -> budgets -> left to assign. */
export function monthPlan(m, ym, rec = recurring(m)) {
  const income = expectedIncome(m, ym);
  const savings = Number(m.settings.plan.savingsTarget || 0);
  const sinking = sinkingMonthly(m);
  const budgets = Object.values(m.settings.budgets).reduce((a, b) => a + Number(b || 0), 0);
  // Detected bills in categories you haven't budgeted (avoids counting twice)
  const billList = rec.filter((r) => r.active && r.status !== 'cancel' && !m.settings.budgets[r.category]);
  const bills = round2(billList.reduce((a, r) => a + r.annual / 12, 0));
  return {
    income: income.amount, incomeSource: income.source, savings, sinking, bills, billCount: billList.length, budgets: round2(budgets),
    leftToAssign: round2(income.amount - savings - sinking - bills - budgets),
  };
}

// --------------------------------------------------------- safe to spend
/**
 * What you can still spend this month after protecting savings,
 * set-asides and bills that haven't hit yet.
 */
export function safeToSpend(m, rec = recurring(m)) {
  const ym = ymOf(m.today);
  const day = Number(m.today.slice(8));
  const dim = daysInMonth(ym);
  const income = expectedIncome(m, ym);
  const receivedSoFar = monthIncome(m, ym);
  const incomeUsed = Math.max(income.amount, receivedSoFar);
  const savings = Number(m.settings.plan.savingsTarget || 0);
  const sinking = sinkingMonthly(m);
  const spent = round2(monthSpending(m, ym));
  const bills = upcomingBills(m, addDays(m.today, 1), `${ym}-${pad(dim)}`, rec).filter((b) => m.isSpending(b.category));
  const upcoming = round2(bills.reduce((s, b) => s + b.amount, 0));
  const available = round2(incomeUsed - savings - sinking - spent - upcoming);
  const daysLeft = dim - day + 1;
  const spentToday = totalSpending(m.txns.filter((t) => t.date === m.today), m);
  // Today's allowance is set from the start of the day, so spending today
  // reduces what's left rather than the daily number itself.
  const perDay = round2(Math.max(0, available + spentToday) / daysLeft);
  return {
    ready: incomeUsed > 0,
    income: round2(incomeUsed), incomeSource: income.source, savings, sinking, spent, upcoming,
    bills, available, daysLeft, perDay, leftToday: round2(perDay - spentToday), spentToday: round2(spentToday),
  };
}

/**
 * Mid-month, "income minus spending" swings wildly (rent leaves on the 1st,
 * pay arrives later). The useful question is: is the savings goal still
 * protected? It is, as long as spending stays within safe-to-spend.
 */
export function savingsGoalStatus(m, sts = safeToSpend(m)) {
  const target = Number(m.settings.plan.savingsTarget || 0);
  if (!target || !sts.ready) return null;
  const onTrack = round2(Math.max(0, Math.min(target, target + Math.min(0, sts.available))));
  return { target, onTrack, atRisk: round2(target - onTrack), pct: onTrack / target, ok: onTrack >= target };
}

// ----------------------------------------------------------- weekly caps
export function weeklyCaps(m, refDay = m.today) {
  const start = weekStart(refDay);
  const end = addDays(start, 6);
  return m.settings.weeklyCaps.map((cap) => {
    const cats = new Set(cap.categories || []);
    const spentIn = (from, to) => {
      let s = 0;
      for (const t of inRange(m, from, to)) for (const a of t.alloc) if (cats.has(a.c)) s += a.amount;
      return round2(s);
    };
    const spent = spentIn(start, refDay);
    // consecutive full weeks under the cap, before this week
    let streak = 0;
    for (let i = 1; i <= 52; i++) {
      const ws = addDays(start, -7 * i);
      if (!m.txns.some((t) => t.date <= addDays(ws, 6))) break; // no data that far back
      if (spentIn(ws, addDays(ws, 6)) <= cap.amount) streak++; else break;
    }
    const daysLeft = daysBetween(refDay, end) + 1;
    return {
      ...cap, start, end, spent, remaining: round2(cap.amount - spent),
      pct: cap.amount > 0 ? spent / cap.amount : 0, daysLeft, streak,
      level: spent > cap.amount ? 'over' : spent >= cap.amount * 0.85 ? 'warn' : 'ok',
    };
  });
}

// ---------------------------------------------------------------- goals
export function goals(m) {
  const nowYm = ymOf(m.today);
  return m.settings.goals.map((g) => {
    const saved = round2((g.contributions || []).reduce((s, c) => s + Number(c.amount || 0), 0));
    const target = Number(g.target || 0);
    const monthsLeft = g.date ? Math.max(1, monthsBetween(nowYm, ymOf(g.date))) : null;
    const remaining = round2(Math.max(0, target - saved));
    return {
      ...g, saved, target, remaining, pct: target ? Math.min(1, saved / target) : 0,
      monthsLeft, perMonth: monthsLeft ? round2(remaining / monthsLeft) : null, done: target > 0 && saved >= target,
    };
  });
}

/** Income minus spending. For the current month, so far. */
export function savingsFor(m, ym) {
  const txns = inMonth(m, ym);
  const income = totalIncome(txns);
  const spent = totalSpending(txns, m);
  return { income: round2(income), spent: round2(spent), saved: round2(income - spent), rate: income > 0 ? (income - spent) / income : null };
}

// -------------------------------------------------------------- streaks
export function streaks(m) {
  const ym = ymOf(m.today);
  const wants = new Map();
  for (const t of inMonth(m, ym)) for (const a of t.alloc) {
    if (m.isSpending(a.c) && !m.isNeed(a.c) && a.amount > 0) wants.set(t.date, (wants.get(t.date) || 0) + a.amount);
  }
  const day = Number(m.today.slice(8));
  let noSpendDays = 0;
  for (let d = 1; d <= day; d++) if (!wants.has(`${ym}-${pad(d)}`)) noSpendDays++;
  let current = 0;
  // today only counts once it's over, so start from yesterday
  for (let d = addDays(m.today, -1); d.startsWith(ym) && !wants.has(d); d = addDays(d, -1)) current++;
  return { noSpendDays, currentNoSpend: current, daysSoFar: day };
}

// ---------------------------------------------------------------- review
export function monthReview(m, ym) {
  const cur = spendingByCategory(inMonth(m, ym), m);
  const prevYm = shiftMonth(ym, -1);
  const prev = spendingByCategory(inMonth(m, prevYm), m);
  const priorMonths = [1, 2, 3].map((i) => shiftMonth(ym, -i)).filter((x) => hasData(m, x));
  const avg = {};
  for (const pm of priorMonths) {
    const s = spendingByCategory(inMonth(m, pm), m);
    for (const [c, v] of Object.entries(s)) avg[c] = (avg[c] || 0) + v / priorMonths.length;
  }
  const cats = [...new Set([...Object.keys(cur), ...Object.keys(avg)])].map((c) => ({
    category: c, spent: round2(cur[c] || 0), prev: round2(prev[c] || 0), avg: round2(avg[c] || 0),
    change: round2((cur[c] || 0) - (avg[c] || 0)),
  })).sort((a, b) => b.spent - a.spent);

  // Which merchants drove each category this month
  const merchants = (txns, cat) => {
    const map = new Map();
    for (const t of txns) for (const a of t.alloc) if (a.c === cat && a.amount > 0) {
      const k = merchantKey(t.name);
      const o = map.get(k) || { name: t.name, total: 0, count: 0 };
      o.total += a.amount; o.count++;
      map.set(k, o);
    }
    return map;
  };
  const curTx = inMonth(m, ym), prevTx = inMonth(m, prevYm);
  const drivers = cats.filter((c) => c.change > 15 && priorMonths.length).slice(0, 3).map((c) => {
    const now = merchants(curTx, c.category), before = merchants(prevTx, c.category);
    let top = null;
    for (const [k, o] of now) {
      const d = o.total - (before.get(k)?.total || 0);
      if (!top || d > top.delta) top = { ...o, total: round2(o.total), delta: round2(d) };
    }
    return { ...c, merchant: top };
  });

  const budgets = budgetStatus(m, ym);
  const overs = budgets.filter((b) => b.level === 'over').sort((a, b) => a.remaining - b.remaining);
  let suggestion = null;
  if (overs.length) {
    const o = overs[0];
    const d = drivers.find((x) => x.category === o.category);
    const weekly = Math.round((o.available / 4.33) / 5) * 5;
    suggestion = `${o.category} went $${Math.round(-o.remaining)} over budget` +
      (d?.merchant ? `, mostly ${d.merchant.name} (${d.merchant.count} charge${d.merchant.count > 1 ? 's' : ''}, $${Math.round(d.merchant.total)})` : '') +
      `. Try a weekly cap of about $${weekly} on ${o.category} next month.`;
  } else if (drivers.length) {
    const d = drivers[0];
    suggestion = `${d.category} was $${Math.round(d.change)} above your recent average` +
      (d.merchant ? `, led by ${d.merchant.name} (${d.merchant.count}×)` : '') + `. Worth setting a budget for it.`;
  } else if (hasData(m, ym)) {
    suggestion = 'Spending was at or below your recent average in every category. Consider raising your savings target.';
  }

  let needs = 0, wantsTotal = 0;
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  for (const t of curTx) for (const a of t.alloc) {
    if (!m.isSpending(a.c)) continue;
    if (m.isNeed(a.c)) needs += a.amount;
    else { wantsTotal += a.amount; byWeekday[weekday(t.date)] += a.amount; }
  }
  const biggest = curTx.filter((t) => t.amount > 0 && m.isSpending(t.cat)).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const sav = savingsFor(m, ym);

  return {
    ym, categories: cats, drivers, suggestion, budgets,
    total: round2(totalSpending(curTx, m)), prevTotal: round2(totalSpending(prevTx, m)),
    avgTotal: round2(Object.values(avg).reduce((a, b) => a + b, 0)), monthsCompared: priorMonths.length,
    needs: round2(needs), wants: round2(wantsTotal), byWeekday: byWeekday.map(round2), biggest,
    savings: sav, savingsTarget: Number(m.settings.plan.savingsTarget || 0),
    goalStatus: ymOf(m.today) === ym ? savingsGoalStatus(m) : null,
  };
}

// ---------------------------------------------------------------- alerts
/** Things worth knowing about right now. `key` is stable so emails aren't repeated. */
export function alerts(m, rec = recurring(m)) {
  const out = [];
  const ym = ymOf(m.today);
  for (const b of budgetStatus(m, ym)) {
    if (b.level === 'over') out.push({ key: `budget:${b.category}:${ym}:over`, level: 'bad', icon: '🚨', text: `${b.category} is $${Math.round(-b.remaining)} over this month's budget.` });
    else if (b.level === 'warn') out.push({ key: `budget:${b.category}:${ym}:warn`, level: 'warn', icon: '⚠️', text: `${b.category} has used ${Math.round(b.pct * 100)}% of its budget ($${Math.round(b.remaining)} left).` });
  }
  for (const c of weeklyCaps(m)) {
    if (c.level === 'over') out.push({ key: `cap:${c.id}:${c.start}:over`, level: 'bad', icon: '🚨', text: `${c.name} is $${Math.round(-c.remaining)} over its $${c.amount} weekly cap.` });
    else if (c.level === 'warn') out.push({ key: `cap:${c.id}:${c.start}:warn`, level: 'warn', icon: '⚠️', text: `${c.name}: $${Math.round(c.remaining)} left of $${c.amount} this week, with ${c.daysLeft} day${c.daysLeft > 1 ? 's' : ''} to go.` });
  }
  const sts = safeToSpend(m, rec);
  if (sts.ready && sts.available < 0) {
    out.push({ key: `sts:${ym}:negative`, level: 'bad', icon: '🧯', text: `You're $${Math.round(-sts.available)} past what you can spend this month without dipping into savings.` });
  }
  for (const r of rec) {
    if (r.priceChange > 0 && daysBetween(r.changedOn, m.today) <= 35 && r.status !== 'keep') {
      out.push({ key: `price:${r.key}:${r.changedOn}`, level: 'warn', icon: '📈', text: `${r.name} went up ${r.priceChange}%: $${r.previousAmount} → $${r.amount}.` });
    }
  }
  for (const b of upcomingBills(m, m.today, addDays(m.today, 3), rec)) {
    out.push({ key: `bill:${b.key}:${b.date}`, level: 'info', icon: '🗓️', text: `${b.name} (~$${Math.round(b.amount)}) is due ${b.date === m.today ? 'today' : 'on ' + b.date.slice(5).replace('-', '/')}.` });
  }
  // Unusually large purchases in the last 3 days
  const since = addDays(m.today, -90);
  for (const t of inRange(m, addDays(m.today, -3), m.today)) {
    if (t.amount <= 0 || !m.isSpending(t.cat) || ['Rent', 'Debt Payments'].includes(t.cat)) continue;
    const typical = median(m.txns.filter((x) => x.cat === t.cat && x.amount > 0 && x.date >= since && x.id !== t.id).map((x) => x.amount));
    if (t.amount >= Math.max(150, typical * 3)) {
      out.push({ key: `big:${t.id}`, level: 'info', icon: '💳', text: `Large purchase: $${Math.round(t.amount)} at ${t.name} (${t.cat}).` });
    }
  }
  const other = inMonth(m, ym).filter((t) => t.cat === 'Other').length;
  if (other) out.push({ key: `other:${ym}:${other}`, level: 'info', icon: '🧐', text: `${other} purchase${other > 1 ? 's' : ''} this month still need${other > 1 ? '' : 's'} a category.`, inAppOnly: true });
  const rank = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

// ------------------------------------------------------- everything, once
export function snapshot(m) {
  const rec = recurring(m);
  return {
    rec,
    sts: safeToSpend(m, rec),
    caps: weeklyCaps(m),
    alerts: alerts(m, rec),
    streaks: streaks(m),
    goals: goals(m),
    sinking: sinkingFunds(m),
  };
}
