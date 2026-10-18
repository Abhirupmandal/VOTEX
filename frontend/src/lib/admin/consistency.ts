/**
 * On-chain vs indexed consistency detection (Phase 6 §19).
 *
 * The blockchain is authoritative. This module compares an authoritative
 * on-chain value with the indexer's read-model value and reports any divergence
 * so the UI can raise a "DATA CONSISTENCY WARNING" — it never silently prefers
 * (or overwrites) one side.
 */

export interface ConsistencyRow {
  /** Field under comparison. */
  field: string;
  /** Authoritative value read from the chain. */
  onChain: number | string | boolean | null;
  /** Value reported by the backend index. */
  indexed: number | string | boolean | null;
  /** True when the two agree. */
  matches: boolean;
  /** How the indexed value behaves when it disagrees. */
  severity: "ok" | "lag" | "mismatch";
}

export interface ConsistencyReport {
  consistent: boolean;
  rows: ConsistencyRow[];
  /** Convenience list of only the divergent rows. */
  divergences: ConsistencyRow[];
}

function normalise(value: number | string | boolean | null | undefined) {
  return value === undefined ? null : value;
}

/**
 * Compare a set of labelled field pairs.
 *
 * `lagTolerance` applies to numeric fields: an indexed value BELOW the on-chain
 * value within this tolerance is treated as indexer lag (expected while the
 * indexer catches up) rather than a hard mismatch.
 */
export function compareConsistency(
  pairs: Array<{
    field: string;
    onChain: number | string | boolean | null | undefined;
    indexed: number | string | boolean | null | undefined;
  }>,
  lagTolerance = 0,
): ConsistencyReport {
  const rows: ConsistencyRow[] = pairs.map((pair) => {
    const onChain = normalise(pair.onChain);
    const indexed = normalise(pair.indexed);

    // If the indexer has no value yet, treat as lag (never a false mismatch).
    if (indexed === null) {
      return { field: pair.field, onChain, indexed, matches: false, severity: "lag" };
    }

    if (typeof onChain === "number" && typeof indexed === "number") {
      if (onChain === indexed) {
        return { field: pair.field, onChain, indexed, matches: true, severity: "ok" };
      }
      const behind = onChain - indexed;
      if (lagTolerance > 0 && behind > 0 && behind <= lagTolerance) {
        return { field: pair.field, onChain, indexed, matches: false, severity: "lag" };
      }
      return { field: pair.field, onChain, indexed, matches: false, severity: "mismatch" };
    }

    const matches = onChain === indexed;
    return {
      field: pair.field,
      onChain,
      indexed,
      matches,
      severity: matches ? "ok" : "mismatch",
    };
  });

  const divergences = rows.filter((row) => !row.matches);
  return {
    consistent: divergences.length === 0,
    rows,
    divergences,
  };
}
