import React from "react";
import { cn } from "../utils";

export interface StatusBadgeProps {
  status: "pending" | "confirmed" | "validating" | "valid" | "invalid" | "idle";
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const colors: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    validating: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    confirmed: "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20",
    valid: "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20",
    invalid: "bg-red-500/10 text-red-400 border-red-500/20",
    idle: "bg-white/10 text-white/70 border-white/20",
  };

  const labels: Record<string, string> = {
    pending: "Transaction Pending",
    confirmed: "Transaction Confirmed",
    validating: "Verifying...",
    valid: "Proof Validated",
    invalid: "Invalid",
    idle: "Idle",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border backdrop-blur-sm",
        colors[status],
        className
      )}
    >
      {(status === "pending" || status === "validating") && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {(status === "confirmed" || status === "valid") && (
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
      )}
      {labels[status]}
    </div>
  );
}
