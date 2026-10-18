import { describe, expect, it } from "vitest";

import {
  dateTimeLocalToUnix,
  safeParseEther,
  unixToDateTimeLocal,
  validateAddress,
  validateCandidateInput,
  validateElectionDraft,
  validateVoterInput,
  type ElectionDraft,
} from "@/lib/admin/validation";

const NOW = 1_000_000;

function draft(overrides: Partial<ElectionDraft> = {}): ElectionDraft {
  return {
    title: "General Election 2026",
    description: "A valid election description.",
    registrationStart: NOW,
    registrationEnd: NOW + 600,
    votingStart: NOW + 600,
    votingEnd: NOW + 1_200,
    ...overrides,
  };
}

describe("validateElectionDraft", () => {
  it("accepts a well-formed draft", () => {
    const result = validateElectionDraft(draft(), NOW);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("requires a title", () => {
    expect(validateElectionDraft(draft({ title: "   " }), NOW).errors.title).toBeTruthy();
  });

  it("rejects an over-long title", () => {
    const result = validateElectionDraft(draft({ title: "x".repeat(121) }), NOW);
    expect(result.errors.title).toContain("120");
  });

  it("rejects an over-long description", () => {
    const result = validateElectionDraft(draft({ description: "d".repeat(2001) }), NOW);
    expect(result.errors.description).toBeTruthy();
  });

  it("flags every missing timestamp", () => {
    const result = validateElectionDraft(
      draft({ registrationStart: null, registrationEnd: null, votingStart: null, votingEnd: null }),
      NOW,
    );
    expect(result.errors.registrationStart).toBeTruthy();
    expect(result.errors.registrationEnd).toBeTruthy();
    expect(result.errors.votingStart).toBeTruthy();
    expect(result.errors.votingEnd).toBeTruthy();
  });

  it("requires the registration window to be ordered", () => {
    const result = validateElectionDraft(
      draft({ registrationStart: NOW + 600, registrationEnd: NOW + 100, votingStart: NOW + 600, votingEnd: NOW + 1_200 }),
      NOW,
    );
    expect(result.errors.registrationEnd).toBeTruthy();
  });

  it("requires voting to end after it starts", () => {
    const result = validateElectionDraft(draft({ votingStart: NOW + 1_200, votingEnd: NOW + 1_200 }), NOW);
    expect(result.errors.votingEnd).toBeTruthy();
  });

  it("requires voting to start after registration closes", () => {
    const result = validateElectionDraft(draft({ votingStart: NOW + 100 }), NOW);
    expect(result.errors.votingStart).toBeTruthy();
  });

  it("rejects a registration start in the past", () => {
    const result = validateElectionDraft(
      draft({ registrationStart: NOW - 3_600, registrationEnd: NOW + 600, votingStart: NOW + 600 }),
      NOW,
    );
    expect(result.errors.registrationStart).toBeTruthy();
  });

  it("requires a voting window of at least one minute", () => {
    const result = validateElectionDraft(
      draft({ votingStart: NOW + 600, votingEnd: NOW + 620 }),
      NOW,
    );
    expect(result.errors.votingEnd).toBeTruthy();
  });
});

describe("validateCandidateInput", () => {
  it("accepts a normal candidate", () => {
    expect(validateCandidateInput("Alice", "A fine candidate.").valid).toBe(true);
  });

  it("requires a name", () => {
    expect(validateCandidateInput("  ", "").errors.name).toBeTruthy();
  });

  it("rejects an over-long name", () => {
    expect(validateCandidateInput("x".repeat(121), "").errors.name).toBeTruthy();
  });

  it("rejects an over-long description", () => {
    expect(validateCandidateInput("Alice", "d".repeat(1001)).errors.description).toBeTruthy();
  });
});

describe("validateVoterInput", () => {
  const VALID = "0x0000000000000000000000000000000000000001";

  it("accepts a valid wallet with no commitment", () => {
    expect(validateVoterInput({ wallet: VALID, credentialCommitment: "" }).valid).toBe(true);
  });

  it("requires a wallet", () => {
    expect(validateVoterInput({ wallet: "", credentialCommitment: "" }).errors.wallet).toBeTruthy();
  });

  it("rejects a malformed wallet", () => {
    expect(validateVoterInput({ wallet: "0x123", credentialCommitment: "" }).errors.wallet).toBeTruthy();
  });

  it("rejects a malformed commitment", () => {
    const result = validateVoterInput({ wallet: VALID, credentialCommitment: "0x1234" });
    expect(result.errors.credentialCommitment).toBeTruthy();
  });

  it("accepts a 32-byte commitment", () => {
    const commitment = `0x${"a".repeat(64)}`;
    expect(validateVoterInput({ wallet: VALID, credentialCommitment: commitment }).valid).toBe(true);
  });
});

describe("validateAddress", () => {
  it("accepts a checksum-agnostic address", () => {
    expect(validateAddress("0x0000000000000000000000000000000000000001").valid).toBe(true);
  });

  it("requires a value", () => {
    expect(validateAddress("").errors.address).toBeTruthy();
  });

  it("supports a custom field name", () => {
    expect(validateAddress("", "account").errors.account).toBeTruthy();
  });
});

describe("date/time + ether helpers", () => {
  it("parses a datetime-local value to unix seconds", () => {
    const unix = dateTimeLocalToUnix("2026-01-01T00:00");
    expect(typeof unix).toBe("number");
    expect(unix).toBeGreaterThan(0);
  });

  it("returns null for an empty datetime", () => {
    expect(dateTimeLocalToUnix("")).toBeNull();
  });

  it("round-trips a unix timestamp through the local input format", () => {
    const unix = 1_767_225_600; // 2026-01-01T00:00:00Z
    const local = unixToDateTimeLocal(unix);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(dateTimeLocalToUnix(local)).toBe(unix);
  });

  it("returns an empty string for a null timestamp", () => {
    expect(unixToDateTimeLocal(null)).toBe("");
  });

  it("parses a decimal ether string", () => {
    expect(safeParseEther("1.5")).toBe(1_500_000_000_000_000_000n);
  });

  it("returns null for invalid ether input", () => {
    expect(safeParseEther("not-a-number")).toBeNull();
  });
});
