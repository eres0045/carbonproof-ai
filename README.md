# CarbonProof AI

**Emissions you can verify. Claims you can defend.**

A tamper-evident CO2e ledger with an AI-style claim checker, built for the
**IEEE ClimateChain Global Hackathon**, track:
**Carbon Markets & Emissions Transparency**.

---

## The problem

Carbon data today runs on trust. Companies record emissions in spreadsheets
that anyone can quietly edit after the fact, publish the totals in glossy
PDFs, and top them off with marketing claims like "100% carbon neutral" that
no one can check. Auditors, regulators, and customers have no cheap way to
answer two basic questions:

1. **Was this emissions record changed after it was entered?**
2. **Is this green claim actually substantiated — or is it greenwashing?**

Spreadsheets answer neither. CarbonProof AI is a prototype that answers both.

## The solution

CarbonProof AI combines two tools in one small web app:

1. **A hash-chained emissions ledger.** Every emissions record (electricity,
   diesel, petrol, flights, waste) is converted to CO2e with a *visible*
   emission factor, then sealed as a block containing its index, timestamp,
   the previous block's hash, and its own SHA-256 hash. Editing any
   historical record breaks the chain — and the built-in **Verify ledger**
   action recomputes every hash and link and shows exactly which block was
   altered. A demo-only "simulate tampering" mode acts out an edit on a
   *copy* of the chain so judges can watch the fraud get caught without
   touching real data.
2. **An AI-style claim checker.** Paste a sustainability claim before it
   goes public. A transparent, rule-based analysis assistant (fully local,
   no external API) scores the claim 0–100 on the substantiation signals
   green-claims guidance asks for — quantities with units, a named scope,
   a baseline/timeframe, methodology, and checkable evidence — and flags
   vague absolute phrases ("carbon neutral", "eco-friendly", "100% green")
   that arrive without proof, with concrete suggestions to make the claim
   defensible.

## Track alignment

The ClimateChain track *Carbon Markets & Emissions Transparency* calls for
blockchain-backed integrity and transparency in carbon data. CarbonProof AI
implements the core mechanism of that idea — an append-only, hash-linked
record chain with public verifiability — in a form a small organization can
actually use today, plus a claims layer aimed at the transparency problem
from the other side: what companies *say* about their footprint.

## Features

- 📥 **Emissions record entry** — organization/activity, category, quantity,
  date, evidence note/URL, with live CO2e preview before sealing.
- 🧮 **Transparent calculation** — every record shows its math on screen:
  `quantity × factor = kg CO2e`, including in the ledger view.
- 🔗 **Tamper-evident ledger** — SHA-256 hash chain (index, timestamp,
  prevHash, hash) with one-click full-chain verification and precise
  per-block error reporting; demo tamper simulation on a safe copy.
- 🤖 **AI claim checker** — substantiation score, flagged phrases,
  and sentence-level improvement suggestions; runs 100% locally.
- 📊 **Dashboard** — total CO2e, record count, per-category breakdown bars,
  live chain-integrity status, recent records.
- 💾 **Persistence + export** — records persist in browser localStorage;
  export the full ledger (with hashes) as JSON or CSV for auditors.
- 🌱 **Seeded demo data** — 3 realistic records so the first screen is
  meaningful immediately; one-click reset.

## Architecture

```
src/
  data/emissionFactors.js   — documented emission factors (single source of truth)
  lib/sha256.js             — pure-JS SHA-256 (FIPS 180-4), no dependencies
  lib/ledger.js             — CO2e math, block creation, chain verification
  lib/claimChecker.js       — rule-based claim scoring & suggestions
  App.jsx                   — React UI: dashboard / add / ledger / claims tabs
tests/logic.test.mjs        — node test: SHA-256 vectors, chain validity,
                              tamper detection, claim-score sanity
```

Everything runs client-side: React + Vite, no backend, no login, no API
keys. The same hash-chain design maps directly onto a smart-contract
anchor (see Roadmap).

## How to run

```bash
npm install
npm run dev        # development server (Vite prints the local URL)
npm run build      # production build → dist/ (static site, deploy anywhere)
npm run preview    # serve the production build locally
node tests/logic.test.mjs   # run the logic tests
```

## Emission-factor note (important)

The factors in `src/data/emissionFactors.js` are **prototype defaults**:
round, public-sector-style values in the range published by widely used
government/industry conversion-factor tables (grid electricity, road fuels,
air travel, landfill waste). They are deliberately **not** presented as an
audited source and no specific edition is cited. Production use should pin
each factor to a named, versioned factor release and store the factor
version alongside every record — the data model already carries the factor
used, per record, in the calculation display.

| Category | Unit | Factor (kg CO2e/unit) | Scope |
|---|---|---|---|
| Electricity | kWh | 0.82 | Scope 2 |
| Diesel | litres | 2.68 | Scope 1 |
| Petrol | litres | 2.31 | Scope 1 |
| Business flight | passenger-km | 0.18 | Scope 3 |
| Waste to landfill | kg | 0.45 | Scope 3 |

## Limitations (honest list)

- **Client-side only.** localStorage persistence means the ledger lives in
  one browser; clearing site data erases it. No multi-user sync, no auth.
- **Tamper-evidence, not tamper-proofing.** A hash chain proves a record
  changed *relative to a known-good copy of the hashes*; an attacker who
  controls the only copy could rebuild the whole chain. Real deployments
  need the anchoring step in the roadmap.
- **Claim checker is a heuristic prototype**, not an LLM and not legal
  advice: it detects *absence of substantiation signals*, it cannot verify
  that stated numbers are true.
- **Prototype emission factors** (see note above); flight factor is a
  single average, not distance/cabin-aware.

## Roadmap

1. **On-chain anchoring** — periodically anchor the chain head hash (and
   Merkle root of each period) to a public blockchain via a chain-agnostic
   anchoring service, making history edits detectable against an
   independent, timestamped commitment.
2. **Smart-contract registry** — optional contract that stores anchors and
   exposes a public `verify(recordHash)` endpoint for auditors/customers.
3. **Versioned factor library** — named, dated factor sets per country/
   region with the factor version sealed into each block.
4. **Evidence attachments** — hash documents (bills, meter photos) into the
   block so evidence is covered by the same tamper-evidence.
5. **Team mode** — shared ledger backend with role-based entry (data
   entry vs. verifier), keeping the same hash-chain core.
6. **Claim checker v2** — optional LLM pass for nuance, layered on top of
   the transparent rule score so the score stays explainable.
