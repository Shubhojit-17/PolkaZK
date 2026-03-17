/**
 * Proof serialization utilities — converts snarkjs JSON proof/VK objects
 * to the binary hex format the Rust PolkaVM verifier expects.
 *
 * Binary formats (all field elements are 32-byte big-endian):
 *   G1 point = x(32) | y(32) = 64 bytes
 *   G2 point = x_c0(32) | x_c1(32) | y_c0(32) | y_c1(32) = 128 bytes
 *
 *   proof_bytes  = pi_a(64) | pi_b(128) | pi_c(64) = 256 bytes
 *   vk_bytes     = alpha_g1(64) | beta_g2(128) | gamma_g2(128) | delta_g2(128) | num_ic(4 BE) | ic[](64 each)
 *   inputs_bytes = num_inputs(4 BE) | input[](32 each)
 */

/** Convert a decimal string to a 32-byte big-endian Uint8Array */
function fieldToBytes32(decimalStr: string): Uint8Array {
  let hex = BigInt(decimalStr).toString(16).padStart(64, "0");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Write a u32 as 4-byte big-endian */
function uint32BE(n: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = (n >>> 24) & 0xff;
  buf[1] = (n >>> 16) & 0xff;
  buf[2] = (n >>> 8) & 0xff;
  buf[3] = n & 0xff;
  return buf;
}

/** Concatenate multiple Uint8Arrays */
function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/** Convert Uint8Array to hex string with 0x prefix */
function toHex(bytes: Uint8Array): string {
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

// ─── snarkjs JSON types ──────────────────────────────────────

interface SnarkjsProof {
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], [string, string]];
  pi_c: [string, string, string];
}

interface SnarkjsVK {
  vk_alpha_1: [string, string, string];
  vk_beta_2: [[string, string], [string, string], [string, string]];
  vk_gamma_2: [[string, string], [string, string], [string, string]];
  vk_delta_2: [[string, string], [string, string], [string, string]];
  IC: [string, string, string][];
}

// ─── Serialization ───────────────────────────────────────────

/** Serialize G1 point [x, y, "1"] → 64 bytes */
function serializeG1(point: [string, string, ...string[]]): Uint8Array {
  return concat(fieldToBytes32(point[0]), fieldToBytes32(point[1]));
}

/** Serialize G2 point [[x_c0, x_c1], [y_c0, y_c1], ...] → 128 bytes */
function serializeG2(
  point: [[string, string], [string, string], ...any[]]
): Uint8Array {
  return concat(
    fieldToBytes32(point[0][0]), // x_c0
    fieldToBytes32(point[0][1]), // x_c1
    fieldToBytes32(point[1][0]), // y_c0
    fieldToBytes32(point[1][1]) // y_c1
  );
}

/**
 * Serialize a Groth16 proof to hex.
 * Output: pi_a(64) | pi_b(128) | pi_c(64) = 256 bytes
 */
export function serializeProofToHex(proof: SnarkjsProof): string {
  const bytes = concat(
    serializeG1(proof.pi_a),
    serializeG2(proof.pi_b),
    serializeG1(proof.pi_c)
  );
  return toHex(bytes);
}

/**
 * Serialize a verification key to hex.
 * Output: alpha_g1(64) | beta_g2(128) | gamma_g2(128) | delta_g2(128) | num_ic(4) | ic[](64 each)
 */
export function serializeVKToHex(vk: SnarkjsVK): string {
  const parts: Uint8Array[] = [
    serializeG1(vk.vk_alpha_1),
    serializeG2(vk.vk_beta_2),
    serializeG2(vk.vk_gamma_2),
    serializeG2(vk.vk_delta_2),
    uint32BE(vk.IC.length),
  ];
  for (const ic of vk.IC) {
    parts.push(serializeG1(ic));
  }
  return toHex(concat(...parts));
}

/**
 * Serialize public signals to hex.
 * Output: num_inputs(4 BE) | input[](32 each)
 */
export function serializePublicInputsToHex(publicSignals: string[]): string {
  const parts: Uint8Array[] = [uint32BE(publicSignals.length)];
  for (const sig of publicSignals) {
    parts.push(fieldToBytes32(sig));
  }
  return toHex(concat(...parts));
}
