const { ethers } = require("ethers");
const config = require("./config");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Market IDs as keccak256 hashes — these must match PriceOracle.sol */
const MARKET_IDS = {
  NYC: ethers.keccak256(ethers.toUtf8Bytes("NYC")),
  DUBAI: ethers.keccak256(ethers.toUtf8Bytes("DUBAI")),
};

/** Minimal ABI for the PriceOracle.updatePricesBatch function */
const ORACLE_ABI = [
  "function updatePricesBatch(bytes32[] calldata marketIds, uint256[] calldata prices, uint256[] calldata timestamps, bytes calldata signature) external",
];

/** EIP-712 domain — must match the contract's DOMAIN_SEPARATOR */
const EIP712_DOMAIN = {
  name: "TerraformOracle",
  version: "1",
  chainId: config.chainId,
  // verifyingContract is set dynamically from config.oracleAddress
};

/** EIP-712 types for BatchPriceUpdate */
const EIP712_TYPES = {
  BatchPriceUpdate: [
    { name: "marketIds", type: "bytes32[]" },
    { name: "prices", type: "uint256[]" },
    { name: "timestamps", type: "uint256[]" },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
  console.log(`[${new Date().toISOString()}] [SIGNER] ${msg}`);
}

/**
 * Convert a USD per-sqft price to WAD (1e18 decimals).
 * Example: $500/sqft -> 500_000000000000000000n
 */
function toWad(priceUsd) {
  // Use ethers' parseUnits to avoid floating-point issues.
  // Round to 2 decimal places first (cent precision), then convert.
  const rounded = Math.round(priceUsd * 100) / 100;
  return ethers.parseUnits(rounded.toFixed(2), 18);
}

// ---------------------------------------------------------------------------
// Main signing + submission flow
// ---------------------------------------------------------------------------

/**
 * Sign price data and submit to the PriceOracle contract.
 *
 * @param {Array<{ marketId: string, price: number, timestamp: Date }>} updates
 *   Each entry has:
 *     - marketId: "NYC" or "DUBAI"
 *     - price:    USD per sqft (float)
 *     - timestamp: Date when the price was scraped
 *
 * @returns {{ txHash: string, markets: string[] }}
 */
async function signAndSubmit(updates) {
  if (!config.signerPrivateKey) {
    throw new Error("ORACLE_SIGNER_PRIVATE_KEY is not set");
  }
  if (!config.oracleAddress) {
    throw new Error("ORACLE_PRICE_ORACLE_ADDRESS is not set");
  }
  if (updates.length === 0) {
    throw new Error("No price updates to submit");
  }

  // Build arrays for the batch call
  const marketIds = [];
  const prices = [];
  const timestamps = [];

  for (const u of updates) {
    const marketHash = MARKET_IDS[u.marketId];
    if (!marketHash) {
      throw new Error(`Unknown market ID: ${u.marketId}`);
    }
    marketIds.push(marketHash);

    const wad = toWad(u.price);
    prices.push(wad);

    const ts = BigInt(Math.floor(u.timestamp.getTime() / 1000));
    timestamps.push(ts);

    log(`  ${u.marketId}: $${u.price}/sqft -> WAD ${wad.toString()} | ts ${ts}`);
  }

  // ----- EIP-712 signing -----
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.signerPrivateKey, provider);

  const domain = {
    ...EIP712_DOMAIN,
    verifyingContract: config.oracleAddress,
  };

  const value = {
    marketIds,
    prices,
    timestamps,
  };

  log("Signing EIP-712 BatchPriceUpdate...");
  const signature = await wallet.signTypedData(domain, EIP712_TYPES, value);
  log(`Signature: ${signature.slice(0, 20)}...${signature.slice(-8)}`);

  // ----- On-chain submission -----
  const oracle = new ethers.Contract(config.oracleAddress, ORACLE_ABI, wallet);

  log("Submitting updatePricesBatch transaction...");
  const tx = await oracle.updatePricesBatch(
    marketIds,
    prices,
    timestamps,
    signature
  );
  log(`Transaction sent: ${tx.hash}`);

  log("Waiting for confirmation...");
  const receipt = await tx.wait();
  log(`Confirmed in block ${receipt.blockNumber} (gas used: ${receipt.gasUsed.toString()})`);

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    markets: updates.map((u) => u.marketId),
  };
}

module.exports = { signAndSubmit, toWad, MARKET_IDS };
