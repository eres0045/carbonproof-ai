const { expect } = require("chai");
const { ethers } = require("hardhat");

const WIND_SERIAL = "IN-WIND-2026-04471";
const WIND_NAME = "Urja Wind Farms — Madhya Pradesh";
const WIND_TYPE = "Wind energy";
const HEAD_HASH =
  "0xafd9ffd954baaee59beff0f78900ae95ad80acc1a86bc483a1a64f180a62e9f5";

describe("CarbonRegistry", function () {
  let registry;
  let admin;
  let other;

  beforeEach(async function () {
    [admin, other] = await ethers.getSigners();
    const CarbonRegistry = await ethers.getContractFactory("CarbonRegistry");
    registry = await CarbonRegistry.deploy();
    await registry.waitForDeployment();
  });

  async function issueWind(amountKg = 400_000) {
    return registry.issue(WIND_SERIAL, WIND_NAME, WIND_TYPE, 2026, amountKg);
  }

  describe("issuance", function () {
    it("sets the deployer as admin", async function () {
      expect(await registry.admin()).to.equal(admin.address);
    });

    it("issue creates a batch and updates totals", async function () {
      await expect(issueWind())
        .to.emit(registry, "CreditsIssued")
        .withArgs(WIND_SERIAL, WIND_NAME, WIND_TYPE, 2026, 400_000);

      const batch = await registry.getBatch(WIND_SERIAL);
      expect(batch.serial_).to.equal(WIND_SERIAL);
      expect(batch.projectName).to.equal(WIND_NAME);
      expect(batch.projectType).to.equal(WIND_TYPE);
      expect(batch.vintage).to.equal(2026);
      expect(batch.issuedKg).to.equal(400_000);
      expect(batch.retiredKg).to.equal(0);
      expect(batch.exists).to.equal(true);

      expect(await registry.batchCount()).to.equal(1);
      expect(await registry.totalIssuedKg()).to.equal(400_000);
      expect(await registry.totalRetiredKg()).to.equal(0);
      expect(await registry.totalHeldKg()).to.equal(400_000);
    });

    it("duplicate serial reverts (unique-serial double-count guard)", async function () {
      await issueWind();
      await expect(issueWind()).to.be.revertedWith(
        "CarbonRegistry: serial already exists"
      );
    });

    it("zero-amount issue reverts", async function () {
      await expect(issueWind(0)).to.be.revertedWith(
        "CarbonRegistry: amount must be > 0"
      );
    });

    it("non-admin issue reverts", async function () {
      await expect(
        registry
          .connect(other)
          .issue("IN-SOLAR-2026-00001", "Solar Park", "Solar energy", 2026, 1_000)
      ).to.be.revertedWith("CarbonRegistry: caller is not admin");
    });
  });

  describe("retirement", function () {
    beforeEach(async function () {
      await issueWind(400_000);
    });

    it("partial retire updates held and records the retirement", async function () {
      await expect(
        registry.retire(WIND_SERIAL, 150_000, "GreenMart Retail", "Q1 offset")
      ).to.emit(registry, "CreditsRetired");

      const batch = await registry.getBatch(WIND_SERIAL);
      expect(batch.retiredKg).to.equal(150_000);
      expect(await registry.totalRetiredKg()).to.equal(150_000);
      expect(await registry.totalHeldKg()).to.equal(250_000);
      expect(await registry.retirementCount()).to.equal(1);

      const r = await registry.getRetirement(0);
      expect(r.serial).to.equal(WIND_SERIAL);
      expect(r.amountKg).to.equal(150_000);
      expect(r.beneficiary).to.equal("GreenMart Retail");
      expect(r.reason).to.equal("Q1 offset");
      expect(r.timestamp).to.be.gt(0);
    });

    it("retiring more than issued-minus-retired reverts", async function () {
      // Issue 400_000, retire 200_000, then attempt to retire 500_000 more.
      await registry.retire(WIND_SERIAL, 200_000, "GreenMart Retail", "offset");
      await expect(
        registry.retire(WIND_SERIAL, 500_000, "GreenMart Retail", "offset")
      ).to.be.revertedWith("CarbonRegistry: retirement exceeds issued amount");
    });

    it("full retire of the remaining balance succeeds", async function () {
      await registry.retire(WIND_SERIAL, 200_000, "GreenMart Retail", "offset");
      await registry.retire(WIND_SERIAL, 200_000, "GreenMart Retail", "offset");

      const batch = await registry.getBatch(WIND_SERIAL);
      expect(batch.retiredKg).to.equal(400_000);
      expect(await registry.totalHeldKg()).to.equal(0);
    });

    it("retiring against an unknown serial reverts", async function () {
      await expect(
        registry.retire("NOPE-0000", 1_000, "GreenMart Retail", "offset")
      ).to.be.revertedWith("CarbonRegistry: unknown serial");
    });

    it("zero-amount retire reverts", async function () {
      await expect(
        registry.retire(WIND_SERIAL, 0, "GreenMart Retail", "offset")
      ).to.be.revertedWith("CarbonRegistry: amount must be > 0");
    });

    it("non-admin retire reverts", async function () {
      await expect(
        registry.connect(other).retire(WIND_SERIAL, 1_000, "Mallory", "theft")
      ).to.be.revertedWith("CarbonRegistry: caller is not admin");
    });
  });

  describe("ledger anchoring", function () {
    it("anchorLedgerHead stores and returns the hash", async function () {
      await expect(registry.anchorLedgerHead("FY2025-26", HEAD_HASH))
        .to.emit(registry, "LedgerHeadAnchored")
        .withArgs("FY2025-26", HEAD_HASH);

      expect(await registry.anchoredHead("FY2025-26")).to.equal(HEAD_HASH);
      expect(await registry.anchoredHead("FY2024-25")).to.equal(
        ethers.ZeroHash
      );
    });

    it("non-admin anchor reverts", async function () {
      await expect(
        registry.connect(other).anchorLedgerHead("FY2025-26", HEAD_HASH)
      ).to.be.revertedWith("CarbonRegistry: caller is not admin");
    });
  });
});
