# CarbonProof AI

**Emissions you can verify. Claims you can defend.**

A tamper-evident CO2e ledger and carbon-credit registry with an explainable
claim checker, built for the **IEEE ClimateChain Global Hackathon**, track:
**Carbon Markets & Emissions Transparency**.

- **Live demo:** https://carbonproof-ai.vercel.app
- **Public anchor record:** `public/carbonproof-anchor.txt` (+ its
  OpenTimestamps proof, `public/anchor.ots`) — the seeded ledger state,
  timestamped into the Bitcoin blockchain.

---

## The problem

Carbon markets run on trust they haven't earned. Companies record emissions
in spreadsheets anyone can quietly edit, publish totals as static PDFs, and
announce "carbon neutrality" backed by credits that may have been counted
twice — double counting is named in this track's own problem statement.
Auditors, regulators, and buyers have no cheap way to answer three basic
questions:

1. **Was this emissions record changed after it was entered?**
2. **Do the claimed credits actually exist — and were they retired only once?**
3. **Is this green claim substantiated — or is it greenwashing?**

CarbonProof AI is a working prototype that answers all three.

## The solution

One hash chain, three kinds of blocks — emissions, credit issuances, and
credit retirements — so every claim the app makes can be checked in a
single verification pass:

1. **Emissions ledger.** Each record is converted to CO2e using a
   *published, cited* emission factor (shown inside every record's
   calculation) and sealed as a SHA-256 hash-chained block. Editing any
   historical record breaks the chain; **Verify ledger** recomputes every
   hash, link, and CO2e figure and names the exact block that was altered.
   A demo-only tamper simulation edits a *copy* so judges can watch fraud
   get caught safely.
2. **Carbon-credit registry with a double-counting guard.** Credits are
   issued under unique registry serials and retired against emissions —
   both as sealed blocks in the same chain. Verification enforces the
   market's core invariants: a serial can be issued only once; retirements
   must reference an issued serial; cumulative retirements can never
   exceed issuance. The dashboard shows the live net position (emissions −
   retired), and you can retire credits live to watch it reach neutral.
3. **Explainable claim checker.** A transparent rule engine (deliberately
   *not* a black-box AI — it runs fully locally) scores a draft claim
   0–100 on substantiation signals: quantities, scope, baseline, evidence.
   For neutrality claims it goes further and cross-checks the words
   against the ledger itself: retirements must cover recorded emissions,
   or the claim fails — with the exact shortfall named.
4. **Public anchoring.** The seeded ledger's state is sealed in a public
   anchor record whose SHA-256 is timestamped via **OpenTimestamps** into
   the **Bitcoin blockchain**. Anyone can recompute the ledger head hash
   from this repo and verify the timestamp independently at
   opentimestamps.org — the seeded history cannot be quietly rewritten
   afterwards, not even by us.

## Track alignment

The track calls for blockchain-based carbon-credit verification,
transparent emissions tracking, and mechanisms that prevent double
counting. CarbonProof AI implements exactly that stack in miniature:
hash-chained tracking, a serial-based credit registry whose verification
*enforces* the no-double-counting invariant, and a public-chain anchor —
in a form a small organization can actually use today.

## Features

- 📥 **Record entry + CSV import** — single records or bulk spreadsheet
  import (template included); invalid rows are reported, never swallowed.
- 🧮 **Transparent calculation** — `quantity × factor = kg CO2e` shown in
  every record; factors pinned to published sources (below).
- 🔗 **Tamper-evident ledger** — one-click verification of hashes, links,
  CO2e math *and* credit invariants, with precise per-block error reports.
- 🪙 **Credit lifecycle** — issue / hold / retire with the double-counting
  guard enforced in both the UI and chain verification.
- ⛓ **Bitcoin anchoring** — OpenTimestamps proof for the seeded state,
  downloadable from the dashboard and independently verifiable.
- 🔍 **Claim checker** — substantiation score, flagged phrases,
  improvement suggestions, and the ledger cross-check for neutrality
  claims.
- 📊 **Dashboard** — totals, net position, per-category breakdown, live
  integrity status, anchor status, recent activity.
- 🌱 **Seeded dataset** — a full financial year (FY2025-26) for a mid-size
  retailer: 65 emissions records (483.4 t CO2e) + 750 t of credits issued,
  300 t retired. Deterministic, so the chain head is reproducible.
- 💾 **Export** — full ledger (with hashes) as JSON or CSV for auditors.

## Architecture

```
src/
  data/emissionFactors.js   — published factors with named sources
  data/anchor.json          — public-anchor metadata shown in the app
  lib/sha256.js             — pure-JS SHA-256 (FIPS 180-4), no dependencies
  lib/ledger.js             — CO2e math, emissions + credit blocks,
                              chain & invariant verification, seeded data
  lib/claimChecker.js       — rule-based claim scoring + ledger cross-check
  lib/csvImport.js          — activity CSV parsing/validation
  App.jsx                   — React UI (dashboard / add / ledger / credits / claims)
public/
  carbonproof-anchor.txt    — anchor record sealing the seeded ledger state
  anchor.ots                — OpenTimestamps proof for that record
tests/logic.test.mjs        — SHA-256 vectors, chain validity, tamper
                              detection, credit-invariant tests, claim
                              cross-check, CSV import tests
```

Everything runs client-side: React + Vite, no backend, no login, no API
keys. Anchoring is done with the OpenTimestamps protocol (calendar
attestations upgrading to a Bitcoin block attestation).

## How to run

```bash
npm install
npm run dev        # development server (Vite prints the local URL)
npm run build      # production build → dist/ (static site, deploy anywhere)
npm run preview    # serve the production build locally
node tests/logic.test.mjs   # run the logic tests (all passing)
```

## Emission factors (published, cited)

| Category | Unit | Factor (kg CO2e/unit) | Source |
|---|---|---|---|
| Electricity | kWh | 0.727 | CEA (India) CO2 Baseline Database, FY 2023-24 grid weighted average |
| Diesel | litres | 2.5128 | UK DESNZ GHG Conversion Factors 2024 (average biofuel blend) |
| Petrol | litres | 2.0844 | UK DESNZ GHG Conversion Factors 2024 (average biofuel blend) |
| Business flight | passenger-km | 0.18592 | UK DESNZ 2024, short-haul economy incl. radiative-forcing uplift |
| Waste to landfill | kg | 0.467 | UK DESNZ 2024, commercial & industrial waste to landfill (467 kg/t) |

## Limitations (honest list)

- **Client-side demo.** Records live in the visitor's browser
  (localStorage); the anchor seals the *seeded* state, not later edits —
  a production deployment would anchor every state change and hold the
  registry in a smart contract.
- **Tamper-evidence ≠ tamper-proofing.** The chain + public anchor make
  edits *detectable against an independent commitment*; they do not make
  edits impossible on a private copy.
- **Credit serials in the seeded dataset are illustrative** (the dataset
  is a realistic prototype, not a real company's registry extract).
- **Claim checker is a heuristic**, not an LLM and not legal advice: it
  detects missing substantiation and ledger mismatches; it cannot verify
  that entered activity data reflects the real world.

## Roadmap

1. **Smart-contract registry** — move issuance/retirement on-chain so the
   double-counting guard is enforced by the network, not the app.
2. **Per-change anchoring** — anchor every ledger state transition
   (Merkle root per period) instead of only genesis state.
3. **Evidence hashing** — hash bills/meter photos into blocks so evidence
   is covered by the same tamper-evidence.
4. **Versioned factor library** — more regions/years, factor version
   sealed into each block.
5. **Team mode + optional LLM second pass** on the claim checker, layered
   over the transparent rule score.
