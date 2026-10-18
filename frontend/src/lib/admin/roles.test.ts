import { describe, expect, it } from "vitest";
import { keccak256, toHex } from "viem";

import {
  AUDITOR_ROLE,
  CAPABILITY_ROLES,
  DEFAULT_ADMIN_ROLE,
  ELECTION_MANAGER_ROLE,
  ROLES,
  ROLE_LIST,
  ROLE_ORDER,
  SECURITY_OFFICER_ROLE,
  VOTER_REGISTRAR_ROLE,
  roleByHash,
  roleLabel,
  type RoleKey,
} from "@/lib/admin/roles";

const HASH_RE = /^0x[0-9a-f]{64}$/;

describe("role hashes", () => {
  it("computes each role as keccak256 of its canonical string", () => {
    expect(ELECTION_MANAGER_ROLE).toBe(keccak256(toHex("VOTEX_ELECTION_MANAGER_ROLE")));
    expect(VOTER_REGISTRAR_ROLE).toBe(keccak256(toHex("VOTEX_VOTER_REGISTRAR_ROLE")));
    expect(SECURITY_OFFICER_ROLE).toBe(keccak256(toHex("VOTEX_SECURITY_OFFICER_ROLE")));
    expect(AUDITOR_ROLE).toBe(keccak256(toHex("VOTEX_AUDITOR_ROLE")));
  });

  it("exposes DEFAULT_ADMIN_ROLE as the all-zero bytes32", () => {
    expect(DEFAULT_ADMIN_ROLE).toBe(`0x${"0".repeat(64)}`);
  });

  it("produces well-formed, distinct bytes32 values", () => {
    const hashes = ROLE_ORDER.map((key) => ROLES[key].hash);
    hashes.forEach((hash) => expect(hash).toMatch(HASH_RE));
    expect(new Set(hashes.map((h) => h.toLowerCase())).size).toBe(hashes.length);
  });
});

describe("role catalogue", () => {
  it("lists every role in display order", () => {
    expect(ROLE_LIST).toHaveLength(ROLE_ORDER.length);
    ROLE_ORDER.forEach((key, index) => {
      expect(ROLE_LIST[index].key).toBe(key);
    });
  });

  it("marks the auditor role as non-state-changing", () => {
    expect(ROLES.AUDITOR_ROLE.stateChanging).toBe(false);
  });

  it("marks every other role as state-changing", () => {
    (Object.keys(ROLES) as RoleKey[])
      .filter((key) => key !== "AUDITOR_ROLE")
      .forEach((key) => expect(ROLES[key].stateChanging).toBe(true));
  });
});

describe("roleByHash", () => {
  it("resolves a role from an on-chain hash (case-insensitive)", () => {
    expect(roleByHash(ELECTION_MANAGER_ROLE)?.key).toBe("ELECTION_MANAGER_ROLE");
    expect(roleByHash(ELECTION_MANAGER_ROLE.toUpperCase())?.key).toBe(
      "ELECTION_MANAGER_ROLE",
    );
  });

  it("resolves the zero hash to DEFAULT_ADMIN_ROLE", () => {
    expect(roleByHash(DEFAULT_ADMIN_ROLE)?.key).toBe("DEFAULT_ADMIN_ROLE");
  });

  it("returns undefined for an unknown or empty hash", () => {
    expect(roleByHash("0xdeadbeef")).toBeUndefined();
    expect(roleByHash(null)).toBeUndefined();
    expect(roleByHash(undefined)).toBeUndefined();
  });
});

describe("roleLabel", () => {
  it("returns the human label for a known hash", () => {
    expect(roleLabel(SECURITY_OFFICER_ROLE)).toBe("Security Officer");
  });

  it("shortens an unknown hash", () => {
    const unknown = `0x${"ab".repeat(32)}`;
    expect(roleLabel(unknown)).toContain("…");
  });

  it("handles a missing hash", () => {
    expect(roleLabel(null)).toBe("Unknown role");
  });
});

describe("capability role map", () => {
  it("gates election lifecycle under the election manager", () => {
    expect(CAPABILITY_ROLES["election:create"]).toEqual(["ELECTION_MANAGER_ROLE"]);
    expect(CAPABILITY_ROLES["election:finalize"]).toEqual(["ELECTION_MANAGER_ROLE"]);
  });

  it("gates pause/resume under the security officer", () => {
    expect(CAPABILITY_ROLES["election:pause"]).toEqual(["SECURITY_OFFICER_ROLE"]);
    expect(CAPABILITY_ROLES["election:resume"]).toEqual(["SECURITY_OFFICER_ROLE"]);
  });

  it("gates voter writes under the voter registrar", () => {
    expect(CAPABILITY_ROLES["voter:register"]).toEqual(["VOTER_REGISTRAR_ROLE"]);
    expect(CAPABILITY_ROLES["voter:deactivate"]).toEqual(["VOTER_REGISTRAR_ROLE"]);
    expect(CAPABILITY_ROLES["voter:reactivate"]).toEqual(["VOTER_REGISTRAR_ROLE"]);
  });

  it("gates role writes under the default admin", () => {
    expect(CAPABILITY_ROLES["role:grant"]).toEqual(["DEFAULT_ADMIN_ROLE"]);
    expect(CAPABILITY_ROLES["role:revoke"]).toEqual(["DEFAULT_ADMIN_ROLE"]);
  });

  it("references only defined roles", () => {
    Object.values(CAPABILITY_ROLES)
      .flat()
      .forEach((key) => expect(ROLES[key]).toBeDefined());
  });
});
