"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useBlockchain } from "../context/blockchain";
import { GlassCard } from "../components/GlassCard";
import { Button } from "../components/Button";
import { StatusBadge } from "../components/StatusBadge";
import { TransactionCard } from "../components/TransactionCard";
import { CHAIN_CONFIG } from "../contracts";
import { getExplorerActivityUrl } from "../lib/explorer";

// ─── Proof Generator Terminal ────────────────────────────────

function ProofGeneratorTerminal() {
  const { generateProof, proofGenerated, status, verificationState, lastVerifyTxHash } = useBlockchain();
  const [logs, setLogs] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const DEMO_A = "3";
  const DEMO_B = "7";
  const DEMO_C = "21";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Track status changes during proof generation
  useEffect(() => {
    if (isGenerating && status && !status.startsWith("Connected")) {
      setLogs((prev) => {
        if (prev[prev.length - 1] === status) return prev;
        return [...prev, status];
      });
    }
  }, [status, isGenerating]);

  useEffect(() => {
    if (!proofGenerated || logs.length > 0) return;
    if (verificationState === "valid" && lastVerifyTxHash) {
      setLogs([
        "Restored local proof from browser session",
        `On-chain verification found: ${lastVerifyTxHash.slice(0, 12)}...`,
      ]);
      return;
    }
    setLogs(["Restored local proof from browser session"]);
  }, [proofGenerated, verificationState, lastVerifyTxHash, logs.length]);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setLogs([`Generating local fixed demo proof for ${DEMO_A} × ${DEMO_B} = ${DEMO_C}...`]);

    const success = await generateProof();

    if (success) {
      setLogs((prev) => [...prev, "Proof ready ✓"]);
    } else {
      setLogs((prev) => [...prev, "✗ Proof generation failed"]);
    }
    setIsGenerating(false);
  }, [generateProof]);

  return (
    <GlassCard className="flex flex-col flex-1 p-0 bg-[#0A0A0B]/80 border-white/5 font-mono text-sm min-h-[280px]">
      <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border-b border-white/5">
        <span className="text-white/40 text-xs">⌘</span>
        <span className="text-white/40 text-xs">zk-prover node (local)</span>
      </div>
      <div className="flex-1 p-4 overflow-y-auto custom-scrollbar flex flex-col gap-1.5">
        {/* Private input fields */}
        {!proofGenerated && !isGenerating && (
          <div className="mb-2 pb-2 border-b border-white/10">
            <div className="text-xs text-white/50 mb-1.5">Fixed demo statement (locked):</div>
            <div className="flex gap-2 items-center">
              <span className="text-white/40 text-xs">a =</span>
              <span className="w-14 px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-white text-xs font-mono text-center">{DEMO_A}</span>
              <span className="text-white/30">×</span>
              <span className="text-white/40 text-xs">b =</span>
              <span className="w-14 px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-white text-xs font-mono text-center">{DEMO_B}</span>
              <span className="text-white/30">=</span>
              <span className="text-[#10B981] text-xs font-mono font-bold">{DEMO_C}</span>
            </div>
          </div>
        )}
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2 text-white/70 animate-fade-in">
            <span className="text-white/30 shrink-0 select-none text-xs">
              [{new Date().toISOString().substring(11, 19)}]
            </span>
            <span className="text-[#10B981] shrink-0">&gt;</span>
            <span className={log.includes("✓") || log.includes("successfully") ? "text-[#10B981]" : "text-white/80"}>
              {log}
            </span>
          </div>
        ))}
        {isGenerating && (
          <div className="flex gap-2 text-white/70 mt-1 animate-pulse">
            <span className="text-white/30 shrink-0 select-none text-xs">
              [{new Date().toISOString().substring(11, 19)}]
            </span>
            <span className="text-[#10B981]">&gt;</span>
            <span className="w-2 h-4 bg-white/50" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-white/5 bg-white/5">
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || proofGenerated}
          className="w-full text-sm"
          variant={proofGenerated ? "success" : "primary"}
          size="sm"
        >
          {isGenerating
            ? "Generating Local Proof..."
            : proofGenerated
            ? "✓ Local Proof Ready"
            : "Generate Local ZK Proof"}
        </Button>
      </div>
    </GlassCard>
  );
}

// ─── Execution Engine ────────────────────────────────────────

function ExecutionEngine() {
  const { verificationState, verifyProof, proofGenerated, loading, lastVerifyTxHash, lastVerifyBlockNumber, account, vkStored } =
    useBlockchain();

  const isVerifying = verificationState === "verifying";
  const isValid = verificationState === "valid";

  return (
    <GlassCard className="flex flex-col gap-4 relative overflow-hidden flex-1 min-h-[320px]">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg">Execution Engine</h3>
        <StatusBadge
          status={
            isVerifying ? "validating" : isValid ? "valid" : verificationState === "invalid" ? "invalid" : "idle"
          }
        />
      </div>

      <div className="flex-1 flex items-center justify-between relative px-4">
        {/* Solidity Node */}
        <div className="w-[38%] flex flex-col items-center gap-3 z-10">
          <div
            className={`p-6 rounded-2xl border transition-all duration-500 backdrop-blur-md ${
              isVerifying
                ? "bg-[#8B5CF6]/20 border-[#8B5CF6]/50 shadow-[0_0_30px_rgba(139,92,246,0.3)]"
                : "bg-white/5 border-white/10"
            }`}
          >
            <span className={`text-3xl font-bold ${isVerifying ? "text-[#8B5CF6]" : "text-white/40"}`}>S</span>
          </div>
          <span className="font-mono font-bold text-sm text-white/80">Solidity Contract</span>
          <span className="text-xs text-white/40 text-center">Delegates verification</span>
        </div>

        {/* Animated Connection */}
        <div className="flex-1 h-px bg-white/10 mx-2 relative overflow-visible">
          {isVerifying && (
            <>
              <motion.div
                initial={{ left: "0%" }}
                animate={{ left: "100%" }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="absolute top-1/2 -translate-y-1/2 w-8 h-8 -ml-4 rounded-full bg-gradient-to-r from-transparent via-[#F472B6] to-transparent blur-sm"
              />
              <motion.div
                initial={{ left: "0%" }}
                animate={{ left: "100%" }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 -ml-2 rounded-full bg-white shadow-[0_0_15px_#F472B6]"
              />
            </>
          )}
          <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>

        {/* Rust Verifier Node */}
        <div className="w-[38%] flex flex-col items-center gap-3 z-10">
          <div
            className={`p-6 rounded-2xl border transition-all duration-500 backdrop-blur-md ${
              isValid
                ? "bg-gradient-to-br from-[#F472B6]/20 to-[#FB923C]/20 border-[#FB923C]/50 shadow-[0_0_30px_rgba(251,146,60,0.3)]"
                : "bg-white/5 border-white/10"
            }`}
          >
            <span
              className={`text-3xl font-bold ${
                isValid
                  ? "text-transparent bg-clip-text bg-gradient-to-br from-[#F472B6] to-[#FB923C]"
                  : "text-white/40"
              }`}
            >
              R
            </span>
          </div>
          <span className="font-mono font-bold text-sm text-white/80">Rust Verifier</span>
          <span className="text-xs text-white/40 text-center">PolkaVM Execution</span>
          {vkStored && (
            <span className="text-[10px] text-[#10B981] font-mono">VK stored on-chain</span>
          )}
        </div>

        {/* Valid Overlay */}
        <AnimatePresence>
          {isValid && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-[#10B981]/10 border border-[#10B981]/20 rounded-full text-[#10B981] font-mono text-xs backdrop-blur-md shadow-[0_0_20px_rgba(16,185,129,0.2)]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              On-Chain Proof Validated
              {lastVerifyTxHash && (
                <span className="text-white/40 ml-1">
                  {lastVerifyTxHash.slice(0, 8)}...
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Verify button */}
      <Button
        onClick={verifyProof}
        disabled={!proofGenerated || loading || !account || isValid}
        className="w-full text-sm mt-2"
        size="sm"
        variant={isValid ? "success" : "primary"}
      >
        {isVerifying
          ? "Verifying on PolkaVM..."
          : isValid
          ? "✓ On-Chain Proof Verified"
          : !proofGenerated
          ? "Generate local proof first"
          : "Submit Proof for On-Chain Verification"}
      </Button>

      {proofGenerated && !isValid && (
        <p className="text-xs text-white/50 font-mono text-center">
          Local proof is ready. Submit for on-chain verification to unlock voting.
        </p>
      )}

      {lastVerifyTxHash && (
        <a
          href={getExplorerActivityUrl(lastVerifyTxHash, lastVerifyBlockNumber)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-mono text-[#8B5CF6] hover:underline text-center"
        >
          View verification transaction on-chain
        </a>
      )}
    </GlassCard>
  );
}

// ─── Voting Booth ────────────────────────────────────────────

function VotingBooth() {
  const { verificationState, proposals, account } = useBlockchain();
  const canVote = verificationState === "valid" && !!account;
  const activeCount = proposals.filter((p) => p.isActive).length;

  return (
    <GlassCard className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg">Voting Booth</h3>
        {!canVote && (
          <span className="text-xs text-white/40 font-mono">Verify proof to enable</span>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 text-center">
        <p className="text-sm text-white/70 mb-1">
          {activeCount > 0
            ? `${activeCount} active proposal${activeCount > 1 ? "s" : ""} available for voting.`
            : "No active proposals right now."}
        </p>
        <p className="text-xs text-white/40 font-mono mb-4">
          Vote actions are available on the Proposals page.
        </p>
        <a href="/proposal">
          <Button
            disabled={!canVote}
            className="w-full text-sm"
            size="sm"
            variant={canVote ? "primary" : "secondary"}
          >
            {canVote ? "Go to Proposals & Vote" : "Verify proof to vote"}
          </Button>
        </a>
      </div>
    </GlassCard>
  );
}

// ─── Dashboard Page ──────────────────────────────────────────

export default function DashboardPage() {
  const {
    account,
    chainId,
    status,
    loading,
    transactions,
    createProposal,
    switchToAssetHub,
    connectWallet,
  } = useBlockchain();

  const [proposalTitle, setProposalTitle] = useState("");
  const [proposalTxHash, setProposalTxHash] = useState("");
  const [proposalBlockNumber, setProposalBlockNumber] = useState<number | null>(null);
  const [proposalStatus, setProposalStatus] = useState<"idle" | "pending" | "confirmed">("idle");
  const wrongNetwork = !!account && chainId !== CHAIN_CONFIG.chainId;

  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (wrongNetwork) return;
    if (!proposalTitle.trim()) return;
    setProposalStatus("pending");
    setProposalTxHash("");
    setProposalBlockNumber(null);
    const result = await createProposal(proposalTitle.trim(), 172800);
    if (result) {
      setProposalTxHash(result.txHash);
      setProposalBlockNumber(result.blockNumber);
      setProposalStatus("confirmed");
      setProposalTitle("");
    } else {
      setProposalStatus("idle");
    }
  };

  return (
    <div className="pt-20 pb-6 px-6 min-h-screen">
      {/* Status Bar */}
      {status && (
        <div className="max-w-[1600px] mx-auto mb-4 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70 font-mono">
          {status}
        </div>
      )}

      {/* Chain Warning */}
      {account && chainId !== CHAIN_CONFIG.chainId && (
        <div className="max-w-[1600px] mx-auto mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-300">
          Wrong network. Please switch to Westend Asset Hub.
          <button onClick={switchToAssetHub} className="ml-3 underline hover:text-amber-100">
            Switch Network
          </button>
        </div>
      )}

      {!account && (
        <div className="max-w-[1600px] mx-auto mb-4 px-4 py-3 bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 rounded-xl text-sm text-[#8B5CF6] flex items-center justify-between">
          <span>Connect your wallet to interact with PolkaZK contracts</span>
          <Button onClick={connectWallet} size="sm" disabled={loading}>
            Connect Wallet
          </Button>
        </div>
      )}

      {/* Workflow Banner */}
      {account && (
        <div className="max-w-[1600px] mx-auto mb-4 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white/50 flex items-center gap-4 overflow-x-auto">
          <span className="shrink-0 font-bold text-white/70">Workflow:</span>
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="w-5 h-5 rounded-full bg-[#8B5CF6]/20 text-[#8B5CF6] flex items-center justify-center text-[10px] font-bold">1</span>
            Generate eligibility proof
          </span>
          <span className="text-white/20">→</span>
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="w-5 h-5 rounded-full bg-[#F472B6]/20 text-[#F472B6] flex items-center justify-center text-[10px] font-bold">2</span>
            Verify on PolkaVM
          </span>
          <span className="text-white/20">→</span>
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="w-5 h-5 rounded-full bg-[#10B981]/20 text-[#10B981] flex items-center justify-center text-[10px] font-bold">3</span>
            Vote privately on proposals
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 max-w-[1600px] mx-auto" style={{ minHeight: "calc(100vh - 10rem)" }}>
        {/* ── Left Column: Controls (25%) ── */}
        <div className="flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          {/* Proposal Creator */}
          <GlassCard>
            <h3 className="font-bold text-lg mb-4">Proposal Creator</h3>
            <form onSubmit={handleCreateProposal} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-white/70 mb-1.5 block">
                  Proposal Title
                </label>
                <input
                  type="text"
                  placeholder="e.g., Upgrade runtime to v2.4"
                  value={proposalTitle}
                  onChange={(e) => setProposalTitle(e.target.value)}
                  className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#8B5CF6]/50 focus:ring-1 focus:ring-[#8B5CF6]/50 transition-colors"
                />
                <p className="text-xs text-white/40 mt-1 font-mono">Voting period: 48 hours</p>
              </div>
              <Button type="submit" className="w-full text-sm" size="sm" disabled={loading || !account || wrongNetwork}>
                Create Proposal
              </Button>
            </form>

            {proposalStatus !== "idle" && (
              <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                <StatusBadge status={proposalStatus === "pending" ? "pending" : "confirmed"} />
                {proposalTxHash && (
                  <div className="bg-white/5 rounded-lg p-3 border border-white/5 font-mono text-xs flex flex-col gap-1">
                    <span className="text-white/40">Transaction Hash</span>
                    <a
                      href={getExplorerActivityUrl(proposalTxHash, proposalBlockNumber)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#8B5CF6] hover:underline truncate"
                    >
                      {proposalTxHash}
                    </a>
                    {proposalBlockNumber !== null && (
                      <span className="text-white/40">Included in block #{proposalBlockNumber}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </GlassCard>

          {/* Proof Generator Terminal */}
          <ProofGeneratorTerminal key={`${chainId || "no-chain"}:${account || "no-account"}`} />
        </div>

        {/* ── Center Column: Execution Engine (50%) ── */}
        <div className="lg:col-span-2 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          <ExecutionEngine />
          <VotingBooth />
        </div>

        {/* ── Right Column: Blockchain Activity (25%) ── */}
        <div className="flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          {/* Transaction Feed */}
          <GlassCard className="flex-1 flex flex-col">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-[#FB923C]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Blockchain Activity
            </h3>
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-1">
              {transactions.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-white/30 text-sm text-center py-8">
                  <div>
                    <p className="mb-1">No activity yet</p>
                    <p className="text-xs text-white/20">Transactions will appear here as you interact with contracts</p>
                  </div>
                </div>
              ) : (
                transactions.map((tx) => (
                  <TransactionCard
                    key={tx.id}
                    actionType={tx.actionType}
                    timestamp={tx.timestamp}
                    txHash={tx.txHash}
                    blockNumber={tx.blockNumber}
                  />
                ))
              )}
            </div>
          </GlassCard>

          {/* Technical Specs */}
          <GlassCard className="shrink-0">
            <h3 className="font-bold text-lg mb-4 pb-2 border-b border-white/10">Technical Specs</h3>
            <div className="space-y-3 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-white/40">VM</span>
                <span className="text-[#F472B6] font-bold">PolkaVM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Curve</span>
                <span className="text-[#8B5CF6]">BN254</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Protocol</span>
                <span className="text-[#10B981]">Groth16</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Languages</span>
                <span className="text-white/90">Rust + Solidity</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Target</span>
                <span className="text-white/90">riscv64-polkavm</span>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
