#!/usr/bin/env bash
# PolkaZK — Deploy Rust ZK Verifier Contract
set -euo pipefail

# ─── Configuration ─────────────────────────────────────────
# Polkadot Testnet (Paseo AssetHub) Eth-RPC endpoint
export ETH_RPC_URL="${ETH_RPC_URL:-https://services.polkadothub-rpc.com/testnet}"

# IMPORTANT: Set your private key before running this script
# export PRIVATE_KEY=0x...
if [ -z "${PRIVATE_KEY:-}" ]; then
    echo "ERROR: PRIVATE_KEY environment variable not set."
    echo "  export PRIVATE_KEY=0x<your-private-key>"
    echo "  Or use: cast wallet import pvm-account --private-key <key>"
    exit 1
fi

echo "=== Deploying Rust ZK Verifier Contract ==="
echo "RPC: $ETH_RPC_URL"
echo ""

# 1. Build the Rust contract
echo "[1/2] Building Rust contract..."
cd "$(dirname "$0")/../contracts/rust-verifier"
cargo build
echo "Build complete: target/polkazk-verifier.debug.polkavm"
echo ""

# 2. Deploy via cast
echo "[2/2] Deploying to testnet..."
RUST_CONTRACT=$(cast send \
    --private-key "$PRIVATE_KEY" \
    --create "$(xxd -p -c 99999 target/polkazk-verifier.debug.polkavm)" \
    --json | jq -r .contractAddress)

echo ""
echo "=== Rust Verifier Deployed ==="
echo "Contract Address: $RUST_CONTRACT"
echo ""
echo "Export for later use:"
echo "  export RUST_VERIFIER_ADDRESS=$RUST_CONTRACT"
