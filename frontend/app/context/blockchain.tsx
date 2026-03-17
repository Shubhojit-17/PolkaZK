"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { ethers } from "ethers";
import {
  CHAIN_CONFIG,
  CONTRACTS,
  RUST_VERIFIER_ABI,
  PRIVATE_VOTING_ABI,
} from "../contracts";
import {
  serializeProofToHex,
  serializeVKToHex,
  serializePublicInputsToHex,
} from "../lib/proof-utils";

// ─── Types ────────────────────────────────────────────────────

export interface Proposal {
  id: number;
  description: string;
  yesVotes: bigint;
  noVotes: bigint;
  deadline: bigint;
  isActive: boolean;
  userHasVoted?: boolean;
  userVote?: boolean | null;
}

export interface TransactionEntry {
  id: string;
  actionType: string;
  timestamp: Date;
  txHash: string;
  blockNumber?: number;
}

// ─── localStorage persistence ─────────────────────────────────

const STORAGE_KEY_SESSION = "polkazk-proof-session";
const STORAGE_KEY_PROPOSALS_PREFIX = "polkazk-proposals";
const STORAGE_KEY_VOTES_PREFIX = "polkazk-votes";

interface ProofSession {
  proofHex: string;
  vkHex: string;
  inputsHex: string;
  publicSignals: string[];
  verifyTxHash: string;
  vkStoreTxHash: string;
  account: string;
  timestamp: number;
}

interface PersistedProposal {
  id: number;
  description: string;
  yesVotes: string;
  noVotes: string;
  deadline: string;
  isActive: boolean;
}

function saveProofSession(session: ProofSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
}

function loadProofSession(): ProofSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY_SESSION);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getProposalsStorageKey(chainId: string): string {
  return `${STORAGE_KEY_PROPOSALS_PREFIX}:${chainId.toLowerCase()}`;
}

function getVotesStorageKey(chainId: string, account: string): string {
  return `${STORAGE_KEY_VOTES_PREFIX}:${chainId.toLowerCase()}:${account.toLowerCase()}`;
}

function saveProposalsCache(chainId: string, proposals: Proposal[]) {
  if (typeof window === "undefined" || !chainId) return;
  const payload: PersistedProposal[] = proposals.map((proposal) => ({
    id: proposal.id,
    description: proposal.description,
    yesVotes: proposal.yesVotes.toString(),
    noVotes: proposal.noVotes.toString(),
    deadline: proposal.deadline.toString(),
    isActive: proposal.isActive,
  }));
  localStorage.setItem(getProposalsStorageKey(chainId), JSON.stringify(payload));
}

function loadProposalsCache(chainId: string): Proposal[] {
  if (typeof window === "undefined" || !chainId) return [];
  const raw = localStorage.getItem(getProposalsStorageKey(chainId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PersistedProposal[];
    return parsed
      .map((proposal) => ({
        id: Number(proposal.id),
        description: String(proposal.description),
        yesVotes: BigInt(proposal.yesVotes),
        noVotes: BigInt(proposal.noVotes),
        deadline: BigInt(proposal.deadline),
        isActive: Boolean(proposal.isActive),
        userHasVoted: false,
        userVote: null,
      }))
      .sort((a, b) => a.id - b.id);
  } catch {
    return [];
  }
}

function loadLocalVotes(chainId: string, account: string): Record<number, boolean> {
  if (typeof window === "undefined" || !chainId || !account) return {};
  const raw = localStorage.getItem(getVotesStorageKey(chainId, account));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    const normalized: Record<number, boolean> = {};
    for (const [proposalId, value] of Object.entries(parsed)) {
      normalized[Number(proposalId)] = Boolean(value);
    }
    return normalized;
  } catch {
    return {};
  }
}

function saveLocalVote(chainId: string, account: string, proposalId: number, vote: boolean) {
  if (typeof window === "undefined" || !chainId || !account) return;
  const current = loadLocalVotes(chainId, account);
  current[proposalId] = vote;
  localStorage.setItem(getVotesStorageKey(chainId, account), JSON.stringify(current));
}

function mergeProposals(remote: Proposal[], cached: Proposal[]): Proposal[] {
  const merged = new Map<number, Proposal>();

  for (const cachedProposal of cached) {
    merged.set(cachedProposal.id, { ...cachedProposal });
  }

  for (const remoteProposal of remote) {
    const existing = merged.get(remoteProposal.id);
    merged.set(remoteProposal.id, {
      ...remoteProposal,
      description:
        remoteProposal.description.startsWith("Proposal #") && existing?.description
          ? existing.description
          : remoteProposal.description,
      deadline: remoteProposal.deadline === BigInt(0) && existing ? existing.deadline : remoteProposal.deadline,
      isActive:
        remoteProposal.deadline > BigInt(0)
          ? remoteProposal.deadline > BigInt(Math.floor(Date.now() / 1000))
          : remoteProposal.isActive,
      userHasVoted: Boolean(remoteProposal.userHasVoted || existing?.userHasVoted),
      userVote:
        typeof remoteProposal.userVote === "boolean"
          ? remoteProposal.userVote
          : typeof existing?.userVote === "boolean"
            ? existing.userVote
            : null,
    });
  }

  return Array.from(merged.values()).sort((a, b) => a.id - b.id);
}

function applyLocalVoteState(
  proposals: Proposal[],
  chainId: string,
  account: string
): Proposal[] {
  const localVotes = loadLocalVotes(chainId, account);
  return proposals.map((proposal) => ({
    ...proposal,
    userHasVoted: Boolean(proposal.userHasVoted || localVotes[proposal.id]),
    userVote:
      typeof localVotes[proposal.id] === "boolean"
        ? localVotes[proposal.id]
        : typeof proposal.userVote === "boolean"
          ? proposal.userVote
          : null,
  }));
}

// Pallet-revive explicit gas params (eth_estimateGas is broken)
const TX_OVERRIDES = {
  gasLimit: BigInt("5000000000"),
  maxFeePerGas: BigInt("100000000"),
  maxPriorityFeePerGas: BigInt("0"),
};

const EVENT_LOOKBACK_BLOCKS = 150000;
const TX_SCAN_LOOKBACK_BLOCKS = 5000;
const ACTIVITY_LOOKBACK_BLOCKS = 800;

function getReadableError(err: any): string {
  const message =
    err?.shortMessage ||
    err?.reason ||
    err?.info?.error?.message ||
    err?.data?.message ||
    err?.message ||
    "Unknown error";
  return String(message).replace(/^execution reverted:?\s*/i, "Reverted: ");
}

function isMetadataCallError(err: any): boolean {
  const msg = String(err?.info?.error?.message || err?.message || "");
  return msg.toLowerCase().includes("metadata error");
}

// ─── Context ──────────────────────────────────────────────────

interface BlockchainContextType {
  // Wallet
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  account: string;
  chainId: string;

  // UI state
  loading: boolean;
  status: string;

  // Proposals
  proposals: Proposal[];

  // Proof state
  proofHex: string;
  inputsHex: string;
  proofGenerated: boolean;
  verificationState: "idle" | "verifying" | "valid" | "invalid";
  lastVerifyTxHash: string;
  lastVerifyBlockNumber: number | null;

  // VK state
  vkHex: string;
  vkStored: boolean;

  // Transaction feed
  transactions: TransactionEntry[];

  // Actions
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  switchToAssetHub: () => Promise<void>;
  generateProof: (a: string, b: string, c: string) => Promise<boolean>;
  storeVerificationKey: () => Promise<boolean>;
  verifyProof: () => Promise<boolean>;
  loadProposals: () => Promise<void>;
  castVote: (proposalId: number, vote: boolean) => Promise<boolean>;
  createProposal: (
    description: string,
    durationSeconds: number
  ) => Promise<{ txHash: string; proposalId: number; blockNumber: number } | null>;
  setStatus: (s: string) => void;
}

const BlockchainContext = createContext<BlockchainContextType | null>(null);

// ─── Provider ─────────────────────────────────────────────────

export function BlockchainProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const [proposals, setProposals] = useState<Proposal[]>([]);

  const [proofHex, setProofHex] = useState("");
  const [inputsHex, setInputsHex] = useState("");
  const [vkHex, setVkHex] = useState("");
  const [proofGenerated, setProofGenerated] = useState(false);
  const [verificationState, setVerificationState] = useState<
    "idle" | "verifying" | "valid" | "invalid"
  >("idle");
  const [lastVerifyTxHash, setLastVerifyTxHash] = useState("");
  const [lastVerifyBlockNumber, setLastVerifyBlockNumber] = useState<number | null>(null);
  const [vkStored, setVkStored] = useState(false);

  const [transactions, setTransactions] = useState<TransactionEntry[]>([]);

  const resetProofState = useCallback(() => {
    setProofHex("");
    setInputsHex("");
    setVkHex("");
    setProofGenerated(false);
    setVerificationState("idle");
    setLastVerifyTxHash("");
    setLastVerifyBlockNumber(null);
    setVkStored(false);
  }, []);

  // ── helpers ──

  const addTransaction = useCallback(
    (actionType: string, txHash: string, blockNumber?: number) => {
      setTransactions((prev) => [
        ...(prev.some((t) => t.txHash === txHash && t.actionType === actionType)
          ? []
          : [
              {
                id: Math.random().toString(36).substring(2),
                actionType,
                timestamp: new Date(),
                txHash,
                blockNumber,
              },
            ]),
        ...prev.filter((t) => !(t.txHash === txHash && t.actionType === actionType)),
      ]);
    },
    []
  );

  const requireOnChainSuccess = useCallback(
    async (txHash: string, waitReceipt?: ethers.TransactionReceipt | null) => {
      const readProvider = provider ?? signer?.provider;
      if (!readProvider) {
        throw new Error("Provider not available for receipt confirmation");
      }

      const receipt = waitReceipt ?? (await readProvider.getTransactionReceipt(txHash));
      if (!receipt || receipt.blockNumber == null) {
        throw new Error("Transaction was not included on-chain");
      }
      if (receipt.status !== 1) {
        throw new Error("Transaction failed on-chain");
      }

      // Confirm through provider lookup to avoid treating local/pending responses as final.
      const confirmed = await readProvider.getTransactionReceipt(txHash);
      if (!confirmed || confirmed.blockNumber == null || confirmed.status !== 1) {
        throw new Error("Transaction could not be confirmed on-chain");
      }

      return confirmed;
    },
    [provider, signer]
  );

  const onExpectedChain = useCallback(() => {
    return chainId.toLowerCase() === CHAIN_CONFIG.chainId.toLowerCase();
  }, [chainId]);

  const buildTxOverrides = useCallback(async () => {
    // Westend Asset Hub RPC adapter may not implement eth_maxPriorityFeePerGas.
    // Use fixed known-good fee overrides for all write transactions.
    return TX_OVERRIDES;
  }, []);

  const loadRecentActivityFromChain = useCallback(async () => {
    if (!provider) return;

    const ifaceVoting = new ethers.Interface(PRIVATE_VOTING_ABI);
    const ifaceRust = new ethers.Interface(RUST_VERIFIER_ABI);
    const votingAddr = CONTRACTS.privateVoting.toLowerCase();
    const rustAddr = CONTRACTS.rustVerifier.toLowerCase();

    const createSelector = ifaceVoting.getFunction("createProposal")?.selector.toLowerCase();
    const voteSelector = ifaceVoting.getFunction("castVote")?.selector.toLowerCase();
    const verifySelector = ifaceRust.getFunction("verify")?.selector.toLowerCase();
    const storeVkSelector = ifaceRust.getFunction("storeVerificationKey")?.selector.toLowerCase();

    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - ACTIVITY_LOOKBACK_BLOCKS);
    const chainEntries: TransactionEntry[] = [];

    for (let blockNumber = latestBlock; blockNumber >= fromBlock; blockNumber--) {
      const blockTag = "0x" + blockNumber.toString(16);
      const block = await provider.send("eth_getBlockByNumber", [blockTag, true]);
      const txs = Array.isArray(block?.transactions) ? block.transactions : [];

      for (const tx of txs) {
        const txHash = String(tx?.hash || "");
        const to = String(tx?.to || "").toLowerCase();
        const input = String(tx?.input || "");
        if (!txHash || !input || (!to || (to !== votingAddr && to !== rustAddr))) continue;

        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt || receipt.status !== 1 || receipt.blockNumber == null) continue;

        const selector = input.slice(0, 10).toLowerCase();
        let actionType = "Contract Tx";

        if (to === votingAddr && selector === createSelector) actionType = "Proposal Created";
        else if (to === votingAddr && selector === voteSelector) actionType = "Vote Cast";
        else if (to === rustAddr && selector === verifySelector) actionType = "Proof Verified";
        else if (to === rustAddr && selector === storeVkSelector) actionType = "VK Stored";
        else continue;

        chainEntries.push({
          id: `${txHash}:${receipt.blockNumber}`,
          actionType,
          timestamp: new Date(),
          txHash,
          blockNumber: receipt.blockNumber,
        });
      }
    }

    if (chainEntries.length === 0) return;

    setTransactions((prev) => {
      const byHash = new Map<string, TransactionEntry>();
      for (const t of prev) byHash.set(t.txHash, t);
      for (const t of chainEntries) byHash.set(t.txHash, t);
      return Array.from(byHash.values()).sort(
        (a, b) => (b.blockNumber ?? 0) - (a.blockNumber ?? 0)
      );
    });
  }, [provider]);

  const ensureContractDeployed = useCallback(
    async (
      readProvider: ethers.Provider,
      address: string,
      label: string
    ): Promise<boolean> => {
      try {
        const code = await readProvider.getCode(address);
        if (code === "0x") {
          if (label === "PrivateVoting") {
            return true;
          }
          setStatus(
            `${label} is not deployed on the current network. Switch to ${CHAIN_CONFIG.chainName}.`
          );
          return false;
        }
        return true;
      } catch (err: any) {
        setStatus(`Failed to check ${label} deployment: ${getReadableError(err)}`);
        return false;
      }
    },
    []
  );

  // ── Restore proof session from localStorage ──

  const restoreSession = useCallback((addr: string) => {
    const session = loadProofSession();
    if (!session || session.account.toLowerCase() !== addr.toLowerCase()) {
      resetProofState();
      return;
    }
    setProofHex(session.proofHex);
    setVkHex(session.vkHex);
    setInputsHex(session.inputsHex);
    setProofGenerated(true);
    if (session.verifyTxHash) {
      setLastVerifyTxHash(session.verifyTxHash);
      setVerificationState("valid");
      addTransaction("Proof Verified (restored)", session.verifyTxHash);
    }
    if (session.vkStoreTxHash) {
      setVkStored(true);
      addTransaction("VK Stored (restored)", session.vkStoreTxHash);
    }
  }, [addTransaction, resetProofState]);

  // ── wallet ──

  const connectWallet = useCallback(async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      setStatus("Please install MetaMask");
      return;
    }
    try {
      setLoading(true);
      const ethereum = (window as any).ethereum;
      const prov = new ethers.BrowserProvider(ethereum);
      // Force MetaMask account picker dialog every time
      try {
        await ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch {
        // Fallback if wallet_requestPermissions not supported
        await ethereum.request({ method: "eth_requestAccounts" });
      }
      const sig = await prov.getSigner();
      const addr = await sig.getAddress();
      const network = await prov.getNetwork();
      setProvider(prov);
      setSigner(sig);
      setAccount(addr);
      setChainId("0x" + network.chainId.toString(16));
      setStatus(`Connected: ${addr.slice(0, 6)}...${addr.slice(-4)}`);
      restoreSession(addr);
    } catch (err: any) {
      setStatus(`Connection failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [restoreSession]);

  const disconnectWallet = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAccount("");
    setChainId("");
    setProposals([]);
    setProofHex("");
    setInputsHex("");
    setProofGenerated(false);
    setVerificationState("idle");
    setLastVerifyTxHash("");
    setLastVerifyBlockNumber(null);
    setVkStored(false);
    setTransactions([]);
    setStatus("Wallet disconnected");
  }, []);

  // Auto-reconnect on page load if previously connected
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).ethereum) return;
    const ethereum = (window as any).ethereum;
    ethereum
      .request({ method: "eth_accounts" })
      .then(async (accounts: string[]) => {
        if (accounts.length > 0) {
          const prov = new ethers.BrowserProvider(ethereum);
          const sig = await prov.getSigner();
          const addr = await sig.getAddress();
          const network = await prov.getNetwork();
          setProvider(prov);
          setSigner(sig);
          setAccount(addr);
          setChainId("0x" + network.chainId.toString(16));
          setStatus(`Connected: ${addr.slice(0, 6)}...${addr.slice(-4)}`);
          restoreSession(addr);
        }
      })
      .catch(() => {});
  }, [restoreSession]);

  // Keep chain/account state in sync with wallet after user switches network/accounts in MetaMask
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).ethereum) return;
    const ethereum = (window as any).ethereum;

    const handleAccountsChanged = async (accounts: string[]) => {
      if (!accounts || accounts.length === 0) {
        disconnectWallet();
        return;
      }
      try {
        const prov = new ethers.BrowserProvider(ethereum);
        const sig = await prov.getSigner();
        const addr = await sig.getAddress();
        const network = await prov.getNetwork();
        setProvider(prov);
        setSigner(sig);
        setAccount(addr);
        setChainId("0x" + network.chainId.toString(16));
        setStatus(`Connected: ${addr.slice(0, 6)}...${addr.slice(-4)}`);
        restoreSession(addr);
      } catch (err: any) {
        setStatus(`Account change handling failed: ${getReadableError(err)}`);
      }
    };

    const handleChainChanged = (nextChainId: string) => {
      setChainId(nextChainId.toLowerCase());
      setProposals([]);
      if (nextChainId.toLowerCase() !== CHAIN_CONFIG.chainId.toLowerCase()) {
        setStatus(`Wrong network. Switch to ${CHAIN_CONFIG.chainName}.`);
      }
    };

    if (ethereum.on) {
      ethereum.on("accountsChanged", handleAccountsChanged);
      ethereum.on("chainChanged", handleChainChanged);
    }

    return () => {
      if (ethereum.removeListener) {
        ethereum.removeListener("accountsChanged", handleAccountsChanged);
        ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [disconnectWallet, restoreSession]);

  const switchToAssetHub = useCallback(async () => {
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
  }, []);

  // ── Real proof generation using snarkjs in-browser ──

  const generateProof = useCallback(
    async (a: string, b: string, c: string): Promise<boolean> => {
      try {
        setLoading(true);
        setStatus("Loading snarkjs...");

        const snarkjs = await import("snarkjs");

        setStatus("Loading circuit WASM and proving key...");
        const input = { a, b, c };

        setStatus(`Generating Groth16 proof for ${a} × ${b} = ${c}...`);
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
          input,
          "/multiply.wasm",
          "/multiply_final.zkey"
        );

        setStatus("Proof generated. Serializing to binary format...");

        // Serialize proof to the binary hex format the Rust verifier expects
        const proofHexVal = serializeProofToHex(proof);
        const inputsHexVal = serializePublicInputsToHex(publicSignals);

        // Load and serialize the verification key
        setStatus("Loading verification key...");
        const vkResp = await fetch("/verification_key.json");
        const vk = await vkResp.json();
        const vkHexVal = serializeVKToHex(vk);

        // Verify locally with snarkjs before sending on-chain
        setStatus("Verifying proof locally with snarkjs...");
        const localValid = await snarkjs.groth16.verify(vk, publicSignals, proof);

        if (!localValid) {
          setStatus("Local verification failed — invalid inputs. Proof not generated.");
          setLoading(false);
          return false;
        }

        // Store in state
        setProofHex(proofHexVal);
        setInputsHex(inputsHexVal);
        setVkHex(vkHexVal);
        setProofGenerated(true);
        setVerificationState("idle");

        // Persist proof data (without verification tx yet)
        if (account) {
          saveProofSession({
            proofHex: proofHexVal,
            vkHex: vkHexVal,
            inputsHex: inputsHexVal,
            publicSignals,
            verifyTxHash: "",
            vkStoreTxHash: "",
            account,
            timestamp: Date.now(),
          });
        }

        setStatus(
          `Proof generated and locally verified! (${(proofHexVal.length - 2) / 2} bytes proof, public output: ${publicSignals.join(", ")})`
        );
        return true;
      } catch (err: any) {
        setStatus(`Proof generation error: ${err.message}`);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [account]
  );

  // ── VK storage ──

  const storeVerificationKey = useCallback(async (): Promise<boolean> => {
    if (!signer || !CONTRACTS.rustVerifier || !vkHex) return false;
    if (!onExpectedChain()) {
      setStatus(`Wrong network. Switch to ${CHAIN_CONFIG.chainName} before storing VK.`);
      return false;
    }
    try {
      const canCall = await ensureContractDeployed(
        provider ?? signer.provider!,
        CONTRACTS.rustVerifier,
        "Rust verifier"
      );
      if (!canCall) return false;

      const verifier = new ethers.Contract(
        CONTRACTS.rustVerifier,
        RUST_VERIFIER_ABI,
        signer
      );
      const tx = await verifier.storeVerificationKey(vkHex, await buildTxOverrides());
      const waitReceipt = await tx.wait();
      const receipt = await requireOnChainSuccess(tx.hash, waitReceipt);
      addTransaction("VK Stored", receipt.hash, receipt.blockNumber);
      setVkStored(true);

      // Update persisted session with VK store tx hash
      const session = loadProofSession();
      if (session) {
        session.vkStoreTxHash = receipt.hash;
        saveProofSession(session);
      }

      return true;
    } catch (err: any) {
      console.error("Failed to store VK:", err);
      setStatus(`Failed to store verification key: ${getReadableError(err)}`);
      return false;
    }
  }, [
    signer,
    provider,
    vkHex,
    addTransaction,
    onExpectedChain,
    ensureContractDeployed,
    buildTxOverrides,
    requireOnChainSuccess,
  ]);

  // ── verification ──

  const verifyProof = useCallback(
    async (): Promise<boolean> => {
      if (!signer || !CONTRACTS.rustVerifier) {
        setStatus("Connect wallet and ensure contracts are deployed");
        return false;
      }
      if (!onExpectedChain()) {
        setStatus(`Wrong network. Switch to ${CHAIN_CONFIG.chainName} before verification.`);
        return false;
      }
      if (!proofHex || !inputsHex) {
        setStatus("Generate a proof first");
        return false;
      }
      try {
        setLoading(true);
        setVerificationState("verifying");

        const canCall = await ensureContractDeployed(
          provider ?? signer.provider!,
          CONTRACTS.rustVerifier,
          "Rust verifier"
        );
        if (!canCall) {
          setVerificationState("invalid");
          return false;
        }

        // Auto-store VK if not yet stored
        if (!vkStored && vkHex) {
          setStatus("Storing verification key on PolkaVM (one-time setup)...");
          const stored = await storeVerificationKey();
          if (!stored) {
            setVerificationState("invalid");
            setStatus("Failed to store verification key on-chain");
            return false;
          }
        }

        setStatus("Submitting proof to Rust verifier on PolkaVM...");
        const verifier = new ethers.Contract(
          CONTRACTS.rustVerifier,
          RUST_VERIFIER_ABI,
          signer
        );
        const tx = await verifier.verify(proofHex, inputsHex, await buildTxOverrides());
        const waitReceipt = await tx.wait();
        const receipt = await requireOnChainSuccess(tx.hash, waitReceipt);
        setLastVerifyTxHash(receipt.hash);
        setLastVerifyBlockNumber(receipt.blockNumber);
        addTransaction("Proof Verified", receipt.hash, receipt.blockNumber);

        // Parse ProofVerified event to get the actual verification result
        let parsedResult: boolean | null = null;
        const iface = new ethers.Interface(RUST_VERIFIER_ABI);
        for (const log of receipt.logs) {
          try {
            const parsed = iface.parseLog({
              topics: log.topics as string[],
              data: log.data,
            });
            if (parsed && parsed.name === "ProofVerified") {
              parsedResult = Boolean(parsed.args[1]); // bool result
              break;
            }
          } catch {
            // Not a matching event, continue
          }
        }

        // On this RPC adapter, logs/event decoding can be unreliable.
        // If no explicit ProofVerified(false) is decoded, trust successful receipt status.
        const success = parsedResult === null ? receipt.status === 1 : parsedResult;

        setVerificationState(success ? "valid" : "invalid");
        setStatus(
          success
            ? "Proof verified on-chain by Rust verifier!"
            : "Proof verification failed — invalid proof"
        );

        // Persist the verification tx hash
        if (success) {
          const session = loadProofSession();
          if (session) {
            session.verifyTxHash = receipt.hash;
            saveProofSession(session);
          }
        }

        return success;
      } catch (err: any) {
        setStatus(`Verification error: ${getReadableError(err)}`);
        setVerificationState("invalid");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [
      signer,
      provider,
      proofHex,
      inputsHex,
      vkHex,
      vkStored,
      addTransaction,
      storeVerificationKey,
      onExpectedChain,
      ensureContractDeployed,
      buildTxOverrides,
      requireOnChainSuccess,
    ]
  );

  // ── proposals ──

  const loadProposalsFromLogs = useCallback(async (): Promise<Proposal[]> => {
    if (!provider || !CONTRACTS.privateVoting) return [];

    const iface = new ethers.Interface(PRIVATE_VOTING_ABI);
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - EVENT_LOOKBACK_BLOCKS);

    const proposalTopic = ethers.id("ProposalCreated(uint256,string,uint256)");
    const voteTopic = ethers.id("VoteCast(uint256,bool,bytes32)");

    const [proposalLogs, voteLogs] = await Promise.all([
      provider.getLogs({
        address: CONTRACTS.privateVoting,
        fromBlock,
        toBlock: latestBlock,
        topics: [proposalTopic],
      }),
      provider.getLogs({
        address: CONTRACTS.privateVoting,
        fromBlock,
        toBlock: latestBlock,
        topics: [voteTopic],
      }),
    ]);

    const byId = new Map<number, Proposal>();

    for (const log of proposalLogs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
        if (!parsed || parsed.name !== "ProposalCreated") continue;

        const id = Number(parsed.args[0]);
        const description = String(parsed.args[1]);
        const deadline = BigInt(parsed.args[2].toString());

        byId.set(id, {
          id,
          description,
          yesVotes: BigInt(0),
          noVotes: BigInt(0),
          deadline,
          isActive: deadline > BigInt(Math.floor(Date.now() / 1000)),
          userHasVoted: false,
          userVote: null,
        });
      } catch {
        // Ignore logs that fail decoding
      }
    }

    for (const log of voteLogs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
        if (!parsed || parsed.name !== "VoteCast") continue;

        const id = Number(parsed.args[0]);
        const vote = Boolean(parsed.args[1]);
        const existing = byId.get(id);
        if (!existing) {
          byId.set(id, {
            id,
            description: `Proposal #${id}`,
            yesVotes: vote ? BigInt(1) : BigInt(0),
            noVotes: vote ? BigInt(0) : BigInt(1),
            deadline: BigInt(0),
            isActive: true,
            userHasVoted: false,
            userVote: null,
          });
          continue;
        }

        if (vote) {
          existing.yesVotes = existing.yesVotes + BigInt(1);
        } else {
          existing.noVotes = existing.noVotes + BigInt(1);
        }
      } catch {
        // Ignore logs that fail decoding
      }
    }

    return Array.from(byId.values()).sort((a, b) => a.id - b.id);
  }, [provider]);

  const loadProposalsFromTransactions = useCallback(async (): Promise<Proposal[]> => {
    if (!provider || !CONTRACTS.privateVoting) return [];

    const iface = new ethers.Interface(PRIVATE_VOTING_ABI);
    const createFn = iface.getFunction("createProposal");
    const voteFn = iface.getFunction("castVote");
    if (!createFn || !voteFn) return [];

    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - TX_SCAN_LOOKBACK_BLOCKS);
    const toAddress = CONTRACTS.privateVoting.toLowerCase();
    const currentUser = account.toLowerCase();

    const proposalsById = new Map<number, Proposal>();
    const voterSetByProposal = new Map<number, Set<string>>();
    const userVoteByProposal = new Map<number, boolean>();
    let nextProposalId = 0;

    for (let blockNumber = fromBlock; blockNumber <= latestBlock; blockNumber++) {
      const blockTag = "0x" + blockNumber.toString(16);
      const block = await provider.send("eth_getBlockByNumber", [blockTag, true]);
      const txs = Array.isArray(block?.transactions) ? block.transactions : [];
      const timestampHex = String(block?.timestamp || "0x0");
      const blockTs = BigInt(timestampHex);

      for (const tx of txs) {
        const to = String(tx?.to || "").toLowerCase();
        const input = String(tx?.input || "");
        const txHash = String(tx?.hash || "");
        if (!to || to !== toAddress || !input || !txHash) continue;

        const selector = input.slice(0, 10).toLowerCase();
        const isCreate = selector === createFn.selector.toLowerCase();
        const isVote = selector === voteFn.selector.toLowerCase();
        if (!isCreate && !isVote) continue;

        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt || receipt.status !== 1) continue;

        if (isCreate) {
          try {
            const decoded = iface.decodeFunctionData("createProposal", input);
            const description = String(decoded[0]);
            const duration = BigInt(decoded[1].toString());
            const deadline = blockTs + duration;

            proposalsById.set(nextProposalId, {
              id: nextProposalId,
              description,
              yesVotes: BigInt(0),
              noVotes: BigInt(0),
              deadline,
              isActive: deadline > BigInt(Math.floor(Date.now() / 1000)),
              userHasVoted: false,
              userVote: null,
            });
            nextProposalId += 1;
          } catch {
            // Ignore malformed tx data
          }
          continue;
        }

        if (isVote) {
          try {
            const decoded = iface.decodeFunctionData("castVote", input);
            const proposalId = Number(decoded[0]);
            const vote = Boolean(decoded[1]);
            let voter = String(tx?.from || "").toLowerCase();
            if (!voter) {
              try {
                const fullTx = await provider.getTransaction(txHash);
                voter = String(fullTx?.from || "").toLowerCase();
              } catch {
                voter = "";
              }
            }

            if (!proposalsById.has(proposalId)) {
              proposalsById.set(proposalId, {
                id: proposalId,
                description: `Proposal #${proposalId}`,
                yesVotes: BigInt(0),
                noVotes: BigInt(0),
                deadline: BigInt(0),
                isActive: true,
                userHasVoted: false,
                userVote: null,
              });
            }

            if (!voterSetByProposal.has(proposalId)) {
              voterSetByProposal.set(proposalId, new Set<string>());
            }
            const voters = voterSetByProposal.get(proposalId)!;

            if (voter && currentUser && voter === currentUser) {
              userVoteByProposal.set(proposalId, vote);
            }

            // Treat one wallet as one voter when computing UI totals.
            if (voter && !voters.has(voter)) {
              voters.add(voter);
              const current = proposalsById.get(proposalId)!;
              if (vote) {
                current.yesVotes = current.yesVotes + BigInt(1);
              } else {
                current.noVotes = current.noVotes + BigInt(1);
              }
            } else if (!voter) {
              const current = proposalsById.get(proposalId)!;
              if (vote) {
                current.yesVotes = current.yesVotes + BigInt(1);
              } else {
                current.noVotes = current.noVotes + BigInt(1);
              }
            }
          } catch {
            // Ignore malformed tx data
          }
        }
      }
    }

    proposalsById.forEach((proposal, proposalId) => {
      const voters = voterSetByProposal.get(proposalId);
      proposal.userHasVoted = !!(currentUser && voters?.has(currentUser));
      proposal.userVote = userVoteByProposal.has(proposalId)
        ? userVoteByProposal.get(proposalId)!
        : null;
      proposalsById.set(proposalId, proposal);
    });

    return Array.from(proposalsById.values()).sort((a, b) => a.id - b.id);
  }, [provider, account]);

  const loadProposals = useCallback(async () => {
    if (!provider || !CONTRACTS.privateVoting) return;
    if (!onExpectedChain()) {
      setProposals([]);
      return;
    }
    try {
      const cachedProposals = loadProposalsCache(chainId);
      if (cachedProposals.length > 0) {
        setProposals(applyLocalVoteState(cachedProposals, chainId, account));
      }

      const canRead = await ensureContractDeployed(
        provider,
        CONTRACTS.privateVoting,
        "PrivateVoting"
      );
      if (!canRead) {
        const propsFromTxs = await loadProposalsFromTransactions();
        const merged = mergeProposals(propsFromTxs, cachedProposals);
        const hydrated = applyLocalVoteState(merged, chainId, account);
        setProposals(hydrated);
        if (merged.length > 0) {
          saveProposalsCache(chainId, merged);
          setStatus("Loaded proposals from on-chain transactions.");
        } else if (cachedProposals.length > 0) {
          setStatus("Loaded proposals from local cache while chain reads are unavailable.");
        }
        return;
      }

      const voting = new ethers.Contract(
        CONTRACTS.privateVoting,
        PRIVATE_VOTING_ABI,
        provider
      );
      try {
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
              userHasVoted: false,
              userVote: null,
            });
          } catch {
            props.push({
              id: i,
              description: `Proposal #${i}`,
              yesVotes: BigInt(0),
              noVotes: BigInt(0),
              deadline: BigInt(0),
              isActive: true,
              userHasVoted: false,
              userVote: null,
            });
          }
        }
        if (props.length > 0) {
          const merged = mergeProposals(props, cachedProposals);
          const hydrated = applyLocalVoteState(merged, chainId, account);
          setProposals(hydrated);
          saveProposalsCache(chainId, merged);
          return;
        }

        const propsFromTxs = await loadProposalsFromTransactions();
        const merged = mergeProposals(propsFromTxs, cachedProposals);
        const hydrated = applyLocalVoteState(merged, chainId, account);
        setProposals(hydrated);
        if (merged.length > 0) {
          saveProposalsCache(chainId, merged);
          setStatus("Loaded proposals from on-chain transactions.");
        } else if (cachedProposals.length > 0) {
          setStatus("Loaded proposals from local cache while chain history is unavailable.");
        }
      } catch (readErr: any) {
        if (isMetadataCallError(readErr)) {
          const propsFromLogs = await loadProposalsFromLogs();
          if (propsFromLogs.length > 0) {
            const merged = mergeProposals(propsFromLogs, cachedProposals);
            const hydrated = applyLocalVoteState(merged, chainId, account);
            setProposals(hydrated);
            saveProposalsCache(chainId, merged);
            setStatus("Loaded proposals from on-chain logs (direct reads unavailable on this RPC adapter).");
            return;
          }

          const propsFromTxs = await loadProposalsFromTransactions();
          const merged = mergeProposals(propsFromTxs, cachedProposals);
          const hydrated = applyLocalVoteState(merged, chainId, account);
          setProposals(hydrated);
          if (merged.length > 0) {
            saveProposalsCache(chainId, merged);
            setStatus("Loaded proposals from on-chain transactions (read APIs unavailable on this RPC adapter).");
          } else if (cachedProposals.length > 0) {
            setStatus("Loaded proposals from local cache while chain reads are unavailable.");
          } else {
            setStatus(
              `No proposals found for ${CONTRACTS.privateVoting} in the last ${TX_SCAN_LOOKBACK_BLOCKS} blocks.`
            );
          }
          return;
        }
        throw readErr;
      }
    } catch (err: any) {
      console.error("Failed to load proposals:", err);
    }
  }, [
    chainId,
    account,
    provider,
    onExpectedChain,
    ensureContractDeployed,
    loadProposalsFromLogs,
    loadProposalsFromTransactions,
  ]);

  const createProposal = useCallback(
    async (
      description: string,
      durationSeconds: number
    ): Promise<{ txHash: string; proposalId: number; blockNumber: number } | null> => {
      if (!signer || !CONTRACTS.privateVoting) {
        setStatus("Connect wallet and ensure contracts are deployed");
        return null;
      }
      if (!onExpectedChain()) {
        setStatus(`Wrong network. Switch to ${CHAIN_CONFIG.chainName} before creating a proposal.`);
        return null;
      }
      try {
        setLoading(true);
        setStatus("Preparing proposal transaction...");

        // Re-request account access right before sending a write tx so wallet prompt is not skipped.
        if (typeof window !== "undefined" && (window as any).ethereum) {
          await (window as any).ethereum.request({ method: "eth_requestAccounts" });
        }

        const voting = new ethers.Contract(
          CONTRACTS.privateVoting,
          PRIVATE_VOTING_ABI,
          signer
        );
        setStatus("Confirm the transaction in MetaMask...");
        const tx = await voting.createProposal(
          description,
          durationSeconds,
          TX_OVERRIDES
        );
        setStatus("Transaction submitted, waiting for confirmation...");
        const waitReceipt = await tx.wait();
        const receipt = await requireOnChainSuccess(tx.hash, waitReceipt);
        addTransaction("Proposal Created", receipt.hash, receipt.blockNumber);
        setStatus("Proposal created successfully!");

        // Parse ProposalCreated event to get the actual proposal ID
        let newProposalId = -1;
        const iface = new ethers.Interface(PRIVATE_VOTING_ABI);
        for (const log of receipt.logs) {
          try {
            const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
            if (parsed && parsed.name === "ProposalCreated") {
              newProposalId = Number(parsed.args[0]);
              break;
            }
          } catch {
            // Not a matching event, continue
          }
        }
        if (newProposalId < 0) {
          setStatus(
            "Proposal transaction confirmed. ProposalCreated event was not returned by RPC logs, using local sequence id."
          );
          newProposalId = proposals.length > 0
            ? Math.max(...proposals.map((p) => p.id)) + 1
            : 0;
        }

        const nowTs = BigInt(Math.floor(Date.now() / 1000));
        const duration = BigInt(durationSeconds);
        setProposals((prev) => {
          if (prev.some((p) => p.id === newProposalId)) return prev;
          const next = [
            ...prev,
            {
              id: newProposalId,
              description,
              yesVotes: BigInt(0),
              noVotes: BigInt(0),
              deadline: nowTs + duration,
              isActive: true,
              userHasVoted: false,
              userVote: null,
            },
          ].sort((a, b) => a.id - b.id);
          saveProposalsCache(chainId, next);
          return next;
        });

        await loadProposals();
        return {
          txHash: receipt.hash,
          proposalId: newProposalId,
          blockNumber: receipt.blockNumber,
        };
      } catch (err: any) {
        setStatus(`Error creating proposal: ${getReadableError(err)}`);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [
      signer,
      chainId,
      proposals,
      addTransaction,
      loadProposals,
      onExpectedChain,
      requireOnChainSuccess,
    ]
  );

  // ── voting ──

  const castVote = useCallback(
    async (proposalId: number, vote: boolean): Promise<boolean> => {
      if (!signer || !CONTRACTS.privateVoting) {
        setStatus("Connect wallet and ensure contracts are deployed");
        return false;
      }
      if (!onExpectedChain()) {
        setStatus(`Wrong network. Switch to ${CHAIN_CONFIG.chainName} before casting a vote.`);
        return false;
      }
      const localVotes = loadLocalVotes(chainId, account);
      if (typeof localVotes[proposalId] === "boolean") {
        setStatus("You already voted on this proposal from this wallet.");
        return false;
      }
      try {
        setLoading(true);
        let effectiveProofHex = proofHex;
        let effectiveInputsHex = inputsHex;

        if (!proofHex || !inputsHex) {
          setStatus("Generating eligibility proof...");
          const generated = await generateProof("3", "7", "21");
          if (!generated) {
            setStatus("Could not generate proof. Please generate proof manually in Dashboard.");
            return false;
          }

          const session = loadProofSession();
          if (session && session.account.toLowerCase() === account.toLowerCase()) {
            effectiveProofHex = session.proofHex;
            effectiveInputsHex = session.inputsHex;
          }

          if (!effectiveProofHex || !effectiveInputsHex) {
            setStatus("Generated proof data is unavailable. Please retry from Dashboard.");
            return false;
          }
        }

        if (verificationState !== "valid") {
          setStatus("Verifying eligibility proof on-chain...");
          const verified = await verifyProof();
          if (!verified) {
            setStatus("Proof verification failed. Vote was not submitted.");
            return false;
          }
        }

        setStatus("Casting vote with ZK proof...");

        const canCall = await ensureContractDeployed(
          provider ?? signer.provider!,
          CONTRACTS.privateVoting,
          "PrivateVoting"
        );
        if (!canCall) return false;

        const voting = new ethers.Contract(
          CONTRACTS.privateVoting,
          PRIVATE_VOTING_ABI,
          signer
        );
        // Derive nullifier from voter secret + proposalId (privacy-preserving)
        const voterSecret = ethers.keccak256(
          ethers.solidityPacked(["address"], [account])
        );
        const nullifier = ethers.solidityPackedKeccak256(
          ["bytes32", "uint256"],
          [voterSecret, proposalId]
        );
        const tx = await voting.castVote(
          proposalId,
          vote,
          effectiveProofHex,
          effectiveInputsHex,
          nullifier,
          await buildTxOverrides()
        );
        setStatus("Transaction submitted, waiting for confirmation...");
        const waitReceipt = await tx.wait();
        const receipt = await requireOnChainSuccess(tx.hash, waitReceipt);

        let voteEventSeen = false;
        const iface = new ethers.Interface(PRIVATE_VOTING_ABI);
        for (const log of receipt.logs) {
          try {
            const parsed = iface.parseLog({
              topics: log.topics as string[],
              data: log.data,
            });
            if (parsed && parsed.name === "VoteCast") {
              voteEventSeen = true;
              break;
            }
          } catch {
            // ignore unrelated logs
          }
        }

        if (!voteEventSeen) {
          setStatus(
            "Vote transaction confirmed. VoteCast event was not returned by RPC logs, continuing with transaction-confirmed state."
          );
        }

        addTransaction("Vote Cast", receipt.hash, receipt.blockNumber);
        if (chainId && account) {
          saveLocalVote(chainId, account, proposalId, vote);
        }

        setProposals((prev) => {
          const next = prev.map((proposal) => {
            if (proposal.id !== proposalId) return proposal;
            return {
              ...proposal,
              yesVotes: vote ? proposal.yesVotes + BigInt(1) : proposal.yesVotes,
              noVotes: vote ? proposal.noVotes : proposal.noVotes + BigInt(1),
              userHasVoted: true,
              userVote: vote,
            };
          });
          saveProposalsCache(chainId, next);
          return next;
        });

        setStatus("Vote cast successfully!");
        await loadProposals();
        return true;
      } catch (err: any) {
        setStatus(`Voting error: ${getReadableError(err)}`);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [
      signer,
      provider,
      proofHex,
      inputsHex,
      account,
      chainId,
      verificationState,
      addTransaction,
      loadProposals,
      generateProof,
      verifyProof,
      onExpectedChain,
      ensureContractDeployed,
      buildTxOverrides,
      requireOnChainSuccess,
    ]
  );

  // Load proposals when provider connects
  useEffect(() => {
    if (provider) loadProposals();
  }, [provider, loadProposals]);

  useEffect(() => {
    if (!provider || !onExpectedChain()) return;
    loadRecentActivityFromChain().catch(() => {});
  }, [provider, onExpectedChain, loadRecentActivityFromChain]);

  return (
    <BlockchainContext.Provider
      value={{
        provider,
        signer,
        account,
        chainId,
        loading,
        status,
        proposals,
        proofHex,
        inputsHex,
        proofGenerated,
        verificationState,
        lastVerifyTxHash,
        lastVerifyBlockNumber,
        vkHex,
        vkStored,
        transactions,
        connectWallet,
        disconnectWallet,
        switchToAssetHub,
        generateProof,
        storeVerificationKey,
        verifyProof,
        loadProposals,
        castVote,
        createProposal,
        setStatus,
      }}
    >
      {children}
    </BlockchainContext.Provider>
  );
}

export function useBlockchain() {
  const context = useContext(BlockchainContext);
  if (!context)
    throw new Error("useBlockchain must be used within BlockchainProvider");
  return context;
}
