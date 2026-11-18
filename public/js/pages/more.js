import { money0 } from '../ui.js';

// Phone-only menu for pages that don't fit in the tab bar.
export function render(ctx) {
  const { snap } = ctx;
  const active = snap.rec.filter((r) => r.active).length;
  const goals = snap.goals.length;
  const link = (href, emoji, title, sub) => `<a class="more-link" href="${href}"><span class="e">${emoji}</span><div class="grow"><b>${title}</b><div class="muted small">${sub}</div></div><span class="muted">›</span></a>`;
  return `<div class="wrap page"><div class="page-head"><h1>More</h1></div>
    <section class="card more-list">
      ${link('#/bills', '🗓️', 'Bills & subscriptions', `${active} recurring · ${money0(snap.rec.filter((r) => r.active).reduce((s, r) => s + r.annual, 0))}/yr`)}
      ${link('#/goals', '🎯', 'Goals', goals ? `${goals} goal${goals > 1 ? 's' : ''}` : 'Emergency fund, trips, big buys')}
      ${link('#/settings', '⚙️', 'Settings', 'Accounts, passkeys, email, data')}
    </section>
    <section class="card more-list">
      <button class="more-link" data-action="sync"><span class="e">↻</span><div class="grow"><b>Sync now</b></div></button>
      <button class="more-link" data-action="lock"><span class="e">🔒</span><div class="grow"><b>Lock</b></div></button>
    </section></div>`;
}
