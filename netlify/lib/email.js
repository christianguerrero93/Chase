import { load, save } from './core.js';
import { loadModel } from './dataset.js';
import { snapshot, monthReview, shiftMonth, ymOf, addDays, weekStart, inRange, totalSpending, spendingByCategory } from '../../public/js/engine.js';

export const emailReady = () => Boolean(process.env.RESEND_API_KEY && process.env.DIGEST_EMAIL);

// Sends through Resend (https://resend.com). Free tier is plenty for this.
export async function sendEmail(subject, html) {
  if (!emailReady()) return { skipped: 'RESEND_API_KEY or DIGEST_EMAIL not set' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.DIGEST_FROM || 'Ledger <onboarding@resend.dev>',
      to: process.env.DIGEST_EMAIL.split(',').map((s) => s.trim()),
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Email failed: ${res.status} ${await res.text()}`);
  return { sent: true };
}

const $ = (n) => '$' + Math.round(n).toLocaleString('en-US');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const siteUrl = () => (process.env.URL || '').replace(/\/$/, '');

function shell(title, body) {
  return `<!doctype html><html><body style="margin:0;background:#f3f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:linear-gradient(135deg,#0b1d3a,#1d4ed8);border-radius:18px;padding:24px;color:#fff">
      <div style="font-weight:800;font-size:16px;opacity:.9">Ledger</div>
      <div style="font-size:22px;font-weight:800;margin-top:6px">${title}</div>
    </div>
    ${body}
    ${siteUrl() ? `<p style="text-align:center;margin:24px 0"><a href="${siteUrl()}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700">Open Ledger</a></p>` : ''}
    <p style="text-align:center;color:#94a3b8;font-size:12px">You can turn these emails off in Ledger → Settings.</p>
  </div></body></html>`;
}
const card = (inner) => `<div style="background:#fff;border-radius:16px;padding:18px 20px;margin-top:14px;border:1px solid #e8ecf2">${inner}</div>`;
const row = (l, r, color = '#0f172a') => `<tr><td style="padding:6px 0;color:#475569">${l}</td><td style="padding:6px 0;text-align:right;font-weight:700;color:${color}">${r}</td></tr>`;

/** Monday summary of last week (Mon to Sun), plus the week ahead. */
export async function buildWeeklyDigest() {
  const m = await loadModel();
  const snap = snapshot(m);
  const lastWeekEnd = addDays(weekStart(m.today), -1);
  const lastWeekStart = addDays(lastWeekEnd, -6);
  const week = inRange(m, lastWeekStart, lastWeekEnd);
  const spent = totalSpending(week, m);
  const byCat = Object.entries(spendingByCategory(week, m)).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const prevWeek = totalSpending(inRange(m, addDays(lastWeekStart, -7), addDays(lastWeekStart, -1)), m);
  const ym = ymOf(m.today);
  const review = monthReview(m, ym);
  const target = m.settings.plan.savingsTarget;

  let body = card(`
    <div style="color:#64748b;font-size:13px">Last week (${lastWeekStart.slice(5).replace('-', '/')} to ${lastWeekEnd.slice(5).replace('-', '/')})</div>
    <div style="font-size:34px;font-weight:800;letter-spacing:-1px">${$(spent)}</div>
    <div style="color:#64748b;font-size:14px">${prevWeek > 0 ? `${spent > prevWeek ? '▲' : '▼'} ${Math.abs(Math.round((spent - prevWeek) / prevWeek * 100))}% vs the week before` : ''}</div>
    <table style="width:100%;margin-top:10px;border-collapse:collapse;font-size:14px">${byCat.map(([c, v]) => row(esc(c), $(v))).join('')}</table>`);

  if (snap.sts.ready) {
    body += card(`<div style="font-weight:700;margin-bottom:6px">This month so far</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${row('Spent', $(snap.sts.spent))}
        ${row('Safe to spend for the rest of the month', $(Math.max(0, snap.sts.available)), snap.sts.available < 0 ? '#dc2626' : '#059669')}
        ${row('That works out to', `${$(snap.sts.perDay)}/day for ${snap.sts.daysLeft} days`)}
        ${target ? row('Savings goal', `${$(target)} protected`) : ''}
      </table>`);
  }
  if (snap.caps.length) {
    body += card(`<div style="font-weight:700;margin-bottom:6px">Weekly caps (new week starts today)</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${snap.caps.map((c) =>
        row(esc(c.name), `${$(c.amount)}${c.streak ? ` · ${c.streak}-week streak 🔥` : ''}`)).join('')}</table>`);
  }
  const bills = snap.sts.bills.filter((b) => b.date <= addDays(m.today, 7));
  if (bills.length) {
    body += card(`<div style="font-weight:700;margin-bottom:6px">Bills this week</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${bills.map((b) => row(`${esc(b.name)} · ${b.date.slice(5).replace('-', '/')}`, $(b.amount))).join('')}</table>`);
  }
  const warn = snap.alerts.filter((a) => a.level !== 'info' && !a.inAppOnly);
  if (warn.length) body += card(`<div style="font-weight:700;margin-bottom:6px">Heads up</div>${warn.map((a) => `<div style="padding:4px 0;font-size:14px">${a.icon} ${esc(a.text)}</div>`).join('')}`);
  if (review.suggestion && Number(m.today.slice(8)) <= 7) {
    const last = monthReview(m, shiftMonth(ym, -1));
    if (last.suggestion) body += card(`<div style="font-weight:700;margin-bottom:6px">From last month's review</div><div style="font-size:14px">${esc(last.suggestion)}</div>`);
  }
  return { subject: `Ledger weekly: ${$(spent)} spent last week`, html: shell('Your week in money', body) };
}

/** Emails any new warnings (budget over, cap at 85%, price increase...). Each is sent once. */
export async function sendNewAlerts() {
  const m = await loadModel();
  if (!m.settings.email.alerts) return { skipped: 'alerts off' };
  const sent = await load('alerts-sent', {});
  const fresh = snapshot(m).alerts.filter((a) => !a.inAppOnly && a.level !== 'info' && !sent[a.key]);
  // Bills due tomorrow are worth an email too
  const bills = snapshot(m).alerts.filter((a) => a.key.startsWith('bill:') && a.key.endsWith(addDays(m.today, 1)) && !sent[a.key]);
  const list = [...fresh, ...bills];
  if (!list.length) return { sent: 0 };
  const html = shell(list.length === 1 ? 'Heads up' : `${list.length} things to know`,
    card(list.map((a) => `<div style="padding:6px 0;font-size:15px">${a.icon} ${esc(a.text)}</div>`).join('')));
  const r = await sendEmail(list.length === 1 ? `Ledger: ${list[0].text}` : `Ledger: ${list.length} budget alerts`, html);
  if (r.sent) {
    const now = Date.now();
    for (const a of list) sent[a.key] = now;
    // forget keys older than 120 days
    for (const [k, t] of Object.entries(sent)) if (now - t > 120 * 864e5) delete sent[k];
    await save('alerts-sent', sent);
  }
  return { sent: r.sent ? list.length : 0, ...r };
}
