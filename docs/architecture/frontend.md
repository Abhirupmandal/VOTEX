# VOTEX Frontend Architecture (Phase 5)

> **Phase 5 deliverable.** This document describes the voter-facing VOTEX Web3
> application that ships in `votex/frontend`. It is written to match the code
> exactly: the on-chain integration is real (no mock vote path), the addresses
> and ABIs are derived from the Phase 2 artifacts, and the transaction flow
> follows the contract ABI end to end.

---

## 1. Scope

Phase 5 turns the Next.js foundation into a working decentralized voting
application backed by the **actual Phase 2 contracts**. It delivers:

| Capability | Route / Location |
| --- | --- |
| Landing + system status | `/` |
| Election dashboard | `/elections` |
| Election detail (eligibility, candidates, voting) | `/elections/[id]` |
| Results (winner, tie, live badge, verification) | `/elections/[id]/results` |
| Blockchain audit explorer | `/audit` |
| Wallet connection + network guard | global `SiteHeader` |

The frontend is **not** the authority for eligibility, election state, votes, or
verification. Every one of those is read from (or written to) the chain. The
backend is used only for *supplementary discovery, audit, and analytics*.

---

## 2. Layering (Presentation vs. Chain Access)

The architecture keeps blockchain access isolated from presentation:

```
src/
├── app/                       # App Router routes (presentation only)
│   ├── page.tsx               # landing (outside the (app) route group)
│   └── (app)/                 # shared AppShell chrome
│       ├── elections/         # dashboard + detail + results
│       └── audit/             # audit explorer
├── components/                # presentational + composite UI
│   ├── ui/                    # shadcn-style primitives
│   ├── wallet/  elections/  voting/  results/  audit/  layout/  landing/
├── hooks/                     # data layer (wagmi + react-query + backend)
├── lib/
│   ├── contracts/             # ABIs + address resolution (generated)
│   ├── api/                   # typed backend client (discovery/audit/analytics)
│   ├── wagmi.ts               # chain config (chainId 31337)
│   ├── errors.ts              # raw → human-readable error mapping
│   ├── elections.ts           # lifecycle presentation mapping
│   └── formatting.ts          # address/hash/time helpers
└── types/                     # shared TS types (on-chain + backend)
```

**Rule:** components never call `wagmi`/`viem` directly. They consume hooks.
Hooks are the only place where chain reads, simulations, and writes happen.

---

## 3. Real Contract Integration

### 3.1 ABIs (no hand-written ABIs)

ABIs are generated from the compiled Hardhat artifacts and committed under
`src/lib/contracts/abis/`:

- `election-factory.ts`
- `election-instance.ts`
- `voter-registry.ts`
- `emergency-controller.ts`
- `votex-access-manager.ts`

They are produced by `contracts/scripts/export-abis.ts`, which reads
`artifacts/contracts/**/*.json`. There is no manually retyped ABI anywhere in the
frontend.

### 3.2 Addresses (environment-driven)

`src/lib/contracts/addresses.ts` resolves each contract address from
`NEXT_PUBLIC_*` environment variables at runtime and validates them with
`viem`'s `isAddress`. Configured in `frontend/.env.local`:

```
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_VOTEX_FACTORY_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
NEXT_PUBLIC_VOTER_REGISTRY_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
NEXT_PUBLIC_EMERGENCY_CONTROLLER_ADDRESS=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
NEXT_PUBLIC_VOTEX_ACCESS_MANAGER_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

Contract addresses are **deterministic** for the Hardhat deploy order, so a
fresh `npm run deploy:local` reproduces the same addresses without editing the
env file.

### 3.3 Reads and writes

| Operation | Mechanism |
| --- | --- |
| Election discovery | `ElectionFactory.getElectionAddress(id)` then `getElection()` |
| Candidates | `ElectionInstance.getCandidates()` |
| Live results / winner | `ElectionInstance.getElectionResults()` / `getWinner()` |
| Eligibility | `VoterRegistry.isActive(voter)` + registration read |
| Has voted | `ElectionInstance.hasVoted(voter)` |
| Cast vote | `simulateContract(castVote)` → `writeContract` → `waitForTransactionReceipt` |

The voting write path uses `viem`'s `simulateContract` **before** submitting, so
a doomed transaction is rejected in simulation with a decoded custom error
rather than wasting gas on a revert.

---

## 4. Data Flow

```
Blockchain (source of truth)
   ▲ write castVote (wallet)                          │ read getElection/getCandidates/
   │                                                  ▼ getResults/hasVoted/isActive
Wallet → useVoting ──► tx state machine ──► VoteConfirmDialog
                                                    
Backend API (OFF-CHAIN INDEXED VIEW, supplementary)
   └── useElections (discovery) · useAudit (audit trail) · useResults (analytics)
```

If the backend indexer is offline, discovery falls back to on-chain enumeration
and the app continues to function; only the audit index and analytics degrade.

---

## 5. Wallet & Network (§3, §4)

`useWallet` exposes a single status union:

```
DISCONNECTED | CONNECTING | CONNECTED | WRONG_NETWORK | ERROR
```

- **Connect** via injected connector (MetaMask-compatible).
- **Address** is shortened (`0x1234…5678`) and copyable.
- **Disconnect** clears the local connection.
- **Wrong network** renders a banner plus `[ SWITCH NETWORK ]`, which calls
  `wallet_switchEthereumChain` for chainId `0x7a69` (31337).
- Private keys are **never** read, stored, or transmitted by the app.

---

## 6. Voting Flow & Transaction State Machine (§9, §10, §11)

Selecting a candidate on the detail page transitions directly into the confirm
step (the candidate card's `onSelect` both records the selection and opens the
modal). The state machine is:

```
IDLE → SIMULATING → AWAITING_WALLET → SUBMITTED → CONFIRMING → CONFIRMED
                                     ↘ REJECTED / FAILED (terminal)
```

- **SIMULATING** — `simulateContract` runs.
- **AWAITING_WALLET** — `AWAITING WALLET CONFIRMATION` prompt.
- **SUBMITTED** — `TRANSACTION SUBMITTED 0x…` (hash shown + copyable).
- **CONFIRMING** — `CONFIRMING ON BLOCKCHAIN` (receipt awaited, 1 confirmation).
- **CONFIRMED** — `✓ VOTE RECORDED` + `[ VIEW TRANSACTION ]`.
- **REJECTED / FAILED** — terminal; never an endless spinner.

Every failure surfaces a **human-readable** message; the raw revert reason is
only available inside an expandable "technical details" `<details>` block.

### 6.1 Double vote and eligibility (§12, §13)

- The detail page reads `hasVoted(voter)` on-chain. If true, it shows
  `✓ VOTE ALREADY CAST` and the contract independently reverts a second attempt
  with the `AlreadyVoted` custom error (selector `0x7c9a1cf9`).
- Eligibility comes from `VoterRegistry`: `✓ VERIFIED`, `✕ NOT REGISTERED`, or
  `⚠ INACTIVE`.

---

## 7. Results & Verification (§14, §15)

Results are computed from on-chain tallies (`getElectionResults` /
`getWinner`), rendered as bars via `CandidateCard` in read-only mode
(`selected={false}`, `onSelect={() => undefined}`, `disabled`). The page shows
**Total Votes**, **Winner** (or **Tie**), and a **LIVE RESULTS** badge when the
election is not yet finalized. `VerificationCard` renders **BLOCKCHAIN
VERIFIED** and links to the audit record.

---

## 8. Audit Explorer (§16)

`/audit` lists indexed `AuditEvent`s (OFF-CHAIN INDEXED VIEW) with filters by
event type and election, a transaction lookup (`/audit?tx=0x…`), and links to
the election and transaction. The verifiable source remains the chain; the audit
index is a convenience surface.

---

## 9. Testing

### 9.1 Unit / component (Vitest)

- 11 files / 75 tests passing, jsdom + Testing Library, mocked providers.
- Covers formatting, error mapping, lifecycle presentation, API client, the
  candidate card, eligibility banner, vote dialog state machine, event table,
  verification card, landing page, and election-state badge.

### 9.2 End-to-end (Playwright, real local blockchain)

- 6 tests / 2 files, executed with `npm run e2e`.
- The vote path is **not mocked**: `e2e/helpers/chain.ts` injects an EIP-1193
  provider via `addInitScript` and bridges `eth_sign`/signing to a viem
  `PrivateKeyAccount` in Node via `page.exposeFunction`. All other RPC is
  forwarded to the running Hardhat node, so the browser submits a **genuine
  on-chain transaction**.
- Suite covers: landing, a real vote + a rejected duplicate, wrong-network
  warning/recovery, and on-chain verified results.

---

## 10. Demo Runbook

```bash
# 1. local chain
cd votex/contracts
npm run node                 # Hardhat on :8545 (separate terminal)

# 2. deploy + seed a live election
npm run deploy:local
npm run demo:setup           # creates "NMIET Student Council", 3 candidates, seeds votes

# 3. backend (optional — analytics/audit index only)
cd ../backend
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000

# 4. frontend
cd ../frontend
npm run dev                  # http://127.0.0.1:3000
```

Then connect a funded Hardhat account (the demo leaves account #1 un-voted),
open the seeded election, select a candidate, confirm, and watch the real
transaction progress to `✓ VOTE RECORDED`.

---

## 11. Quality Gates (Phase 5 evidence)

| Gate | Command | Result |
| --- | --- | --- |
| Unit tests | `npm test` (frontend) | ✅ 75 passed / 11 files |
| Lint | `npx next lint` | ✅ no warnings or errors |
| Production build | `npm run build` | ✅ type-check clean, 6 routes |
| E2E (real chain) | `npm run e2e` | ✅ 6 passed / 2 files |
| Visual QA | `node qa/visual-qa.mjs` | ✅ 10 screenshots, 5 routes × 2 viewports |
| Security review | static scan of `src/` | ✅ no XSS sinks, secrets, or reverse-tabnabbing |

---

## 12. Known Limitations

- **One wallet = one vote.** Sybil resistance depends entirely on the off-chain
  enrolment decision of which wallets are registered.
- **No secret ballot.** Votes and the resulting tally are public on-chain.
- The frontend never encodes authority; it reflects on-chain state. Any UI is
  advisory and is re-checked by the contract at execution time.
