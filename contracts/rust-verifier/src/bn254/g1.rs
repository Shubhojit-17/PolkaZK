/// BN254 G1 curve operations
/// G1 is defined over Fq: y^2 = x^3 + 3
/// Points are in affine coordinates (x, y) with a flag for the point at infinity.

use super::fq::{self, Fq};

/// G1 affine point
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct G1Affine {
    pub x: Fq,
    pub y: Fq,
    pub infinity: bool,
}

/// G1 projective point (for efficient computation)
#[derive(Clone, Copy, Debug)]
pub struct G1Projective {
    pub x: Fq,
    pub y: Fq,
    pub z: Fq,
}

/// Generator point of G1
pub fn generator() -> G1Affine {
    G1Affine {
        x: fq::ONE, // Generator x = 1
        y: Fq::from_u64(2), // Generator y = 2
        infinity: false,
    }
}

impl G1Affine {
    pub fn identity() -> Self {
        G1Affine {
            x: fq::ZERO,
            y: fq::ONE,
            infinity: true,
        }
    }

    pub fn is_identity(&self) -> bool {
        self.infinity
    }

    /// Deserialize from 64 bytes (two 32-byte big-endian Fq elements)
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 64 {
            return None;
        }
        let x_bytes: [u8; 32] = bytes[0..32].try_into().ok()?;
        let y_bytes: [u8; 32] = bytes[32..64].try_into().ok()?;

        let x = Fq::from_bytes_be(&x_bytes);
        let y = Fq::from_bytes_be(&y_bytes);

        // Check if point at infinity (both zero)
        if x.is_zero() && y.is_zero() {
            return Some(G1Affine::identity());
        }

        let point = G1Affine {
            x,
            y,
            infinity: false,
        };

        // Verify point is on curve: y^2 = x^3 + 3
        if point.is_on_curve() {
            Some(point)
        } else {
            None
        }
    }

    /// Check if point is on the curve y^2 = x^3 + 3
    pub fn is_on_curve(&self) -> bool {
        if self.infinity {
            return true;
        }
        let y2 = self.y.square();
        let x3 = self.x.square().mul(&self.x);
        let b = Fq::from_u64(3);
        let rhs = x3.add(&b);
        y2 == rhs
    }

    /// Convert to projective coordinates
    pub fn to_projective(&self) -> G1Projective {
        if self.infinity {
            G1Projective {
                x: fq::ZERO,
                y: fq::ONE,
                z: fq::ZERO,
            }
        } else {
            G1Projective {
                x: self.x,
                y: self.y,
                z: fq::ONE,
            }
        }
    }

    /// Negation: (x, y) -> (x, -y)
    pub fn neg(&self) -> Self {
        if self.infinity {
            *self
        } else {
            G1Affine {
                x: self.x,
                y: self.y.neg(),
                infinity: false,
            }
        }
    }
}

impl G1Projective {
    pub fn identity() -> Self {
        G1Projective {
            x: fq::ZERO,
            y: fq::ONE,
            z: fq::ZERO,
        }
    }

    pub fn is_identity(&self) -> bool {
        self.z.is_zero()
    }

    /// Convert back to affine
    pub fn to_affine(&self) -> G1Affine {
        if self.z.is_zero() {
            return G1Affine::identity();
        }

        let z_inv = self.z.inv().unwrap();
        let z_inv2 = z_inv.square();
        let z_inv3 = z_inv2.mul(&z_inv);

        G1Affine {
            x: self.x.mul(&z_inv2),
            y: self.y.mul(&z_inv3),
            infinity: false,
        }
    }

    /// Point doubling in projective coordinates
    pub fn double(&self) -> Self {
        if self.is_identity() {
            return *self;
        }

        // Using standard formulas for short Weierstrass curves with a=0
        let a = self.x.square();
        let b = self.y.square();
        let c = b.square();
        let d = self.x.add(&b).square().sub(&a).sub(&c);
        let d = d.add(&d); // 2*d
        let e = a.add(&a).add(&a); // 3*a (since curve a=0: 3*x^2)
        let f = e.square();

        let x3 = f.sub(&d).sub(&d);
        let eight_c = c.add(&c).add(&c).add(&c);
        let eight_c = eight_c.add(&eight_c);
        let y3 = e.mul(&d.sub(&x3)).sub(&eight_c);
        let z3 = self.y.mul(&self.z);
        let z3 = z3.add(&z3);

        G1Projective {
            x: x3,
            y: y3,
            z: z3,
        }
    }

    /// Point addition: self + other (mixed addition, other is affine)
    pub fn add_affine(&self, other: &G1Affine) -> Self {
        if other.is_identity() {
            return *self;
        }
        if self.is_identity() {
            return other.to_projective();
        }

        let z1z1 = self.z.square();
        let u2 = other.x.mul(&z1z1);
        let s2 = other.y.mul(&self.z).mul(&z1z1);

        let h = u2.sub(&self.x);
        let hh = h.square();
        let i = hh.add(&hh);
        let i = i.add(&i); // 4*hh
        let j = h.mul(&i);
        let r = s2.sub(&self.y);
        let r = r.add(&r); // 2*r

        if h.is_zero() {
            if r.is_zero() {
                return self.double();
            } else {
                return G1Projective::identity();
            }
        }

        let v = self.x.mul(&i);
        let x3 = r.square().sub(&j).sub(&v).sub(&v);
        let y3 = r.mul(&v.sub(&x3)).sub(&self.y.mul(&j).add(&self.y.mul(&j)));
        let z3 = self.z.add(&h).square().sub(&z1z1).sub(&hh);

        G1Projective {
            x: x3,
            y: y3,
            z: z3,
        }
    }

    /// Scalar multiplication using double-and-add
    pub fn scalar_mul(&self, scalar: &[u64; 4]) -> Self {
        let mut result = G1Projective::identity();
        let mut base = *self;

        for &limb in scalar.iter() {
            for bit in 0..64 {
                if (limb >> bit) & 1 == 1 {
                    result = result.add_projective(&base);
                }
                base = base.double();
            }
        }
        result
    }

    /// Point addition: self + other (both projective)
    pub fn add_projective(&self, other: &Self) -> Self {
        if self.is_identity() {
            return *other;
        }
        if other.is_identity() {
            return *self;
        }

        let z1z1 = self.z.square();
        let z2z2 = other.z.square();
        let u1 = self.x.mul(&z2z2);
        let u2 = other.x.mul(&z1z1);
        let s1 = self.y.mul(&other.z).mul(&z2z2);
        let s2 = other.y.mul(&self.z).mul(&z1z1);

        let h = u2.sub(&u1);
        let r = s2.sub(&s1);

        if h.is_zero() {
            if r.is_zero() {
                return self.double();
            } else {
                return G1Projective::identity();
            }
        }

        let i = h.add(&h).square();
        let j = h.mul(&i);
        let r = r.add(&r);
        let v = u1.mul(&i);

        let x3 = r.square().sub(&j).sub(&v).sub(&v);
        let y3 = r.mul(&v.sub(&x3)).sub(&s1.mul(&j).add(&s1.mul(&j)));
        let z3 = self.z.add(&other.z).square().sub(&z1z1).sub(&z2z2);
        let z3 = z3.mul(&h);

        G1Projective {
            x: x3,
            y: y3,
            z: z3,
        }
    }
}
