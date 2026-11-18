import crypto from 'node:crypto';
import { guard, json, load, save, plaidClient } from '../lib/core.js';
import { CATEGORIES, autoCategory } from '../lib/categories.js';
import { loadDataset, cleanName } from '../lib/dataset.js';
import { normalizeSettings } from '../../public/js/engine.js';

const ENTRY_KEYS = ['splits', 'notes', 'rollover', 'recurring', 'budgets', 'overrides'];
const SETTING_KEYS = ['plan', 'weeklyCaps', 'sinking', 'goals', 'needs', 'email', 'timezone'];
const isCat = (c) => CATEGORIES.includes(c);
const money = (n) => Math.round(Number(n) * 100) / 100;
const id = () => crypto.randomBytes(6).toString('hex');

// GET  /api/data  -> everything the dashboard needs (no access tokens)
// POST /api/data  -> { action, ... } for edits
export default guard(async (req) => {
  if (req.method === 'GET') return json(await loadDataset());
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const body = await req.json();
  const settings = normalizeSettings(await load('settings', {}));

  switch (body.action) {
    case 'setOverride': {
      if (body.category && isCat(body.category)) settings.overrides[body.id] = body.category;
      else delete settings.overrides[body.id];
      break;
    }
    case 'addRule': {
      const match = String(body.match || '').trim().slice(0, 80);
      if (!match || !isCat(body.category)) return json({ error: 'Invalid rule' }, 400);
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
      if (amt > 0 && isCat(body.category)) settings.budgets[body.category] = money(amt);
      else delete settings.budgets[body.category];
      break;
    }
    // One entry in a keyed map, e.g. a note on a transaction. value null deletes.
    case 'setEntry': {
      if (!ENTRY_KEYS.includes(body.key) || !body.id) return json({ error: 'Invalid entry' }, 400);
      const v = cleanEntry(body.key, body.value);
      if (v === undefined) return json({ error: 'Invalid value' }, 400);
      if (v === null) delete settings[body.key][body.id];
      else settings[body.key][body.id] = v;
      break;
    }
    // A whole setting, e.g. the monthly plan or the list of goals.
    case 'setSetting': {
      if (!SETTING_KEYS.includes(body.key)) return json({ error: 'Invalid setting' }, 400);
      const v = cleanSetting(body.key, body.value);
      if (v === undefined) return json({ error: 'Invalid value' }, 400);
      settings[body.key] = v;
      break;
    }
    case 'importCsv':
      return json(await importCsv(body));
    case 'deleteImported': {
      const txns = await load('transactions', {});
      let n = 0;
      for (const [tid, t] of Object.entries(txns)) {
        if (t.source === 'csv' && t.account === body.account) { delete txns[tid]; n++; }
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
        for (const [tid, t] of Object.entries(txns)) if (t.item === body.item_id) delete txns[tid];
        await save('transactions', txns);
      }
      await save('items', items);
      return json({ ok: true });
    }
    default:
      return json({ error: 'Unknown action' }, 400);
  }

  if (JSON.stringify(settings).length > 900_000) return json({ error: 'Settings too large' }, 413);
  await save('settings', settings);
  return json({ ok: true, settings });
});

// ---- validation: returns cleaned value, null to delete, undefined if invalid
function cleanEntry(key, v) {
  if (v === null || v === '' || v === undefined) return null;
  switch (key) {
    case 'notes': return String(v).slice(0, 500);
    case 'rollover': return /^\d{4}-\d{2}$/.test(v) ? v : undefined;
    case 'recurring': return ['keep', 'cancel', 'ignore'].includes(v) ? v : undefined;
    case 'budgets': return Number(v) > 0 ? money(v) : null;
    case 'overrides': return isCat(v) ? v : undefined;
    case 'splits': {
      if (!Array.isArray(v) || v.length < 2 || v.length > 8) return undefined;
      const parts = v.map((p) => ({ category: p.category, amount: money(p.amount) }));
      return parts.every((p) => isCat(p.category) && Number.isFinite(p.amount)) ? parts : undefined;
    }
  }
  return undefined;
}

function cleanSetting(key, v) {
  const str = (x, n = 60) => String(x ?? '').slice(0, n);
  const ym = (x) => (/^\d{4}-\d{2}$/.test(x) ? x : undefined);
  const day = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x) ? x : undefined);
  switch (key) {
    case 'plan':
      return { income: Math.max(0, money(v?.income || 0)), savingsTarget: Math.max(0, money(v?.savingsTarget || 0)) };
    case 'weeklyCaps':
      if (!Array.isArray(v)) return undefined;
      return v.slice(0, 10).map((c) => ({
        id: str(c.id, 20) || id(), name: str(c.name) || 'Weekly cap',
        amount: Math.max(0, money(c.amount || 0)), categories: (c.categories || []).filter(isCat),
      }));
    case 'sinking':
      if (!Array.isArray(v)) return undefined;
      return v.slice(0, 30).map((f) => ({
        id: str(f.id, 20) || id(), name: str(f.name) || 'Set-aside', annual: Math.max(0, money(f.annual || 0)),
        category: isCat(f.category) ? f.category : null, start: ym(f.start) || null,
      }));
    case 'goals':
      if (!Array.isArray(v)) return undefined;
      return v.slice(0, 30).map((g) => ({
        id: str(g.id, 20) || id(), name: str(g.name) || 'Goal', target: Math.max(0, money(g.target || 0)),
        date: day(g.date) || null, emoji: str(g.emoji, 8) || '🎯',
        contributions: (g.contributions || []).slice(-500)
          .map((c) => ({ date: day(c.date), amount: money(c.amount) }))
          .filter((c) => c.date && Number.isFinite(c.amount)),
      }));
    case 'needs':
      return Array.isArray(v) ? v.filter(isCat) : undefined;
    case 'email':
      return { weekly: Boolean(v?.weekly), alerts: Boolean(v?.alerts) };
    case 'timezone':
      try { new Intl.DateTimeFormat('en-US', { timeZone: v }); return str(v, 60); } catch { return undefined; }
  }
  return undefined;
}

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

export const config = { path: '/api/data' };
