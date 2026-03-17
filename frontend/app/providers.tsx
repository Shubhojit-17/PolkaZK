"use client";

import { useEffect } from "react";
import { BlockchainProvider } from "./context/blockchain";
import { Navigation } from "./components/Navigation";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = "polkazk-css-recovery-done";

    const ensureStylesLoaded = () => {
      const bg = window.getComputedStyle(document.body).backgroundColor;
      const styled = bg === "rgb(10, 10, 11)";
      if (styled) {
        sessionStorage.removeItem(key);
        return;
      }

      // During Next dev recompiles, CSS can briefly 404. Reload once to recover.
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
      }
    };

    const timer = window.setTimeout(ensureStylesLoaded, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <BlockchainProvider>
      <div className="min-h-screen bg-[#0A0A0B] text-white font-sans">
        <Navigation />
        <main>{children}</main>
      </div>
    </BlockchainProvider>
  );
}
