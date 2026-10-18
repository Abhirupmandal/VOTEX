# VOTEX — Test & Verification Evidence Dossier

This document compiles the exhaustive verification evidence for the VOTEX decentralized e-voting platform across Phases 7, 8, and 9. All evidence is strictly categorized to differentiate between real on-chain activity, local automated testing, and browser rendering.

---

## 1. Evidence Category Taxonomy

- **`[REAL SEPOLIA]`**: Executed directly against Ethereum Sepolia testnet (Chain ID 11155111) with real gas, mined blocks, and public transaction receipts on Etherscan.
- **`[BROWSER E2E]`**: Executed using automated headless Chromium browser automation against rendered HTML/DOM.
- **`[LOCAL TEST]`**: Executed locally in test harnesses (Hardhat local network, Pytest SQLite in-memory).
- **`[UNIT TEST]`**: Isolated component, schema, or math unit test without external dependencies.

---

## 2. Real Ethereum Sepolia Deployment & Lifecycle `[REAL SEPOLIA]`

### 2.1 Core Contracts Deployment

All core contracts were deployed to Ethereum Sepolia at block `11938337` and verified on-chain:

| Contract | Address | Verification Check |
| :--- | :--- | :--- |
| **VotexAccessManager** | `0x32CcA7F2A1336e9160e2c1D76F9C3493C0f6F033` | Bytecode verified, `hasRole(DEFAULT_ADMIN_ROLE)` = true |
| **VoterRegistry** | `0x3C2482EdA3aaDa7EEeb07c937f1c2DAF7fedCeEc` | Bytecode verified, access manager wired |
| **ElectionFactory** | `0x27B6CBfCF0E909e2e4158A34b42e2904041312Be` | Bytecode verified, instances registered |
| **EmergencyController** | `0x6a381FCe8494c09D131d0F0467e83150801Ec526` | Bytecode verified, pause hooks wired |

### 2.2 Authoritative Blockchain Events & Election #1 Lifecycle Transaction Log

The database records **10 total system-wide indexed blockchain events** on Ethereum Sepolia:
- **1 Deployment Wiring Event**: `EmergencyControllerUpdated` (block 11938341, tx `0x72db...`) establishing the circuit-breaker link between `EmergencyController` and `ElectionFactory`.
- **9 Election #1 Lifecycle Events**: The complete execution of `VOTEX Sepolia E2E Test Election` on-chain:

| Step / Event | Operation | Transaction Hash | Block | Gas Used | Receipt Status | Etherscan Link |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| **0** | `EmergencyControllerUpdated` | `0x72db8347e0976b4c5942b8e58d1b2d0c8e68e811aefd05859a3048cfa711c94c` | `11938341` | 46,280 | `1 (Success)` | [View Tx](https://sepolia.etherscan.io/tx/0x72db8347e0976b4c5942b8e58d1b2d0c8e68e811aefd05859a3048cfa711c94c) |
| **1** | `createElection()` | `0x75bfa75b949cd5ec656ebc6feab9dbe14ab56908e6d6d51365ed5cc84e1d908b` | `11938502` | 3,959,045 | `1 (Success)` | [View Tx](https://sepolia.etherscan.io/tx/0x75bfa75b949cd5ec656ebc6feab9dbe14ab56908e6d6d51365ed5cc84e1d908b) |
| **2** | `addCandidate(Dr. Alice Vance)` | `0x5e0e619a61d607afa0afc307c421f86fa3e0c3cf1ade496a98e3a5e1191d8d41` | `11938503` | 134,812 | `1 (Success)` | [View Tx](https://sepolia.etherscan.io/tx/0x5e0e619a61d607afa0afc307c421f86fa3e0c3cf1ade496a98e3a5e1191d8d41) |
| **3** | `addCandidate(Bob Chen)` | `0x8595f22692788ca4d120920373f5cd0be291357b0f95908592b0b61d7430e91a` | `11938504` | 91,446 | `1 (Success)` | [View Tx](https://sepolia.etherscan.io/tx/0x8595f22692788ca4d120920373f5cd0be291357b0f95908592b0b61d7430e91a) |
| **4** | `registerVoter()` | `0xd519939e2b4f557ed36669cf5a6c145d6dd41b0f6c3d56587f490a5d7d9ef637` | `11938506` | 78,521 | `1 (Success)` | [View Tx](https://sepolia.etherscan.io/tx/0xd519939e2b4f557ed36669cf5a6c145d6dd41b0f6c3d56587f490a5d7d9ef637) |
| **5** | Transition `DRAFT → REGISTRATION` | `0xf7b2e34a14ebda394e6d6843a31170618ee32b9346ed492ffb553fe30720d913` | `11938508` | 42,118 | `1 (Success)` | [View Tx](https://sepolia.etherscan.io/tx/0xf7b2e34a14ebda394e6d6843a31170618ee32b9346ed492ffb553fe30720d913) |
| **6** | Transition `REGISTRATION → ACTIVE` | `0x4e0b8bf205d5973b6810940101954618bacfefbb47d21fb44ef0f683432fc0d6` | `11938521` | 44,520 | `1 (Success)` | [View Tx](https://sepolia.etherscan.io/tx/0x4e0b8bf205d5973b6810940101954618bacfefbb47d21fb44ef0f683432fc0d6) |
| **7** | `castVote(candidateId=1)` | `0x9561c8772b24c9c96f5abcf1d4c24d0cb446e247b87588d522198bbfe39bd2fe` | `11938522` | 114,352 | `1 (Success)` | [View Tx](https://sepolia.etherscan.io/tx/0x9561c8772b24c9c96f5abcf1d4c24d0cb446e247b87588d522198bbfe39bd2fe) |
| **—** | Duplicate Vote Attempt | *Reverted on-chain* | — | — | `Revert: AlreadyVoted(1, ...)` | Contract security invariant confirmed |
| **8** | Transition `ACTIVE → ENDED` | `0x8248ad93f7e6c8b2bc3d2347130f19dd7799f25028c64c3cf03cea1763e3413b` | `11938523` | 43,908 | `1 (Success)` | [View Tx](https://sepolia.etherscan.io/tx/0x8248ad93f7e6c8b2bc3d2347130f19dd7799f25028c64c3cf03cea1763e3413b) |
| **9** | Transition `ENDED → RESULTS_FINALIZED` | `0xc1c34196cf15bd34acb6133d37441bc65323c5cf95fad7f829398a1b966cd108` | `11938524` | 46,120 | `1 (Success)` | [View Tx](https://sepolia.etherscan.io/tx/0xc1c34196cf15bd34acb6133d37441bc65323c5cf95fad7f829398a1b966cd108) |

---

## 3. On-Chain ↔ Indexer ↔ API Reconciliation `[REAL SEPOLIA]`

The FastAPI verification endpoint (`GET /api/v1/elections/1/results`) executed automated dual-source reconciliation against Sepolia:

```json
{
  "election_id": 1,
  "indexed_result": {
    "source": "INDEXED",
    "total_votes": 1,
    "candidates": [
      { "candidate_id": 1, "name": "Dr. Alice Vance", "vote_count": 1, "active": true },
      { "candidate_id": 2, "name": "Bob Chen", "vote_count": 0, "active": true }
    ],
    "winner_id": 1,
    "tie": false
  },
  "blockchain_result": {
    "source": "BLOCKCHAIN",
    "total_votes": 1,
    "candidates": [
      { "candidate_id": 1, "name": "Dr. Alice Vance", "vote_count": 1 },
      { "candidate_id": 2, "name": "Bob Chen", "vote_count": 0 }
    ],
    "winner_id": 1,
    "tie": false
  },
  "verification": {
    "matches": true,
    "differences": []
  }
}
```

---

## 4. Real Browser E2E Route Verification `[BROWSER E2E]`

Automated Playwright Chromium execution validated 12 routes against the live Next.js client (`http://127.0.0.1:3000`) and backend API (`http://127.0.0.1:8000`):

| Target Route | Verified UI Elements | Result | Console Errors | Screenshot Artifact |
| :--- | :--- | :---: | :---: | :--- |
| `/` | Hero title, features, `Explore elections` link | **PASS** | 0 | `01_landing_page.png` |
| `/elections` | Summary tiles, Election #1 card | **PASS** | 0 | `02_elections_listing.png` |
| `/elections/1` | Sepolia address, candidate cards, closed banner | **PASS** | 0 | `03_election_detail.png` |
| `/elections/1/results` | Winner Dr. Alice Vance, 1 vote, `BLOCKCHAIN VERIFIED` | **PASS** | 0 | `04_election_results.png` |
| `/admin` | `AdminGuard` gate: `Connect an admin wallet` | **PASS** | 0 | `05_admin_dashboard_gate.png` |
| `/admin/elections` | Protected admin elections gate | **PASS** | 0 | `06_admin_elections_gate.png` |
| `/admin/elections/1` | Protected admin lifecycle gate | **PASS** | 0 | `07_admin_election_detail_gate.png` |
| `/admin/voters` | Protected voter management gate | **PASS** | 0 | `08_admin_voters_gate.png` |
| `/admin/roles` | Protected role matrix gate | **PASS** | 0 | `09_admin_roles_gate.png` |
| `/admin/security` | Protected AI SOC security gate | **PASS** | 0 | `10_ai_security_soc_gate.png` |
| `/audit` | `Blockchain Audit Trail` header, 10 Sepolia events | **PASS** | 0 | `11_audit_explorer.png` |
| Header Control | `data-testid="wallet-connect"`, `Connect Wallet` label | **PASS** | 0 | `12_wallet_connect_state.png` |

---

## 5. Automated Test Suites & Code Integrity

### 5.1 Smart Contract Security Suite `[LOCAL TEST]`

- **Runner**: Hardhat / Mocha / Chai
- **Result**: **90 passing (9s)**
- **Coverage**:
  - Access control and role hierarchy (10 tests)
  - Election creation and parameter bounds (9 tests)
  - Voter registry and commitment commitments (10 tests)
  - Candidate management (7 tests)
  - Linear state machine transitions (11 tests)
  - Voting rules and duplicate protection (15 tests)
  - Emergency controller pause/resume (8 tests)
  - Deterministic tally and winner calculation (6 tests)
  - Adversarial attack simulations (10 tests)
  - Foundation metadata (4 tests)

### 5.2 Backend API & Guardian Suite `[UNIT TEST]` / `[LOCAL TEST]`

- **Runner**: Pytest 8.x
- **Result**: **188 passed, 1 skipped** (clean isolation: 10/10 AI alert tests pass)
- **Coverage**: FastAPI endpoints, Alembic migrations, blockchain sync manager, event deduplication, AI baseline engine, velocity anomaly detector, supervisory invariants.

### 5.3 Frontend Unit & Component Suite `[UNIT TEST]`

- **Runner**: Vitest 2.1.9
- **Result**: **148 passed across 16 test files**
- **Coverage**: Explorer URL generation, election state badge, candidate cards, eligibility banner, vote confirmation dialog, admin role permissions, transaction handling, error boundaries.

### 5.4 Production Build & Static Analysis

- **Next.js 14 Build**: `npm run build` completed with code `0`. All 14 static and dynamic routes compiled.
- **Secret Scanner**: `scan_secrets.py` scanned entire project tree; **0 exposed private keys or credentials**.
