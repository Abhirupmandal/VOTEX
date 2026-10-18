import { Spinner } from "@/components/ui/spinner";

/**
 * Global route loading fallback (Phase 5 §18). Rendered by the App Router while
 * a server component or lazily-loaded segment is resolving.
 */
export default function Loading() {
  return (
    <div
      data-testid="route-loading"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground"
    >
      <Spinner label="Loading" />
      <p className="text-sm">Loading…</p>
    </div>
  );
}
