import { esc, money0, icon, color } from '../ui.js';

// Settings: accounts, sign-in, email, rules, needs vs wants, data.
let passkeyList = null;

export function render(ctx) {
  const { m, data } = ctx;
  const s = m.settings;
  const csvAccounts = [...new Set(data.transactions.filter((t) => t.source === 'csv').map((t) => t.account))];
  const f = data.features || {};

  const conns = data.connections.map((c) => `<div class="conn">
    <div class="grow"><div><strong>🏦 ${esc(c.institution)}</strong> ${c.webhook ? '<span class="tag">auto-sync</span>' : ''}</div>
      ${c.accounts.map((a) => `<div class="acct"><span>${esc(a.name)} ••${esc(a.mask || '')} <span class="muted small">${esc(a.type || '')}</span></span>
        <b class="num ${a.kind === 'debt' ? 'bad' : ''}">${typeof a.balance === 'number' ? (a.kind === 'debt' ? '−' : '') + money0(a.balance) : ''}</b></div>`).join('')}
      <div class="muted small">${c.last_sync ? 'Synced ' + new Date(c.last_sync).toLocaleString() : 'Not synced yet'}</div>
      ${c.error ? `<div class="bad small">${esc(c.error)}${c.error === 'ITEM_LOGIN_REQUIRED' || c.error === 'PENDING_EXPIRATION' ? ' · Chase needs you to log in again' : ''}</div>` : ''}</div>
    <div class="col-btns">${c.error ? `<button class="btn" data-reconnect="${esc(c.item_id)}">Reconnect</button>` : ''}
      <button class="link-btn danger" data-remove="${esc(c.item_id)}">Remove</button></div></div>`).join('');
  const csv = csvAccounts.map((a) => `<div class="conn"><div class="grow"><strong>📄 ${esc(a)}</strong>
    <div class="muted small">CSV import · ${data.transactions.filter((t) => t.account === a).length} transactions</div></div>
    <button class="link-btn danger" data-delcsv="${esc(a)}">Delete</button></div>`).join('');

  return `<div class="wrap page">
    <div class="page-head"><h1>Settings</h1></div>

    <section class="card"><div class="card-head"><h2>Accounts</h2>
      <div class="row-btns"><button class="btn primary" data-connect>+ Connect a bank</button>
      <label class="btn"><input type="file" id="csvFile" accept=".csv,.CSV" multiple hidden>⬆ Import CSV</label></div></div>
      <p class="muted small">Connect Chase plus any other bank (e.g. Capital One) so totals are complete. Plaid ${esc(f.plaidEnv || '')} mode.</p>
      ${conns + csv || '<p class="muted">No accounts yet.</p>'}
      ${data.connections.length ? '<button class="btn" data-action="sync">↻ Sync now</button>' : ''}
    </section>

    <section class="card"><div class="card-head"><h2>Sign-in & security</h2></div>
      <div class="setting"><div><b>Passkeys</b><div class="muted small">Sign in with Face ID, Touch ID or your phone's screen lock instead of typing your password.</div>
        <div id="pkList" class="small">${passkeyList ? passkeyList.map((p) => `<div class="row">🔑 ${esc(p.name)} <span class="muted">added ${new Date(p.created).toLocaleDateString()}</span>
          <button class="link-btn danger" data-delpk="${esc(p.id)}">Remove</button></div>`).join('') || '<span class="muted">None yet</span>' : '<span class="muted">Loading…</span>'}</div></div>
        <button class="btn" data-addpk ${window.PublicKeyCredential ? '' : 'disabled title="This browser does not support passkeys"'}>Add passkey</button></div>
      <div class="setting"><div><b>Sign out everywhere</b><div class="muted small">Ends every session on every device, including this one.</div></div>
        <button class="btn danger" data-signout-all>Sign out all</button></div>
    </section>

    <section class="card"><div class="card-head"><h2>Email</h2></div>
      ${f.email ? `<p class="muted small">Sending to ${esc(f.emailTo)}.</p>` : `<p class="small warn">Email isn't set up yet. Add <code>RESEND_API_KEY</code> and <code>DIGEST_EMAIL</code> in Netlify (see README), then redeploy.</p>`}
      <label class="setting"><div><b>Monday summary</b><div class="muted small">Last week's spending, what's safe to spend, bills coming up, caps reset.</div></div>
        <input type="checkbox" class="switch" id="emWeekly" ${s.email.weekly ? 'checked' : ''}></label>
      <label class="setting"><div><b>Alerts</b><div class="muted small">When a budget or weekly cap hits 85% or goes over, a price goes up, or a bill is due tomorrow. Each alert is sent once.</div></div>
        <input type="checkbox" class="switch" id="emAlerts" ${s.email.alerts ? 'checked' : ''}></label>
      ${f.email ? '<button class="btn" data-test-email>Send me the weekly summary now</button>' : ''}
    </section>

    <section class="card"><div class="card-head"><h2>Needs vs wants</h2></div>
      <p class="muted small">Tap to mark what counts as a need. Everything else is a want. Used for no-spend days and the Insights split.</p>
      <div class="cat-picks">${data.categories.filter((c) => m.isSpending(c)).map((c) =>
        `<label class="pick ${s.needs.includes(c) ? 'on' : ''}" style="--c:${color(c)}"><input type="checkbox" data-need value="${esc(c)}" ${s.needs.includes(c) ? 'checked' : ''}>${icon(c)} ${esc(c)}</label>`).join('')}</div>
    </section>

    <section class="card"><div class="card-head"><h2>Your rules</h2></div>
      <p class="muted small">Change a transaction's category and tap “Always” to make a rule.</p>
      ${s.rules.map((r, i) => `<div class="rule"><span>“${esc(r.match)}” → ${icon(r.category)} <b>${esc(r.category)}</b></span><button class="link-btn danger" data-rule="${i}">Delete</button></div>`).join('') || '<p class="muted small">No rules yet.</p>'}
    </section>

    <section class="card"><div class="card-head"><h2>Your data</h2></div>
      <div class="row-btns"><button class="btn" data-export-csv>⬇ All transactions (CSV)</button><button class="btn" data-backup>⬇ Full backup (JSON)</button></div>
      <label class="field">Time zone<input id="tz" value="${esc(s.timezone)}"></label>
    </section>
  </div>`;
}

export function bind(ctx, root) {
  const { save, post, toast } = ctx;
  if (passkeyList === null) ctx.api('/auth/passkeys').then((l) => { passkeyList = l; ctx.render(); }).catch(() => { passkeyList = []; });

  root.querySelector('[data-connect]').addEventListener('click', () => ctx.connectBank().catch((e) => toast(e.message)));
  root.querySelector('#csvFile').addEventListener('change', async (e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) await ctx.importFiles(files); });
  root.querySelectorAll('[data-reconnect]').forEach((b) => b.addEventListener('click', () => ctx.connectBank(b.dataset.reconnect).catch((e) => toast(e.message))));
  root.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Disconnect this bank? This revokes access at Plaid.')) return;
    const wipe = confirm('Also delete its transactions from Ledger? (Cancel keeps them.)');
    await post('/data', { action: 'removeConnection', item_id: b.dataset.remove, deleteTransactions: wipe });
    await ctx.reload(); toast('Disconnected');
  }));
  root.querySelectorAll('[data-delcsv]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`Delete all transactions imported for ${b.dataset.delcsv}?`)) return;
    const r = await post('/data', { action: 'deleteImported', account: b.dataset.delcsv });
    await ctx.reload(); toast(`Deleted ${r.deleted} transactions`);
  }));

  root.querySelector('[data-addpk]').addEventListener('click', async () => {
    try { await ctx.passkeys.register(); passkeyList = null; toast('🔑 Passkey added'); ctx.render(); }
    catch (e) { toast(e.name === 'NotAllowedError' ? 'Passkey cancelled' : e.message); }
  });
  root.querySelectorAll('[data-delpk]').forEach((b) => b.addEventListener('click', async () => {
    await post('/auth/passkey/delete', { id: b.dataset.delpk }); passkeyList = null; ctx.render();
  }));
  root.querySelector('[data-signout-all]').addEventListener('click', async () => {
    if (!confirm('Sign out of Ledger on every device?')) return;
    await post('/auth/signout-all'); location.reload();
  });

  const saveEmail = () => save({ action: 'setSetting', key: 'email', value: { weekly: root.querySelector('#emWeekly').checked, alerts: root.querySelector('#emAlerts').checked } });
  root.querySelector('#emWeekly').addEventListener('change', saveEmail);
  root.querySelector('#emAlerts').addEventListener('change', saveEmail);
  root.querySelector('[data-test-email]')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await post('/email-test'); toast('📬 Sent. Check your inbox (and spam the first time).'); } catch (err) { toast(err.message); }
    e.target.disabled = false;
  });

  root.querySelectorAll('[data-need]').forEach((i) => i.addEventListener('change', () =>
    save({ action: 'setSetting', key: 'needs', value: [...root.querySelectorAll('[data-need]:checked')].map((x) => x.value) })));
  root.querySelectorAll('[data-rule]').forEach((b) => b.addEventListener('click', () => save({ action: 'deleteRule', index: Number(b.dataset.rule) })));
  root.querySelector('[data-export-csv]').addEventListener('click', () => ctx.exportCsv());
  root.querySelector('[data-backup]').addEventListener('click', () => ctx.exportBackup());
  root.querySelector('#tz').addEventListener('change', (e) => save({ action: 'setSetting', key: 'timezone', value: e.target.value.trim() })
    .then(() => toast('Time zone saved')).catch((err) => toast(err.message)));
}
