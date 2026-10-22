// Logic tests for CarbonProof AI — run with: node tests/logic.test.mjs
import assert from 'node:assert';
import { sha256Hex } from '../src/lib/sha256.js';
import {
  appendRecord, appendCreditIssue, appendCreditRetire, verifyChain, seedChain,
  calculateCo2eKg, summarizeCredits, totalCo2eKg, netPositionKg,
} from '../src/lib/ledger.js';
import { analyzeClaim } from '../src/lib/claimChecker.js';
import { parseActivitiesCsv, CSV_TEMPLATE } from '../src/lib/csvImport.js';

// SHA-256 known-answer vectors (FIPS 180-4 examples)
assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
assert.equal(
  sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
  '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
);
console.log('✓ SHA-256 known-answer vectors pass');

// CO2e math against the published factors (CEA India grid; DESNZ 2024)
assert.equal(calculateCo2eKg('electricity', 100), 72.7);   // 0.727 kg/kWh
assert.equal(calculateCo2eKg('diesel', 10), 25.13);        // 2.5128 kg/litre
assert.equal(calculateCo2eKg('waste', 500), 233.5);        // 0.467 kg/kg
console.log('✓ CO2e factor math (published factors)');

// Seeded chain: a full year of data + credit registry events
const chain = seedChain();
assert.equal(chain.length, 68, `seed length was ${chain.length}`); // 65 emissions + 2 issues + 1 retire
assert.equal(verifyChain(chain).valid, true);
assert.equal(chain[0].prevHash, 'GENESIS');
assert.equal(chain[1].prevHash, chain[0].hash);
const emittedKg = totalCo2eKg(chain);
assert.ok(emittedKg > 400000 && emittedKg < 600000, `emitted ${emittedKg} kg should be a realistic ~478 t`);
console.log(`✓ Seeded FY chain valid: 68 blocks, ${Math.round(emittedKg / 100) / 10} t CO2e emitted`);

// Credit registry derivation
const credits = summarizeCredits(chain);
assert.equal(credits.issuedT, 750);
assert.equal(credits.retiredT, 300);
assert.equal(credits.heldT, 450);
assert.equal(credits.rows.find((r) => r.serial === 'IN-WIND-2026-04471').held, 100);
assert.ok(netPositionKg(chain) > 0, 'seeded position should still be net-positive (demo can retire live)');
console.log('✓ Credit registry: 750 t issued, 300 t retired, 450 t held; net position open');

// Double-counting guard: retire 200 t more from the wind serial (only 100 t held)
const forged = appendCreditRetire(chain, {
  organization: 'GreenMart Retail — offset portfolio', serial: 'IN-WIND-2026-04471',
  tonnes: 200, beneficiary: 'Someone else — second claim on the same credits',
  date: '2026-10-05', evidence: 'forged retirement',
});
const fv = verifyChain(forged);
assert.equal(fv.valid, false);
assert.ok(fv.problems.some((p) => p.reason.includes('DOUBLE COUNTING')), fv.problems.map((p) => p.reason).join('; '));
console.log('✓ Double-counting guard: over-retirement is caught by verification');

// Phantom credit: retire a serial that was never issued
const phantom = appendCreditRetire(chain, {
  organization: 'X', serial: 'FAKE-000', tonnes: 10, beneficiary: 'X', date: '2026-10-05', evidence: '',
});
assert.equal(verifyChain(phantom).valid, false);
console.log('✓ Phantom-credit guard: retiring an unissued serial fails verification');

// Duplicate issuance of the same serial
const dup = appendCreditIssue(chain, {
  organization: 'X', project: 'Copy', serial: 'IN-WIND-2026-04471', vintage: 2025,
  tonnes: 50, date: '2026-10-05', evidence: '',
});
assert.equal(verifyChain(dup).valid, false);
console.log('✓ Duplicate-issuance guard: re-issuing a serial fails verification');

// Tamper detection: quietly change a historical quantity
const tampered = chain.map((b) => ({ ...b }));
tampered[1] = { ...tampered[1], quantity: 3480, co2eKg: 2529.31 };
const tv = verifyChain(tampered);
assert.equal(tv.valid, false);
assert.ok(tv.problems.length >= 1);
console.log('✓ Tampered chain detected:', tv.problems[0].reason);

// Append keeps chain valid
const longer = appendRecord(chain, {
  organization: 'Test Org', category: 'waste', quantity: 500, date: '2026-10-01', evidence: 'skip ticket',
});
assert.equal(longer.length, 69);
assert.equal(verifyChain(longer).valid, true);
assert.equal(longer[68].co2eKg, 233.5);
console.log('✓ Append keeps chain valid');

// Claim checker: vague vs substantiated
const vague = analyzeClaim('We are proud to announce that our company is now 100% carbon neutral and eco-friendly!');
assert.ok(vague.score < 40, `vague score was ${vague.score}`);
const strong = analyzeClaim(
  'We reduced Scope 2 emissions by 1,240 kg CO2e in FY2026 versus our FY2024 baseline, calculated under the GHG Protocol from metered electricity data and independently verified.',
);
assert.ok(strong.score >= 70, `strong score was ${strong.score}`);
console.log(`✓ Claim checker (text only): vague=${vague.score}/100, strong=${strong.score}/100`);

// Claim checker ledger cross-check: neutrality claim vs actual retirements
const failingCtx = analyzeClaim('We are now carbon neutral.', { emittedKg: 478000, retiredT: 300 });
assert.ok(failingCtx.findings.some((f) => f.text.includes('Ledger cross-check FAILED')));
const passingCtx = analyzeClaim('We are now carbon neutral.', { emittedKg: 478000, retiredT: 500 });
assert.ok(passingCtx.findings.some((f) => f.text.includes('Ledger cross-check PASSED')));
assert.ok(passingCtx.score > failingCtx.score);
console.log('✓ Claim checker ledger cross-check: fails unbacked neutrality, passes backed neutrality');

// CSV import
const parsed = parseActivitiesCsv(CSV_TEMPLATE);
assert.equal(parsed.records.length, 2);
assert.equal(parsed.errors.length, 0);
const bad = parseActivitiesCsv('organization,category,quantity,date\nX,unknowncat,5,2026-01-01\nY,diesel,-3,2026-01-01');
assert.equal(bad.records.length, 0);
assert.equal(bad.errors.length, 2);
console.log('✓ CSV import: template parses; bad category and negative quantity are reported');

console.log('\nAll logic tests passed.');
