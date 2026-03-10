/// End-to-end Groth16 verification test using snarkjs-generated proof.
///
/// Circuit: simple multiplier (a * b === c, public input: c)
/// Witness: a=3, b=7, c=21
/// Verified with: snarkjs groth16 verify → OK!

extern crate alloc;

use polkazk_verifier::bn254::fq::Fq;
use polkazk_verifier::bn254::fr::Fr;
use polkazk_verifier::bn254::fq2::Fq2;
use polkazk_verifier::bn254::g1::G1Affine;
use polkazk_verifier::bn254::g2::G2Affine;
use polkazk_verifier::groth16::{Proof, VerificationKey, verify};

/// Helper: decode a 0x-prefixed hex string into 32 bytes (big-endian)
fn hex32(s: &str) -> [u8; 32] {
    let s = s.strip_prefix("0x").unwrap_or(s);
    let bytes = hex::decode(s).expect("invalid hex");
    assert_eq!(bytes.len(), 32, "expected 32 bytes");
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    arr
}

fn fq(hex_str: &str) -> Fq {
    Fq::from_bytes_be(&hex32(hex_str))
}

fn g1(x: &str, y: &str) -> G1Affine {
    let xf = fq(x);
    let yf = fq(y);
    // Check for point at infinity
    if xf.is_zero() && yf.is_zero() {
        return G1Affine::identity();
    }
    G1Affine { x: xf, y: yf, infinity: false }
}

fn g2(x_c0: &str, x_c1: &str, y_c0: &str, y_c1: &str) -> G2Affine {
    let x = Fq2::new(fq(x_c0), fq(x_c1));
    let y = Fq2::new(fq(y_c0), fq(y_c1));
    if x.is_zero() && y.is_zero() {
        return G2Affine::identity();
    }
    G2Affine { x, y, infinity: false }
}

fn fr(hex_str: &str) -> Fr {
    let bytes = hex32(hex_str);
    Fr::from_bytes_be(&bytes)
}

#[test]
fn test_field_arithmetic_basic() {
    // Basic sanity checks for field operations
    let one = Fq::from_u64(1);
    let two = Fq::from_u64(2);
    let three = Fq::from_u64(3);

    assert_eq!(one.add(&two), three);
    assert_eq!(three.sub(&one), two);
    assert_eq!(two.mul(&three), Fq::from_u64(6));

    let inv = three.inv().unwrap();
    assert_eq!(three.mul(&inv), one);
}

#[test]
fn test_fq2_arithmetic() {
    let a = Fq2::new(Fq::from_u64(3), Fq::from_u64(4));
    let b = Fq2::new(Fq::from_u64(1), Fq::from_u64(2));

    // (3+4i)(1+2i) = (3-8) + (6+4)i = -5 + 10i
    let c = a.mul(&b);
    let expected = Fq2::new(Fq::from_u64(5).neg(), Fq::from_u64(10));
    assert_eq!(c, expected);

    // a * a^{-1} = 1
    let a_inv = a.inv().unwrap();
    let product = a.mul(&a_inv);
    assert_eq!(product, polkazk_verifier::bn254::fq2::ONE);
}

#[test]
fn test_g1_point_on_curve() {
    // Generator point should be on curve
    let gen = polkazk_verifier::bn254::g1::generator();
    assert!(gen.is_on_curve(), "G1 generator should be on curve");
}

#[test]
fn test_g1_proof_points_on_curve() {
    // Proof pi_a should be on curve
    let a = g1(
        "0x22497f4b7fc3663ada2a543dc823a550b9fdc4ec94d907ceaa64a020d5ee412b",
        "0x0dc9219e024d84eeda8cdcb6898fdcc4ad4c58d6da8bc306e4dcbe9b6c4105c9",
    );
    assert!(a.is_on_curve(), "pi_a should be on BN254 G1 curve");

    // Proof pi_c should be on curve
    let c = g1(
        "0x1de02837e822e9721bd765b011a70575d9d1b7b7754b472868d2b5947f0b1386",
        "0x11ef1ba4c58a972d55a8f178fb676016d5859ef6d6177c85ef46a4824b858d2b",
    );
    assert!(c.is_on_curve(), "pi_c should be on BN254 G1 curve");
}

#[test]
fn test_g2_proof_point_on_curve() {
    // Proof pi_b should be on curve
    let b = g2(
        "0x2a281d87d584a367ef2dfe58f651d02fc77389c80ad6b174035781d302cfdb0f",
        "0x0a0d05fcad3d1c3aba342da5e208f7f9e879dec4d49d06714140b7f7d9358a93",
        "0x0952ac340f11e63915a61e57798893a501f4d3c5c61be37b6198d19e457cacd9",
        "0x2020f6d6f8bb4b763552eb522f30d6b3b8eb3b070d3c9e9cc1c1342475ff3e4d",
    );
    assert!(b.is_on_curve(), "pi_b should be on BN254 G2 twist curve");
}

#[test]
fn test_pairing_identity() {
    use polkazk_verifier::bn254::pairing;

    let p = G1Affine::identity();
    let q = G2Affine::identity();
    let result = pairing::pairing(&p, &q);
    assert!(result.is_one(), "e(O, O) should be 1");
}

#[test]
fn test_groth16_verify_valid_proof() {
    // snarkjs-generated proof for circuit: a * b === c
    // Witness: a=3, b=7, c=21 (public input: c=21)
    // Verified with snarkjs: OK!

    let proof = Proof {
        a: g1(
            "0x22497f4b7fc3663ada2a543dc823a550b9fdc4ec94d907ceaa64a020d5ee412b",
            "0x0dc9219e024d84eeda8cdcb6898fdcc4ad4c58d6da8bc306e4dcbe9b6c4105c9",
        ),
        b: g2(
            "0x2a281d87d584a367ef2dfe58f651d02fc77389c80ad6b174035781d302cfdb0f",
            "0x0a0d05fcad3d1c3aba342da5e208f7f9e879dec4d49d06714140b7f7d9358a93",
            "0x0952ac340f11e63915a61e57798893a501f4d3c5c61be37b6198d19e457cacd9",
            "0x2020f6d6f8bb4b763552eb522f30d6b3b8eb3b070d3c9e9cc1c1342475ff3e4d",
        ),
        c: g1(
            "0x1de02837e822e9721bd765b011a70575d9d1b7b7754b472868d2b5947f0b1386",
            "0x11ef1ba4c58a972d55a8f178fb676016d5859ef6d6177c85ef46a4824b858d2b",
        ),
    };

    let vk = VerificationKey {
        alpha_g1: g1(
            "0x0207bcca97e48d0b3faff5686c7642da1167b2992e9991fa7414849bab22be6b",
            "0x03d5ca4adbe4c889fcc4c8ec6bb7d84edfd43b9dfde80e0e806850a7b8c261b0",
        ),
        beta_g2: g2(
            "0x2b701e77a7fd6260f70797766ddfcc241a7e14b33f6e80781835617ad5ff00f0",
            "0x13d810ac51b337a8aea7a4c0f1a4a5c0c75dfdeb6399b7138e42663487d0bf89",
            "0x077ec078585b253705517ce80d0fb6b9d2505dd72e2e8d9fd6caaa41b575c038",
            "0x0ccb8c61aa8854f4b26938c646a9ca3a40df9ec4ba76de3656f79dad494ab78a",
        ),
        gamma_g2: g2(
            "0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed",
            "0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2",
            "0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa",
            "0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b",
        ),
        delta_g2: g2(
            "0x173a7e27e820c7068ee476711ec13ca99b6d8507e915dfea4fa596b0466d68d7",
            "0x2c9137e9512e299638457189533ad25d9223713243cb17ad52e71e54c19448b9",
            "0x0e6781c6b38ecde7ad1ab6b80809507aa05145a88890ca6cb03a183fa5e9304f",
            "0x20dc2fb25da814e1564bfc2bbc9bec2f3f60ff97513490614cc6055010718702",
        ),
        ic: vec![
            g1(
                "0x01522d43468d49817509d574163b326078c5e6436fbff0c2272138300ea97206",
                "0x1c085b8626b0634fdef26d034b1820fa1bc1ac74ae94631f7cdbf326a2bce5ef",
            ),
            g1(
                "0x1d0e33258732ed2db4c284d8ccdc126eb01fd6957fd5b86d989638be938c51df",
                "0x08a9117646ab2b08558de38b3e87c3d71dfa8b5866d765109bda11e345dbcb70",
            ),
        ],
    };

    let public_inputs = vec![
        fr("0x0000000000000000000000000000000000000000000000000000000000000015"),
    ];

    let result = verify(&vk, &proof, &public_inputs);
    assert!(result, "Groth16 proof verification should succeed for valid proof (a=3, b=7, c=21)");
}

#[test]
fn test_groth16_reject_invalid_input() {
    // Same proof but wrong public input (c=22 instead of 21)
    // This MUST fail verification.

    let proof = Proof {
        a: g1(
            "0x22497f4b7fc3663ada2a543dc823a550b9fdc4ec94d907ceaa64a020d5ee412b",
            "0x0dc9219e024d84eeda8cdcb6898fdcc4ad4c58d6da8bc306e4dcbe9b6c4105c9",
        ),
        b: g2(
            "0x2a281d87d584a367ef2dfe58f651d02fc77389c80ad6b174035781d302cfdb0f",
            "0x0a0d05fcad3d1c3aba342da5e208f7f9e879dec4d49d06714140b7f7d9358a93",
            "0x0952ac340f11e63915a61e57798893a501f4d3c5c61be37b6198d19e457cacd9",
            "0x2020f6d6f8bb4b763552eb522f30d6b3b8eb3b070d3c9e9cc1c1342475ff3e4d",
        ),
        c: g1(
            "0x1de02837e822e9721bd765b011a70575d9d1b7b7754b472868d2b5947f0b1386",
            "0x11ef1ba4c58a972d55a8f178fb676016d5859ef6d6177c85ef46a4824b858d2b",
        ),
    };

    let vk = VerificationKey {
        alpha_g1: g1(
            "0x0207bcca97e48d0b3faff5686c7642da1167b2992e9991fa7414849bab22be6b",
            "0x03d5ca4adbe4c889fcc4c8ec6bb7d84edfd43b9dfde80e0e806850a7b8c261b0",
        ),
        beta_g2: g2(
            "0x2b701e77a7fd6260f70797766ddfcc241a7e14b33f6e80781835617ad5ff00f0",
            "0x13d810ac51b337a8aea7a4c0f1a4a5c0c75dfdeb6399b7138e42663487d0bf89",
            "0x077ec078585b253705517ce80d0fb6b9d2505dd72e2e8d9fd6caaa41b575c038",
            "0x0ccb8c61aa8854f4b26938c646a9ca3a40df9ec4ba76de3656f79dad494ab78a",
        ),
        gamma_g2: g2(
            "0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed",
            "0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2",
            "0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa",
            "0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b",
        ),
        delta_g2: g2(
            "0x173a7e27e820c7068ee476711ec13ca99b6d8507e915dfea4fa596b0466d68d7",
            "0x2c9137e9512e299638457189533ad25d9223713243cb17ad52e71e54c19448b9",
            "0x0e6781c6b38ecde7ad1ab6b80809507aa05145a88890ca6cb03a183fa5e9304f",
            "0x20dc2fb25da814e1564bfc2bbc9bec2f3f60ff97513490614cc6055010718702",
        ),
        ic: vec![
            g1(
                "0x01522d43468d49817509d574163b326078c5e6436fbff0c2272138300ea97206",
                "0x1c085b8626b0634fdef26d034b1820fa1bc1ac74ae94631f7cdbf326a2bce5ef",
            ),
            g1(
                "0x1d0e33258732ed2db4c284d8ccdc126eb01fd6957fd5b86d989638be938c51df",
                "0x08a9117646ab2b08558de38b3e87c3d71dfa8b5866d765109bda11e345dbcb70",
            ),
        ],
    };

    // Wrong input: c=22 instead of c=21
    let public_inputs = vec![
        fr("0x0000000000000000000000000000000000000000000000000000000000000016"),
    ];

    let result = verify(&vk, &proof, &public_inputs);
    assert!(!result, "Groth16 proof verification should FAIL for wrong public input (c=22)");
}
