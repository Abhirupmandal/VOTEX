"use client";

import { motion } from "framer-motion";
import {
  ShieldCheck,
  Vote,
  ScrollText,
  BrainCircuit,
  type LucideIcon,
} from "lucide-react";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: ShieldCheck,
    title: "Blockchain-backed integrity",
    description:
      "Every vote is recorded on-chain as a tamper-evident, append-only entry.",
  },
  {
    icon: Vote,
    title: "One-wallet-one-vote enforcement",
    description:
      "The election contract deterministically rejects any second vote from the same wallet.",
  },
  {
    icon: ScrollText,
    title: "Transparent audit trail",
    description:
      "Each action is traceable by transaction hash, block number, and event type.",
  },
  {
    icon: BrainCircuit,
    title: "AI-assisted anomaly detection",
    description:
      "An advisory Guardian monitors voting patterns and flags unusual activity for humans.",
  },
];

/** "Why VOTEX" feature grid. */
export function Features() {
  return (
    <section className="w-full max-w-5xl">
      <h2 className="mb-8 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
        Why <span className="text-gradient">VOTEX</span>?
      </h2>
      <div className="grid gap-5 sm:grid-cols-2">
        {FEATURES.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.08 }}
            className="rounded-lg glass p-6"
          >
            <feature.icon className="mb-4 h-7 w-7 text-primary" />
            <h3 className="mb-2 font-semibold">✓ {feature.title}</h3>
            <p className="text-sm text-muted-foreground">
              {feature.description}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
