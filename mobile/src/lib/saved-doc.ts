import type { SavedSnapshot } from '../data/job-cleanup.ts';

import { documentTotals, formatCents, formatQty, type LineKind, type Totals } from './money.ts';

// A saved document (from a removed job) is a copy of its database rows. These turn that copy
// back into totals and into the page that becomes the PDF the owner shares.

/** The lines that count toward the total: priced, not excluded. */
export function countedLines(s: SavedSnapshot) {
  return s.lines
    .filter((l) => !l.excluded && l.unit_cents !== null && Number.isInteger(l.unit_cents) && Number.isInteger(l.qty_hundredths))
    .map((l) => ({ kind: (l.kind === 'material' || l.kind === 'fee' ? l.kind : 'labor') as LineKind, qtyHundredths: l.qty_hundredths, unitCents: l.unit_cents as number }));
}

/** Money received for this document (failed or refunded payments don't count). */
export function paidCents(s: SavedSnapshot): number {
  return s.payments
    .filter((p) => Number.isInteger(p.amountCents) && (p.amountCents > 0 || p.method === 'refund' || p.method === 'dispute') && (!p.status || p.status === 'succeeded' || p.status === 'paid'))
    .reduce((sum, p) => sum + p.amountCents, 0);
}

export function savedTotals(s: SavedSnapshot): Totals {
  if (s.type === 'change_order') {
    const amount = Number(s.document.amount_cents ?? 0);
    return { labor: amount, materials: 0, subtotal: amount, tax: 0, total: amount, paid: 0, due: 0 };
  }
  const d = s.document;
  const tax = { rateBps: Number(d.tax_rate_bps ?? 0), labor: !!d.tax_labor, materials: !!d.tax_materials };
  const totals = documentTotals(countedLines(s), tax);
  // an invoice marked paid (for example in cash before payments were recorded) is paid in full
  const paid = s.type === 'invoice' ? (d.paid_at && !s.payments.some((p) => p.method === 'refund' || p.method === 'dispute') ? Math.max(totals.total, paidCents(s)) : paidCents(s)) : paidCents(s);
  const shown = Math.max(0, Math.min(paid, totals.total));
  return { ...totals, paid: shown, due: Math.max(0, totals.total - shown) };
}

const escape = (text: unknown) => String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

export interface SavedDocLabels {
  title: string; billTo: string; job: string; workOrder: string; issued: string; paidOn: string; signed: string; declined: string;
  description: string; qty: string; price: string; amount: string; excluded: string;
  subtotal: string; tax: string; total: string; paid: string; due: string; base: string; newTotal: string;
  payments: string; signatures: string; fingerprint: string; method: (m: string) => string; signedBy: (name: string) => string;
  materials?: string; dueDate?: string;
}

function signatureSvg(ink: unknown): string {
  if (!Array.isArray(ink) || ink.length > 100) return '';
  const paths = ink.flatMap((stroke: unknown) => {
    if (!Array.isArray(stroke) || stroke.length < 2 || stroke.length > 5000) return [];
    const points = stroke.map((p: unknown) => Array.isArray(p) && p.length === 2 && p.every((value) =>
      typeof value === 'number' && value >= 0 && value <= 1) ? `${(p[0] * 320).toFixed(2)} ${(p[1] * 100).toFixed(2)}` : null);
    if (points.includes(null)) return [];
    return `<path d="M${points.join(' L')}"/>`;
  }).join('');
  return paths ? `<svg width="240" height="75" viewBox="0 0 320 100" fill="none" stroke="black" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${paths}</svg>` : '';
}

/** The saved document as a printable page. Text from the copy is escaped; nothing runs. */
export function savedDocHtml(s: SavedSnapshot, labels: SavedDocLabels, lang: 'en' | 'es', receipt = false): string {
  const locale = lang === 'es' ? 'es-US' : 'en-US';
  const money = (cents: number) => escape(formatCents(cents, locale));
  const date = (iso: unknown) => (iso ? escape(new Date(String(iso)).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? 'UTC' : undefined })) : '');
  const d = s.document;
  const totals = savedTotals(s);
  const lumpMaterials = s.type === 'invoice' && d.materials_mode === 'total';
  const rows = s.lines.filter((line) => !lumpMaterials || line.kind !== 'material').map((l) => {
    const off = l.excluded || l.unit_cents === null;
    const amount = off ? labels.excluded : money(Math.round((l.qty_hundredths * (l.unit_cents ?? 0)) / 100));
    return `<tr><td>${escape(l.description)}</td><td class="n">${escape(formatQty(l.qty_hundredths, locale))}</td><td class="n">${l.unit_cents === null ? '' : money(l.unit_cents)}</td><td class="n">${amount}</td></tr>`;
  }).join('') + (lumpMaterials ? `<tr><td>${escape(labels.materials ?? (lang === 'es' ? 'Materiales' : 'Materials'))}</td><td></td><td></td><td class="n">${money(totals.materials)}</td></tr>` : '');
  const facts = [
    d.sent_at || d.issued_on ? `${labels.issued}: ${date(d.issued_on ?? d.sent_at)}` : '',
    d.due_date ? `${labels.dueDate}: ${date(d.due_date)}` : '',
    d.signed_at ? `${labels.signed}: ${date(d.signed_at)}` : '',
    d.declined_at ? `${labels.declined}: ${date(d.declined_at)}` : '',
    d.paid_at && totals.due === 0 ? `${labels.paidOn}: ${date(d.paid_at)}` : '',
  ].filter(Boolean).map((x) => `<div>${x}</div>`).join('');
  const sum = (label: string, cents: number, strong = false) => `<tr${strong ? ' class="strong"' : ''}><td>${escape(label)}</td><td class="n">${money(cents)}</td></tr>`;
  const totalsTable = s.type === 'change_order'
    ? `<table class="sum">${sum(labels.base, Number(d.base_cents ?? 0))}${sum(labels.amount, totals.total)}${sum(labels.newTotal, Number(d.base_cents ?? 0) + totals.total, true)}</table>`
    : `<table class="sum">${sum(labels.subtotal, totals.subtotal)}${totals.tax ? sum(labels.tax, totals.tax) : ''}${sum(labels.total, totals.total, true)}${totals.paid ? sum(labels.paid, totals.paid) : ''}${s.type === 'invoice' ? sum(labels.due, totals.due, true) : ''}</table>`;
  const settled = s.payments.filter((payment) => !payment.status || payment.status === 'succeeded' || payment.status === 'paid');
  const payments = settled.length
    ? `<h3>${escape(labels.payments)}</h3><table>${settled.map((p) => `<tr><td>${date(p.paidAt)}</td><td>${escape(labels.method(p.method))}</td><td class="n">${money(p.amountCents)}</td></tr>`).join('')}</table>` : '';
  const signatures = s.signatures.length
    ? `<h3>${escape(labels.signatures)}</h3>${s.signatures.map((x) => `<section>${escape(labels.signedBy(x.name))} · ${date(x.signedAt)}<br>${signatureSvg(x.ink)}${x.hash ? `<br><small>${escape(labels.fingerprint)}: ${escape(x.hash)}</small>` : ''}</section>`).join('')}` : '';
  const scope = typeof d.issued_scope === 'string' && d.issued_scope ? d.issued_scope : typeof d.description === 'string' ? d.description : typeof d.summary === 'string' ? d.summary : '';
  const termSource = d.scope ?? d.issued_scope;
  const termText = termSource !== null && typeof termSource === 'object' ? termSource as Record<string, unknown> : {};
  const terms = (['terms', 'warranty'] as const).flatMap((key) => typeof termText[key] === 'string' && termText[key]
    ? [`<h3>${key === 'terms' ? (lang === 'es' ? 'Condiciones' : 'Terms') : (lang === 'es' ? 'Garantía' : 'Warranty')}</h3><p>${escape(termText[key])}</p>`] : []).join('');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(labels.title)} ${escape(d.number ?? '')}</title>
<style>
body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#000;margin:32px;font-size:13px}
h1{font-size:26px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px}h2{font-size:15px;margin:0}h3{font-size:13px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:1px}
.top{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #F0844C;padding-bottom:12px;margin-bottom:16px}
.muted{color:#4B524F}table{width:100%;border-collapse:collapse}td,th{padding:6px 4px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
th{font-size:11px;text-transform:uppercase;color:#4B524F}.n{text-align:right;white-space:nowrap}.sum{width:55%;margin-left:auto;margin-top:12px}.strong td{font-weight:700}
section,tr{break-inside:avoid}small{overflow-wrap:anywhere}p{white-space:pre-wrap}
</style></head><body>
<div class="top"><div><h1>${escape(labels.title)}${d.number ? ` ${escape(d.number)}` : ''}</h1><h2>${escape(s.business.name)}</h2><div class="muted">${[s.business.phone, s.business.email, s.business.address].filter(Boolean).map(escape).join('<br>')}</div></div><div class="muted">${facts}</div></div>
<p><strong>${escape(labels.billTo)}:</strong> ${escape(s.customer.name)}${s.customer.phone ? ` · ${escape(s.customer.phone)}` : ''}${s.customer.email ? ` · ${escape(s.customer.email)}` : ''}<br>
${s.job.title || s.job.address ? `<strong>${escape(labels.job)}:</strong> ${[s.job.title, s.job.address].filter(Boolean).map(escape).join(' · ')}` : ''}${s.job.workOrder ? `<br><strong>${escape(labels.workOrder)}:</strong> ${escape(s.job.workOrder)}` : ''}</p>
${!receipt && scope ? `<p>${escape(scope)}</p>` : ''}
${!receipt && s.lines.length ? `<table><thead><tr><th>${escape(labels.description)}</th><th class="n">${escape(labels.qty)}</th><th class="n">${escape(labels.price)}</th><th class="n">${escape(labels.amount)}</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
${receipt ? `<table class="sum">${sum(labels.paid, paidCents(s), true)}${sum(labels.due, totals.due)}</table>${payments}` : `${totalsTable}${payments}${terms}${signatures}`}
</body></html>`;
}
