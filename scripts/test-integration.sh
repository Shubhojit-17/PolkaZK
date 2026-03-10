#!/usr/bin/env bash
# PolkaZK — Integration Test: Verify Solidity -> Rust cross-contract call
set -euo pipefail

export ETH_RPC_URL="${ETH_RPC_URL:-https://services.polkadothub-rpc.com/testnet}"

if [ -z "${PRIVATE_KEY:-}" ] || [ -z "${RUST_VERIFIER_ADDRESS:-}" ]; then
    echo "ERROR: Set PRIVATE_KEY and RUST_VERIFIER_ADDRESS first."
    exit 1
fi

echo "=== PolkaZK Integration Test ==="
echo ""

# Test 1: Direct call to Rust verifier with empty proof (should return false)
echo "[Test 1] Call Rust verifier with empty proof..."
RESULT=$(cast call "$RUST_VERIFIER_ADDRESS" \
    "verify(bytes,bytes)(bool)" \
    "0x" "0x" \
    2>/dev/null || echo "REVERTED")
echo "Result: $RESULT"
echo ""

# Test 2: Check contract code exists
echo "[Test 2] Verify Rust contract has code..."
CODE_SIZE=$(cast code-size "$RUST_VERIFIER_ADDRESS" 2>/dev/null || echo "0")
echo "Code size: $CODE_SIZE bytes"
echo ""

if [ -n "${VOTING_CONTRACT_ADDRESS:-}" ]; then
    # Test 3: Create a proposal via the Solidity voting contract
    echo "[Test 3] Create proposal via Solidity contract..."
    cast send --private-key "$PRIVATE_KEY" \
        "$VOTING_CONTRACT_ADDRESS" \
        "createProposal(string,uint256)" \
        "Test Proposal" 3600
    echo "Proposal created."
    echo ""

    # Test 4: Read proposal
    echo "[Test 4] Read proposal..."
    cast call "$VOTING_CONTRACT_ADDRESS" \
        "getProposal(uint256)(string,uint256,uint256,uint256,bool)" 0
    echo ""
fi

echo "=== Tests Complete ==="
