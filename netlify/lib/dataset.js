import { load, localToday } from './core.js';
import { CATEGORIES, NON_SPENDING, autoCategory } from './categories.js';
import { prepare, normalizeSettings } from '../../public/js/engine.js';

const STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY';
const CITIES = 'NEW YORK|NEW YORK CITY|NYC|BROOKLYN|BRONX|QUEENS|ASTORIA|FLUSHING|JAMAICA|LONG ISLAND CITY|LONG IS CITY|STATEN ISLAND|MANHATTAN|YONKERS|JERSEY CITY|HOBOKEN|NEWARK|WHITE PLAINS|SAN FRANCISCO|LOS ANGELES|MIAMI|CHICAGO|BOSTON|SEATTLE|AUSTIN';

// Turns "Card Purchase With Pin 11/14 Starbucks Store 12345 New York NY Card 4417"
// into "Starbucks Store".
export function cleanName(desc = '') {
  const name = String(desc)
    .replace(/^(RECURRING )?(CARD PURCHASE|POS PURCHASE|POS DEBIT|DEBIT CARD PURCHASE)( WITH PIN)?( RETURN)?\s+(\d{2}\/\d{2}\s+)?/i, '')
    .replace(/\b(TST\*|SQ \*|SP \*|PP\*|PAYPAL \*|DD \*|DNH\*|SPO\*)\s*/gi, '')
    .replace(/\s+CARD \d{4}\s*$/i, '')
    .replace(/\s+(PPD|WEB|CCD|TEL|ARC)\s+ID:?.*$/i, '')
    .replace(/\s+(WEB|ONLINE) PMT?\b.*$/i, '')
    .replace(/(\S)\s+\S*\.(COM|NET|ORG|CO)(\/\S*)?(?=\s|$).*$/i, '$1')
    .replace(new RegExp(`\\s+(${CITIES})?\\s*\\b(${STATES})$`, 'i'), '')
    .replace(/\s+\d{2}\/\d{2}(\/\d{2,4})?\b.*$/, '')
    .replace(/\s#?\d{3,}.*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return name || desc;
}

// Re-runs categorization on every load, so improvements to the merchant
// directory apply to transactions you already have. Older records saved
// before raw bank data was kept fall back to their previous category.
export function recategorize(t) {
  const fresh = autoCategory(t);
  const hasRaw = t.pfc || t.bankCategory || t.type;
  const previous = CATEGORIES.includes(t.auto) ? t.auto : 'Other';
  const auto = !hasRaw && fresh === 'Other' ? previous : fresh;
  const name = t.source === 'csv' ? cleanName(t.description) : t.name;
  return { ...t, name, auto };
}

// Everything the dashboard needs. Never includes Plaid access tokens.
export async function loadDataset() {
  const [txns, settings, items, networth] = await Promise.all([
    load('transactions', {}),
    load('settings', {}),
    load('items', {}),
    load('networth', []),
  ]);
  const accounts = {};
  const connections = Object.values(items).map((i) => {
    for (const [id, a] of Object.entries(i.accounts || {})) accounts[id] = { ...a, institution: i.institution };
    return {
      item_id: i.item_id,
      institution: i.institution,
      last_sync: i.last_sync || null,
      error: i.error || null,
      webhook: Boolean(i.webhook),
      accounts: Object.values(i.accounts || {}),
    };
  });
  const s = normalizeSettings(settings);
  return {
    transactions: Object.values(txns).map(recategorize),
    settings: s,
    connections,
    accounts,
    networth,
    categories: CATEGORIES,
    nonSpending: NON_SPENDING,
    today: localToday(s.timezone),
    features: {
      email: Boolean(process.env.RESEND_API_KEY && process.env.DIGEST_EMAIL),
      emailTo: process.env.DIGEST_EMAIL ? process.env.DIGEST_EMAIL.replace(/^(.).*(@.*)$/, '$1•••$2') : null,
      plaidEnv: process.env.PLAID_ENV || 'sandbox',
    },
  };
}

// Same model the browser builds, for server-side emails and alerts.
export async function loadModel() {
  return prepare(await loadDataset());
}
