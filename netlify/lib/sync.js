import { load, save, plaidClient } from './core.js';
import { categorizePlaid } from './categories.js';

function normalize(t, itemId) {
  return {
    id: t.transaction_id,
    date: t.date,
    name: t.merchant_name || t.name,
    description: t.name,
    amount: t.amount, // Plaid: positive = money out
    account: t.account_id,
    pending: !!t.pending,
    auto: categorizePlaid(t.personal_finance_category),
    source: 'plaid',
    item: itemId,
  };
}

// Pulls new / changed / removed transactions for every linked bank using
// Plaid's cursor-based /transactions/sync, then saves them.
export async function syncAll() {
  const client = plaidClient();
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
          item.accounts[a.account_id] = { name: a.name, mask: a.mask, type: a.subtype || a.type };
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
  return summary;
}
