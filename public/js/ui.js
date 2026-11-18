// Shared UI helpers: formatting, category colors/icons, small SVG charts.

export const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const fmt0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const money = (n) => fmt.format(n || 0);
export const money0 = (n) => fmt0.format(n || 0);
export const pct = (x) => `${Math.round((x || 0) * 100)}%`;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const META = {
  Groceries: ['#16a34a', '🛒'], Dining: ['#ea580c', '🍽️'], Coffee: ['#92400e', '☕'],
  'Food Delivery': ['#f97316', '🛵'], Shopping: ['#db2777', '🛍️'], Clothing: ['#c026d3', '👟'],
  Transportation: ['#0891b2', '🚇'], Gas: ['#475569', '⛽'], Travel: ['#0284c7', '✈️'],
  Rent: ['#4f46e5', '🏠'], 'Bills & Utilities': ['#ca8a04', '💡'], 'Phone & Internet': ['#6366f1', '📶'],
  Insurance: ['#64748b', '🛡️'], Subscriptions: ['#7c3aed', '🔁'], Entertainment: ['#e11d48', '🎟️'],
  Fitness: ['#059669', '🏋️'], Health: ['#dc2626', '💊'], 'Personal Care': ['#ec4899', '💈'],
  Home: ['#a16207', '🛋️'], Pets: ['#b45309', '🐾'], Education: ['#2563eb', '🎓'],
  'Gifts & Donations': ['#be185d', '🎁'], 'Venmo & Zelle': ['#0ea5e9', '💸'], 'Cash & ATM': ['#15803d', '🏧'],
  Fees: ['#b91c1c', '⚠️'], 'Debt Payments': ['#7f1d1d', '🏦'], Other: ['#94a3b8', '❔'],
  Income: ['#059669', '💰'], Transfer: ['#64748b', '🔄'], 'Credit Card Payment': ['#334155', '💳'],
};
export const color = (c) => (META[c] || META.Other)[0];
export const icon = (c) => (META[c] || META.Other)[1];
export const chip = (c, size = '') => `<span class="chip ${size}" style="--c:${color(c)}">${icon(c)}</span>`;

export function monthName(ym, short = false) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', short ? { month: 'short' } : { month: 'long', year: 'numeric' });
}
export function dayLabel(iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', opts);
}
export const shortDate = (iso) => dayLabel(iso, { month: 'short', day: 'numeric' });

export function categoryOptions(categories, selected) {
  return categories.map((c) => `<option value="${esc(c)}"${c === selected ? ' selected' : ''}>${icon(c)} ${esc(c)}</option>`).join('');
}

// ---------- charts (SVG, no libraries) ----------
export function ring(value, { size = 150, stroke = 12, color: col = '#60a5fa', track = 'rgba(255,255,255,.14)', label = '', sub = '', textColor = '#fff', subColor = 'rgba(255,255,255,.75)' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, mid = size / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)} ${esc(sub)}">
    <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
    <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${Math.min(Math.max(value, 0), 1) * c} ${c}" transform="rotate(-90 ${mid} ${mid})"/>
    <text x="${mid}" y="${mid - 2}" text-anchor="middle" fill="${textColor}" font-size="${size / 6}" font-weight="800">${esc(label)}</text>
    <text x="${mid}" y="${mid + size / 8}" text-anchor="middle" fill="${subColor}" font-size="${size / 13}">${esc(sub)}</text>
  </svg>`;
}

export function donut(entries, total, { size = 200, center = '', sub = '' } = {}) {
  const r = size / 2 - 20, circ = 2 * Math.PI * r, mid = size / 2;
  let offset = 0;
  const segs = total > 0 ? entries.map(([c, v, col]) => {
    const len = (v / total) * circ, gap = entries.length > 1 ? 2 : 0;
    const s = `<circle class="seg" data-cat="${esc(c)}" cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${col || color(c)}"
      stroke-width="24" stroke-dasharray="${Math.max(len - gap, 0)} ${circ}" stroke-dashoffset="${-offset}"><title>${esc(c)}: ${money(v)}</title></circle>`;
    offset += len;
    return s;
  }).join('') : `<circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="var(--line)" stroke-width="24"/>`;
  return `<div class="donut" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${segs}</svg>
    <div class="center"><b>${center}</b><span>${sub}</span></div></div>`;
}

export function bars(items, { height = 160, active = null, format = money0, avg = null } = {}) {
  const max = Math.max(...items.map((i) => i.value), avg || 0, 1);
  return `<div class="trend" style="height:${height}px">
    ${avg ? `<div class="avg-line" style="bottom:${(avg / max) * (height - 40) + 22}px"><span>avg ${format(avg)}</span></div>` : ''}
    ${items.map((i) => `<div class="col ${i.key === active ? 'active' : ''}" ${i.attr || ''} title="${esc(i.title || '')}">
      <div class="v">${i.value ? format(i.value) : ''}</div>
      <div class="b" style="height:${(Math.max(i.value, 0) / max) * (height - 40)}px"></div>
      <div class="m">${esc(i.label)}</div></div>`).join('')}
  </div>`;
}

export function sparkline(points, { width = 320, height = 90, stroke = '#2563eb' } = {}) {
  if (points.length < 2) return '<p class="muted small">Not enough history yet. This fills in as Ledger syncs each day.</p>';
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * width, height - 6 - ((p.value - min) / span) * (height - 12)]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:100%;height:${height}px">
    <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${stroke}" stop-opacity=".25"/><stop offset="1" stop-color="${stroke}" stop-opacity="0"/></linearGradient></defs>
    <path d="${d} L${width},${height} L0,${height} Z" fill="url(#sg)"/>
    <path d="${d}" fill="none" stroke="${stroke}" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`;
}

export function progress(value, col, cls = '') {
  return `<div class="bar ${cls}" style="--c:${col}"><span style="width:${Math.min(Math.max(value, 0), 1) * 100}%"></span></div>`;
}

export const emptyState = (emoji, title, text, action = '') =>
  `<div class="empty-state"><div class="e">${emoji}</div><strong>${title}</strong><p class="muted">${text}</p>${action}</div>`;
