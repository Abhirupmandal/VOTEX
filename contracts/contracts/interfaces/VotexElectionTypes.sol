// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title VotexElectionTypes
/// @notice Shared, file-level type declarations used across the VOTEX core.
/// @dev Declared at file scope so every contract/interface can import the same
///      canonical definitions without inheritance coupling.

/// @notice Lifecycle states of an election.
/// @dev Ordering is semantic: comparisons such as `state < ElectionState.ACTIVE`
///      are meaningful and relied upon by the implementation.
enum ElectionState {
    DRAFT,
    REGISTRATION,
    ACTIVE,
    PAUSED,
    ENDED,
    RESULTS_FINALIZED
}

/// @notice Full election configuration and running tallies.
/// @dev `exists` distinguishes a real election from the zero-value default and
///      guards against reading uninitialised storage.
struct Election {
    uint256 electionId;
    string title;
    string description;
    uint256 registrationStart;
    uint256 registrationEnd;
    uint256 votingStart;
    uint256 votingEnd;
    ElectionState state;
    uint256 totalRegisteredVoters;
    uint256 totalVotes;
    uint256 createdAt;
    uint256 endedAt;
    bool exists;
}

/// @notice A candidate participating in a single election.
/// @dev Candidates are deactivated rather than deleted so historical results
///      are never corrupted.
struct Candidate {
    uint256 candidateId;
    string name;
    string description;
    uint256 voteCount;
    bool active;
}

/// @notice Minimal voter record. No personally identifiable information is
///         stored on-chain; only a credential commitment and status flags.
struct Voter {
    bool registered;
    bool active;
    bytes32 credentialCommitment;
    uint256 registeredAt;
}
