import { describe, expect, it } from "vitest";

import {
  formatDateTime,
  formatDuration,
  formatPercent,
  formatRelative,
  formatTimestamp,
  percentOf,
  shortenAddress,
  shortenHash,
  toNumber,
} from "@/lib/formatting";

describe("formatting.shortenAddress", () => {
  it("condenses a full EVM address to 0x1234…5678", () => {
    expect(
      shortenAddress("0x1234567890abcdef1234567890abcdef12345678"),
    ).toBe("0x1234…5678");
  });

  it("returns an em dash for missing input", () => {
    expect(shortenAddress(null)).toBe("—");
    expect(shortenAddress(undefined)).toBe("—");
  });

  it("leaves already-short values untouched", () => {
    expect(shortenAddress("0x1234")).toBe("0x1234");
  });
});

describe("formatting.shortenHash", () => {
  it("truncates long hashes with the default size", () => {
    const hash = "0x" + "a".repeat(64);
    const out = shortenHash(hash);
    expect(out.startsWith("0xaaaaaaaa")).toBe(true);
    expect(out).toContain("…");
    expect(out.endsWith("a".repeat(10))).toBe(true);
  });

  it("returns short hashes unchanged and dashes for missing input", () => {
    expect(shortenHash("0xabc")).toBe("0xabc");
    expect(shortenHash(null)).toBe("—");
  });
});

describe("formatting.formatTimestamp", () => {
  it("returns a dash for null, zero, and negative values", () => {
    expect(formatTimestamp(null)).toBe("—");
    expect(formatTimestamp(0)).toBe("—");
    expect(formatTimestamp(-5)).toBe("—");
  });

  it("formats a positive unix-seconds timestamp", () => {
    expect(formatTimestamp(1_700_000_000)).not.toBe("—");
  });
});

describe("formatting.formatDateTime", () => {
  it("returns a dash for missing or invalid strings", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("not-a-date")).toBe("—");
  });

  it("formats a valid ISO string", () => {
    expect(formatDateTime("2026-01-01T00:00:00Z")).not.toBe("—");
  });
});

describe("formatting.formatRelative", () => {
  it("returns a dash for missing input", () => {
    expect(formatRelative(null)).toBe("—");
  });

  it("describes a future point in time", () => {
    const now = Date.now();
    const target = Math.floor(now / 1000) + 120; // +2 minutes
    expect(formatRelative(target, now)).toMatch(/in/i);
  });
});

describe("formatting.formatDuration", () => {
  it("formats a sub-hour countdown as minutes and seconds", () => {
    // Whole-second aligned clock + target so the diff is exactly 90s.
    const now = 1_700_000_000_000;
    const target = 1_700_000_090; // now + 90 seconds
    expect(formatDuration(target, now)).toBe("1m 30s");
  });

  it("returns a dash for missing input", () => {
    expect(formatDuration(null)).toBe("—");
  });
});

describe("formatting.formatPercent", () => {
  it("rounds to the requested precision", () => {
    expect(formatPercent(12.345)).toBe("12.3%");
    expect(formatPercent(12.345, 2)).toBe("12.35%");
  });

  it("returns a dash for non-finite values", () => {
    expect(formatPercent(Number.NaN)).toBe("—");
  });
});

describe("formatting.percentOf", () => {
  it("computes a share of the total", () => {
    expect(percentOf(25, 100)).toBe(25);
  });

  it("guards against divide-by-zero", () => {
    expect(percentOf(5, 0)).toBe(0);
    expect(percentOf(5, -1)).toBe(0);
  });
});

describe("formatting.toNumber", () => {
  it("coerces bigint, string and number inputs", () => {
    expect(toNumber(5n)).toBe(5);
    expect(toNumber("42")).toBe(42);
    expect(toNumber(3)).toBe(3);
  });

  it("returns zero for nullish or non-numeric input", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber("abc")).toBe(0);
  });
});
