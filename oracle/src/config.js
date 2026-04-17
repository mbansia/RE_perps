require("dotenv").config();

module.exports = {
  rpcUrl: process.env.ORACLE_RPC_URL || "https://testnet.integralayer.com/evm",
  signerPrivateKey: process.env.ORACLE_SIGNER_PRIVATE_KEY,
  oracleAddress: process.env.ORACLE_PRICE_ORACLE_ADDRESS,
  updateIntervalHours: parseInt(process.env.ORACLE_UPDATE_INTERVAL_HOURS || "6"),
  chainId: 26218,

  // Scraper settings
  scrapeTimeoutMs: 30_000,
  scrapeRetries: 3,

  // AED to USD fixed rate
  aedToUsd: 1 / 3.6725,

  // Price validation ranges (USD per sqft)
  validation: {
    NYC: { min: 200, max: 2000 },
    DUBAI: { min: 200, max: 1400 },
  },

  markets: {
    NYC: { id: "NYC", name: "New York City" },
    DUBAI: { id: "DUBAI", name: "Dubai" },
  },
};
