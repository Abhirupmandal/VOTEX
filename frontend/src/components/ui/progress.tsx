import { cn } from "@/lib/utils";

export interface ProgressProps {
  /** Completion percentage, clamped to 0-100. */
  value: number;
  className?: string;
  /** Accessible label for the progressbar role. */
  label?: string;
}

/** Horizontal progress bar used for result distribution bars. */
export function Progress({ value, className, label }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-card/80", className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
