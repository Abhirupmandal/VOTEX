// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title VotexFoundation
/// @notice Phase 1 placeholder contract.
/// @dev Proves the Hardhat/Solidity/OpenZeppelin toolchain is wired correctly.
///      Contains NO election, voting, or access-control logic on purpose.
///      Real contracts (ElectionFactory, Election, VoterRegistry, ...) replace
///      this in later phases.
contract VotexFoundation {
    /// @notice Human-readable project identifier.
    string public constant NAME = "VOTEX";

    /// @notice Foundation version marker.
    string public constant VERSION = "0.1.0";

    /// @notice Returns the foundation version string.
    function version() external pure returns (string memory) {
        return VERSION;
    }
}
