"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../utils";
import { useBlockchain } from "../context/blockchain";

const navItems = [
  { label: "Home", path: "/" },
  { label: "Dashboard", path: "/dashboard" },
  { label: "Proposal", path: "/proposal" },
  { label: "Verify", path: "/verify" },
  { label: "Results", path: "/results" },
];

const FAUCET_URL = "https://faucet.polkadot.io/westend?parachain=1000";

export function Navigation() {
  const pathname = usePathname();
  const { account, connectWallet, disconnectWallet, loading, chainId } = useBlockchain();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 bg-[#0A0A0B]/80 backdrop-blur-md border-b border-white/10 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-2 group">
        <div className="p-1.5 bg-gradient-to-tr from-[#8B5CF6] to-[#F472B6] rounded-lg">
          <svg className="w-5 h-5 text-white fill-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>
        <span className="font-bold text-lg tracking-tight group-hover:text-white/80 transition-colors">
          PolkaZK
        </span>
      </Link>

      <div className="hidden md:flex items-center gap-6">
        {navItems.map((item) => {
          const isActive =
            item.path === "/"
              ? pathname === "/"
              : pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "text-sm font-medium transition-colors relative pb-1",
                isActive ? "text-white" : "text-white/50 hover:text-white/80"
              )}
            >
              {item.label}
              {isActive && (
                <span className="absolute -bottom-[5px] left-0 right-0 h-[2px] bg-gradient-to-r from-[#F472B6] to-[#FB923C]" />
              )}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        {/* Faucet link */}
        <a
          href={FAUCET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden lg:flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-full bg-[#FB923C]/10 border border-[#FB923C]/20 text-[#FB923C] hover:bg-[#FB923C]/20 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Get WND
        </a>

        <div className="hidden lg:flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
          <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
          Polkadot Hub
        </div>

        {account ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-[#10B981]" />
              {account.slice(0, 6)}...{account.slice(-4)}
            </div>
            <button
              onClick={disconnectWallet}
              className="p-1.5 rounded-full bg-white/5 border border-white/10 text-white/40 hover:text-red-400 hover:border-red-400/30 transition-colors"
              title="Disconnect wallet"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={connectWallet}
            disabled={loading}
            className="px-4 py-2 bg-gradient-to-r from-[#F472B6] to-[#FB923C] hover:shadow-[#F472B6]/40 rounded-xl text-white text-sm font-medium transition-all shadow-lg shadow-[#F472B6]/25 disabled:opacity-50"
          >
            Connect Wallet
          </button>
        )}
      </div>
    </nav>
  );
}
