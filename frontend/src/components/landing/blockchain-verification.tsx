"use client";

import { motion } from "framer-motion";
import { Boxes, Fingerprint, Link2, Search } from "lucide-react";

const POINTS = [
  {
    icon: Boxes,
    title: "Append-only ledger",
    description:
      "Cast votes are written as on-chain transactions. Once a block is mined, the record cannot be silently altered or deleted.",
  },
  {
    icon: Fingerprint,
    title: "Wallet-bound ballots",
    description:
      "The election contract binds one vote per registered wallet, so the same wallet cannot vote twice.",
  },
  {
    icon: Link2,
    title: "Transaction-hash receipt",
    description:
      "Every vote returns a transaction hash. Share it and anyone can independently re-read the same result.",
  },
  {
    icon: Search,
    title: "Public audit trail",
    description:
      "Registration, candidate, vote, and state-change events are all queryable from the audit explorer.",
  },
];

/** "Blockchain Verification" explainer section. */
export function BlockchainVerification() {
  return (
    <section className="w-full max-w-5xl" data-testid="blockchain-verification">
      <div className="mb-8 text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
          Blockchain Verification
        </p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Every vote is independently verifiable
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
          VOTEX does not store a private tally. The authoritative result lives on
          the blockchain, and the interface simply reads it back for you.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {POINTS.map((point, index) => (
          <motion.div
            key={point.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.08 }}
            className="flex gap-4 rounded-lg glass p-6"
          >
            <point.icon className="h-7 w-7 shrink-0 text-primary" aria-hidden />
            <div>
              <h3 className="mb-1 font-semibold">{point.title}</h3>
              <p className="text-sm text-muted-foreground">
                {point.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
