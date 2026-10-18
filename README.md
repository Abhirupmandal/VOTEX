# VOTEX — Decentralized Election Infrastructure

> **An Academic Research Prototype for Verifiable E-Voting with Passive AI Telemetry**

VOTEX is a full-stack decentralized e-voting and election governance platform. It couples authoritative Ethereum smart contracts with an event-driven off-chain indexer, a FastAPI REST gateway, and a Next.js 14 web client, monitored by a passive AI Election Guardian.

---

## 1. Project Overview

VOTEX explores the application of public blockchain infrastructure to electronic elections. The system enforces ballot integrity, voter eligibility, and lifecycle governance directly on-chain, while providing a fast, accessible web interface for voters, election administrators, and independent auditors.

---

## 2. Problem Statement

Traditional electronic voting systems suffer from fundamental transparency and trust deficits:
- **Centralized Vulnerabilities**: A compromised database or server can alter tallies or voter rolls without leaving an immutable audit trail.
- **Closed Counting**: Voters must blindly trust that the centralized tally server counted their ballot correctly.
- **Administrative Overreach**: Centralized administrators frequently hold arbitrary power to delete or manipulate records.

---

## 3. Why Blockchain is Used

Public blockchain technology provides specific, verifiable guarantees:
- **Immutable Append-Only Audit Log**: Once mined into an Ethereum block, state transitions and votes cannot be rewritten, deleted, or backdated.
- **Deterministic Smart Contract Execution**: Ballot tallying and eligibility verification follow open-source, compiled EVM bytecode.
- **Decentralized Censorship Resistance**: No single central server can unilaterally revoke an election once deployed on public Ethereum.
- **Independent Verifiability**: Anyone with an internet connection can independently verify election results using a block explorer or RPC query.

---

## 4. Architectural Trust Model

VOTEX enforces a strict three-tier classification of authority:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            VOTEX TRUST HIERARCHY                           │
├────────────────────────────────┬────────────────────────────────────────────┤
│ TIER 1: AUTHORITATIVE          │ Ethereum Sepolia Smart Contracts           │
│ (Immutable Source of Truth)    │ • Vote tallies, eligibility commitments    │
│                                │ • Election state machine transitions       │
│                                │ • Role-based access control (RBAC)         │
├────────────────────────────────┼────────────────────────────────────────────┤
│ TIER 2: DERIVED                │ Backend Indexer & Database Read Model      │
│ (Off-Chain Analytics View)     │ • Normalized event log (SyncManager)       │
│                                │ • Read-optimized SQL projections           │
│                                │ • Dual-source audit & reconciliation API   │
├────────────────────────────────┼────────────────────────────────────────────┤
│ TIER 3: ADVISORY               │ AI Election Guardian                       │
│ (Passive Telemetry Monitor)    │ • Velocity spikes & statistical anomalies  │
│                                │ • Risk scores & explainability factors     │
│                                │ • STRICTLY SUPERVISORY — ZERO STATE WRITE  │
└────────────────────────────────┴────────────────────────────────────────────┘
```

---

## 5. Technology Stack

- **Smart Contracts**: Solidity `0.8.24`, OpenZeppelin Contracts `v5`, Hardhat, TypeScript, Ethers.js
- **Backend Service**: Python `3.12`, FastAPI, SQLAlchemy, Alembic, SQLite / PostgreSQL 16, Uvicorn
- **AI Telemetry**: NumPy, SciPy, custom statistical anomaly & velocity baseline engines
- **Frontend Client**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Wagmi `v2`, Viem, Lucide React
- **Testing & QA**: Hardhat Test Suite, Pytest, Vitest, Testing Library, Playwright Chromium

---

## 6. Smart Contract Architecture

The on-chain system consists of five decoupled contracts:

1. **`VotexAccessManager`**: Implements hierarchical OpenZeppelin `AccessControl` for system roles.
2. **`VoterRegistry`**: Stores pseudonymized voter commitments (`keccak256(voterAddress, secret)`) and status flags.
3. **`ElectionFactory`**: Factory contract deploying individual `ElectionInstance` contracts and indexing them.
4. **`ElectionInstance`**: Encapsulates election parameters, candidate rosters, voting windows, and atomic tallying.
5. **`EmergencyController`**: Circuit breaker enabling authorized security officers to pause/resume active elections.

---

## 7. Election Lifecycle

Election instances follow a strict, irreversible linear state machine:

$$\text{DRAFT} \longrightarrow \text{REGISTRATION} \longrightarrow \text{ACTIVE} \underset{\text{resume}}{\overset{\text{pause}}{\rightleftharpoons}} \text{PAUSED} \longrightarrow \text{ENDED} \longrightarrow \text{RESULTS\_FINALIZED}$$

- **`DRAFT`**: Candidates can be added; parameters can be configured.
- **`REGISTRATION`**: Voter commitments are registered; candidate additions locked.
- **`ACTIVE`**: Ballots can be submitted by registered voters.
- **`PAUSED`**: Emergency halt by `SECURITY_OFFICER_ROLE`; voting temporarily blocked.
- **`ENDED`**: Voting window closed; ballots cannot be submitted.
- **`RESULTS_FINALIZED`**: Terminal state; tallies and winner certified permanently.

---

## 8. Voter Lifecycle

1. **Registration**: An authorized registrar enrolls the voter's address and commitment hash in `VoterRegistry`.
2. **Verification**: During voting, `ElectionInstance` queries `VoterRegistry.isRegisteredVoter(msg.sender)`.
3. **Ballot Submission**: The voter calls `castVote(candidateId)`.
4. **Duplicate Protection**: The contract records `hasVoted[voter] = true`. Any subsequent attempt reverts immediately on-chain with custom error `AlreadyVoted(electionId, voter)`.

---

## 9. Admin & Role-Based Access Control (RBAC)

Role administration is enforced on-chain via `VotexAccessManager`:

| Role Identifier | Permissions |
| :--- | :--- |
| `DEFAULT_ADMIN_ROLE` | Grant/revoke operational roles; contract upgrades |
| `ELECTION_MANAGER_ROLE` | Deploy elections via factory, advance lifecycle states, add candidates |
| `VOTER_REGISTRAR_ROLE` | Register and deactivate eligible voters |
| `SECURITY_OFFICER_ROLE` | Execute emergency pause/resume via `EmergencyController` |
| `AUDITOR_ROLE` | Read-only verification access (explicit on-chain designation) |

---

## 10. Backend & Indexer Architecture

The backend service (`votex/backend`) operates an event listener (`SyncManager`) that polls Ethereum Sepolia RPCs:
- **Chunked Polling**: Scans event logs in safe block ranges (e.g. 10–20 blocks) to prevent RPC rate-limit aborts.
- **Checkpoint Persistence**: Tracks processed block heights in `indexer_state`.
- **Idempotency**: Calculates unique natural keys (`tx_hash + log_index`) for every event, ensuring re-scans never duplicate records.
- **Reorg Resilience**: Maintains a confirmation depth (`INDEXER_CONFIRMATIONS=2`) before committing events.

---

## 11. Database Read Model

The backend projects indexed blockchain events into relational tables:
- `elections`: Metadata, state, timestamps, contract addresses.
- `candidates`: Candidate rosters and current indexed vote counts.
- `voters`: Registered voter addresses and commitments.
- `votes`: Anonymized ballot receipts (transaction hash, block number, candidate ID).
- `blockchain_events`: Raw audit log of every indexed smart contract event.
- `ai_alerts` / `ai_risk_assessments`: Security metrics and telemetry snapshots.

---

## 12. AI Election Guardian

The AI Guardian is a passive integrity monitor designed to assist human election officials:
- **Telemetry Extraction**: Evaluates rolling vote velocity, registration rates, and temporal distributions.
- **Anomaly Detection**: Calculates z-scores against calibrated baselines to detect sudden velocity spikes.
- **Hard Architectural Boundary**: The AI Guardian has **zero write permissions** on-chain. It cannot pause elections, alter tallies, or invalidate votes. It only generates advisory risk scores (0–100) and alert notifications for human operators.

---

## 13. Frontend Client Architecture

Built with Next.js 14 and Tailwind CSS, the client interface provides:
- **Direct Web3 Connectivity**: Wagmi v2 and Viem manage MetaMask connection with fallback RPC transports (`ethereum-sepolia-rpc.publicnode.com` and `1rpc.io/sepolia`).
- **Hook Layering**: Custom hooks (`useElection`, `useVoting`, `useAdminRoles`) decouple UI components from raw RPC mechanics.
- **RBAC Gate**: `AdminGuard` inspects real on-chain role membership before rendering administrative consoles.
- **Dual Verification Display**: Surfaces the green `BLOCKCHAIN VERIFIED` badge when indexed backend tallies match live smart contract reads.

---

## 14. Security Model & Threat Mitigation

| Threat Vector | Mitigation Strategy |
| :--- | :--- |
| **Double Voting** | Enforced by EVM storage: `hasVoted[voter]` check reverts atomically |
| **Unauthorized Lifecycle State** | OpenZeppelin `onlyRole` guards; state machine asserts valid step |
| **RPC / Node Tampering** | Frontend queries multi-provider fallback; API cross-checks indexer |
| **SQL Injection / Backend Compromise** | SQLAlchemy ORM parameterized queries; backend is non-authoritative |
| **Privilege Escalation** | Admin console gates UI, while EVM contracts strictly revert unauthorized transactions |

---

## 15. Ethereum Sepolia Deployment

- **Network**: Ethereum Sepolia Testnet
- **Chain ID**: `11155111`
- **Earliest Block**: `11938337`
- **Authoritative Election ID**: `#1`

---

## 16. Authoritative Contract Addresses

| Contract | Address |
| :--- | :--- |
| **VotexAccessManager** | `0x32CcA7F2A1336e9160e2c1D76F9C3493C0f6F033` |
| **VoterRegistry** | `0x3C2482EdA3aaDa7EEeb07c937f1c2DAF7fedCeEc` |
| **ElectionFactory** | `0x27B6CBfCF0E909e2e4158A34b42e2904041312Be` |
| **EmergencyController** | `0x6a381FCe8494c09D131d0F0467e83150801Ec526` |
| **ElectionInstance #1** | `0xA88aa3bB1754Cc5cE43D48e7374D8BdF802f7762` |

---

## 17. Local Development Setup

### Prerequisites
- Node.js `20.x` or higher & npm
- Python `3.12`
- Git

### Quickstart

1. **Clone Repository**:
   ```bash
   git clone <repo-url>
   cd votex
   ```
2. **Backend Setup**:
   ```bash
   cd backend
   python -m venv .venv
   .\.venv\Scripts\activate      # On Windows
   # source .venv/bin/activate   # On Linux/macOS
   pip install -r requirements.txt
   alembic upgrade head
   uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```
3. **Frontend Setup**:
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```
   Open `http://localhost:3000`.

---

## 18. Environment Variables

Templates are provided in each component:
- Root: [`.env.example`](.env.example)
- Backend: [`backend/.env.example`](backend/.env.example)
- Contracts: [`contracts/.env.example`](contracts/.env.example)
- Frontend: [`frontend/.env.example`](frontend/.env.example)

---

## 19. Running Smart Contract Tests

```bash
cd votex/contracts
npx hardhat test
```
*Expected: 90 passing tests across security, access control, state machine, and adversarial attack suites.*

---

## 20. Running Backend Tests

```bash
cd votex/backend
.\.venv\Scripts\pytest.exe
```
*Expected: 188 passed tests validating API routes, event indexing, and AI Guardian engines.*

---

## 21. Running Frontend Tests

```bash
cd votex/frontend
npm test -- --run
```
*Expected: 148 passed unit/component tests across 16 test files.*

---

## 22. Running Browser E2E Tests

```bash
cd votex/frontend
node qa/sepolia-browser-e2e.mjs
```
*Expected: Real Chromium browser automation verifies 12 application routes with 0 console errors and saves screenshot artifacts.*

---

## 23. Production Build

To validate full type safety and production bundling:
```bash
cd votex/frontend
npm run build
```

---

## 24. How to Connect MetaMask to Sepolia

1. Open the MetaMask browser extension.
2. Select the network dropdown at top-left and choose **Sepolia**.
3. If Sepolia is not listed, enable "Show test networks" in MetaMask settings.
4. Obtain testnet SepoliaETH from a public faucet (e.g., Google Cloud Sepolia Faucet or PoW Faucet).
5. Open `http://localhost:3000/elections` and click **Connect Wallet**.

---

## 25. How to Perform an Actual Election

1. **Create Election**: An account with `ELECTION_MANAGER_ROLE` visits `/admin/elections` and submits the election creation form.
2. **Add Candidates**: Add candidate names and details before registration closes.
3. **Register Voters**: An account with `VOTER_REGISTRAR_ROLE` visits `/admin/voters` and registers eligible wallet addresses.
4. **Open Registration & Start Voting**: Advance lifecycle through `REGISTRATION` to `ACTIVE`.
5. **Cast Ballots**: Eligible voters connect their wallet at `/elections/[id]` and click **Cast Vote**.
6. **End & Finalize**: Advance state from `ACTIVE` to `ENDED` and then `RESULTS_FINALIZED`.

---

## 26. Known Limitations

As an academic research prototype, VOTEX has specific limitations:
- **Public Pseudonymity vs. Ballot Secrecy**: While voter identities are pseudonymized via wallet addresses and commitments, transaction payloads on public Ethereum reveal which address voted for which candidate. Real national elections require zero-knowledge proofs (zk-SNARKs/zk-STARKs) or homomorphic encryption to achieve true secret-ballot privacy.
- **Gas Costs**: Public L1 transactions incur gas fees. Scaling to millions of votes requires Ethereum Layer 2 rollups (e.g. Arbitrum, Optimism) or dedicated appchains.
- **Sybil Resistance**: Identity-proofing is currently modeled via an authorized registrar. Decentralized identity (DID / WorldID) would be necessary for permissionless voter registration.

---

## 27. Future Improvements

1. **Zero-Knowledge Ballots**: Implement MACI (Minimal Anti-Collusion Infrastructure) or Semaphore-based zk-proofs for coercion-resistant, confidential voting.
2. **Layer 2 Rollup Deployment**: Migrate contract execution to an L2 rollup to reduce transaction costs to <$0.01 per vote.
3. **Decentralized Storage**: Store election manifestos and candidate media on IPFS / Filecoin.
4. **Federated AI Telemetry**: Distribute AI Guardian anomaly verification across multiple independent validator nodes.

---

## 28. Gas Optimization Discussion

During Phase 7 testnet deployment, `createElection()` incurred ~3.95M gas. This is expected because the factory deploys a full `ElectionInstance` contract with complete storage and state machine logic.
- **Safe Future Optimization**: The factory could be refactored to use ERC-1167 Minimal Proxies (`Clones.clone()`), reducing deployment gas by >85% while preserving identical bytecode execution.

---

## 29. On-Chain vs. Indexed-Data Trust Model

VOTEX explicitly distinguishes between the source of truth and read optimizations:
- **Primary Source**: The Ethereum Sepolia blockchain is the sole authoritative record.
- **Secondary Cache**: The backend indexer is a convenience layer for search, sorting, and fast pagination.
- **Verification Loop**: Any client can bypass the backend and verify results directly against the blockchain contract `0xA88aa3bB1754Cc5cE43D48e7374D8BdF802f7762`.

---

## 30. Academic & Demonstration Evidence

Authoritative testnet evidence from **Election #1**:
- **Election State**: `RESULTS_FINALIZED`
- **Candidate #1 (Dr. Alice Vance)**: `1 vote` (Certified Winner)
- **Candidate #2 (Bob Chen)**: `0 votes`
- **Reconciliation Check**: `MATCH (indexed_votes == on_chain_votes)`
- **AI Guardian Risk Score**: `40` (`ELEVATED` / `CALIBRATING`)
- **Indexed Audit Events**: `10` total system-wide events (`1` contract wiring event + `9` Election #1 lifecycle events)
- **Full Dossier**: See [`docs/VERIFICATION.md`](docs/VERIFICATION.md) for complete transaction hashes and receipts.
