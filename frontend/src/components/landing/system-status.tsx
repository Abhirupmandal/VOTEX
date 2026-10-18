"use client";

import { motion } from "framer-motion";

import type { StatusRow } from "@/types";
import { cn } from "@/lib/utils";

const STATUS_ROWS: StatusRow[] = [
  { label: "Blockchain", status: "ONLINE" },
  { label: "Election Engine", status: "READY" },
  { label: "AI Guardian", status: "STANDBY" },
  { label: "Audit Layer", status: "READY" },
];

const STATUS_STYLES: Record<StatusRow["status"], string> = {
  ONLINE: "text-emerald-400",
  READY: "text-primary",
  STANDBY: "text-amber-400",
  OFFLINE: "text-red-400",
};

/** Static system status board. Labelled as local/development by design. */
export function SystemStatus() {
  return (
    <div className="w-full max-w-xl rounded-lg glass p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Live System Status
        </h2>
        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
          DEVELOPMENT / LOCAL NETWORK
        </span>
      </div>
      <ul className="space-y-3">
        {STATUS_ROWS.map((row, index) => (
          <motion.li
            key={row.label}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.08 }}
            className="flex items-center justify-between border-b border-border/40 pb-3 last:border-b-0 last:pb-0"
          >
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <span
              className={cn(
                "flex items-center gap-2 text-sm font-semibold",
                STATUS_STYLES[row.status],
              )}
            >
              <span className="h-2 w-2 animate-pulse-glow rounded-full bg-current" />
              {row.status}
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
