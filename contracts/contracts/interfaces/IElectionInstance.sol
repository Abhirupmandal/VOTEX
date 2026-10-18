// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Election, Candidate, ElectionState} from "./VotexElectionTypes.sol";

/// @title IElectionInstance
/// @notice External interface for a single deployed election.
/// @dev Each election is its own contract instance, so vote scoping is inherent:
///      `hasVoted` state cannot leak between elections.
interface IElectionInstance {
    /// @notice Unique identifier assigned by the ElectionFactory.
    function electionId() external view returns (uint256);

    /// @notice Current lifecycle state.
    function state() external view returns (ElectionState);

    /// @notice Pauses the election. Restricted to the EmergencyController.
    function emergencyPause() external;

    /// @notice Resumes a paused election. Restricted to the EmergencyController.
    function emergencyResume() external;

    /// @notice Adds a candidate. Election Manager only, before voting starts.
    function addCandidate(string calldata name, string calldata description)
        external
        returns (uint256);

    /// @notice Casts a vote for `candidateId`. Enforces one vote per wallet.
    function castVote(uint256 electionId_, uint256 candidateId) external;

    /// @notice Returns the full election configuration and tallies.
    function getElection() external view returns (Election memory);
}
