// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title VotexAccessRoles
/// @notice Canonical role identifiers used across the VOTEX core.
/// @dev Inherited by {VotexAccessManager} so the constants are available to all
///      role-gated contracts without a separate import.
abstract contract VotexAccessRoles {
    /// @notice Canonical admin role is provided by OpenZeppelin {AccessControl}
    ///         as `DEFAULT_ADMIN_ROLE` (0x00). It is intentionally NOT
    ///         re-declared here to avoid a duplicate-identifier conflict.

    /// @notice Creates elections, adds candidates, advances lifecycle states.
    bytes32 public constant ELECTION_MANAGER_ROLE =
        keccak256("VOTEX_ELECTION_MANAGER_ROLE");

    /// @notice Registers, deactivates, and reactivates eligible voters.
    bytes32 public constant VOTER_REGISTRAR_ROLE =
        keccak256("VOTEX_VOTER_REGISTRAR_ROLE");

    /// @notice Operates emergency controls (pause/resume elections).
    bytes32 public constant SECURITY_OFFICER_ROLE =
        keccak256("VOTEX_SECURITY_OFFICER_ROLE");

    /// @notice Read-only oversight role for audit surfaces.
    /// @dev This role grants no state-changing authority by design.
    bytes32 public constant AUDITOR_ROLE = keccak256("VOTEX_AUDITOR_ROLE");
}
