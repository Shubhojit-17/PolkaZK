/// BN254 dodecic extension field Fq12 = Fq6[w] / (w^2 - v)
/// Elements are c0 + c1*w where c0, c1 in Fq6
/// This is the target group GT of the pairing e: G1 x G2 -> GT

use super::fq6::{self, Fq6};
use super::fq2::Fq2;
use super::frobenius;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Fq12 {
    pub c0: Fq6,
    pub c1: Fq6,
}

pub const ZERO: Fq12 = Fq12 {
    c0: fq6::ZERO,
    c1: fq6::ZERO,
};

pub const ONE: Fq12 = Fq12 {
    c0: fq6::ONE,
    c1: fq6::ZERO,
};

impl Fq12 {
    pub fn new(c0: Fq6, c1: Fq6) -> Self {
        Self { c0, c1 }
    }

    pub fn is_zero(&self) -> bool {
        self.c0.is_zero() && self.c1.is_zero()
    }

    pub fn is_one(&self) -> bool {
        self.c0 == fq6::ONE && self.c1.is_zero()
    }

    pub fn add(&self, other: &Self) -> Self {
        Fq12 {
            c0: self.c0.add(&other.c0),
            c1: self.c1.add(&other.c1),
        }
    }

    pub fn sub(&self, other: &Self) -> Self {
        Fq12 {
            c0: self.c0.sub(&other.c0),
            c1: self.c1.sub(&other.c1),
        }
    }

    /// Multiplication in Fq12
    /// (a0 + a1*w)(b0 + b1*w) = (a0*b0 + a1*b1*v) + (a0*b1 + a1*b0)*w
    /// where w^2 = v (the Fq6 variable)
    pub fn mul(&self, other: &Self) -> Self {
        let a0b0 = self.c0.mul(&other.c0);
        let a1b1 = self.c1.mul(&other.c1);

        // c0 = a0*b0 + a1*b1*v (v is the non-residue in Fq6)
        let c0 = a0b0.add(&a1b1.mul_by_nonresidue());

        // c1 = (a0+a1)*(b0+b1) - a0*b0 - a1*b1
        let c1 = self.c0.add(&self.c1)
            .mul(&other.c0.add(&other.c1))
            .sub(&a0b0)
            .sub(&a1b1);

        Fq12 { c0, c1 }
    }

    pub fn square(&self) -> Self {
        // Optimized squaring using (a+b)(a+b*v) technique
        let ab = self.c0.mul(&self.c1);

        let c0 = self.c1.mul_by_nonresidue().add(&self.c0)
            .mul(&self.c0.add(&self.c1))
            .sub(&ab)
            .sub(&ab.mul_by_nonresidue());

        let c1 = ab.add(&ab);

        Fq12 { c0, c1 }
    }

    /// Inverse in Fq12
    /// (a + bw)^{-1} = (a - bw) / (a^2 - b^2*v)
    pub fn inv(&self) -> Option<Self> {
        if self.is_zero() {
            return None;
        }

        let t = self.c0.square()
            .sub(&self.c1.square().mul_by_nonresidue());

        let t_inv = t.inv()?;

        Some(Fq12 {
            c0: self.c0.mul(&t_inv),
            c1: self.c1.neg().mul(&t_inv),
        })
    }

    /// Conjugate in Fq12: (a + bw) -> (a - bw)
    /// This is also f^{q^6} for the cyclotomic subgroup
    pub fn conjugate(&self) -> Self {
        Fq12 {
            c0: self.c0,
            c1: self.c1.neg(),
        }
    }

    /// Frobenius map: f^{q^power}
    /// Frob_k(c0 + c1*w) = Frob_k(c0) + Frob_k(c1) * w^{q^k}
    /// w^{q^k} = xi^{(q^k - 1)/6}
    pub fn frobenius_map(&self, power: usize) -> Self {
        let c0 = self.c0.frobenius_map(power);
        let c1 = self.c1.frobenius_map(power);

        // Multiply c1 by w^{q^power - 1} = xi^{(q^power - 1)/6}
        let coeff = match power % 12 {
            0 => return *self,
            1 => frobenius::frob_coeff_fq12_1(),
            2 => frobenius::frob_coeff_fq12_2(),
            3 => frobenius::frob_coeff_fq12_3(),
            6 => {
                // For q^6, this is just negation (conjugate)
                return Fq12 { c0, c1: c1.neg() };
            }
            _ => {
                // For other powers, compose from base coefficients
                // This is a simplification; full impl would precompute all 12
                let mut result = *self;
                for _ in 0..power {
                    result = result.frobenius_map(1);
                }
                return result;
            }
        };

        // Multiply each component of c1 by the Frobenius coefficient
        let c1 = Fq6::new(
            c1.c0.mul(&coeff),
            c1.c1.mul(&coeff),
            c1.c2.mul(&coeff),
        );

        Fq12 { c0, c1 }
    }

    /// Exponentiation by squaring
    pub fn pow(&self, exp: &[u64]) -> Self {
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

    /// Cyclotomic squaring (more efficient for elements in cyclotomic subgroup)
    pub fn cyclotomic_square(&self) -> Self {
        // For elements where Norm = 1, we can use a more efficient squaring
        // But for correctness, just use standard squaring
        self.square()
    }

    /// Exponentiation by the BN parameter x (used in hard part of final exp)
    pub fn exp_by_x(&self) -> Self {
        // x = 4965661367192848881 = 0x44E992B44A6909F1
        let x: u64 = 0x44E992B44A6909F1;
        let mut result = ONE;
        let mut base = *self;

        for bit in 0..63 {
            if (x >> bit) & 1 == 1 {
                result = result.mul(&base);
            }
            base = base.cyclotomic_square();
        }

        // BN254 x is positive, so no conjugation needed
        result
    }

    /// Multiply by a "line function" element which is sparse in Fq12.
    /// A line function evaluation has the form:
    ///   l = (ell_0, ell_vw, ell_vv) placed as:
    ///   Fq12(Fq6(ell_0, 0, ell_vv), Fq6(0, ell_vw, 0))
    ///
    /// This is a sparse multiplication that saves many Fq2 multiplications.
    pub fn mul_by_034(&self, c0: &Fq2, c3: &Fq2, c4: &Fq2) -> Self {
        let a0 = self.c0.c0.mul(c0);
        let a1 = self.c0.c1.mul(c0);
        let a2 = self.c0.c2.mul(c0);

        let a = Fq6::new(a0, a1, a2);
        let b = self.c1.mul_by_01(c3, c4);

        let c0_coeff = c0.add(c3);
        let e = self.c0.add(&self.c1).mul_by_01(&c0_coeff, c4);
        let c1 = e.sub(&a).sub(&b);
        let c0 = a.add(&b.mul_by_nonresidue());

        Fq12 { c0, c1 }
    }

    /// Unitary inverse (for elements on the cyclotomic subgroup)
    /// Since the norm is 1, inverse = conjugate
    pub fn unitary_inv(&self) -> Self {
        self.conjugate()
    }
}
