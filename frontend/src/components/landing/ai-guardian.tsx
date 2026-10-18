"use client";

import { motion } from "framer-motion";
import { Activity, BrainCircuit, Gauge, ShieldAlert } from "lucide-react";

const CAPABILITIES = [
  {
    icon: Activity,
    title: "Behavioural monitoring",
    description:
      "Voting telemetry is aggregated into windows and summarised as behavioural features.",
  },
  {
    icon: BrainCircuit,
    title: "Anomaly detection",
    description:
      "A statistical detector and an Isolation Forest flag windows that deviate from the baseline.",
  },
  {
    icon: Gauge,
    title: "Bounded risk scoring",
    description:
      "Signal severities are combined into a deterministic 0–100 risk score with threat bands.",
  },
  {
    icon: ShieldAlert,
    title: "Human-in-the-loop alerts",
    description:
      "The Guardian raises advisory alerts for review. It never casts, blocks, or alters a vote.",
  },
];

/** "AI Election Guardian" explainer section. */
export function AiGuardian() {
  return (
    <section className="w-full max-w-5xl" data-testid="ai-guardian">
      <div className="mb-8 text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
          AI Election Guardian
        </p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          A supervisory layer — never a deciding one
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
          The Guardian is advisory by design. It observes indexed telemetry and
          surfaces anomalies for human review; it has no authority over the
          on-chain result.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {CAPABILITIES.map((capability, index) => (
          <motion.div
            key={capability.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.08 }}
            className="rounded-lg glass p-6"
          >
            <capability.icon className="mb-4 h-7 w-7 text-primary" aria-hidden />
            <h3 className="mb-2 font-semibold">{capability.title}</h3>
            <p className="text-sm text-muted-foreground">
              {capability.description}
            </p>
          </motion.div>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="mx-auto mt-6 max-w-2xl text-center text-xs text-muted-foreground/80"
      >
        Alerts are informational only. An election is never paused, finalised, or
        decided by the AI — those transitions remain the responsibility of the
        authorised on-chain roles.
      </motion.p>
    </section>
  );
}
