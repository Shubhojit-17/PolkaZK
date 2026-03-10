"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  CHAIN_CONFIG,
  CONTRACTS,
  RUST_VERIFIER_ABI,
  PRIVATE_VOTING_ABI,
} from "./contracts";

// ─── Types ────────────────────────────────────────────────────

interface Proposal {
  id: number;
  description: string;
  yesVotes: bigint;
  noVotes: bigint;
  deadline: bigint;
  isActive: boolean;
}

type TabType = "verify" | "vote" | "results";

// ─── Demo Proof Data ──────────────────────────────────────────
// Pre-generated proof for the multiply circuit (3 * 7 = 21)
// In production, this would be generated client-side or via an API

const DEMO_PROOF_HEX = ""; // filled from calldata.json at runtime
const DEMO_INPUTS_HEX = "";

// ─── Pallet-Revive Gas Overrides ──────────────────────────
// eth_estimateGas and eth_call are broken on the current Westend Asset Hub
// eth-rpc adapter, so we must provide explicit gas parameters.
const TX_OVERRIDES = {
  gasLimit: BigInt("5000000000"),
  maxFeePerGas: BigInt("100000000"),
  maxPriorityFeePerGas: BigInt("0"),
};

// ─── Main Component ───────────────────────────────────────────

export default function Home() {
  // Wallet state
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [account, setAccount] = useState<string>("");
  const [chainId, setChainId] = useState<string>("");

  // UI state
  const [activeTab, setActiveTab] = useState<TabType>("verify");
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Verification state
  const [proofHex, setProofHex] = useState(DEMO_PROOF_HEX);
  const [inputsHex, setInputsHex] = useState(DEMO_INPUTS_HEX);
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null);

  // Voting state
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<number>(0);
  const [voteChoice, setVoteChoice] = useState<boolean>(true);

  // ─── Wallet Connection ──────────────────────────────────────

  const connectWallet = useCallback(async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      setStatus("Please install MetaMask");
      return;
    }

    try {
      setLoading(true);
      const ethereum = (window as any).ethereum;
      const prov = new ethers.BrowserProvider(ethereum);

      await ethereum.request({ method: "eth_requestAccounts" });

      const sig = await prov.getSigner();
      const addr = await sig.getAddress();
      const network = await prov.getNetwork();

      setProvider(prov);
      setSigner(sig);
      setAccount(addr);
      setChainId("0x" + network.chainId.toString(16));
      setStatus(`Connected: ${addr.slice(0, 6)}...${addr.slice(-4)}`);
    } catch (err: any) {
      setStatus(`Connection failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const switchToAssetHub = async () => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_CONFIG.chainId }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CHAIN_CONFIG.chainId,
              chainName: CHAIN_CONFIG.chainName,
              rpcUrls: [CHAIN_CONFIG.rpcUrl],
              blockExplorerUrls: [CHAIN_CONFIG.blockExplorer],
              nativeCurrency: CHAIN_CONFIG.nativeCurrency,
            },
          ],
        });
      }
    }
  };

  // ─── Contract Interactions ──────────────────────────────────

  const verifyProof = async () => {
    if (!signer || !CONTRACTS.rustVerifier) {
      setStatus("Connect wallet and ensure contracts are deployed");
      return;
    }

    try {
      setLoading(true);
      setStatus("Submitting proof to Rust verifier...");

      const verifier = new ethers.Contract(
        CONTRACTS.rustVerifier,
        RUST_VERIFIER_ABI,
        signer
      );

      const result = await verifier.verify(proofHex, inputsHex, TX_OVERRIDES);
      const receipt = await result.wait();
      const success = receipt.status === 1;
      setVerifyResult(success);
      setStatus(success ? "Proof verified successfully!" : "Proof verification failed");
    } catch (err: any) {
      setStatus(`Verification error: ${err.message}`);
      setVerifyResult(false);
    } finally {
      setLoading(false);
    }
  };

  const loadProposals = useCallback(async () => {
    if (!provider || !CONTRACTS.privateVoting) return;

    try {
      const voting = new ethers.Contract(
        CONTRACTS.privateVoting,
        PRIVATE_VOTING_ABI,
        provider
      );

      const count = await voting.proposalCount();
      const props: Proposal[] = [];

      for (let i = 0; i < Number(count); i++) {
        try {
          const [desc, yes, no, deadline, active] = await voting.getProposal(i);
          props.push({
            id: i,
            description: desc,
            yesVotes: yes,
            noVotes: no,
            deadline,
            isActive: active,
          });
        } catch {
          // eth_call may fail on pallet-revive — show placeholder
          props.push({
            id: i,
            description: `Proposal #${i} (state read unavailable)`,
            yesVotes: BigInt(0),
            noVotes: BigInt(0),
            deadline: BigInt(0),
            isActive: true,
          });
        }
      }

      setProposals(props);
    } catch (err: any) {
      console.error("Failed to load proposals:", err);
    }
  }, [provider]);

  const castVote = async () => {
    if (!signer || !CONTRACTS.privateVoting) {
      setStatus("Connect wallet and ensure contracts are deployed");
      return;
    }

    try {
      setLoading(true);
      setStatus("Casting vote with ZK proof...");

      const voting = new ethers.Contract(
        CONTRACTS.privateVoting,
        PRIVATE_VOTING_ABI,
        signer
      );

      const nullifier = ethers.keccak256(
        ethers.toUtf8Bytes(`vote-${selectedProposal}-${account}`)
      );

      const tx = await voting.castVote(
        selectedProposal,
        voteChoice,
        proofHex,
        inputsHex,
        nullifier,
        TX_OVERRIDES
      );

      setStatus("Transaction submitted, waiting for confirmation...");
      await tx.wait();

      setStatus("Vote cast successfully!");
      await loadProposals();
    } catch (err: any) {
      setStatus(`Voting error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Load proposals on mount
  useEffect(() => {
    if (provider) loadProposals();
  }, [provider, loadProposals]);

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-700 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#e6007a] flex items-center justify-center text-white font-bold text-lg">
              Z
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">PolkaZK</h1>
              <p className="text-xs text-gray-400">
                Private Voting on Polkadot Hub
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {account ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">
                  {account.slice(0, 6)}...{account.slice(-4)}
                </span>
                <div className="w-2 h-2 rounded-full bg-green-400" />
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={loading}
                className="px-4 py-2 bg-[#e6007a] hover:bg-[#c20067] rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        {/* Status bar */}
        {status && (
          <div className="mb-6 px-4 py-3 bg-[#16213e] border border-gray-600 rounded-lg text-sm">
            {status}
          </div>
        )}

        {/* Chain warning */}
        {account && chainId !== CHAIN_CONFIG.chainId && (
          <div className="mb-6 px-4 py-3 bg-yellow-900/30 border border-yellow-600 rounded-lg text-sm text-yellow-300">
            Wrong network. Please switch to Westend Asset Hub.
            <button
              onClick={switchToAssetHub}
              className="ml-3 underline hover:text-yellow-100"
            >
              Switch Network
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-8 bg-[#0f3460] rounded-lg p-1">
          {(["verify", "vote", "results"] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
                activeTab === tab
                  ? "bg-[#e6007a] text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab === "verify"
                ? "Submit Proof"
                : tab === "vote"
                ? "Cast Vote"
                : "View Results"}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {/* ─── Verify Tab ─ */}
          {activeTab === "verify" && (
            <div className="bg-[#16213e] rounded-xl p-6 border border-gray-700">
              <h2 className="text-lg font-semibold text-white mb-4">
                Submit ZK Proof for Verification
              </h2>
              <p className="text-sm text-gray-400 mb-6">
                Paste your Groth16 proof and public inputs (hex-encoded). The
                proof is verified on-chain by the Rust ZK verifier running on
                PolkaVM.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">
                    Proof Bytes (hex)
                  </label>
                  <textarea
                    value={proofHex}
                    onChange={(e) => setProofHex(e.target.value)}
                    placeholder="0x..."
                    className="w-full h-24 px-3 py-2 bg-[#0f3460] border border-gray-600 rounded-lg text-sm text-gray-200 font-mono focus:border-[#e6007a] focus:outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-1">
                    Public Inputs (hex)
                  </label>
                  <textarea
                    value={inputsHex}
                    onChange={(e) => setInputsHex(e.target.value)}
                    placeholder="0x..."
                    className="w-full h-16 px-3 py-2 bg-[#0f3460] border border-gray-600 rounded-lg text-sm text-gray-200 font-mono focus:border-[#e6007a] focus:outline-none resize-none"
                  />
                </div>

                <button
                  onClick={verifyProof}
                  disabled={loading || !account}
                  className="w-full py-3 bg-[#e6007a] hover:bg-[#c20067] rounded-lg text-white font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? "Verifying..." : "Verify Proof On-Chain"}
                </button>

                {verifyResult !== null && (
                  <div
                    className={`p-4 rounded-lg text-center font-medium ${
                      verifyResult
                        ? "bg-green-900/30 border border-green-600 text-green-300"
                        : "bg-red-900/30 border border-red-600 text-red-300"
                    }`}
                  >
                    {verifyResult
                      ? "Proof Valid — Verification Passed"
                      : "Proof Invalid — Verification Failed"}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Vote Tab ─ */}
          {activeTab === "vote" && (
            <div className="bg-[#16213e] rounded-xl p-6 border border-gray-700">
              <h2 className="text-lg font-semibold text-white mb-4">
                Cast Your Private Vote
              </h2>
              <p className="text-sm text-gray-400 mb-6">
                Select a proposal and vote. Your identity is protected by the ZK
                proof — only proof validity is checked, not who submitted it.
              </p>

              {proposals.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No proposals found. Deploy contracts first.
                </p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">
                      Select Proposal
                    </label>
                    <select
                      value={selectedProposal}
                      onChange={(e) =>
                        setSelectedProposal(Number(e.target.value))
                      }
                      className="w-full px-3 py-2 bg-[#0f3460] border border-gray-600 rounded-lg text-sm text-gray-200 focus:border-[#e6007a] focus:outline-none"
                    >
                      {proposals.map((p) => (
                        <option key={p.id} value={p.id}>
                          #{p.id}: {p.description}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      Your Vote
                    </label>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setVoteChoice(true)}
                        className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                          voteChoice
                            ? "bg-green-600 text-white"
                            : "bg-[#0f3460] text-gray-400 hover:text-white"
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setVoteChoice(false)}
                        className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                          !voteChoice
                            ? "bg-red-600 text-white"
                            : "bg-[#0f3460] text-gray-400 hover:text-white"
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={castVote}
                    disabled={loading || !account}
                    className="w-full py-3 bg-[#e6007a] hover:bg-[#c20067] rounded-lg text-white font-medium transition-colors disabled:opacity-50"
                  >
                    {loading ? "Submitting..." : "Cast Vote with ZK Proof"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─── Results Tab ─ */}
          {activeTab === "results" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-white">
                  Proposal Results
                </h2>
                <button
                  onClick={loadProposals}
                  className="px-3 py-1 text-xs bg-[#0f3460] hover:bg-[#e6007a] rounded text-gray-300 hover:text-white transition-colors"
                >
                  Refresh
                </button>
              </div>

              {proposals.length === 0 ? (
                <div className="bg-[#16213e] rounded-xl p-8 border border-gray-700 text-center text-gray-500">
                  No proposals found. Deploy contracts first.
                </div>
              ) : (
                proposals.map((p) => {
                  const total = Number(p.yesVotes) + Number(p.noVotes);
                  const yesPercent = total > 0 ? (Number(p.yesVotes) / total) * 100 : 0;

                  return (
                    <div
                      key={p.id}
                      className="bg-[#16213e] rounded-xl p-6 border border-gray-700"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-medium text-white">
                            #{p.id}: {p.description}
                          </h3>
                          <p className="text-xs text-gray-400 mt-1">
                            {p.isActive ? "Voting is open" : "Voting has ended"}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 text-xs rounded ${
                            p.isActive
                              ? "bg-green-900/30 text-green-400"
                              : "bg-gray-700 text-gray-400"
                          }`}
                        >
                          {p.isActive ? "Active" : "Closed"}
                        </span>
                      </div>

                      {/* Vote bar */}
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>Yes: {p.yesVotes.toString()}</span>
                          <span>No: {p.noVotes.toString()}</span>
                        </div>
                        <div className="w-full h-3 bg-[#0f3460] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${yesPercent}%` }}
                          />
                        </div>
                      </div>

                      <p className="text-xs text-gray-500">
                        Total votes: {total}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Architecture Info */}
        <div className="mt-12 bg-[#16213e] rounded-xl p-6 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">
            Architecture
          </h3>
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400 flex-wrap">
            <span className="px-3 py-1 bg-[#0f3460] rounded">
              Circom Circuit
            </span>
            <span>&rarr;</span>
            <span className="px-3 py-1 bg-[#0f3460] rounded">
              snarkjs Proof
            </span>
            <span>&rarr;</span>
            <span className="px-3 py-1 bg-[#0f3460] rounded">
              Solidity Contract
            </span>
            <span>&rarr;</span>
            <span className="px-3 py-1 bg-[#e6007a]/20 border border-[#e6007a] rounded text-[#e6007a]">
              Rust ZK Verifier (PolkaVM)
            </span>
            <span>&rarr;</span>
            <span className="px-3 py-1 bg-green-900/30 border border-green-600 rounded text-green-400">
              Result
            </span>
          </div>
          <p className="text-xs text-gray-500 text-center mt-3">
            BN254 Groth16 proof verification runs in Rust on PolkaVM RISC-V,
            called cross-contract from Solidity on Polkadot Hub.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-700 px-6 py-4 text-center text-xs text-gray-500">
        PolkaZK — Polkadot Solidity Hackathon 2026 | Track 2: PVM Smart Contracts
      </footer>
    </div>
  );
}
