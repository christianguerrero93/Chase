// Chase CSV import (credit card and checking/savings exports).

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQ = false;
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const toIso = (mdy) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((mdy || '').trim());
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
};

export function chaseRows(text) {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length < 2) throw new Error('CSV looks empty');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => head.indexOf(name);
  const iDate = col('transaction date') >= 0 ? col('transaction date') : col('posting date');
  const iDesc = col('description');
  const iAmt = col('amount');
  const iCat = col('category');
  const iType = col('type');
  if (iDate < 0 || iDesc < 0 || iAmt < 0) throw new Error('Not a Chase CSV (need Date, Description and Amount columns)');
  return rows.slice(1).map((r) => ({
    date: toIso(r[iDate]),
    description: (r[iDesc] || '').trim(),
    amount: -Number(String(r[iAmt]).replace(/[$,\s]/g, '')), // Chase: negative = money out
    category: iCat >= 0 ? (r[iCat] || '').trim() : '',
    type: iType >= 0 ? (r[iType] || '').trim() : '',
  })).filter((r) => r.date && Number.isFinite(r.amount));
}

export function accountFromFilename(name) {
  const m = /Chase(\d{4})/i.exec(name);
  return m ? `Chase ••${m[1]}` : name.replace(/\.csv$/i, '');
}
