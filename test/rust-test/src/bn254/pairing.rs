/// BN254 optimal Ate pairing implementation
/// e: G1 x G2 -> GT (subset of Fq12*)
///
/// The pairing consists of two steps:
/// 1. Miller loop: computes f_{6x+2, Q}(P) with Frobenius corrections
/// 2. Final exponentiation: f^{(q^12 - 1)/r}
///
/// For BN254, the parameter x = 4965661367071055936 (the BN parameter)
///
/// Reference: Algorithm 1 in "High-Speed Software Implementation of the
/// Optimal Ate Pairing over Barreto-Naehrig Curves" by Beuchat et al.
/// Also: arkworks-rs bn254 pairing implementation.

use super::fq::Fq;
use super::fq2::Fq2;
use super::fq12::{self, Fq12};
use super::g1::G1Affine;
use super::g2::{G2Affine, G2Projective};

/// BN254 curve parameter x (also called u)
/// x = 4965661367192848881 = 0x44E992B44A6909F1
/// This is the standard BN254 parameter from arkworks/gnark.
const BN_X: u64 = 0x44E992B44A6909F1;

/// Whether BN_X is negative (for BN254 it is positive)
const BN_X_IS_NEGATIVE: bool = false;

/// Precomputed line evaluation coefficients for a single G2 point
#[derive(Clone, Copy, Debug)]
struct EllCoeffs {
    ell_0: Fq2,
    ell_vw: Fq2,
    ell_vv: Fq2,
}

/// Compute the optimal Ate pairing e(P, Q)
/// Returns an element in Fq12 (GT)
pub fn pairing(p: &G1Affine, q: &G2Affine) -> Fq12 {
    if p.is_identity() || q.is_identity() {
        return fq12::ONE;
    }

    let f = miller_loop(p, q);
    final_exponentiation(&f)
}

/// Compute the product of Miller loops for multiple pairs,
/// then apply final exponentiation.
/// Used in Groth16 verification: e(a1,b1) * e(a2,b2) * ... = 1
pub fn multi_pairing(pairs: &[(G1Affine, G2Affine)]) -> Fq12 {
    let mut f = fq12::ONE;

    for (p, q) in pairs {
        if p.is_identity() || q.is_identity() {
            continue;
        }
        let ml = miller_loop(p, q);
        f = f.mul(&ml);
    }

    final_exponentiation(&f)
}

/// Check that a product of pairings equals one
pub fn pairing_check(pairs: &[(G1Affine, G2Affine)]) -> bool {
    let result = multi_pairing(pairs);
    result.is_one()
}

/// Miller loop for the optimal Ate pairing on BN254
///
/// Computes f_{6x+2, Q}(P) followed by Q1 and Q2 Frobenius corrections.
///
/// The loop iterates over the bits of |6x+2| from MSB to LSB.
/// At each step:
///   - Square f and apply doubling line
///   - If bit is 1, multiply by addition line
/// After the loop, apply two Frobenius correction lines.
fn miller_loop(p: &G1Affine, q: &G2Affine) -> Fq12 {
    let mut f = fq12::ONE;
    let mut r = q.to_projective();

    // Precompute P coordinates as Fq elements for line evaluation
    let px = p.x;
    let py = p.y;

    // 6x + 2 for BN254
    // BN_X = 0x44E992B44A6909F1
    // 6 * BN_X = 0x19BC7ED59DDB67B60 (65 bits)
    // 6 * BN_X + 2 = 0x19BC7ED59DDB67B62
    // We iterate over bits of this value from MSB-1 down to bit 0.
    //
    // Use the NAF-like representation from the BN parameter.
    // For simplicity and correctness, iterate binary.
    let six_x_plus_2: u128 = 6u128 * (BN_X as u128) + 2;

    let nbits = 128 - six_x_plus_2.leading_zeros();

    // Iterate from second-highest bit down to bit 0
    for i in (0..nbits - 1).rev() {
        f = f.square();

        // Doubling step: compute line and update R = 2R
        let coeffs = doubling_step(&mut r);
        ell(&mut f, &coeffs, &px, &py);

        let bit = ((six_x_plus_2 >> i) & 1) == 1;
        if bit {
            // Addition step: compute line for R + Q and update R = R + Q
            let coeffs = addition_step(&mut r, q);
            ell(&mut f, &coeffs, &px, &py);
        }
    }

    if BN_X_IS_NEGATIVE {
        f = f.conjugate();
        r = G2Projective {
            x: r.x,
            y: r.y.neg(),
            z: r.z,
        };
    }

    // Frobenius corrections: Q1 = pi_q(Q), Q2 = pi_q^2(Q)
    // These are the "correction lines" specific to BN curves.
    let q1 = g2_frobenius(q, 1);
    let q2_neg = g2_frobenius(q, 2).neg();

    // Line for R + Q1
    let coeffs = addition_step(&mut r, &q1);
    ell(&mut f, &coeffs, &px, &py);

    // Line for R + (-Q2)
    let coeffs = addition_step(&mut r, &q2_neg);
    ell(&mut f, &coeffs, &px, &py);

    f
}

/// Apply a line evaluation to an Fq12 accumulator.
///
/// The line has three non-zero Fq2 coefficients, placed sparsely in Fq12:
///   l = ell_0 + ell_vv * (w) + ell_vw * (v*w)
///
/// In our Fq12 = Fq6[w]/(w^2-v) representation:
///   l = Fq12( Fq6(ell_0, 0, 0), Fq6(ell_vw, ell_vv, 0) )
///
/// But we scale by P's coordinates:
///   ell_vv *= p.x  (the "twist" of the line by P)
///   ell_vw *= p.y
fn ell(f: &mut Fq12, coeffs: &EllCoeffs, px: &Fq, py: &Fq) {
    let c0 = coeffs.ell_0;
    let c1 = coeffs.ell_vv.scale(px);
    let c2 = coeffs.ell_vw.scale(py);

    // Sparse mul: f *= line element
    // line = Fq12(Fq6(c0, 0, 0), Fq6(c2, c1, 0))
    *f = f.mul_by_034(&c0, &c2, &c1);
}

/// Doubling step: compute the line evaluation for 2*R and update R <- 2*R
/// Returns the three line coefficients (ell_0, ell_vw, ell_vv)
///
/// Reference: "Implementing Cryptographic Pairings over Barreto-Naehrig Curves"
/// Algorithm 26 / arkworks bn254 doubling step
fn doubling_step(r: &mut G2Projective) -> EllCoeffs {
    // tmp0 = Rx^2
    let tmp0 = r.x.square();
    // tmp1 = Ry^2
    let tmp1 = r.y.square();
    // tmp2 = Ry^4 = tmp1^2
    let tmp2 = tmp1.square();

    // tmp3 = (Rx + Ry^2)^2 - Rx^2 - Ry^4 = 2 * Rx * Ry^2
    let tmp3 = r.x.add(&tmp1).square().sub(&tmp0).sub(&tmp2);
    // tmp3 = 4 * Rx * Ry^2 (= S in the EFD doubling formulas)
    let tmp3 = tmp3.double();

    // tmp4 = 3 * Rx^2 (coefficient for tangent line; a=0 for BN254)
    let tmp4 = tmp0.add(&tmp0).add(&tmp0);

    // tmp6 = Rx + tmp4
    let tmp6 = r.x.add(&tmp4);

    // tmp5 = tmp4^2
    let tmp5 = tmp4.square();

    // new_x = tmp5 - 2*tmp3
    let new_x = tmp5.sub(&tmp3).sub(&tmp3);

    // new_z = (Ry + Rz)^2 - Ry^2 - Rz^2 = 2*Ry*Rz
    let new_z = r.y.add(&r.z).square().sub(&tmp1).sub(&r.z.square());

    // new_y = (tmp3 - new_x) * tmp4 - 8*Ry^4
    let tmp2_x8 = tmp2.double().double().double();
    let new_y = tmp3.sub(&new_x).mul(&tmp4).sub(&tmp2_x8);

    // Line coefficients
    // ell_0   = 3*Rx^2 * Rx - 2*Ry^2  (but we use: tmp6^2 - tmp0 - tmp5 - 4*tmp2 ... )
    // More precisely following the standard:
    // ell_0   = xi * (3*xR^2 * Rz^2) ... no, let's use standard formulas directly.

    // Following gnark/arkworks BN254:
    // ell_vv = -tmp4 (i.e., -3*Rx^2) — this gets multiplied by P.x later
    let ell_vv = tmp4.neg();

    // ell_vw = new_z (i.e., 2*Ry*Rz) — this gets multiplied by P.y later
    let ell_vw = new_z;

    // ell_0 = xi * (tmp6^2 - tmp0 - tmp5 - 4*tmp1)
    let ell_0 = tmp6.square().sub(&tmp0).sub(&tmp5).sub(&tmp1.double().double()).mul_by_nonresidue();

    r.x = new_x;
    r.y = new_y;
    r.z = new_z;

    EllCoeffs { ell_0, ell_vw, ell_vv }
}

/// Addition step: compute line evaluation for R + Q and update R <- R + Q
/// Q is in affine coordinates.
///
/// Reference: Algorithm 27 from Beuchat et al. / arkworks bn254
fn addition_step(r: &mut G2Projective, q: &G2Affine) -> EllCoeffs {
    // tmp0 = Ry - Qy * Rz  ^--- no, standard chord computation
    // Actually: lambda = (Ry - Qy*Rz^2*Rz) / (Rx - Qx*Rz^2)

    // theta = Ry - Qy * Rz^3
    let rz2 = r.z.square();
    let u = q.y.mul(&r.z).mul(&rz2);
    let theta = r.y.sub(&u);

    // lambda = Rx - Qx * Rz^2
    let t = q.x.mul(&rz2);
    let lambda = r.x.sub(&t);

    // ell_0 = xi * (theta * Qx - lambda * Qy)
    let ell_0 = theta.mul(&q.x).sub(&lambda.mul(&q.y)).mul_by_nonresidue();

    // ell_vv: -theta (to be multiplied by P.x)
    let ell_vv = theta.neg();

    // ell_vw: lambda (to be multiplied by P.y)
    let ell_vw = lambda;

    // Update R = R + Q using the computed lambda & theta
    let lambda2 = lambda.square();
    let lambda3 = lambda2.mul(&lambda);
    let t = r.x.mul(&lambda2); // Rx * lambda^2

    // new_x = theta^2 * Rz^2 - lambda^3 - 2*Rx*lambda^2
    // Wait, standard projective addition:
    //   new_x = theta^2 * rz2 - lambda^3 - 2*t
    let new_x = theta.square().mul(&rz2).sub(&lambda3).sub(&t.double());

    // new_y = theta * (t - new_x) - Ry * lambda^3
    let new_y = theta.mul(&t.sub(&new_x)).sub(&r.y.mul(&lambda3));

    // new_z = lambda * Rz
    let new_z = lambda.mul(&r.z);

    r.x = new_x;
    r.y = new_y;
    r.z = new_z;

    EllCoeffs { ell_0, ell_vw, ell_vv }
}

/// Apply the q-th power Frobenius endomorphism to a G2 affine point.
///
/// For a BN254 G2 point (x, y) in the sextic twist, the Frobenius is:
///   pi_q(x, y) = (frob(x) * gamma_x, frob(y) * gamma_y)
///
/// where gamma_x = xi^{(q-1)/3} and gamma_y = xi^{(q-1)/2}
/// and frob means the Fq2 Frobenius (conjugation).
///
/// For pi_q^2: use gamma_x^2 and gamma_y^2 with the q^2 Frobenius on Fq2.
fn g2_frobenius(q: &G2Affine, power: usize) -> G2Affine {
    if q.is_identity() {
        return *q;
    }

    match power {
        1 => {
            // Frobenius once: conjugate coordinates, multiply by twist Frobenius coefficients
            // gamma_x = xi^{(q-1)/3}
            let gamma_x = super::frobenius::frob_coeff_fq6_c1_1();
            // gamma_y = xi^{(q-1)/2}
            // xi^{(q-1)/2} = xi^{(q-1)/6} * xi^{(q-1)/3} ... or compute directly
            // Actually gamma_y = xi^{(q-1)/2}. We can compute this as well.
            // For BN254: xi^{(q-1)/2} is a known constant.
            // It equals frob_coeff_fq12_1 * frob_coeff_fq6_c1_1.
            // But more directly, we know from the arkworks source:
            // TWIST_MUL_BY_Q_X = xi^{(q-1)/3}
            // TWIST_MUL_BY_Q_Y = xi^{(q-1)/2}
            let gamma_y = twist_mul_by_q_y();

            let new_x = q.x.conjugate().mul(&gamma_x);
            let new_y = q.y.conjugate().mul(&gamma_y);

            G2Affine { x: new_x, y: new_y, infinity: false }
        }
        2 => {
            // Frobenius twice: conjugate^2 = identity on Fq2, multiply by gamma^2
            // xi^{2(q-1)/3}
            let gamma_x2 = super::frobenius::frob_coeff_fq6_c1_2();
            // xi^{(q^2-1)/2} = xi^{(q-1)/2 * (q+1)} -- simplification needed
            // For the q^2 twist: new_x = x * xi^{2(q-1)/3}, new_y = -y * xi^{(q^2-1)/2}
            // From arkworks: the q^2 Frobenius on the twist gives (x * wq2x, y * wq2y)
            // wq2x = xi^{(q^2-1)/3} = xi^{2(q-1)/3} (since xi^{(q^2-1)/3} = (xi^{(q-1)/3})^{q+1} but for BN curves xi^{(q^2-1)/3} is real)
            // wq2y is -1 for the standard BN254 twist.
            // Actually: for BN254, pi_q^2(x,y) = (x * xi^{2(q-1)/3}, -y)
            let new_x = q.x.mul(&gamma_x2);
            let new_y = q.y.neg();

            G2Affine { x: new_x, y: new_y, infinity: false }
        }
        _ => {
            let mut result = *q;
            for _ in 0..power {
                result = g2_frobenius(&result, 1);
            }
            result
        }
    }
}

/// xi^{(q-1)/2} — the twist Frobenius coefficient for y-coordinate
/// This is a precomputed constant for BN254.
fn twist_mul_by_q_y() -> Fq2 {
    Fq2::new(
        Fq::from_raw([
            0x46DF998D88E5FE70,
            0xCA3B69B4EF971D28,
            0x4E22B1AC3006A3B6,
            0x12C8C04BA1117041,
        ]),
        Fq::from_raw([
            0x8BEDE0765B69F0A3,
            0xC8FE4E1EBB0CF9F2,
            0x77C67C67A7E2691F,
            0x0CB86C80F26D74B2,
        ]),
    )
}

/// Final exponentiation: f^{(q^12 - 1)/r}
///
/// Split into easy part and hard part:
///   (q^12 - 1)/r = (q^6 - 1) * (q^2 + 1) * (q^4 - q^2 + 1)/r
///
/// Easy part: f^{(q^6 - 1)(q^2 + 1)}
/// Hard part: f^{(q^4 - q^2 + 1)/r}
///
/// The hard part uses the Devegili-Scott-Dahab decomposition:
///   (q^4-q^2+1)/r = l0 + l1*q + l2*q^2 + l3*q^3
/// where:
///   l0 = -2 - 18x - 30x^2 - 36x^3
///   l1 =  1 - 12x - 18x^2 - 36x^3
///   l2 =  1 + 6x^2
///   l3 =  1
///
/// We express f^{l_i} using f^x, f^{x^2}, f^{x^3} computed via exp_by_x,
/// combined with small-power exponentiations.
fn final_exponentiation(f: &Fq12) -> Fq12 {
    // --- Easy part ---
    // Step 1: f1 = f^{q^6 - 1} = conj(f) * f^{-1}
    let f_inv = match f.inv() {
        Some(inv) => inv,
        None => return fq12::ONE,
    };
    let f1 = f.conjugate().mul(&f_inv);

    // Step 2: f2 = f1^{q^2 + 1} = f1.frobenius_map(2) * f1
    let f2 = f1.frobenius_map(2).mul(&f1);

    // --- Hard part ---
    // After easy part, f2 is in the cyclotomic subgroup.
    // In this subgroup, f^{-1} = conjugate(f).
    //
    // Compute key powers via exp_by_x:
    let fx  = f2.exp_by_x();            // f^x
    let fx2 = fx.exp_by_x();            // f^{x^2}
    let fx3 = fx2.exp_by_x();           // f^{x^3}

    // Helper: small-power exponentiation via squaring chains
    // f^2 = square
    let f2_sq = f2.cyclotomic_square();  // f^2

    // Compute f^{l0} = f^{-2 - 18x - 30x^2 - 36x^3}
    //   = conj(f^2 * fx^18 * fx2^30 * fx3^36)
    //
    // Small powers:
    //   a^6  = ((a^2)^2 * a)^2 ... no, a^6 = a^2 * a^4 = a^2 * (a^2)^2
    //   a^12 = (a^6)^2
    //   a^18 = a^12 * a^6
    //   a^30 = a^18 * a^12
    //   a^36 = (a^18)^2

    // fx^18
    let fx2_p = fx.cyclotomic_square();              // fx^2
    let fx4   = fx2_p.cyclotomic_square();            // fx^4
    let fx6   = fx4.mul(&fx2_p);                      // fx^6
    let fx12  = fx6.cyclotomic_square();              // fx^12
    let fx18  = fx12.mul(&fx6);                       // fx^18

    // fx2^30
    let fx2_2  = fx2.cyclotomic_square();             // fx2^2
    let fx2_4  = fx2_2.cyclotomic_square();           // fx2^4
    let fx2_6  = fx2_4.mul(&fx2_2);                   // fx2^6
    let fx2_12 = fx2_6.cyclotomic_square();           // fx2^12
    let fx2_18 = fx2_12.mul(&fx2_6);                  // fx2^18
    let fx2_30 = fx2_18.mul(&fx2_12);                 // fx2^30

    // fx3^36
    let fx3_2  = fx3.cyclotomic_square();             // fx3^2
    let fx3_4  = fx3_2.cyclotomic_square();           // fx3^4
    let fx3_6  = fx3_4.mul(&fx3_2);                   // fx3^6
    let fx3_12 = fx3_6.cyclotomic_square();           // fx3^12
    let fx3_18 = fx3_12.mul(&fx3_6);                  // fx3^18
    let fx3_36 = fx3_18.cyclotomic_square();          // fx3^36

    // f^{l0} = conj(f^2 * fx^18 * fx2^30 * fx3^36)
    let t0 = f2_sq.mul(&fx18).mul(&fx2_30).mul(&fx3_36).conjugate();

    // Compute f^{l1} = f^{1 - 12x - 18x^2 - 36x^3}
    //   = f * conj(fx^12 * fx2^18 * fx3^36)
    // Reuse: fx12, fx2_18, fx3_36 from above
    let t1_inner = fx12.mul(&fx2_18).mul(&fx3_36).conjugate();
    let t1 = f2.mul(&t1_inner);

    // Compute f^{l2} = f^{1 + 6x^2} = f * fx2^6
    // Reuse: fx2_6 from above
    let t2 = f2.mul(&fx2_6);

    // f^{l3} = f^1 = f2
    let t3 = f2;

    // Combine: result = f^{l0} * (f^{l1})^q * (f^{l2})^{q^2} * (f^{l3})^{q^3}
    let result = t0
        .mul(&t1.frobenius_map(1))
        .mul(&t2.frobenius_map(2))
        .mul(&t3.frobenius_map(3));

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pairing_identity() {
        let p = G1Affine::identity();
        let q = G2Affine::identity();
        let result = pairing(&p, &q);
        assert!(result.is_one());
    }
}
