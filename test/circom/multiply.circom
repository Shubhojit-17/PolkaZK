pragma circom 2.0.0;

// Simple circuit: prove knowledge of a, b such that a * b = c
// Public input: c  (the product)
// Private inputs: a, b (the factors)
template Multiplier() {
    signal input a;
    signal input b;
    signal input c;

    a * b === c;
}

component main {public [c]} = Multiplier();
