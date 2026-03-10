/// BN254 base field (Fq) arithmetic
/// q = 21888242871839275222246405745257275088696311157297823662689037894645226208583
///
/// All operations are modular arithmetic over this prime field.
/// Elements are represented as 4 x u64 limbs in little-endian order.

/// Field element: 4 x u64 limbs, little-endian
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Fq(pub [u64; 4]);

/// The BN254 base field modulus q
pub const MODULUS: Fq = Fq([
    0x3C208C16D87CFD47,
    0x97816A916871CA8D,
    0xB85045B68181585D,
    0x30644E72E131A029,
]);

/// R = 2^256 mod q (Montgomery form R)
pub const R: Fq = Fq([
    0xD35D438DC58F0D9D,
    0x0A78EB28F5C70B3D,
    0x666EA36F7879462C,
    0x0E0A77C19A07DF2F,
]);

/// R^2 mod q (for converting to Montgomery form)
pub const R2: Fq = Fq([
    0xF32CFC5B538AFA89,
    0xB5E71911D44501FB,
    0x47AB1EFF0A417FF6,
    0x06D89F71CAB8351F,
]);

/// Zero element
pub const ZERO: Fq = Fq([0, 0, 0, 0]);

/// One element (in Montgomery form)
pub const ONE: Fq = R;

/// INV = -q^{-1} mod 2^64
const INV: u64 = 0x87D20782E4866389;

impl Fq {
    /// Check if zero
    pub fn is_zero(&self) -> bool {
        self.0[0] == 0 && self.0[1] == 0 && self.0[2] == 0 && self.0[3] == 0
    }

    /// Create from raw Montgomery-form limbs (already in Montgomery form)
    pub const fn from_raw(val: [u64; 4]) -> Self {
        Fq(val)
    }

    /// Convert a u64 to field element (Montgomery form)
    pub fn from_u64(val: u64) -> Self {
        let raw = Fq([val, 0, 0, 0]);
        raw.mul(&R2) // Convert to Montgomery form
    }

    /// Convert from raw bytes (32 bytes, big-endian) to Montgomery form
    pub fn from_bytes_be(bytes: &[u8; 32]) -> Self {
        let mut limbs = [0u64; 4];
        for i in 0..4 {
            let offset = 24 - i * 8;
            for j in 0..8 {
                limbs[i] |= (bytes[offset + j] as u64) << ((7 - j) * 8);
            }
        }
        let raw = Fq(limbs);
        raw.mul(&R2) // Convert to Montgomery form
    }

    /// Convert from Montgomery form to raw bytes (32 bytes, big-endian)
    pub fn to_bytes_be(&self) -> [u8; 32] {
        // Multiply by 1 to get out of Montgomery form
        let reduced = self.mul(&Fq([1, 0, 0, 0]));
        let mut bytes = [0u8; 32];
        for i in 0..4 {
            let offset = 24 - i * 8;
            for j in 0..8 {
                bytes[offset + j] = (reduced.0[i] >> ((7 - j) * 8)) as u8;
            }
        }
        bytes
    }

    /// Addition: a + b mod q
    pub fn add(&self, other: &Self) -> Self {
        let (mut result, carry) = adc_chain(&self.0, &other.0);

        // Subtract modulus if result >= q
        let (sub_result, borrow) = sbb_chain(&result, &MODULUS.0);

        // If carry from add or no borrow from subtract, use the subtracted result
        if carry != 0 || borrow == 0 {
            result = sub_result;
        }

        Fq(result)
    }

    /// Subtraction: a - b mod q
    pub fn sub(&self, other: &Self) -> Self {
        let (result, borrow) = sbb_chain(&self.0, &other.0);

        if borrow != 0 {
            // Add modulus back
            let (corrected, _) = adc_chain(&result, &MODULUS.0);
            Fq(corrected)
        } else {
            Fq(result)
        }
    }

    /// Negation: -a mod q
    pub fn neg(&self) -> Self {
        if self.is_zero() {
            *self
        } else {
            MODULUS.sub(self)
        }
    }

    /// Montgomery multiplication: a * b * R^{-1} mod q
    pub fn mul(&self, other: &Self) -> Self {
        let mut result = [0u64; 4];

        for i in 0..4 {
            let mut carry = 0u64;

            // Multiply-accumulate
            for j in 0..4 {
                let idx = j;
                let (lo, hi) = mac(result[idx], self.0[i], other.0[j], carry);
                result[idx] = lo;
                carry = hi;
            }

            // Montgomery reduction step
            let k = result[0].wrapping_mul(INV);
            let mut carry2 = 0u64;
            let (_, hi) = mac(result[0], k, MODULUS.0[0], 0);
            carry2 = hi;

            for j in 1..4 {
                let (lo, hi) = mac(result[j], k, MODULUS.0[j], carry2);
                result[j - 1] = lo;
                carry2 = hi;
            }

            result[3] = carry.wrapping_add(carry2);
        }

        // Final reduction
        let (sub_result, borrow) = sbb_chain(&result, &MODULUS.0);
        if borrow == 0 {
            Fq(sub_result)
        } else {
            Fq(result)
        }
    }

    /// Squaring (uses mul for simplicity; could be optimized)
    pub fn square(&self) -> Self {
        self.mul(self)
    }

    /// Exponentiation by squaring
    pub fn pow(&self, exp: &[u64; 4]) -> Self {
        let mut result = ONE;
        let mut base = *self;

        for &limb in exp.iter() {
            for bit in 0..64 {
                if (limb >> bit) & 1 == 1 {
                    result = result.mul(&base);
                }
                base = base.square();
            }
        }
        result
    }

    /// Multiplicative inverse using Fermat's little theorem: a^{q-2} mod q
    pub fn inv(&self) -> Option<Self> {
        if self.is_zero() {
            return None;
        }
        // q - 2
        let exp = [
            0x3C208C16D87CFD45,
            0x97816A916871CA8D,
            0xB85045B68181585D,
            0x30644E72E131A029,
        ];
        Some(self.pow(&exp))
    }
}

/// Multiply-and-accumulate: result = a + b * c + carry
/// Returns (lo, hi) where result = lo + hi * 2^64
#[inline]
fn mac(a: u64, b: u64, c: u64, carry: u64) -> (u64, u64) {
    let full = (a as u128) + (b as u128) * (c as u128) + (carry as u128);
    (full as u64, (full >> 64) as u64)
}

/// Addition chain with carry for 4 limbs
#[inline]
fn adc_chain(a: &[u64; 4], b: &[u64; 4]) -> ([u64; 4], u64) {
    let mut result = [0u64; 4];
    let mut carry = 0u128;

    for i in 0..4 {
        carry = (a[i] as u128) + (b[i] as u128) + carry;
        result[i] = carry as u64;
        carry >>= 64;
    }

    (result, carry as u64)
}

/// Subtraction chain with borrow for 4 limbs
#[inline]
fn sbb_chain(a: &[u64; 4], b: &[u64; 4]) -> ([u64; 4], u64) {
    let mut result = [0u64; 4];
    let mut borrow = 0i128;

    for i in 0..4 {
        let diff = (a[i] as i128) - (b[i] as i128) + borrow;
        result[i] = diff as u64;
        borrow = diff >> 64; // Sign-extends: -1 if borrowed, 0 otherwise
    }

    (result, if borrow < 0 { 1 } else { 0 })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zero() {
        assert!(ZERO.is_zero());
        assert!(!ONE.is_zero());
    }

    #[test]
    fn test_add_sub() {
        let a = Fq::from_u64(42);
        let b = Fq::from_u64(58);
        let c = a.add(&b);
        let d = c.sub(&b);
        assert_eq!(a, d);
    }

    #[test]
    fn test_mul() {
        let a = Fq::from_u64(7);
        let b = Fq::from_u64(6);
        let c = a.mul(&b);
        let expected = Fq::from_u64(42);
        assert_eq!(c, expected);
    }

    #[test]
    fn test_inv() {
        let a = Fq::from_u64(42);
        let a_inv = a.inv().unwrap();
        let product = a.mul(&a_inv);
        assert_eq!(product, ONE);
    }

    #[test]
    fn test_neg() {
        let a = Fq::from_u64(42);
        let neg_a = a.neg();
        let sum = a.add(&neg_a);
        assert!(sum.is_zero());
    }
}
