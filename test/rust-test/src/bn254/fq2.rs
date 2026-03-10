/// BN254 quadratic extension field Fq2 = Fq[u] / (u^2 + 1)
/// Elements are a + b*u where a, b in Fq
/// This is needed for the G2 group (twist curve) and pairing computation.

use super::fq::{self, Fq};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Fq2 {
    pub c0: Fq, // Real part
    pub c1: Fq, // Imaginary part (coefficient of u)
}

pub const ZERO: Fq2 = Fq2 {
    c0: fq::ZERO,
    c1: fq::ZERO,
};

pub const ONE: Fq2 = Fq2 {
    c0: fq::ONE,
    c1: fq::ZERO,
};

impl Fq2 {
    pub fn new(c0: Fq, c1: Fq) -> Self {
        Self { c0, c1 }
    }

    pub fn is_zero(&self) -> bool {
        self.c0.is_zero() && self.c1.is_zero()
    }

    /// Addition in Fq2
    pub fn add(&self, other: &Self) -> Self {
        Fq2 {
            c0: self.c0.add(&other.c0),
            c1: self.c1.add(&other.c1),
        }
    }

    /// Subtraction in Fq2
    pub fn sub(&self, other: &Self) -> Self {
        Fq2 {
            c0: self.c0.sub(&other.c0),
            c1: self.c1.sub(&other.c1),
        }
    }

    /// Negation in Fq2
    pub fn neg(&self) -> Self {
        Fq2 {
            c0: self.c0.neg(),
            c1: self.c1.neg(),
        }
    }

    /// Multiplication in Fq2: (a + bu)(c + du) = (ac - bd) + (ad + bc)u
    /// Using Karatsuba: (a+bu)(c+du) = (ac-bd) + ((a+b)(c+d)-ac-bd)u
    pub fn mul(&self, other: &Self) -> Self {
        let ac = self.c0.mul(&other.c0);
        let bd = self.c1.mul(&other.c1);

        let ad_plus_bc = self
            .c0
            .add(&self.c1)
            .mul(&other.c0.add(&other.c1))
            .sub(&ac)
            .sub(&bd);

        Fq2 {
            c0: ac.sub(&bd),     // ac - bd (since u^2 = -1)
            c1: ad_plus_bc,
        }
    }

    /// Squaring in Fq2: (a + bu)^2 = (a^2 - b^2) + 2ab*u
    /// Optimized: (a+b)(a-b) + 2ab*u
    pub fn square(&self) -> Self {
        let ab = self.c0.mul(&self.c1);
        let a_plus_b = self.c0.add(&self.c1);
        let a_minus_b = self.c0.sub(&self.c1);

        Fq2 {
            c0: a_plus_b.mul(&a_minus_b),
            c1: ab.add(&ab),
        }
    }

    /// Multiplicative inverse in Fq2
    /// (a + bu)^{-1} = (a - bu) / (a^2 + b^2)
    pub fn inv(&self) -> Option<Self> {
        if self.is_zero() {
            return None;
        }
        // norm = a^2 + b^2 (since u^2 = -1, the norm is a^2 - (-1)*b^2 = a^2 + b^2)
        let norm = self.c0.square().add(&self.c1.square());
        let norm_inv = norm.inv()?;

        Some(Fq2 {
            c0: self.c0.mul(&norm_inv),
            c1: self.c1.neg().mul(&norm_inv),
        })
    }

    /// Conjugate: (a + bu) -> (a - bu)
    pub fn conjugate(&self) -> Self {
        Fq2 {
            c0: self.c0,
            c1: self.c1.neg(),
        }
    }

    /// Double an Fq2 element (add to itself)
    pub fn double(&self) -> Self {
        Fq2 {
            c0: self.c0.add(&self.c0),
            c1: self.c1.add(&self.c1),
        }
    }

    /// Multiply by a scalar in Fq
    pub fn scale(&self, scalar: &Fq) -> Self {
        Fq2 {
            c0: self.c0.mul(scalar),
            c1: self.c1.mul(scalar),
        }
    }

    /// Frobenius endomorphism
    pub fn frobenius(&self) -> Self {
        self.conjugate()
    }

    /// Multiply by the non-residue (used in Fq6/Fq12 tower)
    /// In BN254, the non-residue for Fq2 -> Fq6 is (9 + u)
    pub fn mul_by_nonresidue(&self) -> Self {
        // (a + bu) * (9 + u) = (9a - b) + (a + 9b)u
        let nine = Fq::from_u64(9);
        Fq2 {
            c0: self.c0.mul(&nine).sub(&self.c1),
            c1: self.c0.add(&self.c1.mul(&nine)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fq2_mul_inv() {
        let a = Fq2::new(Fq::from_u64(3), Fq::from_u64(4));
        let a_inv = a.inv().unwrap();
        let product = a.mul(&a_inv);
        assert_eq!(product, ONE);
    }

    #[test]
    fn test_fq2_square() {
        let a = Fq2::new(Fq::from_u64(3), Fq::from_u64(4));
        let sq = a.square();
        let mul = a.mul(&a);
        assert_eq!(sq, mul);
    }
}
