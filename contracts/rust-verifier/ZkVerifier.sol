// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

interface ZkVerifier {
    /// Event emitted when a proof is verified
    event ProofVerified(address indexed submitter, bool result);

    /// Verify a ZK proof
    /// @param proof The serialized proof bytes
    /// @param publicInputs The serialized public inputs
    /// @return valid Whether the proof is valid
    function verify(bytes calldata proof, bytes calldata publicInputs) external returns (bool valid);
}
