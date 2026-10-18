// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VotexAccessRoles} from "../access/VotexAccessRoles.sol";
import {IVotexAccessManager} from "../interfaces/IVotexAccessManager.sol";
import {IVoterRegistry} from "../interfaces/IVoterRegistry.sol";
import {Voter} from "../interfaces/VotexElectionTypes.sol";
import {
    Unauthorized,
    ZeroAddress,
    VoterNotRegistered,
    VoterInactive,
    VoterAlreadyRegistered,
    VoterAlreadyActive
} from "../interfaces/VotexErrors.sol";

/// @title VoterRegistry
/// @notice Authoritative on-chain registry of voter eligibility.
/// @dev Stores only a credential commitment and status flags — never raw
///      personally identifiable information. All mutations require
///      VOTER_REGISTRAR_ROLE, resolved through the shared access manager.
///
///      PRIVACY NOTE: this is a *transparent* registry. Registration is public
///      and linkable to an address; it does not provide ballot secrecy.
contract VoterRegistry is IVoterRegistry, VotexAccessRoles {
    /// @notice Shared role registry used for authorization.
    IVotexAccessManager public immutable accessManager;

    /// @dev voter address => registration record.
    mapping(address => Voter) private _voters;

    /// @dev Running count of registered voters (includes deactivated records).
    uint256 private _totalRegistered;

    /// @notice Emitted when a voter is registered.
    event VoterRegistered(
        address indexed voter, bytes32 credentialCommitment, uint256 timestamp
    );

    /// @notice Emitted when a voter is deactivated.
    event VoterDeactivated(address indexed voter, uint256 timestamp);

    /// @notice Emitted when a voter is reactivated.
    event VoterReactivated(address indexed voter, uint256 timestamp);

    /// @param accessManager_ Address of the shared VotexAccessManager.
    constructor(address accessManager_) {
        if (accessManager_ == address(0)) revert ZeroAddress();
        accessManager = IVotexAccessManager(accessManager_);
    }

    /// @dev Reverts unless the caller holds `role` in the access manager.
    modifier onlyRole(bytes32 role) {
        if (!accessManager.hasRole(role, msg.sender)) revert Unauthorized();
        _;
    }

    /// @notice Registers a new eligible voter with a credential commitment.
    /// @param voter Wallet address to authorize. Cannot be the zero address.
    /// @param credentialCommitment Opaque commitment binding the voter's
    ///        off-chain credential. A commitment cannot be replayed.
    /// @dev Reverts if the voter is already registered. Re-registration is not
    ///      permitted so audit history cannot be overwritten.
    function registerVoter(address voter, bytes32 credentialCommitment)
        external
        onlyRole(VOTER_REGISTRAR_ROLE)
    {
        if (voter == address(0)) revert ZeroAddress();
        Voter storage record = _voters[voter];
        if (record.registered) revert VoterAlreadyRegistered();

        _voters[voter] = Voter({
            registered: true,
            active: true,
            credentialCommitment: credentialCommitment,
            registeredAt: block.timestamp
        });
        unchecked {
            // Practically unreachable overflow; saves gas on a hot path.
            ++_totalRegistered;
        }

        emit VoterRegistered(voter, credentialCommitment, block.timestamp);
    }

    /// @notice Deactivates a registered voter, blocking further voting.
    /// @dev Does not clear the record, so the voter can be reactivated and the
    ///      audit trail is preserved.
    function deactivateVoter(address voter)
        external
        onlyRole(VOTER_REGISTRAR_ROLE)
    {
        Voter storage record = _voters[voter];
        if (!record.registered) revert VoterNotRegistered();
        if (!record.active) revert VoterInactive();

        record.active = false;
        emit VoterDeactivated(voter, block.timestamp);
    }

    /// @notice Reactivates a previously deactivated voter.
    function reactivateVoter(address voter)
        external
        onlyRole(VOTER_REGISTRAR_ROLE)
    {
        Voter storage record = _voters[voter];
        if (!record.registered) revert VoterNotRegistered();
        if (record.active) revert VoterAlreadyActive();

        record.active = true;
        emit VoterReactivated(voter, block.timestamp);
    }

    /// @inheritdoc IVoterRegistry
    function isRegistered(address voter) external view returns (bool) {
        return _voters[voter].registered;
    }

    /// @inheritdoc IVoterRegistry
    function isActive(address voter) external view returns (bool) {
        Voter storage record = _voters[voter];
        return record.registered && record.active;
    }

    /// @inheritdoc IVoterRegistry
    function getVoter(address voter) external view returns (Voter memory) {
        return _voters[voter];
    }

    /// @inheritdoc IVoterRegistry
    function totalRegistered() external view returns (uint256) {
        return _totalRegistered;
    }
}
