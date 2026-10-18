// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VotexAccessRoles} from "../access/VotexAccessRoles.sol";
import {IVotexAccessManager} from "../interfaces/IVotexAccessManager.sol";
import {IElectionFactory} from "../interfaces/IElectionFactory.sol";
import {ElectionInstance} from "./ElectionInstance.sol";
import {
    Unauthorized,
    ZeroAddress,
    EmptyTitle,
    InvalidTimeRange
} from "../interfaces/VotexErrors.sol";

/// @title ElectionFactory
/// @notice Deploys and indexes {ElectionInstance} contracts.
/// @dev Each election is an independent contract, which makes vote scoping and
///      per-election emergency control trivial. The factory validates all
///      configuration up-front so a malformed election can never be deployed.
///
///      Deployment order (avoids a circular dependency):
///        1. Deploy VotexAccessManager.
///        2. Deploy VoterRegistry(accessManager).
///        3. Deploy ElectionFactory(accessManager, voterRegistry).
///        4. Deploy EmergencyController(accessManager, factory).
///        5. factory.setEmergencyController(controller).
contract ElectionFactory is IElectionFactory, VotexAccessRoles {
    /// @notice Shared role registry.
    IVotexAccessManager public immutable accessManager;

    /// @notice Authoritative voter registry injected into each election.
    address public immutable voterRegistry;

    /// @notice Emergency controller wired into elections created from now on.
    address public emergencyController;

    /// @dev Mirrors OpenZeppelin AccessControl.DEFAULT_ADMIN_ROLE (0x00),
    ///      used to gate controller wiring without inheriting AccessControl.
    bytes32 private constant DEFAULT_ADMIN_ROLE = 0x00;

    /// @dev electionId => deployed election address.
    mapping(uint256 => address) private _electionAddresses;

    /// @dev Ordered list of election ids.
    uint256[] private _electionIds;

    /// @notice Emitted when an election is created.
    event ElectionCreated(
        uint256 indexed electionId, address indexed creator, string title
    );

    /// @notice Emitted when the emergency controller address changes.
    event EmergencyControllerUpdated(address indexed controller);

    /// @param accessManager_ Shared role registry. Must be non-zero.
    /// @param voterRegistry_ Authoritative voter registry. Must be non-zero.
    constructor(address accessManager_, address voterRegistry_) {
        if (accessManager_ == address(0) || voterRegistry_ == address(0)) {
            revert ZeroAddress();
        }
        accessManager = IVotexAccessManager(accessManager_);
        voterRegistry = voterRegistry_;
    }

    /// @dev Reverts unless the caller holds `role` in the access manager.
    modifier onlyRole(bytes32 role) {
        if (!accessManager.hasRole(role, msg.sender)) revert Unauthorized();
        _;
    }

    /// @notice Creates and deploys a new election.
    /// @dev Election Manager only. Validates the title and every time bound so
    ///      the deployed instance can always reach ACTIVE legitimately.
    function createElection(
        string calldata title,
        string calldata description,
        uint256 registrationStart,
        uint256 registrationEnd,
        uint256 votingStart,
        uint256 votingEnd
    ) external onlyRole(ELECTION_MANAGER_ROLE) returns (uint256) {
        if (bytes(title).length == 0) revert EmptyTitle();
        if (emergencyController == address(0)) revert ZeroAddress();

        // Registration must be an ordered, non-empty window that starts in the
        // future relative to creation.
        if (registrationStart >= registrationEnd) revert InvalidTimeRange();
        if (registrationStart < block.timestamp) revert InvalidTimeRange();

        // Voting must be an ordered, non-empty window...
        if (votingStart >= votingEnd) revert InvalidTimeRange();
        // ...and must not begin before registration closes.
        if (votingStart < registrationEnd) revert InvalidTimeRange();

        uint256 newId = _electionIds.length + 1;

        ElectionInstance election = new ElectionInstance(
            newId,
            msg.sender,
            title,
            description,
            registrationStart,
            registrationEnd,
            votingStart,
            votingEnd,
            address(accessManager),
            voterRegistry,
            emergencyController
        );

        address electionAddress = address(election);
        _electionIds.push(newId);
        _electionAddresses[newId] = electionAddress;

        // Note: the creator already holds ELECTION_MANAGER_ROLE in the shared
        // access manager (it was required to call this function), so no extra
        // per-instance grant is needed.
        emit ElectionCreated(newId, msg.sender, title);
        return newId;
    }

    /// @notice Sets the emergency controller wired into future elections.
    /// @dev DEFAULT_ADMIN_ROLE only. Existing elections must be updated
    ///      individually via {ElectionInstance.setEmergencyController}.
    function setEmergencyController(address controller)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (controller == address(0)) revert ZeroAddress();
        emergencyController = controller;
        emit EmergencyControllerUpdated(controller);
    }

    /// @inheritdoc IElectionFactory
    function getElectionAddress(uint256 electionId)
        external
        view
        returns (address)
    {
        return _electionAddresses[electionId];
    }

    /// @inheritdoc IElectionFactory
    function totalElections() external view returns (uint256) {
        return _electionIds.length;
    }

    /// @inheritdoc IElectionFactory
    function getElectionIds() external view returns (uint256[] memory) {
        return _electionIds;
    }

    /// @notice Returns the address for the election at `index` in the list.
    function getElectionAt(uint256 index) external view returns (uint256, address) {
        uint256 id = _electionIds[index];
        return (id, _electionAddresses[id]);
    }
}
