import crypto from 'node:crypto';
import { json, load, save, plaidClient } from '../lib/core.js';
import { syncAll } from '../lib/sync.js';
import { sendNewAlerts, emailReady } from '../lib/email.js';

// Plaid calls this when new transactions are ready, so you don't have to
// tap Sync. Every request is checked against Plaid's signature first.
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const raw = await req.text();

  try {
    await verifyPlaidSignature(req.headers.get('plaid-verification'), raw);
  } catch (e) {
    console.warn('Rejected webhook:', e.message);
    return json({ error: 'Invalid signature' }, 401);
  }

  const body = JSON.parse(raw);
  const items = await load('items', {});
  const item = items[body.item_id];

  if (body.webhook_type === 'TRANSACTIONS' && body.webhook_code === 'SYNC_UPDATES_AVAILABLE') {
    await syncAll({ reason: 'webhook' });
    if (emailReady()) await sendNewAlerts().catch((e) => console.error(e));
  } else if (body.webhook_type === 'ITEM' && item) {
    // e.g. ITEM_LOGIN_REQUIRED / PENDING_EXPIRATION: show "Reconnect" in the app
    if (['ERROR', 'PENDING_EXPIRATION', 'PENDING_DISCONNECT'].includes(body.webhook_code)) {
      item.error = body.error?.error_code || body.webhook_code;
      await save('items', items);
    }
  }
  return json({ ok: true });
};

// Plaid signs webhooks with an ES256 JWT in the Plaid-Verification header.
// https://plaid.com/docs/api/webhooks/webhook-verification/
async function verifyPlaidSignature(token, rawBody) {
  if (!token) throw new Error('missing Plaid-Verification header');
  const [h, p, sig] = token.split('.');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  if (header.alg !== 'ES256') throw new Error('unexpected alg');

  const keys = await load('plaid-webhook-keys', {});
  let jwk = keys[header.kid];
  if (!jwk) {
    const { data } = await plaidClient().webhookVerificationKeyGet({ key_id: header.kid });
    jwk = data.key;
    keys[header.kid] = jwk;
    await save('plaid-webhook-keys', keys);
  }
  if (jwk.expired_at) throw new Error('key expired');

  const key = crypto.createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, format: 'jwk' });
  const ok = crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'));
  if (!ok) throw new Error('bad signature');

  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (Math.abs(Date.now() / 1000 - claims.iat) > 5 * 60) throw new Error('stale webhook');
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const a = Buffer.from(bodyHash), b = Buffer.from(String(claims.request_body_sha256 || ''));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('body hash mismatch');
}

export const config = { path: '/api/plaid-webhook' };
