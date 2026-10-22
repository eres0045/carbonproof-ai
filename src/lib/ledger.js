import { sha256Hex } from './sha256.js';
import { EMISSION_FACTORS } from '../data/emissionFactors.js';

export const GENESIS_PREV_HASH = 'GENESIS';

/** CO2e for a record: quantity x factor for its category. Returns kg CO2e. */
export function calculateCo2eKg(category, quantity) {
  const f = EMISSION_FACTORS[category];
  if (!f) throw new Error(`Unknown category: ${category}`);
  return Math.round(quantity * f.factorKgPerUnit * 100) / 100;
}

/** Canonical string that gets hashed for a block. Every field matters:
 *  changing any of them after the fact changes the hash. */
export function blockPayload(block) {
  return [
    block.index,
    block.timestamp,
    block.prevHash,
    block.organization,
    block.category,
    block.quantity,
    block.unit,
    block.date,
    block.co2eKg,
    block.evidence,
  ].join('|');
}

export function hashBlock(block) {
  return sha256Hex(blockPayload(block));
}

/** Append a new emissions record as a block on the chain. Pure: returns a new array. */
export function appendRecord(chain, record) {
  const prev = chain.length ? chain[chain.length - 1] : null;
  const block = {
    index: chain.length,
    timestamp: record.timestamp || new Date().toISOString(),
    prevHash: prev ? prev.hash : GENESIS_PREV_HASH,
    organization: record.organization,
    category: record.category,
    quantity: record.quantity,
    unit: EMISSION_FACTORS[record.category].unit,
    date: record.date,
    co2eKg: calculateCo2eKg(record.category, record.quantity),
    evidence: record.evidence || '',
  };
  block.hash = hashBlock(block);
  return [...chain, block];
}

/** Recompute every hash and link. Returns { valid, problems: [{index, reason}] }. */
export function verifyChain(chain) {
  const problems = [];
  chain.forEach((block, i) => {
    const expectedPrev = i === 0 ? GENESIS_PREV_HASH : chain[i - 1].hash;
    if (block.index !== i) problems.push({ index: i, reason: 'Block index out of sequence' });
    if (block.prevHash !== expectedPrev)
      problems.push({ index: i, reason: 'prevHash does not match previous block hash (link broken)' });
    if (block.hash !== hashBlock(block))
      problems.push({ index: i, reason: 'Stored hash does not match recomputed hash (record altered after entry)' });
    const expectedCo2e = calculateCo2eKg(block.category, block.quantity);
    if (Math.abs(block.co2eKg - expectedCo2e) > 0.011)
      problems.push({ index: i, reason: `CO2e mismatch: stored ${block.co2eKg} kg, factor math gives ${expectedCo2e} kg` });
  });
  return { valid: problems.length === 0, problems };
}

/** Build the seeded demo chain (3 realistic records). Deterministic timestamps. */
export function seedChain() {
  let chain = [];
  chain = appendRecord(chain, {
    organization: 'GreenMart Retail — Pune distribution centre',
    category: 'electricity',
    quantity: 12400,
    date: '2026-09-01',
    timestamp: '2026-09-03T09:15:00.000Z',
    evidence: 'September grid electricity meter reading; utility bill #EB-2026-0917 on file',
  });
  chain = appendRecord(chain, {
    organization: 'GreenMart Retail — delivery fleet',
    category: 'diesel',
    quantity: 860,
    date: '2026-09-15',
    timestamp: '2026-09-16T11:40:00.000Z',
    evidence: 'Fuel card statement, Sep 1–15 (fleet of 6 vans)',
  });
  chain = appendRecord(chain, {
    organization: 'GreenMart Retail — executive travel',
    category: 'flight',
    quantity: 3140,
    date: '2026-09-28',
    timestamp: '2026-09-29T08:05:00.000Z',
    evidence: '2 passengers, Pune–Delhi return (approx. 1,570 passenger-km each); booking ref on file',
  });
  return chain;
}

export function totalsByCategory(chain) {
  const out = {};
  for (const b of chain) {
    out[b.category] = (out[b.category] || 0) + b.co2eKg;
  }
  return out;
}

export function totalCo2eKg(chain) {
  return Math.round(chain.reduce((s, b) => s + b.co2eKg, 0) * 100) / 100;
}
