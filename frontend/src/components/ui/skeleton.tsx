import { cn } from "@/lib/utils";

/** Pulsing placeholder used while content loads (Phase 5 §18). */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-card/80", className)}
      aria-hidden="true"
      {...props}
    />
  );
}
