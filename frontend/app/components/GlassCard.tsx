import React from "react";
import { cn } from "../utils";

export function GlassCard({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.36)] p-6",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
