import { ShieldCheck } from "lucide-react";

/** Site footer. */
export function Footer() {
  return (
    <footer className="w-full border-t border-border/60 py-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-5 w-5 text-primary" />
          VOTEX
        </div>
        <p className="text-sm text-muted-foreground">
          Decentralized Election Infrastructure
        </p>
        <p className="text-xs text-muted-foreground/70">
          Experimental hackathon prototype — not a production national-election
          system.
        </p>
      </div>
    </footer>
  );
}
