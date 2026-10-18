// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title VotexErrors
/// @notice Canonical custom errors shared by the VOTEX core contracts.
/// @dev File-level errors are cheaper than string reverts and are importable by
///      any contract, keeping error semantics consistent across the system.

/// @notice Caller lacks the required role or authority.
error Unauthorized();

/// @notice A required address argument was the zero address.
error ZeroAddress();

/// @notice The referenced election does not exist.
error ElectionNotFound();

/// @notice An election with the supplied identifier already exists.
error ElectionAlreadyExists();

/// @notice The action is not permitted in the election's current state.
error InvalidElectionState();

/// @notice The requested lifecycle transition is not allowed from this state.
error InvalidStateTransition();

/// @notice The election is not active (paused, ended, or not yet started).
error ElectionNotActive();

/// @notice The registration window is not open.
error RegistrationClosed();

/// @notice Voting has not started yet.
error VotingNotStarted();

/// @notice Voting has already ended.
error VotingEnded();

/// @notice The voter has not been registered.
error VoterNotRegistered();

/// @notice The voter record exists but is inactive.
error VoterInactive();

/// @notice The voter is already registered.
error VoterAlreadyRegistered();

/// @notice The voter is already active.
error VoterAlreadyActive();

/// @notice The voter has already cast a vote in this election.
error AlreadyVoted();

/// @notice The referenced candidate does not exist.
error CandidateNotFound();

/// @notice The candidate exists but is not accepting votes.
error CandidateInactive();

/// @notice The election title must not be empty.
error EmptyTitle();

/// @notice A candidate name must not be empty.
error EmptyCandidateName();

/// @notice A supplied time range is invalid or inconsistent.
error InvalidTimeRange();

/// @notice The election has no candidates to report results for.
error NoCandidates();
