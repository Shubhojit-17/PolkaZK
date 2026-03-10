import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PolkaZK — Private Voting on Polkadot",
  description: "ZK-Proof private voting using Groth16 verification on PolkaVM",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
