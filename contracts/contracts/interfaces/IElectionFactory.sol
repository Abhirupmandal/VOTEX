// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IElectionFactory
/// @notice External interface for the election deployment registry.
interface IElectionFactory {
    /// @notice Deploys a new election. Election Manager role required.
    function createElection(
        string calldata title,
        string calldata description,
        uint256 registrationStart,
        uint256 registrationEnd,
        uint256 votingStart,
        uint256 votingEnd
    ) external returns (uint256);

    /// @notice Returns the deployed address for `electionId`.
    function getElectionAddress(uint256 electionId) external view returns (address);

    /// @notice Returns the total number of elections created.
    function totalElections() external view returns (uint256);

    /// @notice Returns every election identifier created so far.
    function getElectionIds() external view returns (uint256[] memory);
}
