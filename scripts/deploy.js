/**
 * PolkaZK — Contract Deployment Script
 *
 * Deploys the Rust ZK Verifier and Solidity PrivateVoting contracts
 * to a pallet-revive chain via Eth-RPC.
 *
 * Usage:
 *   node scripts/deploy.js [--network local|westend] [--step rust|solidity|all]
 *
 * Prerequisites:
 *   - .env file with PRIVATE_KEY and RPC_URL
 *   - Rust contract built: cargo build --release (in contracts/rust-verifier/)
 *   - Solidity contract compiled with resolc (or use the pre-compiled ABI)
 */

require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// ─── Configuration ───────────────────────────────────────────

const NETWORKS = {
  local: {
    rpc: "http://127.0.0.1:8545",
    name: "Local Kitchensink",
  },
  westend: {
    rpc: "https://westend-asset-hub-eth-rpc.polkadot.io",
    name: "Westend Asset Hub",
  },
};

function getConfig() {
  const args = process.argv.slice(2);
  let network = "local";
  let step = "all";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--network" && args[i + 1]) network = args[++i];
    if (args[i] === "--step" && args[i + 1]) step = args[++i];
  }

  const rpcUrl = process.env.RPC_URL || NETWORKS[network]?.rpc;
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey || privateKey === "0x_YOUR_PRIVATE_KEY_HERE") {
    console.error("ERROR: Set PRIVATE_KEY in .env file");
    process.exit(1);
  }

  return { network, step, rpcUrl, privateKey };
}

// ─── ABI Definitions ─────────────────────────────────────────

// Rust verifier ABI (matches ZkVerifier.sol interface)
const RUST_VERIFIER_ABI = [
  "function verify(bytes calldata proof, bytes calldata publicInputs) external returns (bool)",
  "event ProofVerified(address indexed submitter, bool result)",
];

// Solidity PrivateVoting ABI
const PRIVATE_VOTING_ABI = [
  "constructor(address _rustVerifier)",
  "function createProposal(string calldata description, uint256 durationSeconds) external returns (uint256)",
  "function castVote(uint256 proposalId, bool vote, bytes calldata proof, bytes calldata publicInputs, bytes32 nullifierHash) external",
  "function getProposal(uint256 proposalId) external view returns (string description, uint256 yesVotes, uint256 noVotes, uint256 deadline, bool isActive)",
  "function proposalCount() external view returns (uint256)",
  "function rustVerifier() external view returns (address)",
  "function owner() external view returns (address)",
  "function nullifierUsed(bytes32) external view returns (bool)",
  "function setVerifier(address newVerifier) external",
  "event ProposalCreated(uint256 indexed proposalId, string description, uint256 deadline)",
  "event VoteCast(uint256 indexed proposalId, bool vote, bytes32 nullifierHash)",
  "event ProofVerified(address indexed submitter, bool result)",
];

// ─── Deploy Functions ────────────────────────────────────────

async function deployRustVerifier(wallet) {
  console.log("\n[Step 1] Deploying Rust ZK Verifier...");

  // Read the compiled PVM binary
  const pvmPath = path.join(
    __dirname,
    "..",
    "contracts",
    "rust-verifier",
    "target",
    "polkazk-verifier.release.polkavm"
  );

  if (!fs.existsSync(pvmPath)) {
    console.error(`PVM binary not found at: ${pvmPath}`);
    console.error("Build first: cd contracts/rust-verifier && cargo build --release");
    process.exit(1);
  }

  const pvmBytecode = fs.readFileSync(pvmPath);
  console.log(`  PVM binary size: ${pvmBytecode.length} bytes`);

  // Deploy as a contract creation transaction
  // The PVM bytecode IS the contract code (not EVM bytecode)
  // pallet-revive's Eth-RPC adapter handles the translation
  const tx = await wallet.sendTransaction({
    data: "0x" + pvmBytecode.toString("hex"),
    gasLimit: 5_000_000_000n,
    value: ethers.parseEther("2"),
    maxFeePerGas: 100_000_000n,
    maxPriorityFeePerGas: 0n,
  });

  console.log(`  Deploy tx: ${tx.hash}`);
  const receipt = await tx.wait();
  const contractAddress = receipt.contractAddress;
  console.log(`  Rust Verifier deployed at: ${contractAddress}`);

  return contractAddress;
}

async function deploySolidityVoting(wallet, rustVerifierAddress) {
  console.log("\n[Step 2] Deploying Solidity PrivateVoting...");

  // For pallet-revive, Solidity contracts must be compiled with resolc
  // which outputs PolkaVM bytecode. Check for pre-compiled output:
  const compiledPath = path.join(
    __dirname,
    "..",
    "contracts",
    "solidity-frontend",
    "output",
    "PrivateVoting.pvm"
  );

  let bytecode;

  if (fs.existsSync(compiledPath)) {
    bytecode = "0x" + fs.readFileSync(compiledPath).toString("hex");
    console.log(`  Using pre-compiled PVM bytecode: ${compiledPath}`);
  } else {
    // Try to compile with resolc
    console.log("  No pre-compiled PVM found. Attempting resolc compilation...");
    const { execSync } = require("child_process");
    try {
      const solPath = path.join(
        __dirname,
        "..",
        "contracts",
        "solidity-frontend",
        "PrivateVoting.sol"
      );
      const outDir = path.join(
        __dirname,
        "..",
        "contracts",
        "solidity-frontend",
        "output"
      );
      fs.mkdirSync(outDir, { recursive: true });
      execSync(`resolc --bin "${solPath}" -o "${outDir}"`, { stdio: "pipe" });
      bytecode = "0x" + fs.readFileSync(compiledPath).toString("hex");
    } catch (e) {
      console.error("  resolc not available. Please install Revive compiler.");
      console.error("  See: https://github.com/parity-tech/revive");
      console.error("\n  For now, deploying a minimal proxy placeholder...");

      // Deploy a minimal placeholder that forwards calls to the Rust verifier
      // This is a valid approach: use the Rust contract directly
      console.log(`\n  Skipping Solidity deploy — use Rust verifier directly.`);
      return null;
    }
  }

  // ABI-encode constructor args: address _rustVerifier
  const iface = new ethers.Interface(PRIVATE_VOTING_ABI);
  const constructorData = iface.encodeDeploy([rustVerifierAddress]);

  // Deployment: bytecode + constructor args
  const deployData = bytecode + constructorData.slice(2);

  const tx = await wallet.sendTransaction({
    data: deployData,
    gasLimit: 5_000_000_000n,
    value: ethers.parseEther("2"),
    maxFeePerGas: 100_000_000n,
    maxPriorityFeePerGas: 0n,
  });

  console.log(`  Deploy tx: ${tx.hash}`);
  const receipt = await tx.wait();
  const contractAddress = receipt.contractAddress;
  console.log(`  PrivateVoting deployed at: ${contractAddress}`);

  return contractAddress;
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const config = getConfig();
  const networkInfo = NETWORKS[config.network] || { name: config.network, rpc: config.rpcUrl };

  console.log("=== PolkaZK Contract Deployment ===");
  console.log(`Network: ${networkInfo.name}`);
  console.log(`RPC: ${config.rpcUrl}`);
  console.log(`Step: ${config.step}\n`);

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);

  console.log(`Deployer: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  let rustAddress = process.env.RUST_VERIFIER_ADDRESS;
  let votingAddress = process.env.VOTING_CONTRACT_ADDRESS;

  // Deploy Rust verifier
  if (config.step === "all" || config.step === "rust") {
    rustAddress = await deployRustVerifier(wallet);
  }

  // Deploy Solidity voting contract
  if (config.step === "all" || config.step === "solidity") {
    if (!rustAddress) {
      console.error("ERROR: RUST_VERIFIER_ADDRESS not set. Deploy Rust contract first.");
      process.exit(1);
    }
    votingAddress = await deploySolidityVoting(wallet, rustAddress);
  }

  // Save deployment info
  const deployInfo = {
    network: config.network,
    rpc: config.rpcUrl,
    deployer: wallet.address,
    rustVerifier: rustAddress,
    votingContract: votingAddress,
    timestamp: new Date().toISOString(),
  };

  const deployPath = path.join(__dirname, "..", `deployment-${config.network}.json`);
  fs.writeFileSync(deployPath, JSON.stringify(deployInfo, null, 2));

  console.log("\n=== Deployment Summary ===");
  console.log(`Rust Verifier:    ${rustAddress || "not deployed"}`);
  console.log(`Voting Contract:  ${votingAddress || "not deployed"}`);
  console.log(`Saved to: ${deployPath}`);

  // Update .env with addresses
  if (rustAddress || votingAddress) {
    console.log("\nAdd to .env:");
    if (rustAddress) console.log(`RUST_VERIFIER_ADDRESS=${rustAddress}`);
    if (votingAddress) console.log(`VOTING_CONTRACT_ADDRESS=${votingAddress}`);
  }
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
