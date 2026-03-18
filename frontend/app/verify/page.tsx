"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useBlockchain } from "../context/blockchain";
import { GlassCard } from "../components/GlassCard";
import { Button } from "../components/Button";
import { StatusBadge } from "../components/StatusBadge";
import { getExplorerActivityUrl } from "../lib/explorer";

const CIRCUIT_PUBLIC_OUTPUT = "21";
const DEMO_PROOF_A = "3";
const DEMO_PROOF_B = "7";

export default function VerifyPage() {
  const {
    generateProof,
    verifyProof,
    proofGenerated,
    verificationState,
    lastVerifyTxHash,
    lastVerifyBlockNumber,
    loading,
    account,
    connectWallet,
    vkStored,
    transactions,
  } = useBlockchain();

  const [logs, setLogs] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  const handleGenerateAndVerify = useCallback(async () => {
    if (proofGenerated) {
      // Already generated — just verify on-chain
      await verifyProof();
      return;
    }

    const a = DEMO_PROOF_A;
    const b = DEMO_PROOF_B;
    const product = CIRCUIT_PUBLIC_OUTPUT;

    setIsGenerating(true);
    setLogs([]);
    addLog(`Starting local fixed demo proof generation (a=${a}, b=${b})...`);
    addLog(`Locked public constraint: a × b = ${CIRCUIT_PUBLIC_OUTPUT}`);

    const success = await generateProof();

    if (success) {
      addLog("Groth16 proof generated and locally verified in browser ✓");
      addLog(`Proof size: 256 bytes | Public output: [${product}]`);
      addLog("Ready for on-chain verification.");
    } else {
      addLog("✗ Proof generation failed. Check inputs and try again.");
    }

    setIsGenerating(false);
  }, [generateProof, verifyProof, proofGenerated]);

  const isVerifying = verificationState === "verifying";
  const isValid = verificationState === "valid";
  const isInvalid = verificationState === "invalid";

  const getStatusColor = () => {
    switch (verificationState) {
      case "idle": return "text-white/60";
      case "verifying": return "text-amber-400";
      case "valid": return "text-[#10B981]";
      case "invalid": return "text-red-500";
    }
  };

  const getBorderClass = () => {
    switch (verificationState) {
      case "valid": return "border-[#10B981]/50 shadow-[0_0_50px_rgba(16,185,129,0.1)]";
      case "invalid": return "border-red-500/50 shadow-[0_0_50px_rgba(239,68,68,0.1)]";
      case "verifying": return "border-amber-500/50 shadow-[0_0_50px_rgba(245,158,11,0.1)]";
      default: return "border-white/10";
    }
  };

  // Recent verification transactions
  const verifyTxs = transactions.filter(
    (t) => t.actionType === "Proof Verified" || t.actionType === "VK Stored"
  );

  return (
    <div className="pt-28 pb-12 px-6 min-h-screen flex flex-col items-center relative overflow-hidden">
      {/* Background pulse when verifying */}
      {isVerifying && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.15 }}
          className="absolute inset-0 bg-gradient-to-r from-[#F472B6] to-[#FB923C] rounded-full blur-[150px] -z-10 w-3/4 h-3/4 m-auto animate-pulse"
        />
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-4xl"
      >
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-4 tracking-tight">Local Proof + On-Chain Verification</h1>
          <p className="text-white/60 text-lg max-w-2xl mx-auto">
            Generate a ZK proof to prove your eligibility to vote, then verify it on-chain via the Rust verifier on PolkaVM.
            Once verified, you can cast private votes on any active proposal.
          </p>
        </div>

        {/* Workflow Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            {
              step: 1,
              label: "Generate Proof",
              desc: "Groth16 ZK proof of eligibility",
              done: proofGenerated,
              active: !proofGenerated && !isVerifying,
            },
            {
              step: 2,
              label: "On-Chain Verification",
              desc: "Rust verifier validates on PolkaVM",
              done: isValid,
              active: proofGenerated && !isValid,
            },
            {
              step: 3,
              label: "Vote on Proposals",
              desc: "Cast private votes with your proof",
              done: false,
              active: isValid,
            },
          ].map((s) => (
            <div
              key={s.step}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                s.done
                  ? "border-[#10B981]/30 bg-[#10B981]/5"
                  : s.active
                  ? "border-[#8B5CF6]/30 bg-[#8B5CF6]/5"
                  : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                  s.done
                    ? "bg-[#10B981]/20 text-[#10B981]"
                    : s.active
                    ? "bg-[#8B5CF6]/20 text-[#8B5CF6]"
                    : "bg-white/10 text-white/30"
                }`}
              >
                {s.done ? "✓" : s.step}
              </div>
              <div>
                <div className={`text-sm font-bold ${s.done ? "text-[#10B981]" : s.active ? "text-white" : "text-white/40"}`}>
                  {s.label}
                </div>
                <div className="text-xs text-white/40">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Terminal + Action (3 cols) */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            <GlassCard className={`p-0 bg-[#0A0A0B]/80 border-white/5 font-mono text-sm transition-all duration-500 ${getBorderClass()}`}>
              {/* Terminal Header */}
              <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border-b border-white/5">
                <span className="w-3 h-3 rounded-full bg-red-500/50" />
                <span className="w-3 h-3 rounded-full bg-amber-500/50" />
                <span className="w-3 h-3 rounded-full bg-[#10B981]/50" />
                <span className="text-white/40 text-xs ml-2">zk-prover — local proof generation</span>
              </div>

              {/* Terminal Body */}
              <div className="p-4 min-h-[200px] max-h-[300px] overflow-y-auto custom-scrollbar flex flex-col gap-1.5">
                {/* Private input fields */}
                {!proofGenerated && !isGenerating && (
                  <div className="mb-3 pb-3 border-b border-white/10">
                    <div className="text-xs text-white/50 mb-2">Fixed demo statement (locked):</div>
                    <div className="flex gap-3 items-center">
                      <div className="flex items-center gap-1">
                        <span className="text-white/40 text-xs">a =</span>
                        <span className="w-16 px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-xs font-mono text-center">{DEMO_PROOF_A}</span>
                      </div>
                      <span className="text-white/30">×</span>
                      <div className="flex items-center gap-1">
                        <span className="text-white/40 text-xs">b =</span>
                        <span className="w-16 px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-xs font-mono text-center">{DEMO_PROOF_B}</span>
                      </div>
                      <span className="text-white/30">=</span>
                      <span className="text-[#10B981] text-xs font-mono font-bold">{CIRCUIT_PUBLIC_OUTPUT}</span>
                    </div>
                  </div>
                )}
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-2 text-white/70">
                    <span className="text-[#10B981] shrink-0">&gt;</span>
                    <span className={log.includes("✓") ? "text-[#10B981]" : "text-white/80"}>
                      {log}
                    </span>
                  </div>
                ))}
                {isVerifying && (
                  <div className="flex gap-2 text-amber-400 mt-2 animate-pulse">
                    <span className="text-amber-500">&gt;</span>
                    <span>Submitting to Rust verifier on PolkaVM...</span>
                  </div>
                )}
                {isValid && (
                  <div className="flex gap-2 text-[#10B981] mt-2">
                    <span>&gt;</span>
                    <span className="font-bold">✓ Proof verified on-chain! You can now vote on proposals.</span>
                  </div>
                )}
                {isInvalid && (
                  <div className="flex gap-2 text-red-400 mt-2">
                    <span>&gt;</span>
                    <span>✗ Verification failed. Please try again.</span>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Action Button */}
              <div className="p-3 border-t border-white/5 bg-white/5">
                {!account ? (
                  <Button onClick={connectWallet} className="w-full text-sm" size="sm">
                    Connect Wallet
                  </Button>
                ) : (
                  <Button
                    onClick={
                      proofGenerated && verificationState !== "valid"
                        ? verifyProof
                        : handleGenerateAndVerify
                    }
                    disabled={isGenerating || isVerifying || isValid}
                    className="w-full text-sm"
                    size="sm"
                    variant={isValid ? "success" : isInvalid ? "danger" : "primary"}
                  >
                    {isGenerating
                      ? "Generating Proof..."
                      : isVerifying
                      ? "Verifying on PolkaVM..."
                      : isValid
                      ? "✓ Voter Eligibility Verified"
                      : isInvalid
                      ? "Retry Verification"
                      : proofGenerated
                      ? "Verify Proof On-Chain"
                      : "Generate & Verify Eligibility Proof"}
                  </Button>
                )}
              </div>
            </GlassCard>

            {/* Navigate to vote */}
            <AnimatePresence>
              {isValid && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <GlassCard className="p-6 border-[#10B981]/30 bg-[#10B981]/5 text-center">
                    <h3 className="font-bold text-[#10B981] mb-2">You&apos;re eligible to vote!</h3>
                    <p className="text-sm text-white/60 mb-4">
                      Your ZK proof has been verified on-chain. You can now cast private votes on any active proposal.
                    </p>
                    <a href="/proposal">
                      <Button variant="success" size="sm">
                        Go to Proposals →
                      </Button>
                    </a>
                  </GlassCard>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Verification Metadata (2 cols) */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <GlassCard className="flex flex-col gap-4 relative overflow-hidden">
              <h3 className="font-bold text-lg">Verification Details</h3>

              <div className="space-y-3 font-mono text-sm">
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-white/40">Status</span>
                  <span className={`font-bold capitalize ${getStatusColor()}`}>
                    {verificationState}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-white/40">Proving System</span>
                  <span className="text-white/90">Groth16</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-white/40">Elliptic Curve</span>
                  <span className="text-white/90">BN254</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-white/40">Verifier</span>
                  <span className="text-[#F472B6]">Rust (PolkaVM)</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-white/40">VK On-Chain</span>
                  <span className={vkStored ? "text-[#10B981]" : "text-white/30"}>
                    {vkStored ? "Stored ✓" : "Not yet"}
                  </span>
                </div>
                {lastVerifyTxHash && (
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-white/40">Verify Tx</span>
                    <a
                      href={getExplorerActivityUrl(lastVerifyTxHash, lastVerifyBlockNumber)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#8B5CF6] hover:underline truncate max-w-[140px]"
                    >
                      {lastVerifyTxHash.slice(0, 10)}...
                    </a>
                  </div>
                )}
              </div>

              {/* Status visual */}
              {isVerifying && (
                <div className="flex flex-col items-center py-4">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-14 h-14 rounded-full border-4 border-amber-500/20 border-t-amber-500"
                  />
                  <p className="font-mono text-xs text-amber-400 mt-3 animate-pulse">
                    Running Rust verifier on PolkaVM...
                  </p>
                </div>
              )}

              {isValid && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center py-4"
                >
                  <svg className="w-14 h-14 text-[#10B981] drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <h3 className="text-base font-bold text-[#10B981] mt-2">Proof Valid</h3>
                </motion.div>
              )}
            </GlassCard>

            {/* Recent Verification Transactions */}
            {verifyTxs.length > 0 && (
              <GlassCard>
                <h3 className="font-bold text-sm mb-3">Verification History</h3>
                <div className="space-y-2">
                  {verifyTxs.slice(0, 5).map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
                    >
                      <div>
                        <span className="text-xs font-medium text-white/80">{tx.actionType}</span>
                        <span className="text-[10px] text-white/30 block">
                          {tx.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <a
                        href={getExplorerActivityUrl(tx.txHash, tx.blockNumber)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#8B5CF6] hover:underline font-mono"
                      >
                        {tx.txHash.slice(0, 8)}...
                      </a>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
