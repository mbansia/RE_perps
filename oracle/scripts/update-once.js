#!/usr/bin/env node

/**
 * Manual trigger: run one oracle update cycle without scheduling.
 *
 * Usage:
 *   node scripts/update-once.js
 *   npm run update-once
 *
 * Set env vars (or use a .env file in the oracle/ directory):
 *   ORACLE_RPC_URL
 *   ORACLE_SIGNER_PRIVATE_KEY
 *   ORACLE_PRICE_ORACLE_ADDRESS
 */

require("dotenv").config();

const { runUpdateCycle } = require("../src/index");

function log(msg) {
  console.log(`[${new Date().toISOString()}] [UPDATE-ONCE] ${msg}`);
}

async function main() {
  log("Running a single oracle update cycle...");

  try {
    const result = await runUpdateCycle();
    if (result) {
      log(`Done. tx: ${result.txHash}`);
      process.exit(0);
    } else {
      log("Cycle completed but no transaction was submitted.");
      process.exit(1);
    }
  } catch (err) {
    log(`Fatal error: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

main();
