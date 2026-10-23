const { ethers } = require("hardhat");
const assert = require("node:assert");

// Mirrors the CarbonProof AI app's seeded registry state.
const WIND = {
  serial: "IN-WIND-2026-04471",
  name: "Urja Wind Farms — Madhya Pradesh",
  type: "Wind energy",
  vintage: 2026,
  issuedKg: 400_000,
  retireKg: 200_000,
};

const AFOR = {
  serial: "IN-AFOR-2026-01183",
  name: "Sahyadri Reforestation Collective",
  type: "Reforestation",
  vintage: 2026,
  issuedKg: 350_000,
  retireKg: 100_000,
};

const BENEFICIARY = "GreenMart Retail";
const REASON = "FY2025-26 annual offset";
const PERIOD = "FY2025-26";
const HEAD_HASH =
  "0xafd9ffd954baaee59beff0f78900ae95ad80acc1a86bc483a1a64f180a62e9f5";

const EXPECTED = { issued: 750_000n, retired: 300_000n, held: 450_000n };

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(
    `Balance:  ${ethers.formatEther(
      await ethers.provider.getBalance(deployer.address)
    )} ETH\n`
  );

  const CarbonRegistry = await ethers.getContractFactory("CarbonRegistry");
  const registry = await CarbonRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  const deployTx = registry.deploymentTransaction();
  console.log(`CarbonRegistry deployed to: ${address}`);
  console.log(`Deploy tx: ${deployTx ? deployTx.hash : "(unknown)"}\n`);

  async function send(label, txPromise) {
    const tx = await txPromise;
    await tx.wait();
    console.log(`${label}\n  tx: ${tx.hash}`);
    return tx;
  }

  await send(
    `Issue ${WIND.serial} (${WIND.issuedKg} kg)`,
    registry.issue(WIND.serial, WIND.name, WIND.type, WIND.vintage, WIND.issuedKg)
  );

  await send(
    `Issue ${AFOR.serial} (${AFOR.issuedKg} kg)`,
    registry.issue(AFOR.serial, AFOR.name, AFOR.type, AFOR.vintage, AFOR.issuedKg)
  );

  await send(
    `Retire ${WIND.retireKg} kg from ${WIND.serial}`,
    registry.retire(WIND.serial, WIND.retireKg, BENEFICIARY, REASON)
  );

  await send(
    `Retire ${AFOR.retireKg} kg from ${AFOR.serial}`,
    registry.retire(AFOR.serial, AFOR.retireKg, BENEFICIARY, REASON)
  );

  await send(
    `Anchor ledger head for ${PERIOD}`,
    registry.anchorLedgerHead(PERIOD, HEAD_HASH)
  );

  const [issued, retired, held, anchored] = await Promise.all([
    registry.totalIssuedKg(),
    registry.totalRetiredKg(),
    registry.totalHeldKg(),
    registry.anchoredHead(PERIOD),
  ]);

  console.log("\n=== Final totals ===");
  console.log(`Issued:   ${issued} kg  (expected ${EXPECTED.issued})`);
  console.log(`Retired:  ${retired} kg  (expected ${EXPECTED.retired})`);
  console.log(`Held:     ${held} kg  (expected ${EXPECTED.held})`);
  console.log(`Anchored head (${PERIOD}): ${anchored}`);

  assert.equal(issued, EXPECTED.issued, "totalIssuedKg mismatch");
  assert.equal(retired, EXPECTED.retired, "totalRetiredKg mismatch");
  assert.equal(held, EXPECTED.held, "totalHeldKg mismatch");
  assert.equal(anchored, HEAD_HASH, "anchored head hash mismatch");

  console.log("\nAll totals match the CarbonProof AI seeded state. ✅");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
