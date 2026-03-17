import React from "react";
import { cn } from "../utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "success";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0A0A0B] disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
          {
            "bg-gradient-to-r from-[#F472B6] to-[#FB923C] text-white shadow-lg shadow-[#F472B6]/25 hover:shadow-[#F472B6]/40 focus:ring-[#F472B6]":
              variant === "primary",
            "bg-white/10 text-white hover:bg-white/20 focus:ring-white/50 border border-white/5 backdrop-blur-md":
              variant === "secondary",
            "bg-transparent border border-white/20 text-white hover:bg-white/5 focus:ring-white/50":
              variant === "outline",
            "bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30 focus:ring-red-500":
              variant === "danger",
            "bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/50 hover:bg-[#10B981]/30 focus:ring-[#10B981]":
              variant === "success",
          },
          {
            "px-4 py-2 text-sm": size === "sm",
            "px-6 py-3 text-base": size === "md",
            "px-8 py-4 text-lg": size === "lg",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
