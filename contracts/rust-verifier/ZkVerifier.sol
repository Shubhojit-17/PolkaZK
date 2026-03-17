// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

interface ZkVerifier {
    /// Event emitted when a proof is verified
    event ProofVerified(address indexed submitter, bool result);

    /// Event emitted when a verification key is stored
    event VerificationKeyStored(address indexed submitter, bytes32 vkHash);

    /// Verify a ZK proof
    /// @param proof The serialized proof bytes (256 bytes, or 256+VK for backward compat)
    /// @param publicInputs The serialized public inputs
    /// @return valid Whether the proof is valid
    function verify(bytes calldata proof, bytes calldata publicInputs) external returns (bool valid);

    /// Store a verification key on-chain (one-time setup)
    /// @param vk The serialized verification key bytes
    function storeVerificationKey(bytes calldata vk) external;
}
