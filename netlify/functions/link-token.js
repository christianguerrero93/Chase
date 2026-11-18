import { guard, json, load, plaidClient } from '../lib/core.js';

// Creates a Plaid Link token. Pass { item_id } to re-authenticate an
// existing connection (e.g. when Chase asks you to log in again).
export default guard(async (req) => {
  const body = await req.json().catch(() => ({}));
  const client = plaidClient();

  const request = {
    user: { client_user_id: 'owner' },
    client_name: 'Expense Tracker',
    country_codes: ['US'],
    language: 'en',
  };
  if (process.env.PLAID_REDIRECT_URI) request.redirect_uri = process.env.PLAID_REDIRECT_URI;

  if (body.item_id) {
    const items = await load('items', {});
    const item = items[body.item_id];
    if (!item) return json({ error: 'Unknown connection' }, 404);
    request.access_token = item.access_token; // update mode
  } else {
    request.products = ['transactions'];
    request.transactions = { days_requested: 730 };
  }

  const { data } = await client.linkTokenCreate(request);
  return json({ link_token: data.link_token });
});

export const config = { path: '/api/link-token' };
