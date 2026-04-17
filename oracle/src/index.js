require("dotenv").config();

const cron = require("node-cron");
const config = require("./config");
const { scrapeNYC } = require("./scrapers/nyc");
const { scrapeDubai } = require("./scrapers/dubai");
const { signAndSubmit } = require("./signer");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
  console.log(`[${new Date().toISOString()}] [ORACLE] ${msg}`);
}

// ---------------------------------------------------------------------------
// Core update cycle
// ---------------------------------------------------------------------------

/**
 * Run one full oracle update cycle:
 *   1. Scrape both NYC and Dubai prices
 *   2. Validate data
 *   3. Sign with EIP-712
 *   4. Submit to PriceOracle.sol on Integra testnet
 *
 * Each city is scraped independently — if one fails, the other is still
 * submitted.
 */
async function runUpdateCycle() {
  log("========== Starting oracle update cycle ==========");

  const updates = [];

  // --- NYC ---
  try {
    log("Scraping NYC...");
    const nyc = await scrapeNYC();
    log(`NYC result: $${nyc.price}/sqft from ${nyc.source} at ${nyc.timestamp.toISOString()}`);
    updates.push({
      marketId: "NYC",
      price: nyc.price,
      timestamp: nyc.timestamp,
    });
  } catch (err) {
    log(`NYC scrape FAILED: ${err.message}`);
  }

  // --- Dubai ---
  try {
    log("Scraping Dubai...");
    const dubai = await scrapeDubai();
    log(`Dubai result: $${dubai.price}/sqft from ${dubai.source} at ${dubai.timestamp.toISOString()}`);
    updates.push({
      marketId: "DUBAI",
      price: dubai.price,
      timestamp: dubai.timestamp,
    });
  } catch (err) {
    log(`Dubai scrape FAILED: ${err.message}`);
  }

  // --- Submit whatever we have ---
  if (updates.length === 0) {
    log("No price data was scraped successfully. Skipping submission.");
    log("========== Update cycle complete (NO SUBMISSION) ==========");
    return null;
  }

  log(`Submitting ${updates.length} market update(s): ${updates.map((u) => u.marketId).join(", ")}`);

  try {
    const result = await signAndSubmit(updates);
    log(`Submission successful! tx: ${result.txHash} | block: ${result.blockNumber}`);
    log("========== Update cycle complete ==========");
    return result;
  } catch (err) {
    log(`Submission FAILED: ${err.message}`);
    log("========== Update cycle complete (SUBMISSION FAILED) ==========");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

function start() {
  log("Terraform Oracle Service starting...");
  log(`  RPC URL:         ${config.rpcUrl}`);
  log(`  Oracle address:  ${config.oracleAddress || "(not set)"}`);
  log(`  Signer key:      ${config.signerPrivateKey ? "****" + config.signerPrivateKey.slice(-4) : "(not set)"}`);
  log(`  Update interval: every ${config.updateIntervalHours} hours`);
  log(`  Markets:         ${Object.keys(config.markets).join(", ")}`);
  log("");

  if (!config.signerPrivateKey) {
    log("WARNING: ORACLE_SIGNER_PRIVATE_KEY is not set. Scraping will run but signing/submission will fail.");
  }
  if (!config.oracleAddress) {
    log("WARNING: ORACLE_PRICE_ORACLE_ADDRESS is not set. Submission will fail.");
  }

  // Run once immediately on startup
  log("Running initial update cycle...");
  runUpdateCycle().catch((err) => {
    log(`Unexpected error in initial update cycle: ${err.message}`);
  });

  // Schedule recurring runs.
  // node-cron expression: run at minute 0 of every Nth hour.
  // For 6-hour interval: "0 */6 * * *" = 00:00, 06:00, 12:00, 18:00 UTC
  const cronExpr = `0 */${config.updateIntervalHours} * * *`;
  log(`Scheduling cron: "${cronExpr}"`);

  cron.schedule(cronExpr, () => {
    log("Cron tick — starting scheduled update cycle...");
    runUpdateCycle().catch((err) => {
      log(`Unexpected error in scheduled update cycle: ${err.message}`);
    });
  });

  log("Oracle service is running. Press Ctrl+C to stop.");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

// Export for programmatic use (e.g., update-once script)
module.exports = { runUpdateCycle, start };

// Run if executed directly
if (require.main === module) {
  start();
}
