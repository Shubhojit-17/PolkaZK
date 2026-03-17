#![no_main]
#![no_std]

use alloy_core::{
    sol,
    sol_types::{SolCall, SolEvent},
};
use pallet_revive_uapi::{HostFn, HostFnImpl as api, ReturnFlags, StorageFlags};

extern crate alloc;
use alloc::vec;

mod bn254;
mod groth16;

// Define the ZkVerifier contract interface (Ethereum ABI)
sol!("ZkVerifier.sol");

// ─── Allocator ───────────────────────────────────────────────
// picoalloc provides a minimal allocator for no_std environments.
// 32KB heap should be sufficient for proof verification.
#[global_allocator]
static mut ALLOC: picoalloc::Mutex<picoalloc::Allocator<picoalloc::ArrayPointer<32768>>> = {
    static mut ARRAY: picoalloc::Array<32768> = picoalloc::Array([0u8; 32768]);
    picoalloc::Mutex::new(picoalloc::Allocator::new(unsafe {
        picoalloc::ArrayPointer::new(&raw mut ARRAY)
    }))
};

// ─── Panic Handler ───────────────────────────────────────────
#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    unsafe {
        core::arch::asm!("unimp");
        core::hint::unreachable_unchecked();
    }
}

// ─── Storage Keys ────────────────────────────────────────────
// Slot 0: Verification key hash (for tracking which VK is stored)
const VK_HASH_KEY: [u8; 32] = [0u8; 32];
// Slot 1: Total verifications count
const VERIFY_COUNT_KEY: [u8; 32] = {
    let mut key = [0u8; 32];
    key[31] = 1;
    key
};
// Slot 2: Owner address (who deployed the contract)
const OWNER_KEY: [u8; 32] = {
    let mut key = [0u8; 32];
    key[31] = 2;
    key
};
// Slot 3: Verification key data (raw bytes, stored once)
const VK_DATA_KEY: [u8; 32] = {
    let mut key = [0u8; 32];
    key[31] = 3;
    key
};

// ─── Constructor ─────────────────────────────────────────────
#[no_mangle]
#[polkavm_derive::polkavm_export]
pub extern "C" fn deploy() {
    // Store the deployer as owner
    let mut caller = [0u8; 20];
    api::caller(&mut caller);

    let mut owner_padded = [0u8; 32];
    owner_padded[12..32].copy_from_slice(&caller);
    api::set_storage(StorageFlags::empty(), &OWNER_KEY, &owner_padded);

    // Initialize verification count to 0
    let zero = [0u8; 32];
    api::set_storage(StorageFlags::empty(), &VERIFY_COUNT_KEY, &zero);
}

// ─── Main Entry Point ────────────────────────────────────────
#[no_mangle]
#[polkavm_derive::polkavm_export]
pub extern "C" fn call() {
    // Read call data
    let call_data_len = api::call_data_size();
    if call_data_len < 4 {
        api::return_value(ReturnFlags::REVERT, b"Input too short");
    }

    let mut call_data = vec![0u8; call_data_len as usize];
    api::call_data_copy(&mut call_data, 0);

    // Extract 4-byte function selector
    let selector: [u8; 4] = call_data[0..4].try_into().unwrap();

    match selector {
        // verify(bytes proof, bytes publicInputs) -> bool
        ZkVerifier::verifyCall::SELECTOR => {
            handle_verify(&call_data[4..]);
        }
        // storeVerificationKey(bytes vk)
        ZkVerifier::storeVerificationKeyCall::SELECTOR => {
            handle_store_vk(&call_data[4..]);
        }
        _ => {
            api::return_value(ReturnFlags::REVERT, b"Unknown function");
        }
    }
}

/// Handle the verify(bytes, bytes) call
/// ABI decoding: two dynamic byte arrays
fn handle_verify(data: &[u8]) {
    // ABI decode: bytes proof, bytes publicInputs
    // Solidity ABI encoding for dynamic types:
    // [offset_proof (32)] [offset_inputs (32)] [len_proof (32)] [proof_data...] [len_inputs (32)] [input_data...]
    if data.len() < 64 {
        api::return_value(ReturnFlags::REVERT, b"Invalid calldata");
    }

    // Read offsets (big-endian uint256, but we only need last 4 bytes)
    let proof_offset = read_u256_as_usize(data, 0);
    let inputs_offset = read_u256_as_usize(data, 32);

    // Read proof bytes
    let proof_bytes = read_dynamic_bytes(data, proof_offset);
    // Read public inputs bytes
    let input_bytes = read_dynamic_bytes(data, inputs_offset);

    if proof_bytes.is_none() || input_bytes.is_none() {
        api::return_value(ReturnFlags::REVERT, b"Failed to decode");
    }

    let proof_bytes = proof_bytes.unwrap();
    let input_bytes = input_bytes.unwrap();

    // For the hackathon demo, we implement a simplified verification:
    // The proof contains a hardcoded verification key + proof + public inputs
    // In a full implementation, the VK would be stored on-chain

    let result = perform_verification(&proof_bytes, &input_bytes);

    // Emit ProofVerified event
    let mut caller = [0u8; 20];
    api::caller(&mut caller);
    emit_proof_verified(&caller, result);

    // Increment verification count
    increment_verify_count();

    // Return bool result (ABI encoded as uint256)
    let mut return_data = [0u8; 32];
    return_data[31] = if result { 1 } else { 0 };
    api::return_value(ReturnFlags::empty(), &return_data);
}

/// Perform the actual ZK proof verification
fn perform_verification(proof_bytes: &[u8], input_bytes: &[u8]) -> bool {
    // Deserialize the proof (first 256 bytes)
    let proof = match groth16::deserialize_proof(proof_bytes) {
        Some(p) => p,
        None => return false,
    };

    // Get VK: prefer embedded in proof (backward compat), else read from storage
    let vk = if proof_bytes.len() > 256 {
        // Old format: VK appended after the 256-byte proof
        groth16::deserialize_vk(&proof_bytes[256..])
    } else {
        // New format: read VK from on-chain storage
        read_vk_from_storage()
    };

    let vk = match vk {
        Some(v) => v,
        None => return false,
    };

    // Deserialize public inputs
    let public_inputs = match groth16::deserialize_public_inputs(input_bytes) {
        Some(i) => i,
        None => return false,
    };

    // Run Groth16 verification
    groth16::verify(&vk, &proof, &public_inputs)
}

/// Read the verification key from on-chain storage
fn read_vk_from_storage() -> Option<groth16::VerificationKey> {
    let mut vk_buf = vec![0u8; 1024];
    let mut vk_slice = vk_buf.as_mut_slice();
    match api::get_storage(StorageFlags::empty(), &VK_DATA_KEY, &mut vk_slice) {
        Ok(_) => {
            if vk_slice.is_empty() {
                return None;
            }
            groth16::deserialize_vk(vk_slice)
        }
        Err(_) => None,
    }
}

/// Read a uint256 from ABI data and return as usize
fn read_u256_as_usize(data: &[u8], offset: usize) -> usize {
    if offset + 32 > data.len() {
        return 0;
    }
    // ABI uint256 is big-endian; read last 8 bytes as usize
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&data[offset + 24..offset + 32]);
    usize::from_be_bytes(bytes)
}

/// Read a dynamic bytes field from ABI-encoded data
fn read_dynamic_bytes<'a>(data: &'a [u8], offset: usize) -> Option<&'a [u8]> {
    if offset + 32 > data.len() {
        return None;
    }
    let length = read_u256_as_usize(data, offset);
    let start = offset + 32;
    let end = start + length;
    if end > data.len() {
        return None;
    }
    Some(&data[start..end])
}

/// Emit the ProofVerified event
fn emit_proof_verified(submitter: &[u8; 20], result: bool) {
    // Event signature: ProofVerified(address indexed submitter, bool result)
    let sig_topic = ZkVerifier::ProofVerified::SIGNATURE_HASH.0;

    // indexed address as topic (left-padded to 32 bytes)
    let mut addr_topic = [0u8; 32];
    addr_topic[12..32].copy_from_slice(submitter);

    let topics = [sig_topic, addr_topic];

    // Non-indexed data: bool result
    let mut event_data = [0u8; 32];
    event_data[31] = if result { 1 } else { 0 };

    api::deposit_event(&topics, &event_data);
}

/// Handle the storeVerificationKey(bytes) call
fn handle_store_vk(data: &[u8]) {
    if data.len() < 32 {
        api::return_value(ReturnFlags::REVERT, b"Invalid calldata");
    }

    let vk_offset = read_u256_as_usize(data, 0);
    let vk_bytes = read_dynamic_bytes(data, vk_offset);

    if vk_bytes.is_none() {
        api::return_value(ReturnFlags::REVERT, b"Failed to decode VK");
    }
    let vk_bytes = vk_bytes.unwrap();

    // Validate VK can be deserialized
    if groth16::deserialize_vk(vk_bytes).is_none() {
        api::return_value(ReturnFlags::REVERT, b"Invalid VK data");
    }

    // Store VK bytes in contract storage
    api::set_storage(StorageFlags::empty(), &VK_DATA_KEY, vk_bytes);

    // Store first 32 bytes as VK identifier
    let mut vk_hash = [0u8; 32];
    let copy_len = core::cmp::min(32, vk_bytes.len());
    vk_hash[..copy_len].copy_from_slice(&vk_bytes[..copy_len]);
    api::set_storage(StorageFlags::empty(), &VK_HASH_KEY, &vk_hash);

    // Emit VerificationKeyStored event
    let mut caller = [0u8; 20];
    api::caller(&mut caller);
    emit_vk_stored(&caller, &vk_hash);

    // Return success (void function)
    api::return_value(ReturnFlags::empty(), &[]);
}

/// Emit the VerificationKeyStored event
fn emit_vk_stored(submitter: &[u8; 20], vk_hash: &[u8; 32]) {
    let sig_topic = ZkVerifier::VerificationKeyStored::SIGNATURE_HASH.0;

    let mut addr_topic = [0u8; 32];
    addr_topic[12..32].copy_from_slice(submitter);

    let topics = [sig_topic, addr_topic];

    api::deposit_event(&topics, vk_hash);
}

/// Increment the verification counter in storage
fn increment_verify_count() {
    let mut count_bytes = [0u8; 32];
    let mut output = count_bytes.as_mut_slice();

    let count = match api::get_storage(StorageFlags::empty(), &VERIFY_COUNT_KEY, &mut output) {
        Ok(_) => {
            let mut bytes = [0u8; 8];
            bytes.copy_from_slice(&output[24..32]);
            u64::from_be_bytes(bytes)
        }
        Err(_) => 0,
    };

    let new_count = count + 1;
    let mut new_bytes = [0u8; 32];
    new_bytes[24..32].copy_from_slice(&new_count.to_be_bytes());
    api::set_storage(StorageFlags::empty(), &VERIFY_COUNT_KEY, &new_bytes);
}
