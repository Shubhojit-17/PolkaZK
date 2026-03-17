import React from "react";
import { getExplorerActivityUrl } from "../lib/explorer";

interface TransactionCardProps {
  actionType: string;
  timestamp: Date;
  txHash: string;
  blockNumber?: number;
}

export function TransactionCard({ actionType, timestamp, txHash, blockNumber }: TransactionCardProps) {
  const explorerUrl = getExplorerActivityUrl(txHash, blockNumber);
  const timeStr = timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const shortHash = txHash.length > 12
    ? `${txHash.slice(0, 8)}...${txHash.slice(-6)}`
    : txHash;

  return (
    <div className="relative group p-4 bg-white/[0.02] border border-white/10 rounded-xl border-l-4 border-l-[#F472B6]/50 hover:border-l-[#F472B6] transition-all duration-300">
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-start mb-1">
          <span className="text-white/90 font-medium text-sm">{actionType}</span>
          <span className="text-white/40 text-xs font-mono">{timeStr}</span>
        </div>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-white/60 bg-white/5 rounded-md px-2 py-1.5 text-xs font-mono hover:bg-white/10 transition-colors"
        >
          <span className="text-[#FB923C]">#</span>
          <span className="truncate">{shortHash}</span>
          <svg className="w-3 h-3 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  );
}
