"use client";

import { motion } from "framer-motion";

interface Step {
  number: string;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    number: "01",
    title: "VERIFY",
    description: "Connect your wallet and prove eligibility for the election.",
  },
  {
    number: "02",
    title: "VOTE",
    description: "Select a candidate and commit your ballot to the blockchain.",
  },
  {
    number: "03",
    title: "VERIFY ON-CHAIN",
    description: "Confirm your vote via transaction hash and the public audit trail.",
  },
];

/** Three-step "How it works" flow. */
export function HowItWorks() {
  return (
    <section className="w-full max-w-5xl">
      <h2 className="mb-8 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
        How It Works
      </h2>
      <div className="grid gap-5 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <motion.div
            key={step.number}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.12 }}
            className="rounded-lg glass p-6 text-center"
          >
            <div className="mb-3 text-3xl font-bold text-gradient">
              {step.number}
            </div>
            <div className="mb-2 text-sm font-semibold uppercase tracking-widest">
              {step.title}
            </div>
            <p className="text-sm text-muted-foreground">{step.description}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
