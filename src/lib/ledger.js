import { sha256Hex } from './sha256.js';
import { EMISSION_FACTORS } from '../data/emissionFactors.js';

export const GENESIS_PREV_HASH = 'GENESIS';

// Block types sharing one hash chain:
//  - 'emission'      : an emissions record (quantity x published factor = CO2e)
//  - 'credit_issue'  : carbon credits enter the registry (serial, project, tonnes)
//  - 'credit_retire' : credits are retired against emissions (serial, tonnes)
// Sealing all three into ONE chain means the credit registry inherits the
// ledger's tamper-evidence, and verifyChain() can enforce the carbon-market
// invariant that matters most: a credit can never be counted twice — its
// cumulative retirements can never exceed its issuance, and every retirement
// must reference a serial that was actually issued earlier in the chain.

/** CO2e for an emissions record: quantity x factor for its category. kg CO2e. */
export function calculateCo2eKg(category, quantity) {
  const f = EMISSION_FACTORS[category];
  if (!f) throw new Error(`Unknown category: ${category}`);
  return Math.round(quantity * f.factorKgPerUnit * 100) / 100;
}

/** Canonical string that gets hashed for a block. Every field matters:
 *  changing any of them after the fact changes the hash. */
export function blockPayload(block) {
  return [
    block.type || 'emission',
    block.index,
    block.timestamp,
    block.prevHash,
    block.organization,
    block.category || '',
    block.quantity ?? '',
    block.unit || '',
    block.date,
    block.co2eKg ?? '',
    block.evidence || '',
    block.project || '',
    block.serial || '',
    block.vintage ?? '',
    block.tonnes ?? '',
    block.beneficiary || '',
  ].join('|');
}

export function hashBlock(block) {
  return sha256Hex(blockPayload(block));
}

function nextBlock(chain, fields) {
  const prev = chain.length ? chain[chain.length - 1] : null;
  const block = {
    index: chain.length,
    prevHash: prev ? prev.hash : GENESIS_PREV_HASH,
    ...fields,
  };
  block.hash = hashBlock(block);
  return block;
}

/** Append an emissions record as a block. Pure: returns a new array. */
export function appendRecord(chain, record) {
  const block = nextBlock(chain, {
    type: 'emission',
    timestamp: record.timestamp || new Date().toISOString(),
    organization: record.organization,
    category: record.category,
    quantity: record.quantity,
    unit: EMISSION_FACTORS[record.category].unit,
    date: record.date,
    co2eKg: calculateCo2eKg(record.category, record.quantity),
    evidence: record.evidence || '',
  });
  return [...chain, block];
}

/** Append a credit issuance (credits enter the registry under a serial). */
export function appendCreditIssue(chain, issue) {
  const block = nextBlock(chain, {
    type: 'credit_issue',
    timestamp: issue.timestamp || new Date().toISOString(),
    organization: issue.organization || '',
    date: issue.date,
    project: issue.project,
    serial: issue.serial,
    vintage: issue.vintage,
    tonnes: issue.tonnes,
    evidence: issue.evidence || '',
  });
  return [...chain, block];
}

/** Append a credit retirement (credits permanently leave circulation). */
export function appendCreditRetire(chain, retire) {
  const block = nextBlock(chain, {
    type: 'credit_retire',
    timestamp: retire.timestamp || new Date().toISOString(),
    organization: retire.organization || '',
    date: retire.date,
    serial: retire.serial,
    tonnes: retire.tonnes,
    beneficiary: retire.beneficiary || '',
    evidence: retire.evidence || '',
  });
  return [...chain, block];
}

/** Derive the credit registry from the chain: per-serial issued/retired/held. */
export function summarizeCredits(chain) {
  const bySerial = {};
  for (const b of chain) {
    if (b.type === 'credit_issue') {
      bySerial[b.serial] = {
        serial: b.serial, project: b.project, vintage: b.vintage,
        issued: (bySerial[b.serial]?.issued || 0) + b.tonnes,
        retired: bySerial[b.serial]?.retired || 0,
      };
    } else if (b.type === 'credit_retire' && bySerial[b.serial]) {
      bySerial[b.serial].retired += b.tonnes;
    }
  }
  const rows = Object.values(bySerial).map((r) => ({ ...r, held: Math.round((r.issued - r.retired) * 100) / 100 }));
  const issued = rows.reduce((s, r) => s + r.issued, 0);
  const retired = rows.reduce((s, r) => s + r.retired, 0);
  return {
    rows,
    issuedT: Math.round(issued * 100) / 100,
    retiredT: Math.round(retired * 100) / 100,
    heldT: Math.round((issued - retired) * 100) / 100,
  };
}

/**
 * Recompute every hash and link, re-check every CO2e figure against the
 * published factors, and enforce the credit invariants (unique issuance
 * serials; retirements reference issued serials and never exceed them —
 * the double-counting guard). Returns { valid, problems: [{index, reason}] }.
 */
export function verifyChain(chain) {
  const problems = [];
  const issuedSoFar = {};   // serial -> tonnes issued up to this block
  const retiredSoFar = {};  // serial -> tonnes retired up to this block
  chain.forEach((block, i) => {
    const expectedPrev = i === 0 ? GENESIS_PREV_HASH : chain[i - 1].hash;
    if (block.index !== i) problems.push({ index: i, reason: 'Block index out of sequence' });
    if (block.prevHash !== expectedPrev)
      problems.push({ index: i, reason: 'prevHash does not match previous block hash (link broken)' });
    if (block.hash !== hashBlock(block))
      problems.push({ index: i, reason: 'Stored hash does not match recomputed hash (record altered after entry)' });

    if ((block.type || 'emission') === 'emission') {
      const expectedCo2e = calculateCo2eKg(block.category, block.quantity);
      if (Math.abs(block.co2eKg - expectedCo2e) > 0.011)
        problems.push({ index: i, reason: `CO2e mismatch: stored ${block.co2eKg} kg, factor math gives ${expectedCo2e} kg` });
    } else if (block.type === 'credit_issue') {
      if (!(block.tonnes > 0)) problems.push({ index: i, reason: 'Credit issuance must be for a positive number of tonnes' });
      if (issuedSoFar[block.serial] !== undefined)
        problems.push({ index: i, reason: `Credit serial ${block.serial} issued more than once (duplicate issuance)` });
      issuedSoFar[block.serial] = (issuedSoFar[block.serial] || 0) + block.tonnes;
    } else if (block.type === 'credit_retire') {
      if (issuedSoFar[block.serial] === undefined)
        problems.push({ index: i, reason: `Retirement references serial ${block.serial}, which was never issued (phantom credit)` });
      retiredSoFar[block.serial] = (retiredSoFar[block.serial] || 0) + block.tonnes;
      if (issuedSoFar[block.serial] !== undefined && retiredSoFar[block.serial] > issuedSoFar[block.serial] + 1e-9)
        problems.push({
          index: i,
          reason: `DOUBLE COUNTING: serial ${block.serial} retired ${retiredSoFar[block.serial]} t against only ${issuedSoFar[block.serial]} t issued`,
        });
    }
  });
  return { valid: problems.length === 0, problems };
}

/**
 * Seeded dataset: a full financial year (Oct 2025 – Sep 2026) of activity
 * for GreenMart Retail, a mid-size Indian retail chain — monthly electricity
 * for its distribution centre and stores, fleet diesel, sales-team petrol,
 * landfill waste, and business flights — plus its carbon-credit registry:
 * two issuances and one retirement. Deterministic timestamps throughout,
 * so the chain (and its head hash) is identical on every fresh load.
 */
export function seedChain() {
  let chain = [];
  const months = [
    ['2025-10', 13100, 34800, 920, 265, 2140],
    ['2025-11', 12650, 33900, 885, 248, 2075],
    ['2025-12', 13980, 37400, 1010, 302, 2380],
    ['2026-01', 12240, 33100, 860, 236, 1990],
    ['2026-02', 11890, 32400, 812, 224, 1915],
    ['2026-03', 12960, 35200, 934, 258, 2120],
    ['2026-04', 13420, 36100, 958, 271, 2245],
    ['2026-05', 14230, 38500, 996, 288, 2360],
    ['2026-06', 14780, 39800, 1042, 305, 2490],
    ['2026-07', 14310, 38900, 1018, 296, 2415],
    ['2026-08', 13860, 37600, 972, 283, 2305],
    ['2026-09', 13520, 36900, 949, 274, 2260],
  ];
  const flights = [
    ['2025-11-18', 3140, '2 passengers, Pune–Delhi return (approx. 1,570 passenger-km each); booking ref on file'],
    ['2026-02-09', 2300, '1 passenger, Pune–Bengaluru return plus onward hop; itinerary on file'],
    ['2026-04-22', 4600, '3 passengers, Pune–Delhi return (supplier review); booking ref on file'],
    ['2026-07-14', 1480, '1 passenger, Pune–Hyderabad return; booking ref on file'],
    ['2026-09-07', 2870, '2 passengers, Pune–Ahmedabad return; booking ref on file'],
  ];
  const ts = (ym, day, hh, mm) => `${ym}-${String(day).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`;

  months.forEach(([ym, dcKwh, storesKwh, dieselL, petrolL, wasteKg], mi) => {
    chain = appendRecord(chain, {
      organization: 'GreenMart Retail — Pune distribution centre',
      category: 'electricity', quantity: dcKwh, date: `${ym}-28`,
      timestamp: ts(ym, 29, 9, 15),
      evidence: `Monthly grid electricity meter reading; utility bill on file (${ym})`,
    });
    chain = appendRecord(chain, {
      organization: 'GreenMart Retail — stores (14 outlets, combined)',
      category: 'electricity', quantity: storesKwh, date: `${ym}-28`,
      timestamp: ts(ym, 29, 10, 40),
      evidence: `Aggregated store utility bills (${ym})`,
    });
    chain = appendRecord(chain, {
      organization: 'GreenMart Retail — delivery fleet (6 vans)',
      category: 'diesel', quantity: dieselL, date: `${ym}-28`,
      timestamp: ts(ym, 30, 11, 5),
      evidence: `Fuel card statement for ${ym}`,
    });
    chain = appendRecord(chain, {
      organization: 'GreenMart Retail — sales team cars',
      category: 'petrol', quantity: petrolL, date: `${ym}-28`,
      timestamp: ts(ym, 30, 12, 20),
      evidence: `Fuel card statement for ${ym}`,
    });
    chain = appendRecord(chain, {
      organization: 'GreenMart Retail — distribution centre waste',
      category: 'waste', quantity: wasteKg, date: `${ym}-28`,
      timestamp: ts(ym, 30, 15, 45),
      evidence: `Landfill weighbridge tickets for ${ym}`,
    });
    for (const [fdate, pkm, ev] of flights) {
      if (fdate.startsWith(ym)) {
        chain = appendRecord(chain, {
          organization: 'GreenMart Retail — business travel',
          category: 'flight', quantity: pkm, date: fdate,
          timestamp: ts(ym, Number(fdate.slice(8)), 18, 30),
          evidence: ev,
        });
      }
    }
    if (mi === 3) { // Jan 2026: first credit issuance
      chain = appendCreditIssue(chain, {
        organization: 'GreenMart Retail — offset portfolio',
        project: 'Bundled Wind Power Project, Maharashtra (grid-connected wind)',
        serial: 'IN-WIND-2026-04471', vintage: 2025, tonnes: 400,
        date: '2026-01-20', timestamp: ts('2026-01', 20, 14, 0),
        evidence: 'Purchase agreement + registry serial range on file (prototype dataset — illustrative serial)',
      });
    }
    if (mi === 6) { // Apr 2026: second credit issuance
      chain = appendCreditIssue(chain, {
        organization: 'GreenMart Retail — offset portfolio',
        project: 'Community Reforestation Programme, Western Ghats',
        serial: 'IN-AFOR-2026-01183', vintage: 2025, tonnes: 350,
        date: '2026-04-16', timestamp: ts('2026-04', 16, 14, 0),
        evidence: 'Purchase agreement + registry serial range on file (prototype dataset — illustrative serial)',
      });
    }
  });

  // Sep 2026: retire 300 t against FY2025-26 operations (partial — the
  // remaining position stays open on purpose: the demo can retire live).
  chain = appendCreditRetire(chain, {
    organization: 'GreenMart Retail — offset portfolio',
    serial: 'IN-WIND-2026-04471', tonnes: 300,
    beneficiary: 'GreenMart Retail operations, FY2025-26',
    date: '2026-09-30', timestamp: ts('2026-09', 30, 16, 10),
    evidence: 'Retirement recorded against FY2025-26 emissions inventory (partial retirement)',
  });
  return chain;
}

export function totalsByCategory(chain) {
  const out = {};
  for (const b of chain) {
    if ((b.type || 'emission') !== 'emission') continue;
    out[b.category] = (out[b.category] || 0) + b.co2eKg;
  }
  return out;
}

export function totalCo2eKg(chain) {
  return Math.round(
    chain.filter((b) => (b.type || 'emission') === 'emission').reduce((s, b) => s + b.co2eKg, 0) * 100,
  ) / 100;
}

/** Net position: emissions minus retired credits, in kg CO2e. <= 0 means
 *  retirements fully cover recorded emissions. */
export function netPositionKg(chain) {
  const { retiredT } = summarizeCredits(chain);
  return Math.round((totalCo2eKg(chain) - retiredT * 1000) * 100) / 100;
}
