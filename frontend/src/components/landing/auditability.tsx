"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, FileSearch, Hash, History, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";

const LAYERS = [
  {
    icon: Hash,
    label: "Block / Transaction",
    description: "The mined block and transaction hash for the action.",
  },
  {
    icon: FileSearch,
    label: "Event type",
    description:
      "Whether it was a registration, candidate, vote, or state change.",
  },
  {
    icon: History,
    label: "Election & timestamp",
    description: "Which election it belongs to, and when it was indexed.",
  },
  {
    icon: Radio,
    label: "Status",
    description: "Confirmations and indexing state for the event.",
  },
];

/** "Transparent Auditability" section with a CTA into the audit explorer. */
export function Auditability() {
  return (
    <section className="w-full max-w-5xl" data-testid="auditability">
      <div className="mb-8 text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
          Transparent Auditability
        </p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Follow the trail from vote to block
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
          The audit explorer turns indexed blockchain events into a readable
          timeline: block, event, transaction, election, timestamp, and status.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {LAYERS.map((layer, index) => (
          <motion.div
            key={layer.label}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.08 }}
            className="rounded-lg glass p-5 text-center"
          >
            <layer.icon
              className="mx-auto mb-3 h-6 w-6 text-primary"
              aria-hidden
            />
            <h3 className="mb-1 text-sm font-semibold">{layer.label}</h3>
            <p className="text-xs text-muted-foreground">{layer.description}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <Button asChild variant="outline" size="lg" data-testid="open-audit">
          <Link href="/audit">
            Open Audit Explorer
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
