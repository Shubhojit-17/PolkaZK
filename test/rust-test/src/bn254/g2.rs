/// BN254 G2 curve operations  
/// G2 is defined over Fq2: y^2 = x^3 + 3/(9+u) (the twist curve)
/// Points are in affine coordinates (x, y) where x, y in Fq2.

use super::fq::{self, Fq};
use super::fq2::{self, Fq2};

/// Twist parameter B' = 3/(9+u)
/// Precomputed: B_TWIST = 3 * (9-u) / (81+1) = 3*(9-u)/82
fn twist_b() -> Fq2 {
    // For BN254, B' = 3/(9+u) in Fq2
    // (9+u)^{-1} = (9-u)/82
    // B' = 3*(9-u)/82
    let nine = Fq::from_u64(9);
    let eighty_two_inv = Fq::from_u64(82).inv().unwrap();
    let three = Fq::from_u64(3);

    let real = nine.mul(&three).mul(&eighty_two_inv);
    let imag = three.neg().mul(&eighty_two_inv);
    Fq2::new(real, imag)
}

/// G2 affine point
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct G2Affine {
    pub x: Fq2,
    pub y: Fq2,
    pub infinity: bool,
}

/// G2 projective point
#[derive(Clone, Copy, Debug)]
pub struct G2Projective {
    pub x: Fq2,
    pub y: Fq2,
    pub z: Fq2,
}

impl G2Affine {
    pub fn identity() -> Self {
        G2Affine {
            x: fq2::ZERO,
            y: fq2::ONE,
            infinity: true,
        }
    }

    pub fn is_identity(&self) -> bool {
        self.infinity
    }

    /// Deserialize from 128 bytes (four 32-byte big-endian Fq elements)
    /// Format: x.c0 (32) | x.c1 (32) | y.c0 (32) | y.c1 (32)
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 128 {
            return None;
        }

        let x_c0: [u8; 32] = bytes[0..32].try_into().ok()?;
        let x_c1: [u8; 32] = bytes[32..64].try_into().ok()?;
        let y_c0: [u8; 32] = bytes[64..96].try_into().ok()?;
        let y_c1: [u8; 32] = bytes[96..128].try_into().ok()?;

        let x = Fq2::new(
            Fq::from_bytes_be(&x_c0),
            Fq::from_bytes_be(&x_c1),
        );
        let y = Fq2::new(
            Fq::from_bytes_be(&y_c0),
            Fq::from_bytes_be(&y_c1),
        );

        if x.is_zero() && y.is_zero() {
            return Some(G2Affine::identity());
        }

        let point = G2Affine {
            x,
            y,
            infinity: false,
        };

        if point.is_on_curve() {
            Some(point)
        } else {
            None
        }
    }

    /// Check if point is on the twist curve: y^2 = x^3 + B'
    pub fn is_on_curve(&self) -> bool {
        if self.infinity {
            return true;
        }
        let y2 = self.y.square();
        let x3 = self.x.square().mul(&self.x);
        let rhs = x3.add(&twist_b());
        y2 == rhs
    }

    pub fn to_projective(&self) -> G2Projective {
        if self.infinity {
            G2Projective {
                x: fq2::ZERO,
                y: fq2::ONE,
                z: fq2::ZERO,
            }
        } else {
            G2Projective {
                x: self.x,
                y: self.y,
                z: fq2::ONE,
            }
        }
    }

    pub fn neg(&self) -> Self {
        if self.infinity {
            *self
        } else {
            G2Affine {
                x: self.x,
                y: self.y.neg(),
                infinity: false,
            }
        }
    }
}

impl G2Projective {
    pub fn identity() -> Self {
        G2Projective {
            x: fq2::ZERO,
            y: fq2::ONE,
            z: fq2::ZERO,
        }
    }

    pub fn is_identity(&self) -> bool {
        self.z.is_zero()
    }

    pub fn to_affine(&self) -> G2Affine {
        if self.z.is_zero() {
            return G2Affine::identity();
        }

        let z_inv = self.z.inv().unwrap();
        let z_inv2 = z_inv.square();
        let z_inv3 = z_inv2.mul(&z_inv);

        G2Affine {
            x: self.x.mul(&z_inv2),
            y: self.y.mul(&z_inv3),
            infinity: false,
        }
    }

    pub fn double(&self) -> Self {
        if self.is_identity() {
            return *self;
        }

        let a = self.x.square();
        let b = self.y.square();
        let c = b.square();
        let d = self.x.add(&b).square().sub(&a).sub(&c);
        let d = d.add(&d);
        let e = a.add(&a).add(&a);
        let f = e.square();

        let x3 = f.sub(&d).sub(&d);
        let eight_c = c.add(&c).add(&c).add(&c);
        let eight_c = eight_c.add(&eight_c);
        let y3 = e.mul(&d.sub(&x3)).sub(&eight_c);
        let z3 = self.y.mul(&self.z);
        let z3 = z3.add(&z3);

        G2Projective {
            x: x3,
            y: y3,
            z: z3,
        }
    }

    pub fn add_affine(&self, other: &G2Affine) -> Self {
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
        let i = i.add(&i);
        let j = h.mul(&i);
        let r = s2.sub(&self.y);
        let r = r.add(&r);

        if h.is_zero() {
            if r.is_zero() {
                return self.double();
            } else {
                return G2Projective::identity();
            }
        }

        let v = self.x.mul(&i);
        let x3 = r.square().sub(&j).sub(&v).sub(&v);
        let y3 = r.mul(&v.sub(&x3)).sub(&self.y.mul(&j).add(&self.y.mul(&j)));
        let z3 = self.z.add(&h).square().sub(&z1z1).sub(&hh);

        G2Projective {
            x: x3,
            y: y3,
            z: z3,
        }
    }

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
                return G2Projective::identity();
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

        G2Projective {
            x: x3,
            y: y3,
            z: z3,
        }
    }
}
