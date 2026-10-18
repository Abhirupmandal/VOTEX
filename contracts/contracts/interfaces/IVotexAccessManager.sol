// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IVotexAccessManager
/// @notice Minimal read interface for the central VOTEX role registry.
/// @dev Core contracts depend on this interface rather than the concrete
///      implementation, keeping coupling low and enabling swaps/mocks.
interface IVotexAccessManager {
    /// @notice Returns true when `account` holds `role`.
    function hasRole(bytes32 role, address account) external view returns (bool);
}
