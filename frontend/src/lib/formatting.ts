/** Presentation-only formatting helpers. No business logic lives here. */

/** Shorten an EVM address to the 0x1234...5678 display form. */
export function shortenAddress(address: string | undefined | null): string {
  if (!address) return "—";
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Shorten a transaction/block hash for compact display. */
export function shortenHash(hash: string | undefined | null, size = 10): string {
  if (!hash) return "—";
  if (hash.length <= size * 2 + 1) return hash;
  return `${hash.slice(0, size)}…${hash.slice(-size)}`;
}

/** Format a unix-seconds timestamp as a local date-time string. */
export function formatTimestamp(
  seconds: number | bigint | null | undefined,
): string {
  if (seconds === null || seconds === undefined) return "—";
  const value = typeof seconds === "bigint" ? Number(seconds) : seconds;
  if (!Number.isFinite(value) || value <= 0) return "—";
  return new Date(value * 1000).toLocaleString();
}

/** Format an ISO/date string as a local date-time string. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

/** Human relative time, e.g. "3 minutes ago" / "in 2 days". */
export function formatRelative(
  targetSeconds: number | bigint | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (targetSeconds === null || targetSeconds === undefined) return "—";
  const target = typeof targetSeconds === "bigint" ? Number(targetSeconds) : targetSeconds;
  if (!Number.isFinite(target) || target <= 0) return "—";
  const diffMs = target * 1000 - nowMs;
  const abs = Math.abs(diffMs);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
    ["second", 1_000],
  ];
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "second") {
      const value = Math.round(diffMs / ms);
      return fmt.format(value, unit);
    }
  }
  return "—";
}

/** Countdown label, e.g. "2d 03h 14m" (clamped at zero). */
export function formatDuration(
  targetSeconds: number | bigint | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (targetSeconds === null || targetSeconds === undefined) return "—";
  const target = typeof targetSeconds === "bigint" ? Number(targetSeconds) : targetSeconds;
  if (!Number.isFinite(target) || target <= 0) return "—";
  const totalSeconds = Math.max(0, Math.floor(target - nowMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/** Percentage (0-100) with a fixed precision. */
export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

/** Compute a percentage of a total, guarding against divide-by-zero. */
export function percentOf(part: number, total: number): number {
  if (!total || total <= 0) return 0;
  return (part / total) * 100;
}

/** Turn a bigint/string/number into a number safely for display. */
export function toNumber(value: bigint | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
