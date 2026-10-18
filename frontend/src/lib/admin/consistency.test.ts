import { describe, expect, it } from "vitest";

import { compareConsistency } from "@/lib/admin/consistency";

describe("compareConsistency", () => {
  it("reports a consistent set when all numeric pairs agree", () => {
    const report = compareConsistency([
      { field: "Election count", onChain: 3, indexed: 3 },
      { field: "Votes", onChain: 10, indexed: 10 },
    ]);
    expect(report.consistent).toBe(true);
    expect(report.divergences).toHaveLength(0);
    expect(report.rows.every((row) => row.severity === "ok")).toBe(true);
  });

  it("flags a hard mismatch when the index is AHEAD of the chain", () => {
    const report = compareConsistency([{ field: "Votes", onChain: 5, indexed: 7 }]);
    expect(report.consistent).toBe(false);
    expect(report.rows[0].severity).toBe("mismatch");
    expect(report.divergences).toHaveLength(1);
  });

  it("flags a mismatch beyond the lag tolerance", () => {
    const report = compareConsistency(
      [{ field: "Votes", onChain: 10, indexed: 2 }],
      2,
    );
    expect(report.rows[0].severity).toBe("mismatch");
  });

  it("treats a small numeric shortfall as indexer lag", () => {
    const report = compareConsistency(
      [{ field: "Votes", onChain: 10, indexed: 9 }],
      5,
    );
    expect(report.consistent).toBe(false);
    expect(report.rows[0].severity).toBe("lag");
  });

  it("treats a null indexed value as lag, never a mismatch", () => {
    const report = compareConsistency([{ field: "Votes", onChain: 10, indexed: null }]);
    expect(report.rows[0].severity).toBe("lag");
    expect(report.rows[0].matches).toBe(false);
  });

  it("treats an undefined indexed value as null", () => {
    const report = compareConsistency([{ field: "Votes", onChain: 10, indexed: undefined }]);
    expect(report.rows[0].indexed).toBeNull();
    expect(report.rows[0].severity).toBe("lag");
  });

  it("does not apply lag tolerance without an explicit tolerance", () => {
    const report = compareConsistency([{ field: "Votes", onChain: 10, indexed: 9 }]);
    expect(report.rows[0].severity).toBe("mismatch");
  });

  it("compares boolean fields by equality", () => {
    const ok = compareConsistency([{ field: "Active", onChain: true, indexed: true }]);
    expect(ok.consistent).toBe(true);

    const bad = compareConsistency([{ field: "Active", onChain: true, indexed: false }]);
    expect(bad.consistent).toBe(false);
    expect(bad.rows[0].severity).toBe("mismatch");
  });

  it("compares string fields by equality", () => {
    const ok = compareConsistency([{ field: "State", onChain: "ACTIVE", indexed: "ACTIVE" }]);
    expect(ok.consistent).toBe(true);

    const bad = compareConsistency([{ field: "State", onChain: "ACTIVE", indexed: "PAUSED" }]);
    expect(bad.rows[0].severity).toBe("mismatch");
  });

  it("collects only the divergent rows in `divergences`", () => {
    const report = compareConsistency([
      { field: "A", onChain: 1, indexed: 1 },
      { field: "B", onChain: 2, indexed: 5 },
      { field: "C", onChain: 3, indexed: null },
    ]);
    expect(report.divergences.map((row) => row.field)).toEqual(["B", "C"]);
  });

  it("returns a consistent report for an empty pair list", () => {
    const report = compareConsistency([]);
    expect(report.consistent).toBe(true);
    expect(report.rows).toEqual([]);
  });
});
