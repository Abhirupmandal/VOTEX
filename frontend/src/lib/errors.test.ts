import { describe, expect, it } from "vitest";

import { toFriendlyError } from "@/lib/errors";

describe("errors.toFriendlyError", () => {
  it("classifies a user rejection and preserves the raw message", () => {
    const result = toFriendlyError(new Error("User rejected the request."));
    expect(result.kind).toBe("user-rejected");
    expect(result.rawMessage).toContain("rejected");
  });

  it("maps the AlreadyVoted contract error", () => {
    const result = toFriendlyError(
      new Error("execution reverted: custom error 'AlreadyVoted()'"),
    );
    expect(result.kind).toBe("already-voted");
    expect(result.title).toBe("Vote already cast");
  });

  it("maps registry and lifecycle contract errors", () => {
    expect(toFriendlyError("VoterNotRegistered()").kind).toBe("not-registered");
    expect(toFriendlyError("VoterInactive()").kind).toBe("inactive");
    expect(toFriendlyError("ElectionNotActive()").kind).toBe("not-active");
    expect(toFriendlyError("CandidateInactive()").kind).toBe("candidate");
  });

  it("detects insufficient funds", () => {
    expect(toFriendlyError(new Error("insufficient funds for gas")).kind).toBe(
      "insufficient-funds",
    );
  });

  it("detects an unreachable RPC", () => {
    expect(toFriendlyError(new Error("connection refused")).kind).toBe("rpc");
  });

  it("falls back to a generic revert classification", () => {
    expect(toFriendlyError(new Error("execution reverted")).kind).toBe("reverted");
  });

  it("returns an unknown classification for unexpected input", () => {
    expect(toFriendlyError(new Error("something bizarre")).kind).toBe("unknown");
  });

  it("handles non-Error thrown values without crashing", () => {
    const result = toFriendlyError({ code: 123 });
    expect(result.rawMessage).toBeTruthy();
    expect(result.kind).toBe("unknown");
  });
});
