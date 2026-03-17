# Demo Runbook (Polkadot Solidity Hackathon 2026)

This runbook is optimized for a 3-5 minute live demo.

## Goal
Show a full end-to-end flow for Track 2 (PVM Smart Contracts):
- Solidity contract calling Rust verifier on PolkaVM
- ZK proof verification
- Proposal creation and one-vote-per-wallet governance
- Live vote tally updates

## Prerequisites
- MetaMask installed
- Wallet funded on Westend Asset Hub
- App running locally

## Start Commands
From repository root:

```bash
npm install
cd frontend && npm install
npm run dev
```

Open:
- `http://localhost:3000`

## Fast Demo Script (Time-boxed)

### 1) Architecture framing (30s)
- Show landing page and explain:
  - `PrivateVoting.sol` (Solidity)
  - `rust-verifier` (Rust on PolkaVM)
  - cross-contract call via Ethereum ABI

### 2) Connect and verify (60-90s)
- Connect wallet on Dashboard
- Generate proof (`3 * 7 = 21`) and verify on-chain
- Show verification status and tx hash in activity feed

### 3) Create proposal (30-45s)
- Create a proposal from Dashboard
- Confirm tx in wallet
- Navigate to Proposal page and click Refresh

### 4) Cast YES vote (30-45s)
- Vote YES on proposal #0
- Confirm tx in wallet
- Show:
  - YES count increments
  - selected button highlighted
  - voter locked from voting again on same proposal

### 5) Cast NO vote from second wallet (45-60s)
- Switch wallet account
- Vote NO on same or another proposal
- Confirm:
  - NO count increments
  - NO selection highlighted for second wallet
  - one-vote-per-wallet rule still enforced

### 6) Results and wrap-up (30-45s)
- Go to Results page
- Show aggregate charts and recent activity
- Explain this is built specifically for Track 2 (PVM interoperability)

## Fallback Notes (RPC quirks)
- Westend RPC may not always return contract logs reliably.
- The frontend uses transaction-confirmed fallbacks and local vote persistence to keep UX stable.
- If reads are intermittent, click Refresh and wait 2-3s.

## What Judges Should Observe
- Functional private voting flow
- Solidity-to-Rust cross-contract execution path
- Deterministic one-vote-per-wallet behavior
- Persisted, visible vote state and updated tallies
