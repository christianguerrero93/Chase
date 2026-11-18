import crypto from 'node:crypto';
import { guard, json, load, save, plaidClient } from '../lib/core.js';
import { CATEGORIES, NON_SPENDING, autoCategory } from '../lib/categories.js';

const DEFAULT_SETTINGS = { budgets: {}, overrides: {}, rules: [] };

// GET  /api/data  -> everything the dashboard needs (no access tokens)
// POST /api/data  -> { action, ... } for edits
export default guard(async (req) => {
  if (req.method === 'GET') {
    const [txns, settings, items] = await Promise.all([
      load('transactions', {}),
      load('settings', DEFAULT_SETTINGS),
      load('items', {}),
    ]);
    const accounts = {};
    const connections = Object.values(items).map((i) => {
      Object.assign(accounts, i.accounts || {});
      return {
        item_id: i.item_id,
        institution: i.institution,
        last_sync: i.last_sync || null,
        error: i.error || null,
        accounts: Object.values(i.accounts || {}),
      };
    });
    return json({
      transactions: Object.values(txns).map(recategorize),
      settings: { ...DEFAULT_SETTINGS, ...settings },
      connections,
      accounts,
      categories: CATEGORIES,
      nonSpending: NON_SPENDING,
    });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const body = await req.json();
  const settings = { ...DEFAULT_SETTINGS, ...(await load('settings', DEFAULT_SETTINGS)) };

  switch (body.action) {
    case 'setOverride': {
      if (body.category) settings.overrides[body.id] = body.category;
      else delete settings.overrides[body.id];
      break;
    }
    case 'addRule': {
      const match = String(body.match || '').trim();
      if (!match || !CATEGORIES.includes(body.category)) return json({ error: 'Invalid rule' }, 400);
      settings.rules = settings.rules.filter((r) => r.match.toLowerCase() !== match.toLowerCase());
      settings.rules.unshift({ match, category: body.category });
      break;
    }
    case 'deleteRule': {
      settings.rules.splice(Number(body.index), 1);
      break;
    }
    case 'setBudget': {
      const amt = Number(body.amount);
      if (amt > 0) settings.budgets[body.category] = Math.round(amt * 100) / 100;
      else delete settings.budgets[body.category];
      break;
    }
    case 'importCsv':
      return json(await importCsv(body));
    case 'deleteImported': {
      const txns = await load('transactions', {});
      let n = 0;
      for (const [id, t] of Object.entries(txns)) {
        if (t.source === 'csv' && t.account === body.account) { delete txns[id]; n++; }
      }
      await save('transactions', txns);
      return json({ ok: true, deleted: n });
    }
    case 'removeConnection': {
      const items = await load('items', {});
      const item = items[body.item_id];
      if (!item) return json({ error: 'Unknown connection' }, 404);
      try { await plaidClient().itemRemove({ access_token: item.access_token }); } catch { /* still remove locally */ }
      delete items[body.item_id];
      const txns = await load('transactions', {});
      if (body.deleteTransactions) {
        for (const [id, t] of Object.entries(txns)) if (t.item === body.item_id) delete txns[id];
        await save('transactions', txns);
      }
      await save('items', items);
      return json({ ok: true });
    }
    default:
      return json({ error: 'Unknown action' }, 400);
  }

  await save('settings', settings);
  return json({ ok: true, settings });
});

// rows: [{ date:'YYYY-MM-DD', description, amount (positive = out), category, type }]
async function importCsv({ rows, account }) {
  if (!Array.isArray(rows) || !rows.length) return { error: 'No rows to import' };
  const label = String(account || 'Chase CSV').slice(0, 60);
  const txns = await load('transactions', {});
  const seen = {};
  let added = 0;

  for (const r of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(r.amount)) continue;
    const base = `${label}|${r.date}|${r.description}|${r.amount}`;
    seen[base] = (seen[base] || 0) + 1; // keep same-day duplicates distinct
    const id = 'csv_' + crypto.createHash('sha1').update(`${base}|${seen[base]}`).digest('hex').slice(0, 20);
    if (!txns[id]) added++;
    const t = {
      id,
      date: r.date,
      name: cleanName(r.description),
      description: r.description,
      amount: Math.round(r.amount * 100) / 100,
      account: label,
      pending: false,
      bankCategory: String(r.category || '').slice(0, 60),
      type: String(r.type || '').slice(0, 40),
      source: 'csv',
    };
    t.auto = autoCategory(t);
    txns[id] = t;
  }
  await save('transactions', txns);
  return { ok: true, added, total: rows.length };
}

// Re-runs categorization on every load, so improvements to the merchant
// directory apply to transactions you already have. Older records saved
// before raw bank data was kept fall back to their previous category.
function recategorize(t) {
  const fresh = autoCategory(t);
  const hasRaw = t.pfc || t.bankCategory || t.type;
  const previous = CATEGORIES.includes(t.auto) ? t.auto : 'Other';
  const auto = !hasRaw && fresh === 'Other' ? previous : fresh;
  const name = t.source === 'csv' ? cleanName(t.description) : t.name;
  return { ...t, name, auto };
}

const STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY';
const CITIES = 'NEW YORK|NEW YORK CITY|NYC|BROOKLYN|BRONX|QUEENS|ASTORIA|FLUSHING|JAMAICA|LONG ISLAND CITY|LONG IS CITY|STATEN ISLAND|MANHATTAN|YONKERS|JERSEY CITY|HOBOKEN|NEWARK|WHITE PLAINS|SAN FRANCISCO|LOS ANGELES|MIAMI|CHICAGO|BOSTON|SEATTLE|AUSTIN';

function cleanName(desc = '') {
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

export const config = { path: '/api/data' };
