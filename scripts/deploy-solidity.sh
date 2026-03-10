#!/usr/bin/env bash
# PolkaZK — Deploy Solidity Private Voting Contract
set -euo pipefail

# ─── Configuration ─────────────────────────────────────────
export ETH_RPC_URL="${ETH_RPC_URL:-https://services.polkadothub-rpc.com/testnet}"

if [ -z "${PRIVATE_KEY:-}" ]; then
    echo "ERROR: PRIVATE_KEY environment variable not set."
    exit 1
fi

if [ -z "${RUST_VERIFIER_ADDRESS:-}" ]; then
    echo "ERROR: RUST_VERIFIER_ADDRESS not set."
    echo "Deploy the Rust verifier first: ./scripts/deploy-rust.sh"
    exit 1
fi

echo "=== Deploying Solidity Private Voting Contract ==="
echo "RPC: $ETH_RPC_URL"
echo "Rust Verifier: $RUST_VERIFIER_ADDRESS"
echo ""

# 1. Compile with resolc
echo "[1/2] Compiling Solidity contract..."
cd "$(dirname "$0")/../contracts/solidity-frontend"

# Check if resolc is available
if ! command -v resolc &> /dev/null; then
    echo "ERROR: resolc not found. Install it first:"
    echo "  npm install -g @parity/resolc"
    echo "  OR download from: https://github.com/paritytech/revive/releases"
    exit 1
fi

# Compile with resolc (Solidity -> RISC-V for PolkaVM)
resolc --bin PrivateVoting.sol -o ./output/

BYTECODE=$(cat ./output/PrivateVoting.bin)
echo "Compilation complete."
echo ""

# 2. Deploy with constructor argument (Rust verifier address)
echo "[2/2] Deploying to testnet..."

# ABI-encode the constructor argument: address _rustVerifier
CONSTRUCTOR_ARGS=$(cast abi-encode "constructor(address)" "$RUST_VERIFIER_ADDRESS")

VOTING_CONTRACT=$(cast send \
    --private-key "$PRIVATE_KEY" \
    --create "${BYTECODE}${CONSTRUCTOR_ARGS}" \
    --json | jq -r .contractAddress)

echo ""
echo "=== Private Voting Contract Deployed ==="
echo "Contract Address: $VOTING_CONTRACT"
echo "Rust Verifier: $RUST_VERIFIER_ADDRESS"
echo ""
echo "Export for later use:"
echo "  export VOTING_CONTRACT_ADDRESS=$VOTING_CONTRACT"
