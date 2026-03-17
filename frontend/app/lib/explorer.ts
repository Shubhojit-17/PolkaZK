import { CHAIN_CONFIG } from "../contracts";

type BlockRef = number | bigint | string | null | undefined;

function toBlockNumber(value: BlockRef): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("0x")) {
    const parsed = Number.parseInt(trimmed, 16);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

// Subscan often cannot resolve revive smart-contract tx hashes directly.
// Block links are a reliable way to reach the real on-chain record.
export function getExplorerActivityUrl(txHash: string, blockNumber?: BlockRef): string {
  const bn = toBlockNumber(blockNumber);
  if (bn !== null) {
    return `${CHAIN_CONFIG.blockExplorer}/block/${bn}?tab=extrinsic`;
  }
  return `${CHAIN_CONFIG.blockExplorer}/extrinsic/${txHash}`;
}
