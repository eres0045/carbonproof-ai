# CarbonRegistry — CarbonProof AI smart contract

An on-chain carbon-credit registry that mirrors the CarbonProof AI app's
off-chain registry, enforcing the same anti-double-counting rules in Solidity
so they hold even if the app (or its operator) misbehaves.

The app keeps a local SHA-256 hash-chained emissions ledger plus a credit
registry. This contract is the trust anchor for the credit side of that
system: issuance, retirement, and a commitment to the ledger's head hash all
live on-chain, where anyone can audit them.

## The rules (mirroring the app's invariants)

| App invariant | Contract enforcement |
| --- | --- |
| Every credit batch has a **unique serial** | `issue()` reverts if the serial already exists — double issuance of the same batch is impossible |
| **Retirements never exceed issuance** | `retire()` reverts unless `retiredKg + amountKg <= issuedKg` for that batch |
| Amounts are exact, no float drift | All amounts are `uint256` **kilograms** (1 t = 1,000 kg) |
| Only the registry operator mutates state | `issue`, `retire`, and `anchorLedgerHead` are `onlyAdmin` (admin = deployer) |
| Ledger state is verifiable | `anchorLedgerHead(period, headHash)` stores the app ledger's SHA-256 head hash per reporting period; events make every state change auditable |

Key functions:

- `issue(serial, projectName, projectType, vintage, amountKg)` — create a batch
- `retire(serial, amountKg, beneficiary, reason)` — permanently retire credits
  against a batch; every retirement is kept in an append-only log
- `anchorLedgerHead(period, headHash)` — commit the off-chain ledger's head
- Views: `getBatch`, `batchCount`, `totalIssuedKg`, `totalRetiredKg`,
  `totalHeldKg`, `retirementCount`, `getRetirement`, `anchoredHead`

The contract is fully self-contained (no external imports) and compiles with
Solidity `^0.8.24`.

## Run the tests

```bash
cd contracts
npm install
npx hardhat test
```

The suite covers the guards end-to-end: issuance and totals, duplicate-serial
revert, zero-amount reverts, non-admin reverts, partial retirement accounting,
the over-retirement scenario (issue 400,000 kg → retire 200,000 kg → retire
500,000 kg reverts), full retirement of the remainder, and ledger-head
anchoring.

## Deployment

`scripts/deploy.js` deploys `CarbonRegistry` and then seeds it to mirror the
app's published state:

| Batch | Serial | Issued | Retired |
| --- | --- | --- | --- |
| Urja Wind Farms — Madhya Pradesh (Wind energy, 2026) | `IN-WIND-2026-04471` | 400,000 kg | 200,000 kg |
| Sahyadri Reforestation Collective (Reforestation, 2026) | `IN-AFOR-2026-01183` | 350,000 kg | 100,000 kg |

Retirements are recorded for beneficiary **GreenMart Retail** with reason
"FY2025-26 annual offset". The script then anchors the app's seeded ledger
head hash `afd9ffd954baaee59beff0f78900ae95ad80acc1a86bc483a1a64f180a62e9f5`
for period `FY2025-26`, prints every transaction hash, and asserts the final
totals: **issued 750,000 kg · retired 300,000 kg · held 450,000 kg**.

### Sepolia

The RPC URL and deployer key are read from environment variables — never
hardcode a key:

```bash
export SEPOLIA_RPC_URL="https://your-sepolia-rpc"
export DEPLOYER_PRIVATE_KEY="0x..."   # funded Sepolia testnet account
npm run deploy:sepolia
```

## Deployment (Sepolia) — LIVE

Deployed and seeded on **Ethereum Sepolia** (chainId 11155111) on 2026-10-23.
Source verified on Sourcify (**exact match**, runtime + creation) and pushed
to Etherscan — the full source is readable on the explorer.

- **Contract:** [`0xEeDa0d764654798Fb25e3981Be236A75edCF0a8e`](https://sepolia.etherscan.io/address/0xEeDa0d764654798Fb25e3981Be236A75edCF0a8e)
- **Deploy tx:** [`0x86a74ba1…f9510ea`](https://sepolia.etherscan.io/tx/0x86a74ba1ea3e95110a93627b671bcf46b310a021f4d3b3bef7dbcc0b8f9510ea)
- **Issue `IN-WIND-2026-04471` (400,000 kg):** [`0x4f6911a4…c34cd`](https://sepolia.etherscan.io/tx/0x4f6911a4953d863fe341c72b4e8752a88fc535ec7a27cd7bdaf90d245e8c34cd)
- **Issue `IN-AFOR-2026-01183` (350,000 kg):** [`0x5a85d0cb…90cbe`](https://sepolia.etherscan.io/tx/0x5a85d0cb46c3d04b36aeb6422c0383aaf39f84205a263a51ba7457195e890cbe)
- **Retire 200,000 kg (wind):** [`0x033239d5…348e6`](https://sepolia.etherscan.io/tx/0x033239d5bd20e01f44ca4d18a537ad123a7eee92b9dbc55f46ce5cd732b348e6)
- **Retire 100,000 kg (reforestation):** [`0x3dce771c…08360`](https://sepolia.etherscan.io/tx/0x3dce771c67977b78315c3ca109eaa3b0370ef794f00fffc7746061ceb7e08360)
- **Anchor ledger head (FY2025-26):** [`0x03ff6481…9c81`](https://sepolia.etherscan.io/tx/0x03ff6481af01ad3507401f8f2987641b77afb279c1a561d7b474cff9fb4e9c81)

On-chain state, independently re-read after deployment: issued **750,000 kg** ·
retired **300,000 kg** · held **450,000 kg** · 2 batches · 2 retirements ·
`anchoredHead("FY2025-26")` = `0xafd9ffd954baaee59beff0f78900ae95ad80acc1a86bc483a1a64f180a62e9f5`,
exactly matching the app's seeded ledger head.
