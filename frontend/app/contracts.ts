// Contract ABIs and addresses for PolkaZK
// Update addresses after deployment

export const CHAIN_CONFIG = {
  chainId: "0x" + (420420421).toString(16), // Westend Asset Hub chain ID
  chainName: "Westend Asset Hub",
  rpcUrl: "https://westend-asset-hub-eth-rpc.polkadot.io",
  blockExplorer: "https://assethub-westend.subscan.io",
  nativeCurrency: {
    name: "WND",
    symbol: "WND",
    decimals: 18,
  },
};

// Update these after deploying contracts
export const CONTRACTS = {
  rustVerifier: process.env.NEXT_PUBLIC_RUST_VERIFIER || "0xac32d86d7061C8dC4962e0e401459C079E3Ca7E3",
  privateVoting: process.env.NEXT_PUBLIC_VOTING_CONTRACT || "0x47b6a6bb66eF206ca0D90Ead98b3d8Db6f406CFe",
};

export const RUST_VERIFIER_ABI = [
  "function verify(bytes calldata proof, bytes calldata publicInputs) external returns (bool)",
  "function storeVerificationKey(bytes calldata vk) external",
  "event ProofVerified(address indexed submitter, bool result)",
  "event VerificationKeyStored(address indexed submitter, bytes32 vkHash)",
];

export const PRIVATE_VOTING_ABI = [
  "function createProposal(string calldata description, uint256 durationSeconds) external returns (uint256)",
  "function castVote(uint256 proposalId, bool vote, bytes calldata proof, bytes calldata publicInputs, bytes32 nullifierHash) external",
  "function getProposal(uint256 proposalId) external view returns (string description, uint256 yesVotes, uint256 noVotes, uint256 deadline, bool isActive)",
  "function getResults(uint256 proposalId) external view returns (uint256 yesVotes, uint256 noVotes, uint256 totalVotes)",
  "function proposalCount() external view returns (uint256)",
  "function rustVerifier() external view returns (address)",
  "function owner() external view returns (address)",
  "function nullifierUsed(bytes32) external view returns (bool)",
  "event ProposalCreated(uint256 indexed proposalId, string description, uint256 deadline)",
  "event VoteCast(uint256 indexed proposalId, bool vote, bytes32 nullifierHash)",
  "event ProofVerified(address indexed submitter, bool result)",
];
