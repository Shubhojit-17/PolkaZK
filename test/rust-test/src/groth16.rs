/// Groth16 ZK-SNARK verifier for BN254
///
/// Groth16 verification equation:
///   e(A, B) = e(alpha, beta) * e(sum(public_input_i * L_i), gamma) * e(C, delta)
///
/// Where:
///   A, B, C are proof elements
///   alpha, beta, gamma, delta are verification key elements
///   L_i are verification key points for public inputs
///   public_input_i are the public inputs

use super::bn254::fq::Fq;
use super::bn254::fr::Fr;
use super::bn254::g1::{G1Affine, G1Projective};
use super::bn254::g2::G2Affine;
use super::bn254::pairing;

/// Groth16 Proof: three curve points
#[derive(Clone, Debug)]
pub struct Proof {
    pub a: G1Affine,   // G1 point
    pub b: G2Affine,   // G2 point
    pub c: G1Affine,   // G1 point
}

/// Groth16 Verification Key
#[derive(Clone, Debug)]
pub struct VerificationKey {
    pub alpha_g1: G1Affine,     // alpha * G1
    pub beta_g2: G2Affine,      // beta * G2
    pub gamma_g2: G2Affine,     // gamma * G2
    pub delta_g2: G2Affine,     // delta * G2
    pub ic: alloc::vec::Vec<G1Affine>,  // [beta * A_i + alpha * B_i + C_i]_{G1} for i = 0..l
}

/// Verify a Groth16 proof
///
/// The verification equation:
///   e(A, B) = e(alpha, beta) * e(L, gamma) * e(C, delta)
///
/// Rearranged as a multi-pairing check:
///   e(-A, B) * e(alpha, beta) * e(L, gamma) * e(C, delta) = 1
///
/// Where L = IC[0] + sum(public_inputs[i] * IC[i+1])
pub fn verify(
    vk: &VerificationKey,
    proof: &Proof,
    public_inputs: &[Fr],
) -> bool {
    // Check: number of public inputs matches IC length - 1
    if public_inputs.len() + 1 != vk.ic.len() {
        return false;
    }

    // Compute L = IC[0] + sum(public_inputs[i] * IC[i+1])
    let mut acc = vk.ic[0].to_projective();

    for (i, input) in public_inputs.iter().enumerate() {
        if !input.is_zero() {
            let point = vk.ic[i + 1].to_projective();
            let scaled = point.scalar_mul(&input.0);
            acc = acc.add_projective(&scaled);
        }
    }

    let l = acc.to_affine();

    // Multi-pairing check:
    // e(-A, B) * e(alpha, beta) * e(L, gamma) * e(C, delta) == 1
    let neg_a = proof.a.neg();

    let pairs = [
        (neg_a, proof.b),
        (vk.alpha_g1, vk.beta_g2),
        (l, vk.gamma_g2),
        (proof.c, vk.delta_g2),
    ];

    pairing::pairing_check(&pairs)
}

/// Deserialize a proof from bytes
/// Format: A (64 bytes G1) | B (128 bytes G2) | C (64 bytes G1)
/// Total: 256 bytes
pub fn deserialize_proof(bytes: &[u8]) -> Option<Proof> {
    if bytes.len() < 256 {
        return None;
    }

    let a = G1Affine::from_bytes(&bytes[0..64])?;
    let b = G2Affine::from_bytes(&bytes[64..192])?;
    let c = G1Affine::from_bytes(&bytes[192..256])?;

    Some(Proof { a, b, c })
}

/// Deserialize a verification key from bytes
/// Format: alpha_g1 (64) | beta_g2 (128) | gamma_g2 (128) | delta_g2 (128) | num_ic (4) | ic[0..n] (64 each)
pub fn deserialize_vk(bytes: &[u8]) -> Option<VerificationKey> {
    if bytes.len() < 452 {
        // Minimum: 64 + 128 + 128 + 128 + 4 = 452 bytes
        return None;
    }

    let alpha_g1 = G1Affine::from_bytes(&bytes[0..64])?;
    let beta_g2 = G2Affine::from_bytes(&bytes[64..192])?;
    let gamma_g2 = G2Affine::from_bytes(&bytes[192..320])?;
    let delta_g2 = G2Affine::from_bytes(&bytes[320..448])?;

    let num_ic = u32::from_be_bytes(bytes[448..452].try_into().ok()?) as usize;

    let expected_len = 452 + num_ic * 64;
    if bytes.len() < expected_len {
        return None;
    }

    let mut ic = alloc::vec::Vec::with_capacity(num_ic);
    for i in 0..num_ic {
        let offset = 452 + i * 64;
        let point = G1Affine::from_bytes(&bytes[offset..offset + 64])?;
        ic.push(point);
    }

    Some(VerificationKey {
        alpha_g1,
        beta_g2,
        gamma_g2,
        delta_g2,
        ic,
    })
}

/// Deserialize public inputs from bytes
/// Format: num_inputs (4 bytes) | input[0..n] (32 bytes each, big-endian Fr elements)
pub fn deserialize_public_inputs(bytes: &[u8]) -> Option<alloc::vec::Vec<Fr>> {
    if bytes.len() < 4 {
        return None;
    }

    let num_inputs = u32::from_be_bytes(bytes[0..4].try_into().ok()?) as usize;
    let expected_len = 4 + num_inputs * 32;

    if bytes.len() < expected_len {
        return None;
    }

    let mut inputs = alloc::vec::Vec::with_capacity(num_inputs);
    for i in 0..num_inputs {
        let offset = 4 + i * 32;
        let bytes_arr: [u8; 32] = bytes[offset..offset + 32].try_into().ok()?;
        inputs.push(Fr::from_bytes_be(&bytes_arr));
    }

    Some(inputs)
}
