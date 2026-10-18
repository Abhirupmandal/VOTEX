// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Voter} from "./VotexElectionTypes.sol";

/// @title IVoterRegistry
/// @notice Read interface for the authoritative voter eligibility registry.
interface IVoterRegistry {
    /// @notice Returns true when `voter` has a registration record.
    function isRegistered(address voter) external view returns (bool);

    /// @notice Returns true when `voter` is registered and currently active.
    function isActive(address voter) external view returns (bool);

    /// @notice Returns the full voter record for `voter`.
    function getVoter(address voter) external view returns (Voter memory);

    /// @notice Returns the total number of registered voters.
    function totalRegistered() external view returns (uint256);
}
