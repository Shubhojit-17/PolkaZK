# PolkaZK — ZK-Proof Verifier on Polkadot Hub

**Polkadot Solidity Hackathon 2026 — Track 2: PVM Smart Contracts**

A Groth16 ZK-SNARK verifier written in Rust, compiled to PolkaVM (RISC-V), with a Solidity voting frontend and React DApp — all running on Polkadot Hub via `pallet-revive`.

---

## Hackathon Positioning

This project is built for **Polkadot Solidity Hackathon 2026 - Track 2 (PVM Smart Contracts)**.

### Why this fits Track 2

- **PVM experiments**: Solidity contract (`PrivateVoting.sol`) calls a Rust verifier contract running on PolkaVM.
- **Cross-language interoperability**: Ethereum ABI compatibility across Solidity and Rust (`alloy-core` `sol!`).
- **Production-like dApp**: full governance workflow (proposal creation, private voting, results UI), not a toy contract.

### Bonus fit areas

- Security-first contract flow (nullifier-based double-vote prevention)
- Frontend resiliency for current Westend RPC limitations

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   Polkadot Hub (Westend Asset Hub)            │
│                         pallet-revive                         │
│                                                              │
│  ┌───────────────────────┐     ┌──────────────────────────┐  │
│  │  PrivateVoting.sol     │────▶│   ZkVerifier (Rust)      │  │
│  │  (Solidity → PVM)      │     │   (Rust → PVM)           │  │
│  │                       │ ABI │                          │  │
│  │ • createProposal()    │◀────│ • verify(proof, inputs)  │  │
│  │ • castVote()          │     │ • BN254 curve arithmetic  │  │
│  │ • getProposal()       │     │ • Optimal Ate pairing     │  │
│  │ • getResults()        │     │ • Groth16 equation check  │  │
│  └───────────────────────┘     └──────────────────────────┘  │
│         ▲                              ▲                      │
│         │ Eth-RPC                      │                      │
└─────────┼──────────────────────────────┼──────────────────────┘
          │                              │
    ┌─────┴──────────┐          ┌────────┴──────────┐
    │  React Frontend │          │  Proof Generation  │
    │  (Next.js)      │          │  (Circom + snarkjs) │
    └────────────────┘          └───────────────────┘
```

### Key Innovation

Both contracts compile to **RISC-V bytecode** and run on PolkaVM. The Solidity contract calls the Rust verifier using standard Ethereum ABI encoding (`abi.encodeWithSelector`), proving seamless **cross-language interoperability** on Polkadot. This unlocks ZK-powered privacy primitives for any Solidity DApp on the network.

### Why Rust for ZK Verification?

- **Performance**: Zero-cost abstractions for heavy 256-bit field arithmetic in pairing-based cryptography
- **no_std**: Runs in constrained PolkaVM environment (32KB heap, no standard library)
- **Safety**: Memory-safe BN254 curve arithmetic without undefined behavior
- **Size**: Full Groth16 verifier compiles to ~34KB PVM binary

---

## Project Structure

```
PolkaZX/
├── contracts/
│   ├── rust-verifier/              # Rust ZK Verifier (PVM contract)
│   │   ├── src/
│   │   │   ├── verifier.rs         # Contract entry (deploy/call dispatch)
│   │   │   ├── groth16.rs          # Groth16 verification + serialization
│   │   │   └── bn254/              # Full BN254 curve implementation
│   │   │       ├── fq.rs           # Base field Fp (Montgomery form)
│   │   │       ├── fr.rs           # Scalar field Fr
│   │   │       ├── fq2.rs          # Quadratic extension Fq2
│   │   │       ├── fq6.rs          # Sextic extension Fq6
│   │   │       ├── fq12.rs         # Dodecic extension Fq12 (GT)
│   │   │       ├── frobenius.rs    # Frobenius endomorphism constants
│   │   │       ├── g1.rs           # G1 curve (affine + projective)
│   │   │       ├── g2.rs           # G2 twist (affine + projective)
│   │   │       └── pairing.rs      # Optimal Ate pairing
│   │   ├── build.rs                # PVM build pipeline
│   │   ├── Cargo.toml
│   │   └── ZkVerifier.sol          # ABI interface for sol! macro
│   └── solidity-frontend/
│       └── PrivateVoting.sol        # Voting DApp (cross-contract to Rust)
├── frontend/                        # React DApp (Next.js + ethers.js)
│   └── app/
│       ├── page.tsx                 # Main UI (verify, vote, results)
│       ├── contracts.ts             # ABIs and chain config
│       ├── layout.tsx               # Root layout
│       └── globals.css              # Tailwind styles
├── scripts/
│   ├── deploy.js                    # Deploy both contracts via ethers.js
│   ├── generate-proof.js            # Generate ZK proof with snarkjs
│   └── integration-test.js          # End-to-end test pipeline
├── docs/
│   ├── DEMO_RUNBOOK.md              # 3-5 minute live demo script
│   └── SUBMISSION_CHECKLIST.md      # Final submission checklist
├── test/
│   └── circom/                      # Circom circuit + proof artifacts
│       ├── multiply.circom          # Test circuit (a × b = c)
│       ├── proof.json               # Generated Groth16 proof
│       ├── verification_key.json    # snarkjs verification key
│       ├── calldata.json            # Hex-encoded contract calldata
│       └── *.bin                    # Binary-serialized proof/VK/inputs
├── .env.example                     # Environment config template
├── package.json                     # Root deps (ethers, snarkjs, dotenv)
└── README.md
```

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Rust (nightly) | 2025+ | Compile Rust → RISC-V PVM |
| Node.js | ≥ 18 | Scripts, frontend, proof generation |
| Circom | ≥ 2.2.3 | Compile ZK circuits |
| snarkjs | ≥ 0.7.6 | Groth16 proof generation (via npm) |
| resolc | ≥ 1.0.0 | Compile Solidity → PVM (optional) |

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/<your-org>/PolkaZX.git
cd PolkaZX
npm install               # Root deps (ethers, snarkjs, dotenv)
cd frontend && npm install # Frontend deps
```

### 2. Build Rust Verifier

```bash
cd contracts/rust-verifier
cargo build --release
```

Output: `target/polkazk-verifier.release.polkavm` (~34KB)

### 3. Generate ZK Proof

```bash
# From project root
node scripts/generate-proof.js
```

This generates a Groth16 proof for the test circuit (3 × 7 = 21), verifies it with snarkjs, and creates binary-serialized calldata at `test/circom/calldata.json`.

### 4. Configure Environment

```bash
cp .env.example .env
# Edit .env with your private key and RPC endpoint
```

### 5. Deploy Contracts

```bash
node scripts/deploy.js --network westend
```

Deploys the Rust PVM verifier and the Solidity PrivateVoting contract, linking them together. Saves addresses to `deployment-westend.json`.

### 6. Run Integration Test

```bash
node scripts/integration-test.js --network westend
```

Tests the full flow: verify proof → create proposal → cast vote → check double-vote prevention.

### 7. Start Frontend

```bash
cd frontend
npm run dev
```

Open http://localhost:3000 — connect your wallet, switch to Westend Asset Hub, and interact with the voting DApp.

### 8. Deploy Frontend on Vercel

This project is deployed to Vercel as a frontend-only app.

Use these settings in Vercel:

- Import the GitHub repository.
- Framework preset: Next.js
- Root Directory: `frontend`
- Build Command: `npm run build`
- Install Command: `npm install`

Environment variables to add in Vercel (Production/Preview):

- `NEXT_PUBLIC_RUST_VERIFIER`
- `NEXT_PUBLIC_VOTING_CONTRACT`

Use `frontend/.env.example` as the source template for these values.

Notes:

- Do not set `PRIVATE_KEY` in Vercel for frontend deploys.
- You do not need to deploy a backend service for the current app architecture.

### Demo Shortcuts

```bash
# Prepare proof assets for demo
npm run demo:prep

# Run integration smoke flow on Westend
npm run demo:smoke

# Start frontend for live presentation
npm run demo:frontend
```

---

## How It Works

### End-to-End Flow

```
User generates ZK proof (Circom + snarkjs)
        │
        ▼
React frontend calls PrivateVoting.castVote(...)
        │
        ▼
Solidity contract encodes verify(bytes,bytes) + calls Rust verifier
        │
        ▼
Rust PVM contract:
  1. ABI-decodes proof bytes + public input bytes
  2. Deserializes Groth16 proof (A ∈ G1, B ∈ G2, C ∈ G1)
  3. Deserializes verification key (α, β, γ, δ, IC points)
  4. Computes multi-pairing check over BN254
  5. Returns ABI-encoded bool
        │
        ▼
Solidity records vote if proof valid, rejects duplicates via nullifier
```

### Cross-Contract Call

The Solidity contract calls the Rust verifier via standard `address.call()`:

```solidity
(bool success, bytes memory result) = rustVerifier.call(
    abi.encodeWithSelector(0xVerifySelector, proofBytes, inputBytes)
);
bool verified = abi.decode(result, (bool));
```

Both sides use the same Ethereum ABI encoding — Rust via `alloy-core`'s `sol!` macro, Solidity natively.

### Groth16 Verification Equation

$$e(A, B) = e(\alpha, \beta) \cdot e\!\left(\sum_{i=0}^{l} a_i \cdot L_i,\; \gamma\right) \cdot e(C, \delta)$$

Where:
- $(A, B, C)$ = proof elements
- $(\alpha, \beta, \gamma, \delta)$ = verification key
- $L_i$ = IC points for public input commitment
- $a_i$ = public inputs

### BN254 Field Tower

```
Fq  (256-bit prime field, Montgomery form)
 └─ Fq2  = Fq[u] / (u² + 1)
     └─ Fq6  = Fq2[v] / (v³ - ξ),  ξ = 9 + u
         └─ Fq12 = Fq6[w] / (w² - v)  ← pairing target GT
```

### Binary Serialization Format

| Data | Size | Format |
|------|------|--------|
| Proof | 256 bytes | A(G1: 64B) + B(G2: 128B) + C(G1: 64B) |
| Verification Key | 580 bytes | α(64B) + β(128B) + γ(128B) + δ(128B) + IC count(4B) + IC points(N×64B) |
| Public Inputs | 4 + N×32 bytes | count(4B) + values(N×32B, big-endian) |

---

## Network Configuration

| Parameter | Value |
|-----------|-------|
| Network | Westend Asset Hub |
| Eth-RPC | `https://westend-asset-hub-eth-rpc.polkadot.io` |
| Chain ID | 420420421 |
| Faucet | [Polkadot Faucet](https://faucet.polkadot.io/) |

---

## Contract Interfaces

### ZkVerifier (Rust)

```solidity
interface ZkVerifier {
    function verify(bytes calldata proof, bytes calldata publicInputs)
        external returns (bool);
    event ProofVerified(address indexed caller, bool result);
}
```

### PrivateVoting (Solidity)

```solidity
contract PrivateVoting {
    function createProposal(string desc, uint256 duration) external returns (uint256);
    function castVote(uint256 proposalId, bool vote, bytes proof,
                      bytes publicInputs, bytes32 nullifierHash) external;
    function getProposal(uint256 id) external view returns (...);
    function getResults(uint256 id) external view returns (uint256 forVotes,
                        uint256 againstVotes, uint256 totalVotes, bool ended);
    function setVerifier(address newVerifier) external;  // owner only
}
```

---

## Technical Details

### Storage Layout (Rust Contract)

| Slot | Content | Type |
|------|---------|------|
| 0 | VK hash | bytes32 |
| 1 | Verification count | uint256 |
| 2 | Owner address | address (20 bytes) |

### Dependencies

**Rust contract:**
- `pallet-revive-uapi 0.10` — PolkaVM host function FFI
- `alloy-core 0.8` — Ethereum ABI encoding/decoding via `sol!` macro
- `picoalloc 5` — Minimal no_std heap allocator (32KB)
- `polkavm-derive 0.30.0` — `#[polkavm_export]` for entry points
- `cargo-pvm-contract-builder 0.2.3` — RISC-V → PVM build pipeline

**Frontend:**
- Next.js 14, React 18, ethers.js v6, Tailwind CSS 3.4

**Proof pipeline:**
- Circom 2.2.3, snarkjs 0.7.6 (Groth16 over BN254)

---

## Demo Circuit

The included test circuit (`test/circom/multiply.circom`) proves knowledge of factors:

```
template Multiply() {
    signal input a;
    signal input b;
    signal output c;
    c <== a * b;
}
```

Test case: prover knows $a = 3, b = 7$ such that $c = 21$ (public output).

---

## Security Model

### On-chain protections

- **Nullifier-based replay prevention**: each `(voter secret, proposalId)` nullifier can be used once.
- **Proposal deadline enforcement**: votes rejected after proposal end.
- **Verifier gating**: vote counted only after successful Rust verifier call.

### Frontend protections

- **Per-wallet vote lock**: each wallet can vote only once per proposal in UI flow.
- **Persisted vote state**: vote choice is stored and restored per wallet/account.
- **Session isolation**: proof session is reset on account change to avoid stale-authority leakage.

---

## Known RPC Limitations and Mitigations

Westend Asset Hub EVM RPC currently has partial feature gaps (notably in read/log reliability).

Observed limitations:

- `eth_call` can return `CALL_EXCEPTION`/missing revert data on some contracts.
- `eth_getCode` can return empty code for some deployed addresses.
- Event logs may be incomplete in some receipts.

Mitigations implemented:

- Transaction-confirmed fallback when logs are missing.
- Proposal and vote local cache hydration to preserve UX continuity.
- Transaction-scanning fallback to reconstruct proposal/vote state.
- Explicit UI status messaging for contract/RPC edge cases.

---

## Demo and Submission Assets

- Demo flow script: `docs/DEMO_RUNBOOK.md`
- Submission checklist: `docs/SUBMISSION_CHECKLIST.md`

Recommended judge demo path:

1. Connect wallet and generate/verify proof
2. Create proposal
3. Cast YES vote (wallet A)
4. Cast NO vote (wallet B)
5. Show results and activity updates

---

## Judging Criteria Mapping

- **Technical Excellence**: Rust Groth16 verifier on PolkaVM + Solidity integration + working frontend.
- **Real Product Potential**: private governance and anti-double-vote controls.
- **Ecosystem Alignment**: built for Polkadot Hub using Solidity + PVM interoperability.

---

## License

MIT
