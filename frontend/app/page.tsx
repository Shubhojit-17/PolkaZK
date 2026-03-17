"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { GlassCard } from "./components/GlassCard";
import { Button } from "./components/Button";

const architectureSteps = [
  { title: "Frontend", desc: "User Interaction & ZK Proof Generation", color: "border-white/20 bg-white/5 text-white" },
  { title: "Solidity Contract", desc: "Voting Logic & Proof Routing", color: "border-[#8B5CF6]/30 bg-[#8B5CF6]/10 text-[#8B5CF6]" },
  { title: "PolkaVM Runtime", desc: "RISC-V Execution Engine", color: "border-blue-500/30 bg-blue-500/10 text-blue-400" },
  { title: "Rust Verifier", desc: "BN254 Groth16 Cryptography", color: "border-[#F472B6]/30 bg-gradient-to-r from-[#F472B6]/10 to-[#FB923C]/10 text-[#F472B6]" },
  { title: "Groth16 Proof Validated", desc: "Trustless Verification Result", color: "border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]" },
];

const techStack = ["Polkadot Hub", "PolkaVM", "Rust", "Solidity", "Groth16", "BN254"];

export default function LandingPage() {
  return (
    <div className="pt-24 pb-32 relative">
      {/* Background Grid */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)]" />

      {/* Hero Section */}
      <section className="relative z-10 container mx-auto px-6 py-24 text-center max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-mono mb-8">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            PolkaVM × Rust Integration Live
          </div>

          <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-8 leading-tight">
            PolkaZK
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F472B6] to-[#FB923C]">
              Private Voting
            </span>
            <br />
            Powered by Rust
          </h1>

          <p className="text-xl text-white/60 mb-12 max-w-2xl mx-auto leading-relaxed">
            Zero-knowledge voting where Solidity delegates cryptography to Rust on
            PolkaVM. Scale your DAO with unmatched privacy and performance.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/dashboard">
              <Button size="lg" className="w-full sm:w-auto gap-2 group">
                Launch Demo
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </Button>
            </Link>
            <a href="#architecture">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                View Architecture
              </Button>
            </a>
          </div>
        </motion.div>
      </section>

      {/* Performance Comparison */}
      <section className="relative z-10 container mx-auto px-6 py-24">
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <GlassCard className="p-8">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
              <span className="text-[#8B5CF6]">⚡</span>
              Solidity Only Verification
            </h3>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-2 text-white/60 font-mono">
                  <span>Gas Cost</span>
                  <span>~300,000</span>
                </div>
                <div className="h-4 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: "95%" }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="h-full bg-red-500/50"
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2 text-white/60 font-mono">
                  <span>Execution Time</span>
                  <span>12.5s</span>
                </div>
                <div className="h-4 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: "80%" }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                    className="h-full bg-red-500/50"
                  />
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-8 relative overflow-hidden border-[#F472B6]/30">
            <div className="absolute inset-0 bg-gradient-to-br from-[#F472B6]/5 to-[#FB923C]/5" />
            <h3 className="text-xl font-bold mb-6 flex items-center gap-3 relative z-10">
              <span className="text-[#F472B6]">⚡</span>
              Rust Verification on PolkaVM
            </h3>
            <div className="space-y-6 relative z-10">
              <div>
                <div className="flex justify-between text-sm mb-2 text-white/60 font-mono">
                  <span>Gas Cost</span>
                  <span className="text-[#10B981]">~45,000 (-85%)</span>
                </div>
                <div className="h-4 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: "15%" }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-[#F472B6] to-[#FB923C]"
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2 text-white/60 font-mono">
                  <span>Execution Time</span>
                  <span className="text-[#10B981]">0.8s (-93%)</span>
                </div>
                <div className="h-4 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: "10%" }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                    className="h-full bg-gradient-to-r from-[#F472B6] to-[#FB923C]"
                  />
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </section>

      {/* Architecture Pipeline */}
      <section id="architecture" className="relative z-10 container mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Architecture Pipeline</h2>
          <p className="text-white/60">How data moves through the PolkaZK system</p>
        </div>

        <div className="flex flex-col items-center gap-4 max-w-md mx-auto">
          {architectureSteps.map((step, i) => (
            <div key={step.title} className="w-full flex flex-col items-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.5 }}
                className="w-full max-w-[320px]"
              >
                <GlassCard className={`p-5 text-center ${step.color} border`}>
                  <h4 className="font-mono font-bold text-sm mb-1">{step.title}</h4>
                  <p className="text-xs text-white/50">{step.desc}</p>
                </GlassCard>
              </motion.div>
              {i < architectureSteps.length - 1 && (
                <motion.div
                  animate={{ y: [0, 8, 0] }}
                  transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
                  className="text-white/30 text-xl my-2"
                >
                  ↓
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Technology Stack */}
      <section className="relative z-10 container mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Technology Stack</h2>
          <p className="text-white/60">Built on modern Web3 infrastructure</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {techStack.map((tech) => (
            <GlassCard
              key={tech}
              className="p-8 text-center hover:bg-white/10 hover:border-white/30 transition-all duration-300 cursor-default group"
            >
              <h4 className="font-mono font-bold tracking-tight text-white/80 group-hover:text-white transition-colors text-lg">
                {tech}
              </h4>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 container mx-auto px-6 py-24 text-center">
        <GlassCard className="max-w-3xl mx-auto p-12 bg-gradient-to-br from-[#8B5CF6]/10 via-[#F472B6]/10 to-[#FB923C]/10 border-[#F472B6]/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-white/5 backdrop-blur-3xl" />
          <div className="relative z-10">
            <h2 className="text-4xl font-bold mb-6">Ready to Experience PolkaZK?</h2>
            <p className="text-xl text-white/60 mb-10">
              Try the interactive demo to see the zero-knowledge voting pipeline in action.
            </p>
            <Link href="/dashboard">
              <Button size="lg" className="shadow-[0_0_40px_rgba(244,114,182,0.4)]">
                Launch Demo
              </Button>
            </Link>
          </div>
        </GlassCard>
      </section>

      {/* Footer */}
      <footer className="relative z-10 text-center text-xs text-white/30 mt-16 pb-8">
        PolkaZK — Polkadot Solidity Hackathon 2026 | Track 2: PVM Smart Contracts
      </footer>
    </div>
  );
}
