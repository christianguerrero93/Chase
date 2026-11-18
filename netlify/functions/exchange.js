import { guard, json, load, save, plaidClient } from '../lib/core.js';
import { syncAll, accountInfo } from '../lib/sync.js';

// Called after you finish connecting a bank in Plaid Link.
// Swaps the one-time public token for a permanent access token that is
// stored server-side only (never sent to the browser).
export default guard(async (req) => {
  const { public_token, institution } = await req.json();
  if (!public_token) return json({ error: 'Missing public_token' }, 400);

  const client = plaidClient();
  const { data } = await client.itemPublicTokenExchange({ public_token });

  const accounts = {};
  try {
    const res = await client.accountsGet({ access_token: data.access_token });
    for (const a of res.data.accounts) {
      accounts[a.account_id] = accountInfo(a);
    }
  } catch { /* accounts also arrive with the first sync */ }

  const items = await load('items', {});
  items[data.item_id] = {
    item_id: data.item_id,
    access_token: data.access_token,
    institution: institution?.name || 'Bank',
    cursor: null,
    accounts,
    linked_at: new Date().toISOString(),
  };
  await save('items', items);

  const summary = await syncAll();
  return json({ ok: true, summary });
});

export const config = { path: '/api/exchange' };
