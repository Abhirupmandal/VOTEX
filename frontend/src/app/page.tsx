"use client";

import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";

import { HeroActions } from "@/components/landing/hero-actions";
import { SystemStatus } from "@/components/landing/system-status";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { BlockchainVerification } from "@/components/landing/blockchain-verification";
import { AiGuardian } from "@/components/landing/ai-guardian";
import { Auditability } from "@/components/landing/auditability";
import { Footer } from "@/components/landing/footer";

/** VOTEX landing page. */
export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

      <main
        id="main-content"
        tabIndex={-1}
        className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center gap-20 px-6 py-16 tabular-nums focus:outline-none"
      >
        {/* Hero */}
        <section className="flex w-full flex-col items-center gap-6 pt-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Decentralized Election Infrastructure
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="text-6xl font-black tracking-tight sm:text-7xl md:text-8xl"
          >
            <span className="text-gradient">VOTEX</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="max-w-2xl text-sm font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:text-base"
          >
            AI-Powered Decentralized Election Infrastructure
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="max-w-xl text-lg text-muted-foreground"
          >
            Trustless elections. Verifiable integrity. Transparent governance.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mt-2 w-full"
          >
            <HeroActions />
          </motion.div>
        </section>

        <SystemStatus />
        <Features />
        <HowItWorks />
        <BlockchainVerification />
        <AiGuardian />
        <Auditability />
      </main>

      <Footer />
    </div>
  );
}
