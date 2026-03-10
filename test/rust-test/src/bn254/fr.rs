/// BN254 scalar field (Fr) arithmetic
/// r = 21888242871839275222246405745257275088548364400416034343698204186575808495617
///
/// Used for scalar multiplication and ZK proof verification.

/// Scalar field element: 4 x u64 limbs, little-endian
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Fr(pub [u64; 4]);

/// The BN254 scalar field modulus r
pub const MODULUS: Fr = Fr([
    0x43E1F593F0000001,
    0x2833E84879B97091,
    0xB85045B68181585D,
    0x30644E72E131A029,
]);

/// R = 2^256 mod r (Montgomery form)
pub const R: Fr = Fr([
    0xAC96341C4FFFFFFB,
    0x36FC76959F60CD29,
    0x666EA36F7879462E,
    0x0E0A77C19A07DF2F,
]);

/// R^2 mod r
pub const R2: Fr = Fr([
    0x1BB8E645AE216DA7,
    0x53FE3AB1E35C59E3,
    0x8C49833D53BB8085,
    0x0216D0B17F4E44A5,
]);

pub const ZERO: Fr = Fr([0, 0, 0, 0]);
pub const ONE: Fr = R;

/// INV = -r^{-1} mod 2^64
const INV: u64 = 0xC2E1F593EFFFFFFF;

impl Fr {
    pub fn is_zero(&self) -> bool {
        self.0[0] == 0 && self.0[1] == 0 && self.0[2] == 0 && self.0[3] == 0
    }

    pub fn from_u64(val: u64) -> Self {
        let raw = Fr([val, 0, 0, 0]);
        raw.mul(&R2)
    }

    pub fn from_bytes_be(bytes: &[u8; 32]) -> Self {
        let mut limbs = [0u64; 4];
        for i in 0..4 {
            let offset = 24 - i * 8;
            for j in 0..8 {
                limbs[i] |= (bytes[offset + j] as u64) << ((7 - j) * 8);
            }
        }
        let raw = Fr(limbs);
        raw.mul(&R2)
    }

    pub fn to_bytes_be(&self) -> [u8; 32] {
        let reduced = self.mul(&Fr([1, 0, 0, 0]));
        let mut bytes = [0u8; 32];
        for i in 0..4 {
            let offset = 24 - i * 8;
            for j in 0..8 {
                bytes[offset + j] = (reduced.0[i] >> ((7 - j) * 8)) as u8;
            }
        }
        bytes
    }

    pub fn add(&self, other: &Self) -> Self {
        let (mut result, carry) = adc_chain(&self.0, &other.0);
        let (sub_result, borrow) = sbb_chain(&result, &MODULUS.0);
        if carry != 0 || borrow == 0 {
            result = sub_result;
        }
        Fr(result)
    }

    pub fn sub(&self, other: &Self) -> Self {
        let (result, borrow) = sbb_chain(&self.0, &other.0);
        if borrow != 0 {
            let (corrected, _) = adc_chain(&result, &MODULUS.0);
            Fr(corrected)
        } else {
            Fr(result)
        }
    }

    pub fn neg(&self) -> Self {
        if self.is_zero() {
            *self
        } else {
            MODULUS.sub(self)
        }
    }

    pub fn mul(&self, other: &Self) -> Self {
        let mut result = [0u64; 4];

        for i in 0..4 {
            let mut carry = 0u64;
            for j in 0..4 {
                let (lo, hi) = mac(result[j], self.0[i], other.0[j], carry);
                result[j] = lo;
                carry = hi;
            }

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

        let (sub_result, borrow) = sbb_chain(&result, &MODULUS.0);
        if borrow == 0 {
            Fr(sub_result)
        } else {
            Fr(result)
        }
    }

    pub fn square(&self) -> Self {
        self.mul(self)
    }

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

    pub fn inv(&self) -> Option<Self> {
        if self.is_zero() {
            return None;
        }
        let exp = [
            0x43E1F593EFFFFFFF,
            0x2833E84879B97091,
            0xB85045B68181585D,
            0x30644E72E131A029,
        ];
        Some(self.pow(&exp))
    }
}

#[inline]
fn mac(a: u64, b: u64, c: u64, carry: u64) -> (u64, u64) {
    let full = (a as u128) + (b as u128) * (c as u128) + (carry as u128);
    (full as u64, (full >> 64) as u64)
}

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

#[inline]
fn sbb_chain(a: &[u64; 4], b: &[u64; 4]) -> ([u64; 4], u64) {
    let mut result = [0u64; 4];
    let mut borrow = 0i128;
    for i in 0..4 {
        let diff = (a[i] as i128) - (b[i] as i128) + borrow;
        result[i] = diff as u64;
        borrow = diff >> 64;
    }
    (result, if borrow < 0 { 1 } else { 0 })
}
