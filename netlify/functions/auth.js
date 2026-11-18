import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import {
  json, load, save, handleErrors, hasSession, sessionCookie, clearCookie, sessionSecret, passwordMatches,
} from '../lib/core.js';

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

// Routes:
//   GET  /api/auth/session            -> { authenticated, passkeys }
//   POST /api/auth/login              -> password sign-in (locks after 5 misses)
//   POST /api/auth/logout
//   POST /api/auth/signout-all        -> invalidates every session
//   POST /api/auth/passkey/login-options | login-verify
//   POST /api/auth/passkey/register-options | register-verify | delete   (signed in)
export default handleErrors(async (req) => {
  if (!process.env.APP_PASSWORD) return json({ error: 'APP_PASSWORD is not set in Netlify environment variables.' }, 500);
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/auth\/?/, '');
  const rp = { id: url.hostname, origin: url.origin };
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const passkeys = await load('passkeys', []);

  if (route === 'session') {
    return json({ authenticated: await hasSession(req), passkeys: passkeys.length });
  }

  if (route === 'login') {
    const lock = await load('auth-lock', { fails: 0, until: 0 });
    if (lock.until > Date.now()) {
      const mins = Math.ceil((lock.until - Date.now()) / 60000);
      return json({ error: `Too many attempts. Try again in ${mins} minute${mins > 1 ? 's' : ''}.` }, 429);
    }
    if (!passwordMatches(body.password)) {
      lock.fails += 1;
      if (lock.fails >= MAX_FAILS) { lock.until = Date.now() + LOCK_MINUTES * 60000; lock.fails = 0; }
      await save('auth-lock', lock);
      return json({ error: 'Wrong password' }, 401);
    }
    await save('auth-lock', { fails: 0, until: 0 });
    return json({ ok: true }, 200, { 'set-cookie': await sessionCookie(req) });
  }

  if (route === 'logout') return json({ ok: true }, 200, { 'set-cookie': clearCookie });

  // ---- Passkey sign-in (public) ----
  if (route === 'passkey/login-options') {
    if (!passkeys.length) return json({ error: 'No passkeys set up yet' }, 400);
    const options = await generateAuthenticationOptions({
      rpID: rp.id,
      allowCredentials: passkeys.map((p) => ({ id: p.id, transports: p.transports })),
      userVerification: 'preferred',
    });
    await save('auth-challenge', { challenge: options.challenge, exp: Date.now() + 5 * 60000 });
    return json(options);
  }

  if (route === 'passkey/login-verify') {
    const ch = await load('auth-challenge', null);
    await save('auth-challenge', null);
    if (!ch || ch.exp < Date.now()) return json({ error: 'Passkey request expired, try again' }, 400);
    const pk = passkeys.find((p) => p.id === body.response?.id);
    if (!pk) return json({ error: 'Unknown passkey' }, 401);
    const result = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: ch.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      credential: { id: pk.id, publicKey: Buffer.from(pk.publicKey, 'base64url'), counter: pk.counter, transports: pk.transports },
    });
    if (!result.verified) return json({ error: 'Passkey not verified' }, 401);
    pk.counter = result.authenticationInfo.newCounter;
    pk.lastUsed = new Date().toISOString();
    await save('passkeys', passkeys);
    return json({ ok: true }, 200, { 'set-cookie': await sessionCookie(req) });
  }

  // ---- Everything below requires being signed in ----
  if (!(await hasSession(req))) return json({ error: 'Unauthorized' }, 401);

  if (route === 'signout-all') {
    await sessionSecret(true);
    return json({ ok: true }, 200, { 'set-cookie': clearCookie });
  }

  if (route === 'passkeys') {
    return json(passkeys.map(({ id, name, created, lastUsed }) => ({ id, name, created, lastUsed })));
  }

  if (route === 'passkey/register-options') {
    const options = await generateRegistrationOptions({
      rpName: 'Ledger',
      rpID: rp.id,
      userName: 'owner',
      userDisplayName: 'Ledger owner',
      userID: new TextEncoder().encode('ledger-owner'),
      attestationType: 'none',
      excludeCredentials: passkeys.map((p) => ({ id: p.id, transports: p.transports })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    await save('auth-challenge', { challenge: options.challenge, exp: Date.now() + 5 * 60000 });
    return json(options);
  }

  if (route === 'passkey/register-verify') {
    const ch = await load('auth-challenge', null);
    await save('auth-challenge', null);
    if (!ch || ch.exp < Date.now()) return json({ error: 'Passkey request expired, try again' }, 400);
    const result = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: ch.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
    });
    if (!result.verified) return json({ error: 'Passkey not verified' }, 400);
    const c = result.registrationInfo.credential;
    passkeys.push({
      id: c.id,
      publicKey: Buffer.from(c.publicKey).toString('base64url'),
      counter: c.counter,
      transports: c.transports || [],
      name: String(body.name || 'Passkey').slice(0, 40),
      created: new Date().toISOString(),
    });
    await save('passkeys', passkeys);
    return json({ ok: true });
  }

  if (route === 'passkey/delete') {
    await save('passkeys', passkeys.filter((p) => p.id !== body.id));
    return json({ ok: true });
  }

  return json({ error: 'Not found' }, 404);
});

export const config = { path: ['/api/auth/*'] };
