"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary (Next.js App Router convention, Phase 5 §19).
 * Catches render/server errors in the page tree; the raw error is logged and
 * exposed only inside an expandable "Technical details" section.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Never hide the error — log it for diagnostics.
    console.error("VOTEX route error:", error);
  }, [error]);

  return (
    <div
      role="alert"
      data-testid="route-error"
      className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 text-center"
    >
      <AlertTriangle className="h-10 w-10 text-amber-400" />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          This page failed to load. You can retry, or return to the elections
          dashboard.
        </p>
      </div>
      <details className="w-full text-left text-xs text-muted-foreground">
        <summary className="cursor-pointer">Technical details</summary>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 font-mono">
          {error.message}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
      </details>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={reset} data-testid="route-error-retry">
          <RotateCcw className="h-4 w-4" />
          Retry
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href="/elections">Back to elections</a>
        </Button>
      </div>
    </div>
  );
}
