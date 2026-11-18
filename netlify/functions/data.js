import crypto from 'node:crypto';
import { guard, json, load, save, plaidClient } from '../lib/core.js';
import { CATEGORIES, NON_SPENDING, categorizeChase } from '../lib/categories.js';

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
      transactions: Object.values(txns),
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
    txns[id] = {
      id,
      date: r.date,
      name: cleanName(r.description),
      description: r.description,
      amount: Math.round(r.amount * 100) / 100,
      account: label,
      pending: false,
      auto: categorizeChase(r),
      source: 'csv',
    };
  }
  await save('transactions', txns);
  return { ok: true, added, total: rows.length };
}

function cleanName(desc = '') {
  return desc
    .replace(/\s{2,}/g, ' ')
    .replace(/\b(TST\*|SQ \*|SP \*|PP\*|PAYPAL \*)/gi, '')
    .replace(/\s#?\d{3,}.*$/, '')
    .trim() || desc;
}

export const config = { path: '/api/data' };
