# VOTEX Blockchain Core Architecture

> **Phase 2 deliverable.** This document describes the authoritative on-chain
> core of VOTEX: the smart contracts, roles, state machine, security model, test
> evidence, and gas profile. It is written to match the code that ships in
> `votex/contracts` exactly.

---

## 1. Scope and Non-Goals

### In scope (implemented and tested)

| Capability | Contract |
| --- | --- |
| Role-based access control (5 roles) | `VotexAccessManager`, `VotexAccessRoles` |
| Voter eligibility registry (commitment-based) | `VoterRegistry` |
| Per-election lifecycle, candidates, voting, results | `ElectionInstance` |
| Election deployment and indexing | `ElectionFactory` |
| Emergency pause / resume gateway | `EmergencyController` |
| Shared types and custom errors | `VotexElectionTypes`, `VotexErrors` |

### Explicitly out of scope for Phase 2

The following are **not** part of this phase and are intentionally absent:

- AI Guardian / anomaly detection.
- Backend event indexer and PostgreSQL ingestion.
- The end-user frontend voting flow.
- Decentralized identity (DID) integration or zero-knowledge proofs.

The contracts are the single source of truth and are designed so these layers
can be added later without changing the core semantics.

---

## 2. Privacy Model (Read Carefully)

Two properties are commonly *assumed* of e-voting systems but **are not provided
by this implementation**. They are stated here without qualification:

> **One wallet = one vote per election.**
> This is **not** "one person = one vote". Sybil resistance depends entirely on
> the off-chain enrolment process that decides which wallet addresses the
> `VOTER_REGISTRAR_ROLE` holder registers. If one person controls several
> registered wallets, they can cast several votes.

> **The current implementation does not provide a cryptographically secret
> ballot.**
> Votes are recorded on a public ledger. A `VoteCast` event and the resulting
> tally are observable, and a voter's choice is linkable to the transaction
> that carried it. There is no encryption, no homomorphic tally, and no
> mixing. Ballot secrecy is a *future* concern, not a Phase 2 property.

The `VoterRegistry` stores only an opaque `bytes32 credentialCommitment` and
never raw personally identifiable information (PII). This bounds on-chain data
exposure but does **not** by itself make ballots secret.

---

## 3. Contract Topology

```text
                       ┌──────────────────────────┐
                       │   VotexAccessManager      │  (AccessControl)
                       │   DEFAULT_ADMIN_ROLE      │
                       │   ELECTION_MANAGER_ROLE   │
                       │   VOTER_REGISTRAR_ROLE    │
                       │   SECURITY_OFFICER_ROLE   │
                       │   AUDITOR_ROLE            │
                       └────────────┬─────────────┘
                                    │ hasRole() consulted by
             ┌──────────────────────┼────────────────────────┐
             │                      │                        │
   ┌─────────▼─────────┐  ┌─────────▼─────────┐   ┌──────────▼──────────┐
   │  VoterRegistry    │  │  ElectionFactory  │   │ EmergencyController │
   │  (eligibility)    │  │  (deploys + index)│   │ (pause/resume gate) │
   └───────────────────┘  └─────────┬─────────┘   └──────────┬──────────┘
                                    │ new ElectionInstance() │
                            ┌───────▼────────────────────────▼────────┐
                            │            ElectionInstance             │
                            │  DRAFT→REGISTRATION→ACTIVE⇄PAUSED→ENDED │
                            │        →RESULTS_FINALIZED               │
                            └─────────────────────────────────────────┘
```

**Deployment order** (avoids a circular dependency):

1. `VotexAccessManager(admin)`
2. `VoterRegistry(accessManager)`
3. `ElectionFactory(accessManager, voterRegistry)`
4. `EmergencyController(accessManager, factory)`
5. `factory.setEmergencyController(controller)`

The factory reads the controller address at `createElection` time and passes it
into each `ElectionInstance` constructor, where it is stored as `immutable`.

---

## 4. Role Model (Least Privilege)

| Role | Constant source | Granted authority |
| --- | --- | --- |
| `DEFAULT_ADMIN_ROLE` | OpenZeppelin `AccessControl` (`0x00`) | Grant/revoke roles; wire the emergency controller |
| `ELECTION_MANAGER_ROLE` | `keccak256("VOTEX_ELECTION_MANAGER_ROLE")` | Create elections, add/deactivate candidates, advance lifecycle |
| `VOTER_REGISTRAR_ROLE` | `keccak256("VOTEX_VOTER_REGISTRAR_ROLE")` | Register, deactivate, reactivate voters |
| `SECURITY_OFFICER_ROLE` | `keccak256("VOTEX_SECURITY_OFFICER_ROLE")` | Pause/resume elections via `EmergencyController` |
| `AUDITOR_ROLE` | `keccak256("VOTEX_AUDITOR_ROLE")` | Read-only oversight (grants **no** state-changing authority) |

Design notes:

- Roles are **not** implicitly held by the admin. Tests assert that the admin
  holds `DEFAULT_ADMIN_ROLE` but *not* the four operational roles, and that
  `AUDITOR_ROLE` confers no mutation rights.
- Operational roles are resolved through the shared access manager at call time
  (`accessManager.hasRole(role, msg.sender)`), so a single grant/revoke updates
  authority across every contract without touching individual elections.
- `DEFAULT_ADMIN_ROLE` is intentionally **not** re-declared in
  `VotexAccessRoles`; the canonical OpenZeppelin constant is reused to avoid a
  duplicate-identifier conflict. `ElectionFactory` (which does not inherit
  `AccessControl`) mirrors it locally as `bytes32 private constant
  DEFAULT_ADMIN_ROLE = 0x00`.

---

## 5. Data Models

```solidity
enum ElectionState { DRAFT, REGISTRATION, ACTIVE, PAUSED, ENDED, RESULTS_FINALIZED }

struct Election {
    uint256 electionId;
    string  title;
    string  description;
    uint256 registrationStart;
    uint256 registrationEnd;
    uint256 votingStart;
    uint256 votingEnd;
    ElectionState state;
    uint256 totalRegisteredVoters;
    uint256 totalVotes;
    uint256 createdAt;
    uint256 endedAt;
    bool    exists;
}

struct Candidate { uint256 candidateId; string name; string description; uint256 voteCount; bool active; }

struct Voter { bool registered; bool active; bytes32 credentialCommitment; uint256 registeredAt; }
```

Per-election state (the `_hasVoted` mapping, candidate set, and tallies) lives
inside each `ElectionInstance`, so vote scoping is **structural**: state cannot
leak between elections.

---

## 6. State Machine

```text
DRAFT ──openRegistration()──▶ REGISTRATION ──startElection()──▶ ACTIVE
                                                                  │ ▲
                                              pauseElection()/    │ │ resumeElection()/
                                              emergencyPause()    │ │ emergencyResume()
                                                                  ▼ │
                                                               PAUSED
                                                                  │
                                              endElection() ──▶ ENDED
                                                                  │
                                          finalizeResults() ──▶ RESULTS_FINALIZED
```

`_transition(from, to)` reverts with `InvalidStateTransition()` unless the
current state is exactly `from`. Transitions not on the diagram (for example
`DRAFT → ACTIVE`, `DRAFT → ENDED`, `ENDED → ACTIVE`) are rejected, and
`RESULTS_FINALIZED` is **terminal** — no transition leaves it. `endElection`
uses `_transitionWithEndStamp`, which also records `endedAt`.

---

## 7. Voting Rules and Duplicate Protection

`castVote(uint256 electionId_, uint256 candidateId)` enforces, in order:

1. `electionId_ == electionId` → else `InvalidElectionState()`. Guards against a
   caller targeting the wrong election or spoofing an id.
2. State is exactly `ACTIVE` → else `ElectionNotActive()`.
3. `block.timestamp >= votingStart` → else `VotingNotStarted()`.
4. `block.timestamp <= votingEnd` → else `VotingEnded()`.
5. `voterRegistry.isRegistered(msg.sender)` → else `VoterNotRegistered()`.
6. `voterRegistry.isActive(msg.sender)` → else `VoterInactive()`.
7. Candidate exists and is active → else `CandidateInactive()`.
8. `!_hasVoted[msg.sender]` → else `AlreadyVoted()`.

Effects then run: `_hasVoted[msg.sender] = true`, `candidate.voteCount++`,
`_election.totalVotes++`, followed by the `VoteCast` event. State is written
before tallies are touched (checks-effects-interactions discipline); no external
calls follow.

**Guarantees:** a wallet can never cast two successful votes in the same
election, a rejected duplicate never mutates a tally, and a wallet may still
vote once in each distinct election.

---

## 8. Results and Deterministic Tie Handling

`getWinner()` returns `(uint256 winnerId, bool tie, uint256 maxVotes)`:

- Reverts with `NoCandidates()` when no candidates exist.
- A strict single highest tally yields that `winnerId` with `tie == false`.
- If the top two totals are equal (and greater than zero), the contract sets
  `tie = true` and `winnerId = 0`. It **never** arbitrarily breaks a tie.

`getElectionResults()` returns aligned parallel arrays `(uint256[] ids,
string[] names, uint256[] votes)`, and results remain readable after
`RESULTS_FINALIZED`.

---

## 9. Emergency Controls

The `EmergencyController` is the single choke point for pausing. A caller must:

1. Hold `SECURITY_OFFICER_ROLE` in the access manager.
2. Target an election id that resolves to a deployed instance.

It then calls `emergencyPause()` / `emergencyResume()` on that instance, which
accepts the call **only** from its immutable `emergencyController` address
(`onlyEmergencyController`). Each action emits
`EmergencyAction(electionId, officer, "PAUSE"|"RESUME", timestamp)`.

Pausing never alters votes, candidate tallies, or voter records — it only flips
the lifecycle state. Pausing a non-`ACTIVE` election reverts with
`InvalidStateTransition()` surfaced from the instance.

---

## 10. Custom Errors

All errors are file-level and importable from
[`VotexErrors.sol`](../../contracts/contracts/interfaces/VotexErrors.sol),
keeping semantics consistent and reverts cheap:

`Unauthorized`, `ZeroAddress`, `ElectionNotFound`, `ElectionAlreadyExists`,
`InvalidElectionState`, `InvalidStateTransition`, `ElectionNotActive`,
`RegistrationClosed`, `VotingNotStarted`, `VotingEnded`, `VoterNotRegistered`,
`VoterInactive`, `VoterAlreadyRegistered`, `VoterAlreadyActive`, `AlreadyVoted`,
`CandidateNotFound`, `CandidateInactive`, `EmptyTitle`, `EmptyCandidateName`,
`InvalidTimeRange`, `NoCandidates`.

## 11. Events

| Contract | Event | Indexed | Purpose |
| --- | --- | --- | --- |
| `VoterRegistry` | `VoterRegistered(voter, credentialCommitment, timestamp)` | `voter` | Registration audit trail |
| `VoterRegistry` | `VoterDeactivated(voter, timestamp)` | `voter` | Eligibility removal |
| `VoterRegistry` | `VoterReactivated(voter, timestamp)` | `voter` | Eligibility restoration |
| `ElectionFactory` | `ElectionCreated(electionId, creator, title)` | `electionId`, `creator` | Discovery / indexing |
| `ElectionFactory` | `EmergencyControllerUpdated(controller)` | `controller` | Wiring changes |
| `ElectionInstance` | `CandidateAdded(electionId, candidateId, name)` | – | Candidate registration |
| `ElectionInstance` | `CandidateDeactivated(electionId, candidateId)` | – | Candidate withdrawal |
| `ElectionInstance` | `VoteCast(electionId, candidateId, voter)` | – | Vote audit |
| `ElectionInstance` | `ElectionStateChanged(electionId, from, to)` | – | Lifecycle audit |
| `EmergencyController` | `EmergencyAction(electionId, officer, action, timestamp)` | `electionId`, `officer` | Emergency audit |

---

## 12. Test Evidence

Command: `npx hardhat test` (run from `votex/contracts`).

```
90 passing (4s)
```

The suite is organized into ten security suites plus the Phase 1 foundation
smoke test:

| Suite | Focus | Tests |
| --- | --- | --- |
| A | Access control | 10 |
| B | Election creation validation | 9 |
| C | Voter registry | 10 |
| D | Candidate management | 7 |
| E | State machine transitions | 11 |
| F | Voting rules | 14 |
| G | Duplicate vote protection | 3 |
| H | Emergency controls | 8 |
| I | Results and tie handling | 6 |
| J | Adversarial attack simulation | 10 |
| – | `VotexFoundation` smoke test | 2 |
| **Total** | | **90** |

Suite J specifically simulates attacks: double voting, unregistered wallets
voting, privilege escalation, invalid candidate ids, invalid election ids,
voting while paused, voting after finalization, unauthorized emergency pauses,
unauthorized transitions, and unauthorized registration attempts. Every attack
is rejected.

> **Harness note.** Hardhat's default test glob loads *every* file under `test/`
> (including `test/helpers/fixtures.ts`). Because matcher registration timing is
> not guaranteed across multiple globbed spec files, the matchers are registered
> explicitly at the top of `VotexCore.test.ts` via
> `import "@nomicfoundation/hardhat-chai-matchers";`. This makes
> `reverted` / `revertedWithCustomError` / `emit` reliable under both bare
> `npx hardhat test` and explicit file arguments.

---

## 13. Gas Profile

Measured with `REPORT_GAS=true`, Solidity 0.8.24, optimizer enabled (200 runs),
block limit 60,000,000 gas.

### Mutating methods

| Contract | Method | Min | Max | Avg | Calls |
| --- | --- | ---: | ---: | ---: | ---: |
| `ElectionFactory` | `createElection` | 2,102,760 | 2,119,860 | 2,119,342 | 134 |
| `ElectionFactory` | `setEmergencyController` | – | – | 50,649 | 1 |
| `ElectionInstance` | `addCandidate` | 132,311 | 169,519 | 144,211 | 130 |
| `ElectionInstance` | `castVote` | 73,573 | 107,773 | 99,223 | 28 |
| `ElectionInstance` | `deactivateCandidate` | – | – | 31,244 | 3 |
| `ElectionInstance` | `endElection` | – | – | 56,164 | 7 |
| `ElectionInstance` | `finalizeResults` | – | – | 34,051 | 4 |
| `ElectionInstance` | `openRegistration` | – | – | 51,130 | 50 |
| `ElectionInstance` | `startElection` | – | – | 34,075 | 48 |
| `ElectionInstance` | `pauseElection` | – | – | 34,019 | 2 |
| `ElectionInstance` | `resumeElection` | – | – | 34,041 | 1 |
| `EmergencyController` | `pauseElection` | – | – | 45,407 | 7 |
| `EmergencyController` | `resumeElection` | – | – | 45,417 | 3 |
| `VoterRegistry` | `registerVoter` | 81,300 | 118,672 | 95,708 | 56 |
| `VoterRegistry` | `deactivateVoter` | – | – | 34,229 | 4 |
| `VoterRegistry` | `reactivateVoter` | – | – | 34,222 | 2 |
| `VotexAccessManager` | `grantRole` | 51,450 | 51,462 | 51,460 | 5 |
| `VotexAccessManager` | `revokeRole` | – | – | 29,564 | 1 |

The dominant cost is `createElection`, which deploys a full
`ElectionInstance` (~2.1M gas). This is the deliberate trade-off of the
one-contract-per-election design: strong isolation and inherent vote scoping in
exchange for deployment cost.

### Deployment costs

| Contract | Gas | % of block limit |
| --- | ---: | ---: |
| `ElectionFactory` | 2,899,129 | 4.8% |
| `VoterRegistry` | 531,386 | 0.9% |
| `EmergencyController` | 428,381 | 0.7% |
| `VotexAccessManager` | 354,565 | 0.6% |

---

## 14. Build and Static Analysis

- **Compiler:** Solidity 0.8.24, EVM target `paris`.
- **Compile result:** `Compiled 18 Solidity files successfully` — **0 errors, 0
  warnings**.
- **Artifacts:** ABI/bytecode emitted under `artifacts/`; TypeChain bindings
  generated as 16 artifacts / 54 typings.

Reproduce:

```bash
cd votex/contracts
npx hardhat clean
npx hardhat compile
npx hardhat test
```

---

## 15. Security Considerations and Known Limitations

- **Transparency, not secrecy.** All votes and tallies are public; see §2.
- **Wallet ≠ person.** Sybil resistance is an off-chain enrolment concern.
- **Admin trust.** `DEFAULT_ADMIN_ROLE` can grant/revoke operational roles and
  rewire the emergency controller. Role hygiene and key management are
  operational responsibilities.
- **Emergency power.** `SECURITY_OFFICER_ROLE` can pause voting; it cannot alter,
  delete, or fabricate votes.
- **Candidate immutability after start.** Candidates may only be added before
  `ACTIVE`; afterwards they can be deactivated (preserving history) but not
  removed.
- **No upgradeability.** Contracts are immutable. Fixes require redeployment and
  explicit migration.
- **Integer safety.** Solidity 0.8.x checked arithmetic is used throughout; the
  only `unchecked` blocks guard counters that cannot realistically overflow.

---

## 16. Interface Summary

| Contract | Key external surface |
| --- | --- |
| `VotexAccessManager` | `hasRole`, `grantRole`, `revokeRole` (OpenZeppelin `AccessControl`) |
| `VoterRegistry` | `registerVoter`, `deactivateVoter`, `reactivateVoter`, `isRegistered`, `isActive`, `getVoter`, `totalRegistered` |
| `ElectionFactory` | `createElection`, `setEmergencyController`, `getElectionAddress`, `totalElections`, `getElectionIds`, `getElectionAt` |
| `ElectionInstance` | `state`, `getElection`, `getCandidate`, `getCandidates`, `candidateCount`, `getCandidateVoteCount`, `getTotalVotes`, `hasVoted`, `getElectionResults`, `getWinner`, `addCandidate`, `deactivateCandidate`, `openRegistration`, `startElection`, `pauseElection`, `resumeElection`, `endElection`, `finalizeResults`, `castVote`, `emergencyPause`, `emergencyResume` |
| `EmergencyController` | `pauseElection`, `resumeElection` |
