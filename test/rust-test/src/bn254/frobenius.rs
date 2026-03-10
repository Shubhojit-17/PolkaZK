/// Precomputed Frobenius coefficients for BN254 extension field tower.
///
/// These are needed for the Frobenius endomorphism on Fq6 and Fq12,
/// which is used in the final exponentiation of the pairing.
///
/// Reference: arkworks-rs/curves bn254 parameters

use super::fq::{self, Fq};
use super::fq2::Fq2;

/// Frobenius coefficients for Fq6
/// FROBENIUS_COEFF_FQ6_C1[i] = xi^((q^i - 1) / 3)  where xi = u + 9
/// FROBENIUS_COEFF_FQ6_C2[i] = xi^((2*(q^i - 1)) / 3)

// xi^{(q-1)/3} — used for Fq6 Frobenius c1 coefficient
pub fn frob_coeff_fq6_c1_1() -> Fq2 {
    Fq2::new(
        Fq::from_raw([
            0x99E39557176F553D,
            0xB78CC310C2C3330C,
            0x4C0BEC3CF559B143,
            0x2FB347984F7911F7,
        ]),
        Fq::from_raw([
            0x1665D51C640FCBA2,
            0x32AE2A1D0B7C9DCE,
            0x4BA4CC8BD75A0794,
            0x16C9E55061EBAE20,
        ]),
    )
}

// xi^{(q-1)/3}^2 = xi^{2(q-1)/3}
pub fn frob_coeff_fq6_c2_1() -> Fq2 {
    Fq2::new(
        Fq::from_raw([
            0xDCB443DB4D2C6585,
            0x46F9C6E3BD9B93AE,
            0xE4AC3B0EF39C8F49,
            0x0F1D3A722BF041AF,
        ]),
        Fq::from_raw([
            0x7C03CBCAC41049A0,
            0x16326633AF7FA1B6,
            0xC0B9C2BB0C11412E,
            0x2C23F625B1A11949,
        ]),
    )
}

// xi^{(q^2-1)/3}
pub fn frob_coeff_fq6_c1_2() -> Fq2 {
    Fq2::new(
        Fq::from_raw([
            0xDCB443DB4D2C6585,
            0x46F9C6E3BD9B93AE,
            0xE4AC3B0EF39C8F49,
            0x0F1D3A722BF041AF,
        ]),
        fq::ZERO,
    )
}

// xi^{2(q^2-1)/3}
pub fn frob_coeff_fq6_c2_2() -> Fq2 {
    Fq2::new(
        Fq::from_raw([
            0x3C208C16D87CFD46,
            0x97816A916871CA8D,
            0xB85045B68181585D,
            0x30644E72E131A029,
        ]),
        fq::ZERO,
    )
}

// xi^{(q^3-1)/3}
pub fn frob_coeff_fq6_c1_3() -> Fq2 {
    Fq2::new(
        Fq::from_raw([
            0xFB02C2D639C3F452,
            0x0BFCA75BFEB0C652,
            0x52D2C8E8F2DB23D3,
            0x1E95BACABA613C7F,
        ]),
        Fq::from_raw([
            0x0FA3EC2B276F4504,
            0x944E69D2C6E25AEA,
            0x5A2C66DB4CF94C0B,
            0x11930FA2DE49DD7E,
        ]),
    )
}

// xi^{2(q^3-1)/3}
pub fn frob_coeff_fq6_c2_3() -> Fq2 {
    Fq2::new(
        Fq::from_raw([
            0xDCB443DB4D2C6585,
            0x46F9C6E3BD9B93AE,
            0xE4AC3B0EF39C8F49,
            0x0F1D3A722BF041AF,
        ]),
        Fq::from_raw([
            0x7C03CBCAC41049A0,
            0x16326633AF7FA1B6,
            0xC0B9C2BB0C11412E,
            0x2C23F625B1A11949,
        ]),
    )
}

/// Frobenius coefficients for Fq12
/// Used for computing f^{q^k} in the final exponentiation

// For Fq12 Frobenius, we need w^{q-1} where w^2 = v
// w^{q-1} = xi^{(q-1)/6}
pub fn frob_coeff_fq12_1() -> Fq2 {
    Fq2::new(
        Fq::from_raw([
            0xAF9BA69633144907,
            0xCA0B202753E0632B,
            0xD7F3BBACA7C74391,
            0x07C9B56A06A4D0EB,
        ]),
        Fq::from_raw([
            0x956DC7E2E0E2A463,
            0xB1E4D84B24EBFE4E,
            0x07E9E9D1E04A4D64,
            0x1DA92E958487E1B4,
        ]),
    )
}

// xi^{(q^2-1)/6}
pub fn frob_coeff_fq12_2() -> Fq2 {
    Fq2::new(
        Fq::from_raw([
            0xDCB443DB4D2C6585,
            0x46F9C6E3BD9B93AE,
            0xE4AC3B0EF39C8F49,
            0x0F1D3A722BF041AF,
        ]),
        Fq::from_raw([
            0x7C03CBCAC41049A0,
            0x16326633AF7FA1B6,
            0xC0B9C2BB0C11412E,
            0x2C23F625B1A11949,
        ]),
    )
}

// xi^{(q^3-1)/6}
pub fn frob_coeff_fq12_3() -> Fq2 {
    Fq2::new(
        Fq::from_raw([
            0xACE3A36BCE20714D,
            0x72B54B8C93A0C386,
            0x4B0F37F0DF7EAFD1,
            0x24361F390C4FFA41,
        ]),
        Fq::from_raw([
            0x38A0FC06AFA45C62,
            0x0B1C7F0FBAB77A10,
            0x5AF40C5717B48C96,
            0x0D0EE52D9CCF84C2,
        ]),
    )
}
