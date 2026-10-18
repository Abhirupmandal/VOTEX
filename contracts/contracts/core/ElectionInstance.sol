// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VotexAccessRoles} from "../access/VotexAccessRoles.sol";
import {IVotexAccessManager} from "../interfaces/IVotexAccessManager.sol";
import {IElectionInstance} from "../interfaces/IElectionInstance.sol";
import {IVoterRegistry} from "../interfaces/IVoterRegistry.sol";
import {
    Election,
    Candidate,
    ElectionState
} from "../interfaces/VotexElectionTypes.sol";
import {
    Unauthorized,
    ZeroAddress,
    InvalidElectionState,
    InvalidStateTransition,
    ElectionNotActive,
    RegistrationClosed,
    VotingNotStarted,
    VotingEnded,
    VoterNotRegistered,
    VoterInactive,
    AlreadyVoted,
    CandidateNotFound,
    CandidateInactive,
    EmptyCandidateName,
    NoCandidates
} from "../interfaces/VotexErrors.sol";

/// @title ElectionInstance
/// @notice A single self-contained election: configuration, lifecycle, candidates,
///         vote casting, and deterministic tallies.
/// @dev Deployed by {ElectionFactory}. Vote scoping is inherent because each
///      election is its own contract, so `_hasVoted` can never leak between
///      elections. The contract holds NO Ether and makes NO external state calls
///      during voting, so a reentrancy guard is deliberately omitted: there is
///      no value-transfer or callback surface to exploit.
///
///      PRIVACY LIMITATION: votes are recorded in plaintext (voter + candidate)
///      on a transparent ledger. This is NOT a secret ballot.
contract ElectionInstance is IElectionInstance, VotexAccessRoles {
    /// @notice Unique identifier assigned by the factory. Immutable.
    uint256 public immutable electionId;

    /// @notice Account that created the election (Election Manager). Immutable.
    address public immutable creator;

    /// @notice Shared role registry.
    IVotexAccessManager public immutable accessManager;

    /// @notice Authoritative voter eligibility registry.
    IVoterRegistry public immutable voterRegistry;

    /// @notice EmergencyController authorized to pause/resume this election.
    /// @dev Set once at construction and never mutated, removing an
    ///      admin privilege-abuse path.
    address public immutable emergencyController;

    Election private _election;

    /// @dev candidateId => Candidate. Candidate ids are 1-based.
    mapping(uint256 => Candidate) private _candidates;

    /// @dev Ordered list of candidate ids for enumeration.
    uint256[] private _candidateIds;

    /// @dev voter => whether they have already voted in THIS election.
    mapping(address => bool) private _hasVoted;

    /// @notice Emitted when a candidate is added.
    event CandidateAdded(
        uint256 indexed electionId,
        uint256 indexed candidateId,
        string name
    );

    /// @notice Emitted when a candidate is deactivated.
    event CandidateDeactivated(
        uint256 indexed electionId, uint256 indexed candidateId
    );

    /// @notice Emitted on every successful vote.
    event VoteCast(
        uint256 indexed electionId,
        uint256 indexed candidateId,
        address indexed voter
    );

    /// @notice Emitted on every lifecycle transition.
    event ElectionStateChanged(
        uint256 indexed electionId,
        ElectionState previousState,
        ElectionState newState
    );

    /// @param electionId_ Unique identifier (assigned by the factory).
    /// @param creator_ Election creator (Election Manager).
    /// @param title_ Human-readable title.
    /// @param description_ Human-readable description.
    /// @param registrationStart_ UNIX timestamp registration opens.
    /// @param registrationEnd_ UNIX timestamp registration closes.
    /// @param votingStart_ UNIX timestamp voting opens.
    /// @param votingEnd_ UNIX timestamp voting closes.
    /// @param accessManager_ Shared role registry.
    /// @param voterRegistry_ Authoritative voter registry.
    /// @param emergencyController_ Address authorized to pause/resume.
    constructor(
        uint256 electionId_,
        address creator_,
        string memory title_,
        string memory description_,
        uint256 registrationStart_,
        uint256 registrationEnd_,
        uint256 votingStart_,
        uint256 votingEnd_,
        address accessManager_,
        address voterRegistry_,
        address emergencyController_
    ) {
        if (
            creator_ == address(0) || accessManager_ == address(0)
                || voterRegistry_ == address(0) || emergencyController_ == address(0)
        ) {
            revert ZeroAddress();
        }

        electionId = electionId_;
        creator = creator_;
        accessManager = IVotexAccessManager(accessManager_);
        voterRegistry = IVoterRegistry(voterRegistry_);
        emergencyController = emergencyController_;

        _election = Election({
            electionId: electionId_,
            title: title_,
            description: description_,
            registrationStart: registrationStart_,
            registrationEnd: registrationEnd_,
            votingStart: votingStart_,
            votingEnd: votingEnd_,
            state: ElectionState.DRAFT,
            totalRegisteredVoters: 0,
            totalVotes: 0,
            createdAt: block.timestamp,
            endedAt: 0,
            exists: true
        });
    }

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    /// @dev Reverts unless the caller holds `role` in the access manager.
    modifier onlyRole(bytes32 role) {
        if (!accessManager.hasRole(role, msg.sender)) revert Unauthorized();
        _;
    }

    /// @dev Reverts unless the caller is the configured emergency controller.
    modifier onlyEmergencyController() {
        if (msg.sender != emergencyController) revert Unauthorized();
        _;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @inheritdoc IElectionInstance
    function state() external view returns (ElectionState) {
        return _election.state;
    }

    /// @inheritdoc IElectionInstance
    function getElection() external view returns (Election memory) {
        return _election;
    }

    /// @notice Returns the candidate with `candidateId`.
    function getCandidate(uint256 candidateId)
        external
        view
        returns (Candidate memory)
    {
        return _candidate(candidateId);
    }

    /// @notice Returns every candidate, including deactivated ones.
    function getCandidates() external view returns (Candidate[] memory) {
        uint256 length = _candidateIds.length;
        Candidate[] memory list = new Candidate[](length);
        for (uint256 i = 0; i < length; ++i) {
            list[i] = _candidates[_candidateIds[i]];
        }
        return list;
    }

    /// @notice Returns the number of candidates ever added.
    function candidateCount() external view returns (uint256) {
        return _candidateIds.length;
    }

    /// @notice Returns the recorded vote count for `candidateId`.
    function getCandidateVoteCount(uint256 candidateId)
        external
        view
        returns (uint256)
    {
        return _candidate(candidateId).voteCount;
    }

    /// @notice Returns the total votes cast in this election.
    function getTotalVotes() external view returns (uint256) {
        return _election.totalVotes;
    }

    /// @notice Returns true when `voter` has already voted in this election.
    function hasVoted(address voter) external view returns (bool) {
        return _hasVoted[voter];
    }

    /// @notice Returns candidate results as parallel arrays.
    /// @return ids Candidate identifiers.
    /// @return names Candidate names.
    /// @return votes Vote totals aligned with `ids`.
    function getElectionResults()
        external
        view
        returns (uint256[] memory ids, string[] memory names, uint256[] memory votes)
    {
        uint256 length = _candidateIds.length;
        ids = new uint256[](length);
        names = new string[](length);
        votes = new uint256[](length);
        for (uint256 i = 0; i < length; ++i) {
            uint256 id = _candidateIds[i];
            Candidate storage candidate = _candidates[id];
            ids[i] = id;
            names[i] = candidate.name;
            votes[i] = candidate.voteCount;
        }
    }

    /// @notice Computes the deterministic winner.
    /// @dev A strict, single highest vote total is required. If the leading
    ///      totals are tied, `tie` is true and `winnerId` is 0 — the contract
    ///      never arbitrarily breaks ties.
    /// @return winnerId The winning candidate id, or 0 when tied/empty.
    /// @return tie True when the top two candidates share the maximum count.
    /// @return maxVotes The maximum vote count observed (0 when no candidates).
    function getWinner()
        external
        view
        returns (uint256 winnerId, bool tie, uint256 maxVotes)
    {
        uint256 length = _candidateIds.length;
        if (length == 0) revert NoCandidates();

        for (uint256 i = 0; i < length; ++i) {
            Candidate storage candidate = _candidates[_candidateIds[i]];
            if (candidate.voteCount > maxVotes) {
                maxVotes = candidate.voteCount;
                winnerId = candidate.candidateId;
                tie = false;
            } else if (candidate.voteCount == maxVotes && maxVotes > 0) {
                // Equal to the current maximum: the lead is contested.
                tie = true;
            }
        }

        if (tie) {
            winnerId = 0;
        }
    }

    // ---------------------------------------------------------------------
    // Candidate management
    // ---------------------------------------------------------------------

    /// @inheritdoc IElectionInstance
    function addCandidate(string calldata name, string calldata description)
        external
        onlyRole(ELECTION_MANAGER_ROLE)
        returns (uint256)
    {
        if (bytes(name).length == 0) revert EmptyCandidateName();
        // Candidates may only be added before voting begins. Deactivation, not
        // deletion, is used thereafter to protect historical results.
        if (uint8(_election.state) >= uint8(ElectionState.ACTIVE)) {
            revert InvalidElectionState();
        }

        uint256 newId = _candidateIds.length + 1;
        _candidateIds.push(newId);
        _candidates[newId] = Candidate({
            candidateId: newId,
            name: name,
            description: description,
            voteCount: 0,
            active: true
        });

        emit CandidateAdded(electionId, newId, name);
        return newId;
    }

    /// @notice Deactivates a candidate so it can no longer receive votes.
    /// @dev The record (and its accumulated votes) is preserved.
    function deactivateCandidate(uint256 candidateId)
        external
        onlyRole(ELECTION_MANAGER_ROLE)
    {
        Candidate storage candidate = _candidate(candidateId);
        if (!candidate.active) revert CandidateInactive();
        candidate.active = false;
        emit CandidateDeactivated(electionId, candidateId);
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    /// @notice DRAFT -> REGISTRATION. Election Manager only.
    function openRegistration() external onlyRole(ELECTION_MANAGER_ROLE) {
        _transition(ElectionState.DRAFT, ElectionState.REGISTRATION);
    }

    /// @notice REGISTRATION -> ACTIVE. Election Manager only.
    function startElection() external onlyRole(ELECTION_MANAGER_ROLE) {
        _transition(ElectionState.REGISTRATION, ElectionState.ACTIVE);
    }

    /// @notice ACTIVE -> PAUSED. Security Officer only.
    function pauseElection() external onlyRole(SECURITY_OFFICER_ROLE) {
        _transition(ElectionState.ACTIVE, ElectionState.PAUSED);
    }

    /// @notice PAUSED -> ACTIVE. Security Officer only.
    function resumeElection() external onlyRole(SECURITY_OFFICER_ROLE) {
        _transition(ElectionState.PAUSED, ElectionState.ACTIVE);
    }

    /// @notice ACTIVE -> ENDED. Election Manager only.
    function endElection() external onlyRole(ELECTION_MANAGER_ROLE) {
        _transitionWithEndStamp(ElectionState.ACTIVE, ElectionState.ENDED);
    }

    /// @notice ENDED -> RESULTS_FINALIZED. Election Manager only.
    function finalizeResults() external onlyRole(ELECTION_MANAGER_ROLE) {
        _transition(ElectionState.ENDED, ElectionState.RESULTS_FINALIZED);
    }

    // ---------------------------------------------------------------------
    // Emergency controls (invoked by the EmergencyController)
    // ---------------------------------------------------------------------

    /// @inheritdoc IElectionInstance
    function emergencyPause() external onlyEmergencyController {
        // Only an ACTIVE election may be paused; votes and tallies are untouched.
        _transition(ElectionState.ACTIVE, ElectionState.PAUSED);
    }

    /// @inheritdoc IElectionInstance
    function emergencyResume() external onlyEmergencyController {
        _transition(ElectionState.PAUSED, ElectionState.ACTIVE);
    }

    // ---------------------------------------------------------------------
    // Voting
    // ---------------------------------------------------------------------

    /// @inheritdoc IElectionInstance
    /// @dev Enforces the full rule set: exists, ACTIVE, within the voting
    ///      window, registered & active voter, existing & active candidate, and
    ///      one vote per wallet per election. State is updated before any tally
    ///      mutation (checks-effects-interactions), though no external calls
    ///      follow.
    function castVote(uint256 electionId_, uint256 candidateId) external {
        // 1. Election identity guard. The factory always passes its own id; a
        //    mismatch indicates a caller error or spoofing attempt.
        if (electionId_ != electionId) revert InvalidElectionState();

        // 2. Must be active (not draft/registration/paused/ended/finalized).
        if (_election.state != ElectionState.ACTIVE) revert ElectionNotActive();

        // 3. Must be inside the voting window.
        if (block.timestamp < _election.votingStart) revert VotingNotStarted();
        if (block.timestamp > _election.votingEnd) revert VotingEnded();

        // 4. & 5. Voter must be registered and active.
        if (!voterRegistry.isRegistered(msg.sender)) revert VoterNotRegistered();
        if (!voterRegistry.isActive(msg.sender)) revert VoterInactive();

        // 6. & 7. Candidate must exist and be active.
        Candidate storage candidate = _candidate(candidateId);
        if (!candidate.active) revert CandidateInactive();

        // 8. One vote per wallet per election.
        if (_hasVoted[msg.sender]) revert AlreadyVoted();

        // Effects: record the vote before adjusting tallies.
        _hasVoted[msg.sender] = true;
        unchecked {
            ++candidate.voteCount;
            ++_election.totalVotes;
        }

        emit VoteCast(electionId, candidateId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    /// @dev Loads a candidate or reverts if the id is unknown.
    function _candidate(uint256 candidateId)
        private
        view
        returns (Candidate storage)
    {
        if (candidateId == 0 || candidateId > _candidateIds.length) {
            revert CandidateNotFound();
        }
        return _candidates[candidateId];
    }

    /// @dev Validates and applies an exact lifecycle transition.
    function _transition(ElectionState from, ElectionState to) private {
        if (_election.state != from) revert InvalidStateTransition();
        _election.state = to;
        emit ElectionStateChanged(electionId, from, to);
    }

    /// @dev Like {_transition} but also records the terminal timestamp.
    function _transitionWithEndStamp(ElectionState from, ElectionState to)
        private
    {
        if (_election.state != from) revert InvalidStateTransition();
        _election.state = to;
        _election.endedAt = block.timestamp;
        emit ElectionStateChanged(electionId, from, to);
    }
}
