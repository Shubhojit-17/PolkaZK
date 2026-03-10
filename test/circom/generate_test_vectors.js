/// Script to convert snarkjs proof and verification key to hex-encoded test vectors.
/// Run with: node generate_test_vectors.js
/// Outputs: test_vectors.json with all values as 0x-prefixed hex strings (32 bytes each)

const fs = require('fs');
const proof = JSON.parse(fs.readFileSync('proof.json', 'utf8'));
const vk = JSON.parse(fs.readFileSync('verification_key.json', 'utf8'));
const pub_signals = JSON.parse(fs.readFileSync('public.json', 'utf8'));

function decToHex32(dec) {
    return '0x' + BigInt(dec).toString(16).padStart(64, '0');
}

const testVectors = {
    proof: {
        pi_a: {
            x: decToHex32(proof.pi_a[0]),
            y: decToHex32(proof.pi_a[1]),
        },
        pi_b: {
            x_c0: decToHex32(proof.pi_b[0][0]),
            x_c1: decToHex32(proof.pi_b[0][1]),
            y_c0: decToHex32(proof.pi_b[1][0]),
            y_c1: decToHex32(proof.pi_b[1][1]),
        },
        pi_c: {
            x: decToHex32(proof.pi_c[0]),
            y: decToHex32(proof.pi_c[1]),
        },
    },
    verification_key: {
        alpha_g1: {
            x: decToHex32(vk.vk_alpha_1[0]),
            y: decToHex32(vk.vk_alpha_1[1]),
        },
        beta_g2: {
            x_c0: decToHex32(vk.vk_beta_2[0][0]),
            x_c1: decToHex32(vk.vk_beta_2[0][1]),
            y_c0: decToHex32(vk.vk_beta_2[1][0]),
            y_c1: decToHex32(vk.vk_beta_2[1][1]),
        },
        gamma_g2: {
            x_c0: decToHex32(vk.vk_gamma_2[0][0]),
            x_c1: decToHex32(vk.vk_gamma_2[0][1]),
            y_c0: decToHex32(vk.vk_gamma_2[1][0]),
            y_c1: decToHex32(vk.vk_gamma_2[1][1]),
        },
        delta_g2: {
            x_c0: decToHex32(vk.vk_delta_2[0][0]),
            x_c1: decToHex32(vk.vk_delta_2[0][1]),
            y_c0: decToHex32(vk.vk_delta_2[1][0]),
            y_c1: decToHex32(vk.vk_delta_2[1][1]),
        },
        ic: vk.IC.map(p => ({
            x: decToHex32(p[0]),
            y: decToHex32(p[1]),
        })),
    },
    public_inputs: pub_signals.map(s => decToHex32(s)),
};

// Also output as a flat byte array for the Rust test
// Format: proof_a(64) | proof_b(128) | proof_c(64) | vk_alpha(64) | vk_beta(128) | vk_gamma(128) | vk_delta(128) | num_ic(4) | ic[0..](64 each) | num_inputs(4) | inputs[0..](32 each)

function hexToBytes(hex) {
    // Remove 0x prefix
    const h = hex.startsWith('0x') ? hex.slice(2) : hex;
    return Buffer.from(h, 'hex');
}

const parts = [];

// Proof A (G1: x, y - each 32 bytes)
parts.push(hexToBytes(testVectors.proof.pi_a.x));
parts.push(hexToBytes(testVectors.proof.pi_a.y));

// Proof B (G2: x.c0, x.c1, y.c0, y.c1 - each 32 bytes)
parts.push(hexToBytes(testVectors.proof.pi_b.x_c0));
parts.push(hexToBytes(testVectors.proof.pi_b.x_c1));
parts.push(hexToBytes(testVectors.proof.pi_b.y_c0));
parts.push(hexToBytes(testVectors.proof.pi_b.y_c1));

// Proof C (G1: x, y - each 32 bytes)
parts.push(hexToBytes(testVectors.proof.pi_c.x));
parts.push(hexToBytes(testVectors.proof.pi_c.y));

const proofBytes = Buffer.concat(parts);

const vkParts = [];
// VK alpha (G1)
vkParts.push(hexToBytes(testVectors.verification_key.alpha_g1.x));
vkParts.push(hexToBytes(testVectors.verification_key.alpha_g1.y));

// VK beta (G2)
vkParts.push(hexToBytes(testVectors.verification_key.beta_g2.x_c0));
vkParts.push(hexToBytes(testVectors.verification_key.beta_g2.x_c1));
vkParts.push(hexToBytes(testVectors.verification_key.beta_g2.y_c0));
vkParts.push(hexToBytes(testVectors.verification_key.beta_g2.y_c1));

// VK gamma (G2)
vkParts.push(hexToBytes(testVectors.verification_key.gamma_g2.x_c0));
vkParts.push(hexToBytes(testVectors.verification_key.gamma_g2.x_c1));
vkParts.push(hexToBytes(testVectors.verification_key.gamma_g2.y_c0));
vkParts.push(hexToBytes(testVectors.verification_key.gamma_g2.y_c1));

// VK delta (G2)
vkParts.push(hexToBytes(testVectors.verification_key.delta_g2.x_c0));
vkParts.push(hexToBytes(testVectors.verification_key.delta_g2.x_c1));
vkParts.push(hexToBytes(testVectors.verification_key.delta_g2.y_c0));
vkParts.push(hexToBytes(testVectors.verification_key.delta_g2.y_c1));

// Number of IC points
const numIc = Buffer.alloc(4);
numIc.writeUInt32BE(testVectors.verification_key.ic.length);
vkParts.push(numIc);

// IC points
for (const ic of testVectors.verification_key.ic) {
    vkParts.push(hexToBytes(ic.x));
    vkParts.push(hexToBytes(ic.y));
}

const vkBytes = Buffer.concat(vkParts);

// Public inputs
const inputParts = [];
const numInputs = Buffer.alloc(4);
numInputs.writeUInt32BE(testVectors.public_inputs.length);
inputParts.push(numInputs);
for (const inp of testVectors.public_inputs) {
    inputParts.push(hexToBytes(inp));
}
const inputBytes = Buffer.concat(inputParts);

// Write JSON
fs.writeFileSync('test_vectors.json', JSON.stringify(testVectors, null, 2));

// Write hex arrays for Rust (easier to embed)
console.log('=== PROOF BYTES (hex) ===');
console.log(proofBytes.toString('hex'));
console.log('=== VK BYTES (hex) ===');
console.log(vkBytes.toString('hex'));
console.log('=== INPUT BYTES (hex) ===');
console.log(inputBytes.toString('hex'));
console.log('\nTotal proof bytes:', proofBytes.length);
console.log('Total vk bytes:', vkBytes.length);
console.log('Total input bytes:', inputBytes.length);

// Also write raw binary files
fs.writeFileSync('proof.bin', proofBytes);
fs.writeFileSync('vk.bin', vkBytes);
fs.writeFileSync('inputs.bin', inputBytes);

console.log('\nBinary files written: proof.bin, vk.bin, inputs.bin');
console.log('\nTest vectors written to test_vectors.json');
