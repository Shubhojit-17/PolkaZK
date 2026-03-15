/**
 * PolkaZK — Backend API Server
 *
 * Provides REST API endpoints for the PolkaZK DApp:
 *   - GET  /api/health          — Health check
 *   - GET  /api/deployment       — Deployed contract addresses and network info
 *   - GET  /api/proof/demo       — Demo proof data (hex-encoded calldata)
 *   - GET  /api/proof/vectors    — Test vectors for the multiply circuit
 *
 * Usage:
 *   node server.js
 *   # or
 *   npm run dev
 *
 * Environment:
 *   PORT               — Server port (default: 3001)
 *   CORS_ORIGIN        — Allowed CORS origin (default: http://localhost:3000)
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

// ─── Middleware ───────────────────────────────────────────────

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// ─── Helper: Load deployment info ────────────────────────────

function loadDeployment() {
  const networks = ["westend", "local"];

  for (const network of networks) {
    const deployPath = path.join(__dirname, "..", `deployment-${network}.json`);
    if (fs.existsSync(deployPath)) {
      const data = JSON.parse(fs.readFileSync(deployPath, "utf8"));
      return { ...data, source: `deployment-${network}.json` };
    }
  }

  // Fallback to env vars
  return {
    network: "unknown",
    rustVerifier: process.env.RUST_VERIFIER_ADDRESS || null,
    votingContract: process.env.VOTING_CONTRACT_ADDRESS || null,
    rpc: process.env.RPC_URL || "https://westend-asset-hub-eth-rpc.polkadot.io",
    source: "environment",
  };
}

// ─── Helper: Load proof calldata ─────────────────────────────

function loadCalldata() {
  const calldataPath = path.join(__dirname, "..", "test", "circom", "calldata.json");
  if (fs.existsSync(calldataPath)) {
    return JSON.parse(fs.readFileSync(calldataPath, "utf8"));
  }
  return null;
}

// ─── Helper: Load test vectors ───────────────────────────────

function loadTestVectors() {
  const vectorsPath = path.join(__dirname, "..", "test", "circom", "test_vectors.json");
  if (fs.existsSync(vectorsPath)) {
    return JSON.parse(fs.readFileSync(vectorsPath, "utf8"));
  }
  return null;
}

// ─── Routes ──────────────────────────────────────────────────

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "polkazk-backend",
    timestamp: new Date().toISOString(),
  });
});

// Deployment info
app.get("/api/deployment", (_req, res) => {
  const deployment = loadDeployment();
  if (!deployment.rustVerifier && !deployment.votingContract) {
    return res.status(404).json({
      error: "No deployment found",
      hint: "Run: node scripts/deploy.js --network westend",
    });
  }
  res.json(deployment);
});

// Demo proof data
app.get("/api/proof/demo", (_req, res) => {
  const calldata = loadCalldata();
  if (!calldata) {
    return res.status(404).json({
      error: "No proof calldata found",
      hint: "Run: node scripts/generate-proof.js",
    });
  }
  res.json(calldata);
});

// Test vectors
app.get("/api/proof/vectors", (_req, res) => {
  const vectors = loadTestVectors();
  if (!vectors) {
    return res.status(404).json({
      error: "No test vectors found",
      hint: "Run: cd test/circom && node generate_test_vectors.js",
    });
  }
  res.json(vectors);
});

// ─── Start Server ────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  PolkaZK Backend API running on http://localhost:${PORT}`);
  console.log(`  CORS origin: ${CORS_ORIGIN}`);
  console.log(`\n  Endpoints:`);
  console.log(`    GET /api/health       — Health check`);
  console.log(`    GET /api/deployment   — Contract addresses`);
  console.log(`    GET /api/proof/demo   — Demo proof calldata`);
  console.log(`    GET /api/proof/vectors — Test vectors\n`);
});

module.exports = app;
