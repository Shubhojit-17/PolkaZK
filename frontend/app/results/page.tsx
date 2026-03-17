"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { useBlockchain } from "../context/blockchain";
import { GlassCard } from "../components/GlassCard";
import { Button } from "../components/Button";
import { getExplorerActivityUrl } from "../lib/explorer";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = ["#10B981", "#EF4444"];

export default function ResultsPage() {
  const { proposals, loadProposals, provider, transactions } = useBlockchain();

  const activeProposals = proposals.filter((p) => p.isActive);
  const closedProposals = proposals.filter((p) => !p.isActive);

  const getRemainingText = (deadline: bigint) => {
    const remaining = Number(deadline) - Math.floor(Date.now() / 1000);
    if (remaining <= 0) return "ending now";
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    return `${hours}h ${minutes}m left`;
  };

  useEffect(() => {
    if (provider) loadProposals();
  }, [provider, loadProposals]);

  if (proposals.length === 0) {
    return (
      <div className="pt-32 pb-12 px-6 min-h-screen flex items-center justify-center">
        <GlassCard className="p-12 text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4">No Proposals Yet</h2>
          <p className="text-white/60">No proposals found on-chain yet.</p>
        </GlassCard>
      </div>
    );
  }

  if (closedProposals.length === 0) {
    return (
      <div className="pt-28 pb-12 px-6 min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-5xl mx-auto space-y-6"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold mb-2 tracking-tight">Vote Results</h1>
              <p className="text-white/50 text-sm font-mono">Results are shown after proposal expiry (48h).</p>
            </div>
            <Button variant="secondary" size="sm" onClick={loadProposals}>
              Refresh Results
            </Button>
          </div>

          <GlassCard className="p-8">
            <h2 className="text-2xl font-bold mb-2">All proposals are still active</h2>
            <p className="text-white/60 mb-6">Voting is open. Final results will appear here once proposals close.</p>
            <div className="space-y-3">
              {activeProposals.map((proposal) => (
                <div key={proposal.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">#{proposal.id} {proposal.description}</p>
                    <span className="text-xs font-mono text-[#10B981]">{getRemainingText(proposal.deadline)}</span>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="pt-28 pb-12 px-6 min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto space-y-8"
      >
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20 text-xs font-mono mb-4">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Verified via ZK Proof on PolkaVM
            </div>
            <h1 className="text-4xl font-bold mb-2 tracking-tight">Vote Results</h1>
            <p className="text-white/50 text-sm font-mono">
              {closedProposals.length} closed proposal{closedProposals.length > 1 ? "s" : ""} with final results
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={loadProposals}>
            Refresh Results
          </Button>
        </div>

        {activeProposals.length > 0 && (
          <GlassCard className="p-4 border-[#10B981]/20 bg-[#10B981]/5">
            <p className="text-sm text-[#10B981] font-mono">
              {activeProposals.length} active proposal{activeProposals.length > 1 ? "s" : ""} still in voting window.
              Results for those will appear here after 48 hours.
            </p>
          </GlassCard>
        )}

        {/* Proposals */}
        {closedProposals.map((proposal) => {
          const yesVotes = Number(proposal.yesVotes);
          const noVotes = Number(proposal.noVotes);
          const totalVotes = yesVotes + noVotes;
          const yesPercentage = totalVotes > 0 ? ((yesVotes / totalVotes) * 100).toFixed(1) : "0.0";
          const noPercentage = totalVotes > 0 ? ((noVotes / totalVotes) * 100).toFixed(1) : "0.0";

          const chartData = [
            { name: "YES", value: yesVotes },
            { name: "NO", value: noVotes },
          ];

          const barData = [
            { name: "YES", value: yesVotes, color: "#10B981" },
            { name: "NO", value: noVotes, color: "#EF4444" },
          ];

          return (
            <div key={proposal.id} className="space-y-6">
              {/* Summary Card */}
              <GlassCard className="p-8 flex flex-col md:flex-row gap-8 items-center justify-between border-[#8B5CF6]/20">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-mono text-[#8B5CF6] bg-[#8B5CF6]/10 px-2 py-1 rounded">
                      #{proposal.id}
                    </span>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        proposal.isActive
                          ? "bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20"
                          : "bg-white/10 text-white/50 border border-white/10"
                      }`}
                    >
                      {proposal.isActive ? "Active" : "Closed"}
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold mb-4">{proposal.description}</h2>
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                      <span className="text-xs font-mono text-white/50 mb-1">Total Votes</span>
                      <span className="text-2xl font-bold font-mono">{totalVotes}</span>
                    </div>
                    {totalVotes > 0 && (
                      <>
                        <div className="h-10 w-px bg-white/10" />
                        <div className="flex flex-col">
                          <span className="text-xs font-mono text-white/50 mb-1">Leading</span>
                          <span className={`text-lg font-bold ${yesVotes >= noVotes ? "text-[#10B981]" : "text-red-400"}`}>
                            {yesVotes >= noVotes ? "YES" : "NO"} ({yesVotes >= noVotes ? yesPercentage : noPercentage}%)
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Mini Pie Chart */}
                {totalVotes > 0 && (
                  <div className="w-40 h-40 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
                          paddingAngle={5}
                          dataKey="value"
                          stroke="none"
                        >
                          {chartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0A0A0B",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "8px",
                          }}
                          itemStyle={{ color: "#fff", fontFamily: "Inter Tight" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl font-bold text-[#10B981]">{yesPercentage}%</span>
                      <span className="text-[10px] text-white/40 uppercase tracking-widest">Yes</span>
                    </div>
                  </div>
                )}
              </GlassCard>

              {/* Details */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Bar Chart */}
                <GlassCard className="lg:col-span-2 p-8 flex flex-col">
                  <h3 className="font-bold text-lg mb-6">Vote Distribution</h3>
                  {totalVotes > 0 ? (
                    <div className="flex-1 min-h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                          <XAxis
                            dataKey="name"
                            stroke="rgba(255,255,255,0.3)"
                            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "bold" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            stroke="rgba(255,255,255,0.3)"
                            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            cursor={{ fill: "rgba(255,255,255,0.05)" }}
                            contentStyle={{
                              backgroundColor: "#0A0A0B",
                              borderColor: "rgba(255,255,255,0.1)",
                              borderRadius: "12px",
                            }}
                          />
                          <Bar dataKey="value" radius={[8, 8, 8, 8]} barSize={60}>
                            {barData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
                      No votes cast yet
                    </div>
                  )}
                </GlassCard>

                {/* Vote Breakdown + Activity */}
                <div className="flex flex-col gap-6">
                  {/* YES Card */}
                  <GlassCard className="relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#10B981]/5 to-transparent z-0" />
                    <div className="relative z-10">
                      <div className="text-sm text-white/50 mb-1 uppercase tracking-wider font-bold">YES Votes</div>
                      <div className="text-3xl font-bold font-mono text-[#10B981] mb-2">
                        {yesVotes}
                      </div>
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#10B981] transition-all duration-1000"
                          style={{ width: `${yesPercentage}%` }}
                        />
                      </div>
                    </div>
                  </GlassCard>

                  {/* NO Card */}
                  <GlassCard className="relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent z-0" />
                    <div className="relative z-10">
                      <div className="text-sm text-white/50 mb-1 uppercase tracking-wider font-bold">NO Votes</div>
                      <div className="text-3xl font-bold font-mono text-red-400 mb-2">
                        {noVotes}
                      </div>
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-500 transition-all duration-1000"
                          style={{ width: `${noPercentage}%` }}
                        />
                      </div>
                    </div>
                  </GlassCard>

                  {/* Recent Transactions */}
                  <GlassCard className="flex-1">
                    <h3 className="font-bold mb-3 flex items-center gap-2 text-sm">
                      <svg className="w-4 h-4 text-[#FB923C]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Recent Activity
                    </h3>
                    <div className="space-y-3 text-xs font-mono">
                      {transactions.length === 0 ? (
                        <p className="text-white/30">No activity yet</p>
                      ) : (
                        transactions.slice(0, 3).map((tx) => (
                          <div key={tx.id} className="flex flex-col gap-1 pb-2 border-b border-white/5">
                            <span className="text-[#10B981]">{tx.actionType}</span>
                            <a
                              href={getExplorerActivityUrl(tx.txHash, tx.blockNumber)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-white/40 hover:text-white/60 flex items-center gap-1"
                            >
                              {tx.txHash.slice(0, 12)}...
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          </div>
                        ))
                      )}
                    </div>
                  </GlassCard>
                </div>
              </div>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
