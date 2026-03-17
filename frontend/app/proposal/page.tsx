"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useBlockchain } from "../context/blockchain";
import { GlassCard } from "../components/GlassCard";
import { Button } from "../components/Button";

export default function ProposalPage() {
  const {
    castVote,
    loadProposals,
    proposals,
    loading,
    status,
    account,
    connectWallet,
    verificationState,
    provider,
  } = useBlockchain();

  const [votingId, setVotingId] = useState<number | null>(null);

  const canVote = !!account;

  useEffect(() => {
    if (provider) loadProposals();
  }, [provider, loadProposals]);

  const handleVote = async (id: number, vote: boolean) => {
    setVotingId(id);
    await castVote(id, vote);
    setVotingId(null);
  };

  const getRemainingText = (deadline: bigint) => {
    const remaining = Number(deadline) - Math.floor(Date.now() / 1000);
    if (remaining <= 0) return "Ended";
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    return `${hours}h ${minutes}m left`;
  };

  return (
    <div className="pt-28 pb-12 px-6 min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto"
      >
        {status && (
          <div className="mb-6 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white/70 font-mono">
            {status}
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2 tracking-tight">Proposals</h1>
            <p className="text-white/60">
              Browse all governance proposals and cast your vote with ZK privacy
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={loadProposals}>
              Refresh
            </Button>
          </div>
        </div>

        {/* ZK Info Banner */}
        {account && verificationState !== "valid" && (
          <div className="mb-6 px-4 py-3 bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 rounded-xl text-sm text-[#C4B5FD] flex items-center gap-3">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              Voting requires a verified ZK proof of eligibility. If missing, the app will auto-generate and verify one before submitting your vote.{" "}
              <a href="/dashboard" className="underline text-[#F472B6] hover:text-[#F472B6]/80">
                Go to Dashboard
              </a>{" "}
              to generate and verify manually.
            </span>
          </div>
        )}

        {/* Not connected */}
        {!account && (
          <GlassCard className="p-12 text-center">
            <h2 className="text-2xl font-bold mb-4">Connect Wallet</h2>
            <p className="text-white/60 mb-6">Connect your wallet to view proposals and vote.</p>
            <Button onClick={connectWallet}>Connect Wallet</Button>
          </GlassCard>
        )}

        {/* Proposals List */}
        {account && proposals.length === 0 && (
          <GlassCard className="p-12 text-center">
            <h2 className="text-2xl font-bold mb-4">No Proposals Yet</h2>
            <p className="text-white/60">No active governance proposals were found yet.</p>
          </GlassCard>
        )}

        {account && proposals.length > 0 && (
          <div className="space-y-4">
            {proposals.map((proposal) => {
              const yesVotes = Number(proposal.yesVotes);
              const noVotes = Number(proposal.noVotes);
              const total = yesVotes + noVotes;
              const yesPercent = total > 0 ? Math.round((yesVotes / total) * 100) : 0;
              const noPercent = total > 0 ? Math.round((noVotes / total) * 100) : 0;
              const isVoting = votingId === proposal.id;
              const alreadyVoted =
                !!proposal.userHasVoted || typeof proposal.userVote === "boolean";
              const selectedYes = alreadyVoted && proposal.userVote === true;
              const selectedNo = alreadyVoted && proposal.userVote === false;

              return (
                <motion.div
                  key={proposal.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: proposal.id * 0.05 }}
                >
                  <GlassCard className="p-6">
                    <div className="flex flex-col lg:flex-row gap-6">
                      {/* Proposal Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xs font-mono text-[#8B5CF6] bg-[#8B5CF6]/10 px-2 py-0.5 rounded">
                            #{proposal.id}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full ${
                              proposal.isActive
                                ? "bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20"
                                : "bg-white/10 text-white/50 border border-white/10"
                            }`}
                          >
                            {proposal.isActive ? "Active" : "Closed"}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold mb-3 break-words">{proposal.description}</h3>

                        {/* Vote Bar */}
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xs text-[#10B981] font-mono w-16">YES {yesVotes}</span>
                          <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden flex">
                            {total > 0 && (
                              <>
                                <div
                                  className="h-full bg-[#10B981] transition-all duration-500"
                                  style={{ width: `${yesPercent}%` }}
                                />
                                <div
                                  className="h-full bg-red-500 transition-all duration-500"
                                  style={{ width: `${noPercent}%` }}
                                />
                              </>
                            )}
                          </div>
                          <span className="text-xs text-red-400 font-mono w-16 text-right">NO {noVotes}</span>
                        </div>
                        <p className="text-xs text-white/40 font-mono">
                          {total} total vote{total !== 1 ? "s" : ""}
                          {total > 0 && ` · ${yesPercent}% YES / ${noPercent}% NO`}
                        </p>
                        <p className={`text-xs font-mono mt-1 ${proposal.isActive ? "text-[#10B981]" : "text-white/40"}`}>
                          {proposal.isActive
                            ? `Status: Active (${getRemainingText(proposal.deadline)})`
                            : "Status: Closed"}
                        </p>
                        {alreadyVoted && (
                          <p className="text-xs text-[#10B981] font-mono mt-1">
                            You already voted on this proposal. Your vote: {selectedYes ? "YES" : "NO"}.
                          </p>
                        )}
                      </div>

                      {/* Vote Actions */}
                      {proposal.isActive && (
                        <div className="flex lg:flex-col gap-3 shrink-0 lg:w-40">
                          <button
                            onClick={() => handleVote(proposal.id, true)}
                            disabled={!canVote || loading || isVoting || alreadyVoted}
                            className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition-all ${
                              selectedYes
                                ? "border-[#10B981] bg-[#10B981]/25 text-[#10B981] shadow-[0_0_0_1px_rgba(16,185,129,0.5)]"
                                : canVote && !alreadyVoted
                                ? "border-[#10B981]/40 bg-[#10B981]/10 hover:bg-[#10B981]/20 text-[#10B981] cursor-pointer"
                                : "border-white/10 bg-white/[0.02] text-white/30 cursor-not-allowed"
                            }`}
                          >
                            <span className="text-base leading-none">Y</span>
                            <span>{isVoting ? "Submitting" : "Vote YES"}</span>
                          </button>
                          <button
                            onClick={() => handleVote(proposal.id, false)}
                            disabled={!canVote || loading || isVoting || alreadyVoted}
                            className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition-all ${
                              selectedNo
                                ? "border-red-500 bg-red-500/25 text-red-400 shadow-[0_0_0_1px_rgba(239,68,68,0.5)]"
                                : canVote && !alreadyVoted
                                ? "border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer"
                                : "border-white/10 bg-white/[0.02] text-white/30 cursor-not-allowed"
                            }`}
                          >
                            <span className="text-base leading-none">N</span>
                            <span>{isVoting ? "Submitting" : "Vote NO"}</span>
                          </button>
                          {!canVote && !alreadyVoted && (
                            <p className="text-[11px] text-white/40 text-center lg:text-left">
                              Verify your proof to enable voting
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
