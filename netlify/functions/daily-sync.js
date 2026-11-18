import { syncAll } from '../lib/sync.js';
import { load } from '../lib/core.js';
import { sendNewAlerts, emailReady } from '../lib/email.js';

// Runs every morning: pulls new transactions, then emails any new alerts.
export default async () => {
  const items = await load('items', {});
  const result = {};
  if (Object.keys(items).length && process.env.PLAID_CLIENT_ID) {
    try { result.sync = await syncAll({ reason: 'daily' }); } catch (e) { result.syncError = e.message; }
  }
  if (emailReady()) {
    try { result.alerts = await sendNewAlerts(); } catch (e) { result.alertError = e.message; }
  }
  console.log('daily-sync', JSON.stringify(result));
  return new Response('ok');
};

// 11:00 UTC = 6 or 7am New York time
export const config = { schedule: '0 11 * * *' };
