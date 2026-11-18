import { guard, json } from '../lib/core.js';
import { buildWeeklyDigest, sendEmail, emailReady } from '../lib/email.js';

// POST /api/email-test -> sends the weekly summary now, so you can see it.
export default guard(async () => {
  if (!emailReady()) return json({ error: 'Add RESEND_API_KEY and DIGEST_EMAIL in Netlify first.' }, 400);
  const { subject, html } = await buildWeeklyDigest();
  await sendEmail(subject, html);
  return json({ ok: true });
});

export const config = { path: '/api/email-test' };
