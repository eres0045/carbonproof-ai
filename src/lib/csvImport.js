// CSV import for activity data: turns a spreadsheet export into ledger
// records. Expected header (any order, case-insensitive):
//   organization, category, quantity, date, evidence
// category must be one of the factor-table keys (electricity, diesel,
// petrol, flight, waste). Invalid rows are reported, never silently added.

import { EMISSION_FACTORS } from '../data/emissionFactors.js';

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseActivitiesCsv(text) {
  const lines = (text || '').split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return { records: [], errors: ['CSV needs a header row and at least one data row.'] };
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = {};
  for (const name of ['organization', 'category', 'quantity', 'date', 'evidence']) {
    col[name] = header.indexOf(name);
  }
  if (col.organization < 0 || col.category < 0 || col.quantity < 0 || col.date < 0) {
    return { records: [], errors: ['Header must include organization, category, quantity and date columns.'] };
  }
  const records = [];
  const errors = [];
  lines.slice(1).forEach((line, i) => {
    const rowNo = i + 2;
    const cells = splitCsvLine(line);
    const organization = cells[col.organization] || '';
    const category = (cells[col.category] || '').toLowerCase();
    const quantity = parseFloat(cells[col.quantity]);
    const date = cells[col.date] || '';
    const evidence = col.evidence >= 0 ? (cells[col.evidence] || '') : '';
    if (!organization) { errors.push(`Row ${rowNo}: missing organization`); return; }
    if (!EMISSION_FACTORS[category]) { errors.push(`Row ${rowNo}: unknown category "${category}"`); return; }
    if (!quantity || quantity <= 0) { errors.push(`Row ${rowNo}: quantity must be a positive number`); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push(`Row ${rowNo}: date must be YYYY-MM-DD`); return; }
    records.push({ organization, category, quantity, date, evidence });
  });
  return { records, errors };
}

export const CSV_TEMPLATE = [
  'organization,category,quantity,date,evidence',
  'Acme Logistics — Jaipur warehouse,electricity,12500,2026-09-30,Utility bill #JB-2211',
  'Acme Logistics — delivery fleet,diesel,640,2026-09-30,Fuel card statement Sep 2026',
].join('\n');
