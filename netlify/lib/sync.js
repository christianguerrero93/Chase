import { load, save, plaidClient, webhookUrl, localToday } from './core.js';
import { autoCategory } from './categories.js';

function normalize(t, itemId) {
  const pfc = t.personal_finance_category
    ? { primary: t.personal_finance_category.primary, detailed: t.personal_finance_category.detailed }
    : null;
  const out = {
    id: t.transaction_id,
    date: t.date,
    name: t.merchant_name || t.name,
    description: t.name,
    amount: t.amount, // Plaid: positive = money out
    account: t.account_id,
    pending: !!t.pending,
    pfc,
    source: 'plaid',
    item: itemId,
  };
  out.auto = autoCategory(out);
  return out;
}

// Pulls new / changed / removed transactions for every linked bank using
// Plaid's cursor-based /transactions/sync, then saves them.
export function accountInfo(a) {
  const debt = a.type === 'credit' || a.type === 'loan';
  return {
    name: a.official_name && a.name.length < 4 ? a.official_name : a.name,
    mask: a.mask,
    type: a.subtype || a.type,
    group: a.type,
    kind: debt ? 'debt' : 'asset',
    balance: a.balances?.current ?? null,
    available: a.balances?.available ?? null,
    limit: a.balances?.limit ?? null,
  };
}

export async function syncAll({ reason = 'manual' } = {}) {
  // Skip if another sync started in the last 2 minutes (webhook + schedule overlap)
  const lock = await load('sync-lock', null);
  if (lock && Date.now() - lock.at < 120000 && reason !== 'manual') {
    return { added: 0, modified: 0, removed: 0, errors: [], skipped: true };
  }
  await save('sync-lock', { at: Date.now(), reason });

  const client = plaidClient();
  const hook = webhookUrl();
  const items = await load('items', {});
  const txns = await load('transactions', {});
  const summary = { added: 0, modified: 0, removed: 0, errors: [] };

  for (const item of Object.values(items)) {
    const startCursor = item.cursor || undefined;
    let cursor = startCursor;
    let hasMore = true;
    let restarts = 0;
    let added = [], modified = [], removed = [];
    let failed = false;

    while (hasMore) {
      try {
        const { data } = await client.transactionsSync({
          access_token: item.access_token,
          cursor,
          count: 500,
        });
        added.push(...data.added);
        modified.push(...data.modified);
        removed.push(...data.removed);
        for (const a of data.accounts || []) {
          item.accounts = item.accounts || {};
          item.accounts[a.account_id] = accountInfo(a);
        }
        cursor = data.next_cursor;
        hasMore = data.has_more;
      } catch (err) {
        const code = err?.response?.data?.error_code;
        if (code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' && restarts++ < 3) {
          cursor = startCursor;
          added = []; modified = []; removed = [];
          hasMore = true;
          continue;
        }
        item.error = code || err.message;
        summary.errors.push({ institution: item.institution, error: item.error });
        failed = true;
        break;
      }
    }

    if (failed) continue;

    // Fresh balances for net worth (and make sure Plaid knows where to send updates)
    try {
      const { data } = await client.accountsGet({ access_token: item.access_token });
      item.accounts = item.accounts || {};
      for (const a of data.accounts) item.accounts[a.account_id] = accountInfo(a);
    } catch { /* balances are optional */ }
    if (hook && item.webhook !== hook) {
      try {
        await client.itemWebhookUpdate({ access_token: item.access_token, webhook: hook });
        item.webhook = hook;
      } catch { /* retried next sync */ }
    }

    for (const t of [...added, ...modified]) txns[t.transaction_id] = normalize(t, item.item_id);
    for (const r of removed) delete txns[r.transaction_id];
    summary.added += added.length;
    summary.modified += modified.length;
    summary.removed += removed.length;
    item.cursor = cursor;
    item.error = null;
    item.last_sync = new Date().toISOString();
  }

  await save('transactions', txns);
  await save('items', items);
  await snapshotNetWorth(items);
  await save('sync-lock', null);
  return summary;
}

// One data point per day: total assets minus total debts across linked accounts
async function snapshotNetWorth(items) {
  let assets = 0, debts = 0, any = false;
  for (const item of Object.values(items)) {
    for (const a of Object.values(item.accounts || {})) {
      if (typeof a.balance !== 'number') continue;
      any = true;
      if (a.kind === 'debt') debts += a.balance; else assets += a.balance;
    }
  }
  if (!any) return;
  const settings = await load('settings', {});
  const date = localToday(settings.timezone || 'America/New_York');
  const history = (await load('networth', [])).filter((p) => p.date !== date);
  history.push({ date, assets: Math.round(assets * 100) / 100, debts: Math.round(debts * 100) / 100 });
  await save('networth', history.slice(-1000));
}
