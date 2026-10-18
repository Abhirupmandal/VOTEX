import { Skeleton } from "@/components/ui/skeleton";

/**
 * App-shell scoped loading skeleton (Phase 5 §18). Mirrors the shape of the
 * typical inner page (header + summary tiles + content grid) so navigation
 * feels instant without layout shift.
 */
export default function AppLoading() {
  return (
    <div data-testid="app-loading" className="flex flex-col gap-8" aria-busy="true">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
