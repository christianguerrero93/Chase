import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid/legacy';

// ---------- Storage (Netlify Blobs, private to your site) ----------
export const store = () => getStore({ name: 'expense-tracker', consistency: 'strong' });

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

// Public URL Plaid should send webhooks to (Netlify sets URL on deploys).
export function webhookUrl() {
  const base = process.env.PLAID_WEBHOOK_BASE || process.env.URL || '';
  if (!/^https:\/\//.test(base)) return null; // Plaid requires https; skipped for local dev
  return base.replace(/\/$/, '') + '/api/plaid-webhook';
}

// ---------- HTTP helpers ----------
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

// ---------- Sessions ----------
// A signed, HttpOnly cookie. The signing secret lives in Blobs and is
// rotated by "Sign out everywhere", which invalidates every session.
const COOKIE = 'ledger_session';
const SESSION_DAYS = 30;

export async function sessionSecret(rotate = false) {
  let s = await load('session-secret', null);
  if (!s || rotate) {
    s = { secret: crypto.randomBytes(32).toString('hex'), created: new Date().toISOString() };
    await save('session-secret', s);
  }
  return s.secret;
}

const sign = (value, secret) => crypto.createHmac('sha256', secret).update(value).digest('base64url');

export async function sessionCookie(req) {
  const secret = await sessionSecret();
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_DAYS * 864e5 })).toString('base64url');
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${payload}.${sign(payload, secret)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

export async function hasSession(req) {
  const raw = (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return false;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload, await sessionSecret());
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch { return false; }
}

export function passwordMatches(given) {
  const expected = process.env.APP_PASSWORD || '';
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return expected.length > 0 && crypto.timingSafeEqual(a, b);
}

// Wraps every private function: session check + readable errors.
export function guard(handler) {
  return async (req, context) => {
    if (!process.env.APP_PASSWORD) {
      return json({ error: 'APP_PASSWORD is not set in Netlify environment variables.' }, 500);
    }
    if (!(await hasSession(req))) return json({ error: 'Unauthorized' }, 401);
    // Writes must be same-origin JSON (blocks cross-site form posts)
    if (req.method !== 'GET' && !(req.headers.get('content-type') || '').includes('application/json')) {
      return json({ error: 'Expected JSON' }, 415);
    }
    return handleErrors(handler)(req, context);
  };
}

export function handleErrors(handler) {
  return async (req, context) => {
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

// Today's date in your timezone (functions run in UTC).
export function localToday(tz = 'America/New_York', date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
