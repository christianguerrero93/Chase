import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid/legacy';

// ---------- Storage (Netlify Blobs, private to your site) ----------
const store = () => getStore({ name: 'expense-tracker', consistency: 'strong' });

export async function load(key, fallback) {
  const value = await store().get(key, { type: 'json' });
  return value ?? fallback;
}

export async function save(key, value) {
  await store().setJSON(key, value);
}

// ---------- Plaid ----------
export function plaidClient() {
  const env = process.env.PLAID_ENV || 'sandbox';
  if (!PlaidEnvironments[env]) throw new Error(`PLAID_ENV must be "sandbox" or "production" (got "${env}")`);
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    throw new Error('PLAID_CLIENT_ID and PLAID_SECRET must be set in Netlify environment variables.');
  }
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
          'PLAID-SECRET': process.env.PLAID_SECRET,
        },
      },
    })
  );
}

// ---------- HTTP helpers ----------
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function passwordOk(req) {
  const expected = process.env.APP_PASSWORD || '';
  const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// Wraps every function: password check + readable errors.
export function guard(handler) {
  return async (req, context) => {
    if (!process.env.APP_PASSWORD) {
      return json({ error: 'APP_PASSWORD is not set in Netlify environment variables.' }, 500);
    }
    if (!passwordOk(req)) return json({ error: 'Unauthorized' }, 401);
    try {
      return await handler(req, context);
    } catch (err) {
      const plaidErr = err?.response?.data;
      console.error(plaidErr || err);
      return json(
        { error: plaidErr?.error_message || err.message || 'Server error', code: plaidErr?.error_code },
        500
      );
    }
  };
}
