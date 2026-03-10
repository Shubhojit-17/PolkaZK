/**
 * PolkaZK — Proof Generation Pipeline
 *
 * Generates a Groth16 proof using snarkjs and serializes it into the binary
 * format expected by the Rust verifier contract.
 *
 * Binary format:
 *   proof_bytes  = pi_a(64) | pi_b(128) | pi_c(64) = 256 bytes
 *   vk_bytes     = alpha_g1(64) | beta_g2(128) | gamma_g2(128) | delta_g2(128) | num_ic(4) | ic[](64 each)
 *   inputs_bytes = num_inputs(4) | input[](32 each)
 *
 * G1 point = x(32 BE) | y(32 BE) = 64 bytes
 * G2 point = x_c0(32 BE) | x_c1(32 BE) | y_c0(32 BE) | y_c1(32 BE) = 128 bytes
 *
 * Usage:
 *   node scripts/generate-proof.js [--input a,b,c]
 *
 * Default input: a=3, b=7, c=21
 */

const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const CIRCOM_DIR = path.join(__dirname, "..", "test", "circom");
const OUTPUT_DIR = path.join(__dirname, "..", "test", "circom");

/**
 * Convert a decimal string to a 32-byte big-endian hex buffer
 */
function fieldToBytes32(decimalStr) {
  let hex = BigInt(decimalStr).toString(16);
  hex = hex.padStart(64, "0");
  return Buffer.from(hex, "hex");
}

/**
 * Serialize a G1 affine point (x, y) as 64 bytes
 * snarkjs G1 format: [x, y, "1"] as decimal strings
 */
function serializeG1(point) {
  const buf = Buffer.alloc(64);
  fieldToBytes32(point[0]).copy(buf, 0);
  fieldToBytes32(point[1]).copy(buf, 32);
  return buf;
}

/**
 * Serialize a G2 affine point as 128 bytes
 * snarkjs G2 format: [[x_c0, x_c1], [y_c0, y_c1], ["1","0"]]
 * Note: snarkjs uses [c0, c1] ordering
 */
function serializeG2(point) {
  const buf = Buffer.alloc(128);
  fieldToBytes32(point[0][0]).copy(buf, 0);   // x_c0
  fieldToBytes32(point[0][1]).copy(buf, 32);  // x_c1
  fieldToBytes32(point[1][0]).copy(buf, 64);  // y_c0
  fieldToBytes32(point[1][1]).copy(buf, 96);  // y_c1
  return buf;
}

/**
 * Serialize a Groth16 proof to binary
 * Format: pi_a(64) | pi_b(128) | pi_c(64) = 256 bytes
 */
function serializeProof(proof) {
  return Buffer.concat([
    serializeG1(proof.pi_a),
    serializeG2(proof.pi_b),
    serializeG1(proof.pi_c),
  ]);
}

/**
 * Serialize a verification key to binary
 * Format: alpha_g1(64) | beta_g2(128) | gamma_g2(128) | delta_g2(128) | num_ic(4) | ic[](64 each)
 */
function serializeVK(vk) {
  const parts = [
    serializeG1(vk.vk_alpha_1),
    serializeG2(vk.vk_beta_2),
    serializeG2(vk.vk_gamma_2),
    serializeG2(vk.vk_delta_2),
  ];

  // num_ic as big-endian u32
  const numIcBuf = Buffer.alloc(4);
  numIcBuf.writeUInt32BE(vk.IC.length);
  parts.push(numIcBuf);

  for (const ic of vk.IC) {
    parts.push(serializeG1(ic));
  }

  return Buffer.concat(parts);
}

/**
 * Serialize public inputs to binary
 * Format: num_inputs(4 BE) | input[](32 each)
 */
function serializePublicInputs(publicSignals) {
  const numBuf = Buffer.alloc(4);
  numBuf.writeUInt32BE(publicSignals.length);

  const parts = [numBuf];
  for (const sig of publicSignals) {
    parts.push(fieldToBytes32(sig));
  }

  return Buffer.concat(parts);
}

async function main() {
  console.log("=== PolkaZK Proof Generation Pipeline ===\n");

  // Parse CLI args
  let a = 3n, b = 7n, c = 21n;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) {
      const parts = args[i + 1].split(",");
      a = BigInt(parts[0]);
      b = BigInt(parts[1]);
      c = BigInt(parts[2]);
    }
  }

  // Verify a * b === c
  if (a * b !== c) {
    console.error(`Error: ${a} * ${b} !== ${c}`);
    process.exit(1);
  }

  console.log(`Circuit: multiply(a, b) -> c`);
  console.log(`Inputs: a=${a}, b=${b}, c=${c}`);
  console.log(`Public output: c=${c}\n`);

  // Paths
  const wasmPath = path.join(CIRCOM_DIR, "multiply_js", "multiply.wasm");
  const zkeyPath = path.join(CIRCOM_DIR, "multiply_final.zkey");
  const vkPath = path.join(CIRCOM_DIR, "verification_key.json");

  // Check files exist
  for (const f of [wasmPath, zkeyPath, vkPath]) {
    if (!fs.existsSync(f)) {
      console.error(`Missing: ${f}`);
      console.error("Run the circom setup first (see test/circom/)");
      process.exit(1);
    }
  }

  // 1. Generate witness and proof
  console.log("[1/4] Generating witness...");
  const input = { a: a.toString(), b: b.toString(), c: c.toString() };
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasmPath,
    zkeyPath
  );

  console.log("[2/4] Proof generated.");
  console.log(`  Public signals: [${publicSignals.join(", ")}]`);

  // 2. Verify locally with snarkjs
  console.log("[3/4] Verifying proof locally with snarkjs...");
  const vk = JSON.parse(fs.readFileSync(vkPath, "utf8"));
  const valid = await snarkjs.groth16.verify(vk, publicSignals, proof);
  console.log(`  snarkjs verification: ${valid ? "PASS" : "FAIL"}`);

  if (!valid) {
    console.error("ERROR: Proof failed snarkjs verification!");
    process.exit(1);
  }

  // 3. Serialize to binary
  console.log("[4/4] Serializing to binary format...\n");

  const proofBytes = serializeProof(proof);
  const vkBytes = serializeVK(vk);
  const inputBytes = serializePublicInputs(publicSignals);

  // Write binary files
  fs.writeFileSync(path.join(OUTPUT_DIR, "proof.bin"), proofBytes);
  fs.writeFileSync(path.join(OUTPUT_DIR, "vk.bin"), vkBytes);
  fs.writeFileSync(path.join(OUTPUT_DIR, "inputs.bin"), inputBytes);

  console.log(`Proof binary:  ${proofBytes.length} bytes -> test/circom/proof.bin`);
  console.log(`VK binary:     ${vkBytes.length} bytes -> test/circom/vk.bin`);
  console.log(`Inputs binary: ${inputBytes.length} bytes -> test/circom/inputs.bin`);

  // Write JSON for reference
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "proof.json"),
    JSON.stringify(proof, null, 2)
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "public.json"),
    JSON.stringify(publicSignals, null, 2)
  );

  // 4. Generate hex calldata for Solidity
  // proof_bytes = proof.bin appended with vk.bin
  const combinedProofBytes = Buffer.concat([proofBytes, vkBytes]);
  console.log(`\nCombined (proof+vk): ${combinedProofBytes.length} bytes`);
  console.log(`\nHex calldata for contract:`);
  console.log(`  proof_hex: 0x${combinedProofBytes.toString("hex")}`);
  console.log(`  inputs_hex: 0x${inputBytes.toString("hex")}`);

  // Save calldata JSON for the deployment/test scripts
  const calldata = {
    proof_hex: "0x" + combinedProofBytes.toString("hex"),
    inputs_hex: "0x" + inputBytes.toString("hex"),
    proof_length: combinedProofBytes.length,
    inputs_length: inputBytes.length,
    public_signals: publicSignals,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "calldata.json"),
    JSON.stringify(calldata, null, 2)
  );
  console.log(`\nCalldata saved to test/circom/calldata.json`);

  console.log("\n=== Proof Generation Complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
