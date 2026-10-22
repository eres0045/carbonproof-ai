// Logic tests for CarbonProof AI — run with: node tests/logic.test.mjs
import assert from 'node:assert';
import { sha256Hex } from '../src/lib/sha256.js';
import { appendRecord, verifyChain, seedChain, calculateCo2eKg } from '../src/lib/ledger.js';
import { analyzeClaim } from '../src/lib/claimChecker.js';

// SHA-256 known-answer vectors (FIPS 180-4 examples)
assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
assert.equal(
  sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
  '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
);
console.log('✓ SHA-256 known-answer vectors pass');

// CO2e math
assert.equal(calculateCo2eKg('electricity', 100), 82);
assert.equal(calculateCo2eKg('diesel', 10), 26.8);
console.log('✓ CO2e factor math');

// Seeded chain verifies
const chain = seedChain();
assert.equal(chain.length, 3);
assert.equal(verifyChain(chain).valid, true);
assert.equal(chain[0].prevHash, 'GENESIS');
assert.equal(chain[1].prevHash, chain[0].hash);
console.log('✓ Seeded chain is valid, 3 blocks, correctly linked');

// Tamper detection: quietly change a historical quantity
const tampered = chain.map((b) => ({ ...b }));
tampered[1] = { ...tampered[1], quantity: 86, co2eKg: 230.48 };
const tv = verifyChain(tampered);
assert.equal(tv.valid, false);
assert.ok(tv.problems.length >= 1);
console.log('✓ Tampered chain detected:', tv.problems[0].reason);

// Append works and keeps chain valid
const longer = appendRecord(chain, {
  organization: 'Test Org', category: 'waste', quantity: 500, date: '2026-10-01', evidence: 'skip ticket',
});
assert.equal(longer.length, 4);
assert.equal(verifyChain(longer).valid, true);
assert.equal(longer[3].co2eKg, 225);
console.log('✓ Append keeps chain valid');

// Claim checker: vague claim scores low, substantiated claim scores high
const vague = analyzeClaim('We are proud to announce that our company is now 100% carbon neutral and eco-friendly!');
assert.ok(vague.score < 40, `vague score was ${vague.score}`);
assert.ok(vague.findings.some((f) => f.type === 'bad'));
const strong = analyzeClaim(
  'We reduced Scope 2 emissions by 1,240 kg CO2e in FY2026 versus our FY2024 baseline, calculated under the GHG Protocol from metered electricity data and independently verified.',
);
assert.ok(strong.score >= 70, `strong score was ${strong.score}`);
console.log(`✓ Claim checker: vague=${vague.score}/100, strong=${strong.score}/100`);

console.log('\nAll logic tests passed.');
