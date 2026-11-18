import { load } from '../lib/core.js';
import { buildWeeklyDigest, sendEmail, emailReady } from '../lib/email.js';

// Monday morning summary of the week that just ended (weeks run Mon to Sun).
export default async () => {
  const settings = await load('settings', {});
  if (!emailReady() || settings.email?.weekly === false) return new Response('skipped');
  const { subject, html } = await buildWeeklyDigest();
  await sendEmail(subject, html);
  return new Response('sent');
};

// 13:30 UTC Monday = 8:30 or 9:30am New York time
export const config = { schedule: '30 13 * * 1' };
