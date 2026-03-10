/// BN254 sextic extension field Fq6 = Fq2[v] / (v^3 - (9 + u))
/// Elements are c0 + c1*v + c2*v^2 where c0, c1, c2 in Fq2
/// Used as part of Fq12 tower construction for the pairing.

use super::fq2::{self, Fq2};
use super::frobenius;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Fq6 {
    pub c0: Fq2,
    pub c1: Fq2,
    pub c2: Fq2,
}

pub const ZERO: Fq6 = Fq6 {
    c0: fq2::ZERO,
    c1: fq2::ZERO,
    c2: fq2::ZERO,
};

pub const ONE: Fq6 = Fq6 {
    c0: fq2::ONE,
    c1: fq2::ZERO,
    c2: fq2::ZERO,
};

impl Fq6 {
    pub fn new(c0: Fq2, c1: Fq2, c2: Fq2) -> Self {
        Self { c0, c1, c2 }
    }

    pub fn is_zero(&self) -> bool {
        self.c0.is_zero() && self.c1.is_zero() && self.c2.is_zero()
    }

    pub fn add(&self, other: &Self) -> Self {
        Fq6 {
            c0: self.c0.add(&other.c0),
            c1: self.c1.add(&other.c1),
            c2: self.c2.add(&other.c2),
        }
    }

    pub fn sub(&self, other: &Self) -> Self {
        Fq6 {
            c0: self.c0.sub(&other.c0),
            c1: self.c1.sub(&other.c1),
            c2: self.c2.sub(&other.c2),
        }
    }

    pub fn neg(&self) -> Self {
        Fq6 {
            c0: self.c0.neg(),
            c1: self.c1.neg(),
            c2: self.c2.neg(),
        }
    }

    /// Multiplication in Fq6 using Karatsuba-like method
    /// (a0 + a1*v + a2*v^2)(b0 + b1*v + b2*v^2)
    /// where v^3 = xi (non-residue in Fq2)
    pub fn mul(&self, other: &Self) -> Self {
        let a0b0 = self.c0.mul(&other.c0);
        let a1b1 = self.c1.mul(&other.c1);
        let a2b2 = self.c2.mul(&other.c2);

        // c0 = a0*b0 + xi*((a1+a2)*(b1+b2) - a1*b1 - a2*b2)
        let t0 = self.c1.add(&self.c2).mul(&other.c1.add(&other.c2));
        let c0 = a0b0.add(&t0.sub(&a1b1).sub(&a2b2).mul_by_nonresidue());

        // c1 = (a0+a1)*(b0+b1) - a0*b0 - a1*b1 + xi*a2*b2
        let t1 = self.c0.add(&self.c1).mul(&other.c0.add(&other.c1));
        let c1 = t1.sub(&a0b0).sub(&a1b1).add(&a2b2.mul_by_nonresidue());

        // c2 = (a0+a2)*(b0+b2) - a0*b0 - a2*b2 + a1*b1
        let t2 = self.c0.add(&self.c2).mul(&other.c0.add(&other.c2));
        let c2 = t2.sub(&a0b0).sub(&a2b2).add(&a1b1);

        Fq6 { c0, c1, c2 }
    }

    pub fn square(&self) -> Self {
        self.mul(self)
    }

    /// Inverse in Fq6 using the formula for cubic extensions
    pub fn inv(&self) -> Option<Self> {
        if self.is_zero() {
            return None;
        }

        let c0s = self.c0.square();
        let c1s = self.c1.square();
        let c2s = self.c2.square();
        let c0c1 = self.c0.mul(&self.c1);
        let c0c2 = self.c0.mul(&self.c2);
        let c1c2 = self.c1.mul(&self.c2);

        // Using the adjugate matrix method
        let t0 = c0s.sub(&c1c2.mul_by_nonresidue());
        let t1 = c2s.mul_by_nonresidue().sub(&c0c1);
        let t2 = c1s.sub(&c0c2);

        let inv_norm = self.c0.mul(&t0)
            .add(&self.c2.mul(&t1).mul_by_nonresidue())
            .add(&self.c1.mul(&t2).mul_by_nonresidue());

        let inv_norm = inv_norm.inv()?;

        Some(Fq6 {
            c0: t0.mul(&inv_norm),
            c1: t1.mul(&inv_norm),
            c2: t2.mul(&inv_norm),
        })
    }

    /// Multiply by non-residue v (for Fq12 construction)
    /// v * (c0 + c1*v + c2*v^2) = xi*c2 + c0*v + c1*v^2
    pub fn mul_by_nonresidue(&self) -> Self {
        Fq6 {
            c0: self.c2.mul_by_nonresidue(),
            c1: self.c0,
            c2: self.c1,
        }
    }

    /// Frobenius map: raise to q-th power
    /// Frob(c0 + c1*v + c2*v^2) = Frob(c0) + Frob(c1)*gamma1 * v + Frob(c2)*gamma2 * v^2
    pub fn frobenius_map(&self, power: usize) -> Self {
        let c0 = match power % 6 {
            0 => self.c0,
            _ => self.c0.frobenius(),  // conjugate for odd powers
        };

        let (c1_frob, c2_frob) = if power % 2 == 0 {
            (self.c1, self.c2)
        } else {
            (self.c1.frobenius(), self.c2.frobenius())
        };

        let (gamma1, gamma2) = match power % 6 {
            0 => return *self,
            1 => (frobenius::frob_coeff_fq6_c1_1(), frobenius::frob_coeff_fq6_c2_1()),
            2 => (frobenius::frob_coeff_fq6_c1_2(), frobenius::frob_coeff_fq6_c2_2()),
            3 => (frobenius::frob_coeff_fq6_c1_3(), frobenius::frob_coeff_fq6_c2_3()),
            4 => {
                // power=4: gamma1 = frob_c1_2^2 mod stuff, we compute from power=2 coeffs
                let g1 = frobenius::frob_coeff_fq6_c1_2();
                let g2 = frobenius::frob_coeff_fq6_c2_2();
                (g1.mul(&frobenius::frob_coeff_fq6_c1_2()), g2.mul(&frobenius::frob_coeff_fq6_c2_2()))
            }
            5 => {
                let g1 = frobenius::frob_coeff_fq6_c1_2().mul(&frobenius::frob_coeff_fq6_c1_3());
                let g2 = frobenius::frob_coeff_fq6_c2_2().mul(&frobenius::frob_coeff_fq6_c2_3());
                (g1, g2)
            }
            _ => unreachable!(),
        };

        Fq6 {
            c0,
            c1: c1_frob.mul(&gamma1),
            c2: c2_frob.mul(&gamma2),
        }
    }

    /// Multiply by an element of the form (c0, c1, 0) — used for sparse multiplication
    pub fn mul_by_01(&self, c0: &Fq2, c1: &Fq2) -> Self {
        let a_a = self.c0.mul(c0);
        let b_b = self.c1.mul(c1);

        let t1 = self.c1.add(&self.c2).mul(c1).sub(&b_b).mul_by_nonresidue().add(&a_a);
        let t2 = self.c0.add(&self.c1).mul(&c0.add(c1)).sub(&a_a).sub(&b_b);
        let t3 = self.c0.add(&self.c2).mul(c0).sub(&a_a).add(&b_b);

        Fq6 {
            c0: t1,
            c1: t2,
            c2: t3,
        }
    }
}
