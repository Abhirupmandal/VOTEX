/**
 * VOTEX role catalogue (Phase 6 §2).
 *
 * The smart contracts expose their roles as `bytes32` constants computed with
 * `keccak256`. The frontend MUST NOT guess a role hash — it is recomputed here
 * with the exact same algorithm so a `hasRole` call against the deployed
 * `VotexAccessManager` is authoritative.
 *
 * Solidity reference (VotexAccessRoles.sol):
 *   ELECTION_MANAGER_ROLE  = keccak256("VOTEX_ELECTION_MANAGER_ROLE")
 *   VOTER_REGISTRAR_ROLE   = keccak256("VOTEX_VOTER_REGISTRAR_ROLE")
 *   SECURITY_OFFICER_ROLE  = keccak256("VOTEX_SECURITY_OFFICER_ROLE")
 *   AUDITOR_ROLE           = keccak256("VOTEX_AUDITOR_ROLE")
 * OpenZeppelin DEFAULT_ADMIN_ROLE is the all-zero bytes32.
 */

import { keccak256, toHex, type Hex } from "viem";

/** OpenZeppelin's universal admin role — the all-zero bytes32. */
export const DEFAULT_ADMIN_ROLE: Hex = `0x${"0".repeat(64)}` as Hex;

function roleHash(name: string): Hex {
  return keccak256(toHex(name));
}

export const ELECTION_MANAGER_ROLE: Hex = roleHash("VOTEX_ELECTION_MANAGER_ROLE");
export const VOTER_REGISTRAR_ROLE: Hex = roleHash("VOTEX_VOTER_REGISTRAR_ROLE");
export const SECURITY_OFFICER_ROLE: Hex = roleHash("VOTEX_SECURITY_OFFICER_ROLE");
export const AUDITOR_ROLE: Hex = roleHash("VOTEX_AUDITOR_ROLE");

/** Canonical role identifiers used across the admin UI. */
export type RoleKey =
  | "DEFAULT_ADMIN_ROLE"
  | "ELECTION_MANAGER_ROLE"
  | "VOTER_REGISTRAR_ROLE"
  | "SECURITY_OFFICER_ROLE"
  | "AUDITOR_ROLE";

export interface RoleDefinition {
  key: RoleKey;
  /** On-chain bytes32 identifier. */
  hash: Hex;
  /** Human-readable name shown in the UI. */
  label: string;
  /** One-line explanation of the authority the role confers. */
  description: string;
  /** Whether this role may change on-chain state at all. */
  stateChanging: boolean;
}

export const ROLES: Record<RoleKey, RoleDefinition> = {
  DEFAULT_ADMIN_ROLE: {
    key: "DEFAULT_ADMIN_ROLE",
    hash: DEFAULT_ADMIN_ROLE,
    label: "Default Admin",
    description:
      "Grants and revokes every other role. Holds no operational authority on its own.",
    stateChanging: true,
  },
  ELECTION_MANAGER_ROLE: {
    key: "ELECTION_MANAGER_ROLE",
    hash: ELECTION_MANAGER_ROLE,
    label: "Election Manager",
    description:
      "Creates elections, manages candidates, and drives the election lifecycle to finalization.",
    stateChanging: true,
  },
  VOTER_REGISTRAR_ROLE: {
    key: "VOTER_REGISTRAR_ROLE",
    hash: VOTER_REGISTRAR_ROLE,
    label: "Voter Registrar",
    description: "Registers, deactivates, and reactivates voter credentials.",
    stateChanging: true,
  },
  SECURITY_OFFICER_ROLE: {
    key: "SECURITY_OFFICER_ROLE",
    hash: SECURITY_OFFICER_ROLE,
    label: "Security Officer",
    description: "Pauses and resumes a live election through the emergency controller.",
    stateChanging: true,
  },
  AUDITOR_ROLE: {
    key: "AUDITOR_ROLE",
    hash: AUDITOR_ROLE,
    label: "Auditor",
    description: "Read-only oversight role. Confers no state-changing authority.",
    stateChanging: false,
  },
};

/** Display order for the role matrix (most privileged first). */
export const ROLE_ORDER: RoleKey[] = [
  "DEFAULT_ADMIN_ROLE",
  "ELECTION_MANAGER_ROLE",
  "VOTER_REGISTRAR_ROLE",
  "SECURITY_OFFICER_ROLE",
  "AUDITOR_ROLE",
];

export const ROLE_LIST: RoleDefinition[] = ROLE_ORDER.map((key) => ROLES[key]);

/** Resolve a role definition from an on-chain bytes32 hash (case-insensitive). */
export function roleByHash(hash: string | undefined | null): RoleDefinition | undefined {
  if (!hash) return undefined;
  const normalised = hash.toLowerCase();
  return ROLE_LIST.find((role) => role.hash.toLowerCase() === normalised);
}

/** Human label for a role hash, falling back to the shortened hash. */
export function roleLabel(hash: string | undefined | null): string {
  const match = roleByHash(hash);
  if (match) return match.label;
  if (!hash) return "Unknown role";
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

/**
 * Roles required to perform each administrative capability. This is a UX map
 * only — the Solidity `onlyRole` guard is the real security boundary.
 */
export const CAPABILITY_ROLES: Record<string, RoleKey[]> = {
  "election:create": ["ELECTION_MANAGER_ROLE"],
  "election:openRegistration": ["ELECTION_MANAGER_ROLE"],
  "election:start": ["ELECTION_MANAGER_ROLE"],
  "election:end": ["ELECTION_MANAGER_ROLE"],
  "election:finalize": ["ELECTION_MANAGER_ROLE"],
  "election:pause": ["SECURITY_OFFICER_ROLE"],
  "election:resume": ["SECURITY_OFFICER_ROLE"],
  "candidate:add": ["ELECTION_MANAGER_ROLE"],
  "candidate:deactivate": ["ELECTION_MANAGER_ROLE"],
  "voter:register": ["VOTER_REGISTRAR_ROLE"],
  "voter:deactivate": ["VOTER_REGISTRAR_ROLE"],
  "voter:reactivate": ["VOTER_REGISTRAR_ROLE"],
  "role:grant": ["DEFAULT_ADMIN_ROLE"],
  "role:revoke": ["DEFAULT_ADMIN_ROLE"],
};
