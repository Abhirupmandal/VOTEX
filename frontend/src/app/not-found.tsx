import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Global 404 page (Phase 5 §19). Keeps the shell minimal and guides the user
 * back to a known-good route.
 */
export default function NotFound() {
  return (
    <div
      data-testid="not-found"
      className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 text-center"
    >
      <Compass className="h-10 w-10 text-sky-400" />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          The page you are looking for does not exist or has moved.
        </p>
      </div>
      <Button asChild>
        <Link href="/elections">Go to elections</Link>
      </Button>
    </div>
  );
}
