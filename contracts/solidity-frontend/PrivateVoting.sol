// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/// @title PolkaZK Private Voting
/// @notice A private voting contract that verifies ZK proofs via a Rust verifier on PolkaVM
/// @dev Calls a Rust ZK verifier contract deployed on the same pallet-revive runtime
contract PrivateVoting {
    // ─── State ───────────────────────────────────────────────

    /// Address of the deployed Rust ZK Verifier contract
    address public rustVerifier;

    /// Owner of the contract
    address public owner;

    /// Proposal counter
    uint256 public proposalCount;

    /// Proposal struct
    struct Proposal {
        string description;
        uint256 yesVotes;
        uint256 noVotes;
        uint256 deadline;
        bool exists;
    }

    /// Proposals mapping
    mapping(uint256 => Proposal) public proposals;

    /// Track which nullifier hashes have been used (prevents double voting)
    mapping(bytes32 => bool) public nullifierUsed;

    // ─── Events ──────────────────────────────────────────────

    event ProposalCreated(uint256 indexed proposalId, string description, uint256 deadline);
    event VoteCast(uint256 indexed proposalId, bool vote, bytes32 nullifierHash);
    event ProofVerified(address indexed submitter, bool result);
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);

    // ─── Errors ──────────────────────────────────────────────

    error NotOwner();
    error ProposalNotFound();
    error VotingEnded();
    error NullifierAlreadyUsed();
    error ProofVerificationFailed();
    error InvalidVerifierAddress();
    error VerifierCallFailed();

    // ─── Constructor ─────────────────────────────────────────

    /// @param _rustVerifier Address of the deployed Rust ZK verifier contract
    constructor(address _rustVerifier) {
        if (_rustVerifier == address(0)) revert InvalidVerifierAddress();
        rustVerifier = _rustVerifier;
        owner = msg.sender;
    }

    // ─── Modifiers ───────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ─── Core Functions ──────────────────────────────────────

    /// @notice Create a new proposal
    /// @param description The proposal description
    /// @param durationSeconds How long voting is open (in seconds)
    function createProposal(
        string calldata description,
        uint256 durationSeconds
    ) external onlyOwner returns (uint256) {
        uint256 proposalId = proposalCount++;
        proposals[proposalId] = Proposal({
            description: description,
            yesVotes: 0,
            noVotes: 0,
            deadline: block.timestamp + durationSeconds,
            exists: true
        });

        emit ProposalCreated(proposalId, description, block.timestamp + durationSeconds);
        return proposalId;
    }

    /// @notice Cast a private vote with ZK proof
    /// @param proposalId The proposal to vote on
    /// @param vote True for yes, false for no
    /// @param proof The serialized ZK proof (proves voter eligibility)
    /// @param publicInputs The serialized public inputs (contains nullifier hash)
    /// @param nullifierHash Unique hash to prevent double voting
    function castVote(
        uint256 proposalId,
        bool vote,
        bytes calldata proof,
        bytes calldata publicInputs,
        bytes32 nullifierHash
    ) external {
        // Check proposal exists and voting is still open
        if (!proposals[proposalId].exists) revert ProposalNotFound();
        if (block.timestamp > proposals[proposalId].deadline) revert VotingEnded();

        // Check nullifier hasn't been used
        if (nullifierUsed[nullifierHash]) revert NullifierAlreadyUsed();

        // Verify the ZK proof by calling the Rust verifier contract
        bool isValid = _verifyProof(proof, publicInputs);

        emit ProofVerified(msg.sender, isValid);

        if (!isValid) revert ProofVerificationFailed();

        // Mark nullifier as used
        nullifierUsed[nullifierHash] = true;

        // Count the vote
        if (vote) {
            proposals[proposalId].yesVotes++;
        } else {
            proposals[proposalId].noVotes++;
        }

        emit VoteCast(proposalId, vote, nullifierHash);
    }

    /// @notice Get proposal results
    /// @param proposalId The proposal ID
    /// @return description The proposal description
    /// @return yesVotes Number of yes votes
    /// @return noVotes Number of no votes
    /// @return deadline Voting deadline timestamp
    /// @return isActive Whether voting is still active
    function getProposal(uint256 proposalId) external view returns (
        string memory description,
        uint256 yesVotes,
        uint256 noVotes,
        uint256 deadline,
        bool isActive
    ) {
        if (!proposals[proposalId].exists) revert ProposalNotFound();
        Proposal storage p = proposals[proposalId];
        return (
            p.description,
            p.yesVotes,
            p.noVotes,
            p.deadline,
            block.timestamp <= p.deadline
        );
    }

    // ─── Admin Functions ─────────────────────────────────────

    /// @notice Get results for a proposal (convenience function)
    /// @param proposalId The proposal ID
    /// @return yesVotes Number of yes votes
    /// @return noVotes Number of no votes
    /// @return totalVotes Total votes cast
    function getResults(uint256 proposalId) external view returns (
        uint256 yesVotes,
        uint256 noVotes,
        uint256 totalVotes
    ) {
        if (!proposals[proposalId].exists) revert ProposalNotFound();
        Proposal storage p = proposals[proposalId];
        return (p.yesVotes, p.noVotes, p.yesVotes + p.noVotes);
    }

    /// @notice Update the Rust verifier contract address
    /// @param newVerifier New verifier contract address
    function setVerifier(address newVerifier) external onlyOwner {
        if (newVerifier == address(0)) revert InvalidVerifierAddress();
        address old = rustVerifier;
        rustVerifier = newVerifier;
        emit VerifierUpdated(old, newVerifier);
    }

    // ─── Internal Functions ──────────────────────────────────

    /// @dev Call the Rust ZK verifier contract via cross-contract call
    /// @param proof Serialized proof bytes
    /// @param publicInputs Serialized public inputs
    /// @return isValid Whether the proof verified successfully
    function _verifyProof(
        bytes calldata proof,
        bytes calldata publicInputs
    ) internal returns (bool isValid) {
        // Encode the call: verify(bytes,bytes)
        // Function selector for verify(bytes,bytes) = first 4 bytes of keccak256("verify(bytes,bytes)")
        bytes memory callData = abi.encodeWithSelector(
            bytes4(keccak256("verify(bytes,bytes)")),
            proof,
            publicInputs
        );

        // Cross-contract call to the Rust verifier
        // On pallet-revive, this works because both contracts run on the same PolkaVM runtime
        (bool success, bytes memory returnData) = rustVerifier.call(callData);

        if (!success) revert VerifierCallFailed();

        // Decode the bool return value
        if (returnData.length >= 32) {
            isValid = abi.decode(returnData, (bool));
        } else {
            isValid = false;
        }
    }
}
