// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {VotexAccessRoles} from "./VotexAccessRoles.sol";
import {ZeroAddress} from "../interfaces/VotexErrors.sol";

/// @title VotexAccessManager
/// @notice Central, least-privilege role registry for the VOTEX core.
/// @dev Built on OpenZeppelin {AccessControl}. The deploying account receives
///      DEFAULT_ADMIN_ROLE (OpenZeppelin behaviour) but NO operational role, so
///      admin authority does not implicitly grant election or voter powers.
///      A single registry is shared by the factory, registry and controller.
///
///      Roles may be granted to a multisig or governance contract to remove any
///      single-key privilege; nothing in this contract prevents that.
contract VotexAccessManager is AccessControl, VotexAccessRoles {
    /// @param admin Address that receives DEFAULT_ADMIN_ROLE. Must be non-zero.
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }
}
