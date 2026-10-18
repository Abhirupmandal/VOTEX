// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VotexAccessRoles} from "../access/VotexAccessRoles.sol";
import {IVotexAccessManager} from "../interfaces/IVotexAccessManager.sol";
import {IElectionInstance} from "../interfaces/IElectionInstance.sol";
import {IElectionFactory} from "../interfaces/IElectionFactory.sol";
import {Unauthorized, ZeroAddress} from "../interfaces/VotexErrors.sol";

/// @title EmergencyController
/// @notice Security-officer operated pause/resume gateway for elections.
/// @dev Elections accept emergency calls only from their configured controller
///      address. This contract holds that authority and additionally requires
///      the caller to hold SECURITY_OFFICER_ROLE, giving a single auditable
///      choke point for emergency actions.
///
///      Pausing never alters votes, candidate tallies, voter records, or the
///      election's identity — it only flips the lifecycle state.
contract EmergencyController is VotexAccessRoles {
    /// @notice Shared role registry.
    IVotexAccessManager public immutable accessManager;

    /// @notice Factory used to resolve election ids to addresses.
    IElectionFactory public immutable factory;

    /// @notice Emitted for every emergency action, for off-chain auditing.
    /// @param electionId Target election.
    /// @param officer The security officer who initiated the action.
    /// @param action Identifier of the action ("PAUSE" / "RESUME").
    /// @param timestamp Block timestamp of the action.
    event EmergencyAction(
        uint256 indexed electionId,
        address indexed officer,
        string action,
        uint256 timestamp
    );

    /// @param accessManager_ Shared role registry. Must be non-zero.
    /// @param factory_ Election factory. Must be non-zero.
    constructor(address accessManager_, address factory_) {
        if (accessManager_ == address(0) || factory_ == address(0)) {
            revert ZeroAddress();
        }
        accessManager = IVotexAccessManager(accessManager_);
        factory = IElectionFactory(factory_);
    }

    /// @dev Reverts unless the caller holds SECURITY_OFFICER_ROLE.
    modifier onlySecurityOfficer() {
        if (!accessManager.hasRole(SECURITY_OFFICER_ROLE, msg.sender)) {
            revert Unauthorized();
        }
        _;
    }

    /// @notice Pauses an active election. Security Officer only.
    /// @param electionId Election to pause; must resolve to a deployed instance.
    function pauseElection(uint256 electionId) external onlySecurityOfficer {
        address target = factory.getElectionAddress(electionId);
        if (target == address(0)) revert ZeroAddress();
        IElectionInstance(target).emergencyPause();
        emit EmergencyAction(electionId, msg.sender, "PAUSE", block.timestamp);
    }

    /// @notice Resumes a paused election. Security Officer only.
    /// @param electionId Election to resume; must resolve to a deployed instance.
    function resumeElection(uint256 electionId) external onlySecurityOfficer {
        address target = factory.getElectionAddress(electionId);
        if (target == address(0)) revert ZeroAddress();
        IElectionInstance(target).emergencyResume();
        emit EmergencyAction(electionId, msg.sender, "RESUME", block.timestamp);
    }
}
