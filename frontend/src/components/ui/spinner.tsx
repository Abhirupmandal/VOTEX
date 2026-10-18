import { cn } from "@/lib/utils";

export interface SpinnerProps {
  className?: string;
  /** Accessible label announced to screen readers. */
  label?: string;
}

/** Minimal, reduced-motion-safe loading spinner. */
export function Spinner({ className, label = "Loading" }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className="inline-flex">
      <svg
        className={cn("h-5 w-5 animate-spin text-primary", className)}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-90"
          fill="currentColor"
          d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
        />
      </svg>
    </span>
  );
}
