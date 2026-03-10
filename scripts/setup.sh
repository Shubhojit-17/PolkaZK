#!/usr/bin/env bash
# PolkaZK — Environment Setup Script
# Run this to install all required tooling

set -euo pipefail

echo "=== PolkaZK Environment Setup ==="
echo ""

# 1. Check Rust installation
echo "[1/5] Checking Rust installation..."
if ! command -v rustup &> /dev/null; then
    echo "Rust not found. Installing..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi
rustc --version
echo ""

# 2. Install nightly toolchain
echo "[2/5] Installing Rust nightly toolchain..."
rustup install nightly
rustup component add rust-src --toolchain nightly
echo ""

# 3. Install cargo-pvm-contract (builds PVM contracts)
echo "[3/5] Installing cargo-pvm-contract..."
cargo install --force --locked cargo-pvm-contract
echo ""

# 4. Install Foundry (for deployment with cast)
echo "[4/5] Checking Foundry installation..."
if ! command -v cast &> /dev/null; then
    echo "Foundry not found. Installing..."
    curl -L https://foundry.paradigm.xyz | bash
    foundryup
else
    echo "Foundry already installed: $(cast --version)"
fi
echo ""

# 5. Install resolc (Revive Solidity compiler)
echo "[5/5] Installing resolc (Revive compiler)..."
if ! command -v resolc &> /dev/null; then
    echo "resolc not found."
    echo "Option A: Install via npm:"
    echo "  npm install -g @parity/resolc"
    echo ""
    echo "Option B: Download binary from:"
    echo "  https://github.com/paritytech/revive/releases"
    echo ""
    echo "Option C: Use Remix for Polkadot:"
    echo "  https://remix.polkadot.io"
else
    echo "resolc already installed: $(resolc --version)"
fi
echo ""

echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. cd contracts/rust-verifier && cargo build"
echo "  2. Set up wallet: cast wallet new"
echo "  3. Get testnet funds: https://faucet.polkadot.io/"
echo "     Select 'Polkadot testnet (Paseo)' > 'Assethub'"
echo "  4. Deploy: see scripts/deploy-rust.sh"
