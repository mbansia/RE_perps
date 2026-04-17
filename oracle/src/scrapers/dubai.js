const { chromium } = require("playwright");
const config = require("../config");

// ---------------------------------------------------------------------------
// Selector documentation — update these when the source sites change their
// markup.  Each scraper function below documents which selectors it relies on
// so the maintenance surface is obvious.
// ---------------------------------------------------------------------------

/**
 * PRIMARY SOURCE: DXBinteract market overview
 * URL: https://dxbinteract.com/
 *
 * DXBinteract is the Dubai Land Department's official market transparency
 * platform.  The landing page shows aggregate transaction stats including
 * average price per sqft in AED.
 *
 * Selectors (may need periodic updates):
 *   STAT_CARD  — a card/tile element showing "Price per Sq. Ft" or similar
 *   AED_VALUE  — the numeric AED figure inside that card
 */
const DXBINTERACT_URL = "https://dxbinteract.com/";

/**
 * FALLBACK SOURCE: Property Finder Dubai market trends
 * URL: https://www.propertyfinder.ae/en/market-trends
 *
 * Property Finder publishes summary stats for the Dubai property market.
 * We look for average/median price per sqft in AED.
 *
 * Selectors (may need periodic updates):
 *   TREND_SECTION — the summary section near the top
 *   AED_FIGURE    — the per-sqft AED figure
 */
const PROPERTYFINDER_URL = "https://www.propertyfinder.ae/en/market-trends";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
  console.log(`[${new Date().toISOString()}] [DUBAI] ${msg}`);
}

/**
 * Parse an AED string like "AED 1,234" or "1,234" into a number.
 */
function parseAED(raw) {
  if (!raw) return NaN;
  let cleaned = raw.replace(/[^0-9.,kKmM]/g, "").trim();

  let multiplier = 1;
  if (/[kK]$/.test(cleaned)) {
    multiplier = 1_000;
    cleaned = cleaned.replace(/[kK]$/, "");
  } else if (/[mM]$/.test(cleaned)) {
    multiplier = 1_000_000;
    cleaned = cleaned.replace(/[mM]$/, "");
  }

  cleaned = cleaned.replace(/,/g, "");
  return parseFloat(cleaned) * multiplier;
}

/**
 * Convert AED per sqft to USD per sqft.
 */
function aedToUsd(aed) {
  return aed * config.aedToUsd;
}

/**
 * Validate that a price (in USD/sqft) falls within the expected Dubai range.
 */
function validate(priceUsd) {
  const { min, max } = config.validation.DUBAI;
  if (typeof priceUsd !== "number" || isNaN(priceUsd)) {
    throw new Error(`Dubai price is not a number: ${priceUsd}`);
  }
  if (priceUsd < min || priceUsd > max) {
    throw new Error(
      `Dubai price $${priceUsd.toFixed(2)}/sqft is outside valid range [$${min}, $${max}]`
    );
  }
  return true;
}

/**
 * Validate that a raw AED/sqft value is in the expected range (800-5000).
 */
function validateAED(aed) {
  if (typeof aed !== "number" || isNaN(aed)) {
    throw new Error(`Dubai AED price is not a number: ${aed}`);
  }
  if (aed < 800 || aed > 5000) {
    throw new Error(
      `Dubai AED ${aed}/sqft is outside expected range [800, 5000]`
    );
  }
  return true;
}

// ---------------------------------------------------------------------------
// Scrapers
// ---------------------------------------------------------------------------

/**
 * Attempt to scrape DXBinteract for average price per sqft in AED.
 */
async function scrapeDXBinteract() {
  log("Scraping DXBinteract market overview...");
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    await page.goto(DXBINTERACT_URL, {
      waitUntil: "domcontentloaded",
      timeout: config.scrapeTimeoutMs,
    });

    // DXBinteract is a heavy SPA; wait for content to render
    await page.waitForTimeout(5000);

    let aedPrice = null;

    // Strategy 1: look for text containing "per sq" near an AED figure
    const sqftLocator = page.locator(
      'text=/per sq\\.?\\s*(ft|foot|meter)|price\\/sq|AED\\/sq/i'
    );
    const sqftCount = await sqftLocator.count();
    if (sqftCount > 0) {
      // Try to get the ancestor card/container with the value
      const parent = sqftLocator.first().locator(
        "xpath=ancestor::*[contains(@class,'card') or contains(@class,'stat') or contains(@class,'metric') or contains(@class,'widget')]"
      );
      const parentCount = await parent.count();
      if (parentCount > 0) {
        const nums = parent.first().locator('text=/[\\d,]{3,}/');
        const numsCount = await nums.count();
        if (numsCount > 0) {
          const numText = await nums.first().textContent();
          aedPrice = parseAED(numText);
        }
      }
    }

    // Strategy 2: scan the full page text for numbers in the 800-5000 range
    // near keywords like "sqft", "sq ft", "per sq"
    if (!aedPrice) {
      log("Strategy 1 missed; trying broad text scan on DXBinteract...");
      const allText = await page.textContent("body");

      // Look for patterns like "1,234" or "1234" near "sq" text
      const numberMatches = allText.match(/[\d,]{3,}/g) || [];
      for (const match of numberMatches) {
        const val = parseAED(match);
        if (val >= 800 && val <= 5000) {
          aedPrice = val;
          log(`Found plausible AED/sqft via broad scan: ${match} (AED ${val})`);
          break;
        }
      }
    }

    if (!aedPrice) {
      throw new Error("Could not locate price-per-sqft on DXBinteract");
    }

    validateAED(aedPrice);
    const priceUsd = Math.round(aedToUsd(aedPrice) * 100) / 100;
    validate(priceUsd);

    log(`DXBinteract: AED ${aedPrice}/sqft -> $${priceUsd}/sqft`);
    return { price: priceUsd, source: "dxbinteract", timestamp: new Date() };
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Fallback: scrape Property Finder market trends for Dubai $/sqft.
 */
async function scrapePropertyFinder() {
  log("Scraping Property Finder market trends (fallback)...");
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    await page.goto(PROPERTYFINDER_URL, {
      waitUntil: "domcontentloaded",
      timeout: config.scrapeTimeoutMs,
    });

    await page.waitForTimeout(4000);

    let aedPrice = null;

    // Strategy 1: look for per-sqft labels
    const sqftLocator = page.locator(
      'text=/per sq\\.?\\s*(ft|foot)|price\\/sq|AED\\/sq/i'
    );
    const sqftCount = await sqftLocator.count();
    if (sqftCount > 0) {
      const parent = sqftLocator.first().locator("xpath=ancestor::*[1]");
      const nums = parent.locator('text=/[\\d,]{3,}/');
      const numsCount = await nums.count();
      if (numsCount > 0) {
        const numText = await nums.first().textContent();
        aedPrice = parseAED(numText);
      }
    }

    // Strategy 2: broad scan for AED values in the right range
    if (!aedPrice) {
      log("Strategy 1 missed; trying broad text scan on Property Finder...");
      const allText = await page.textContent("body");

      // Look for "AED <number>" patterns
      const aedMatches = allText.match(/AED\s*[\d,]+/gi) || [];
      for (const match of aedMatches) {
        const val = parseAED(match);
        if (val >= 800 && val <= 5000) {
          aedPrice = val;
          log(`Found plausible AED/sqft: ${match} (AED ${val})`);
          break;
        }
      }

      // Also look for bare numbers in range
      if (!aedPrice) {
        const numberMatches = allText.match(/[\d,]{3,}/g) || [];
        for (const match of numberMatches) {
          const val = parseAED(match);
          if (val >= 800 && val <= 5000) {
            aedPrice = val;
            log(`Found plausible AED/sqft (bare number): ${match} (AED ${val})`);
            break;
          }
        }
      }
    }

    if (!aedPrice) {
      throw new Error("Could not locate price data on Property Finder");
    }

    validateAED(aedPrice);
    const priceUsd = Math.round(aedToUsd(aedPrice) * 100) / 100;
    validate(priceUsd);

    log(`Property Finder: AED ${aedPrice}/sqft -> $${priceUsd}/sqft`);
    return { price: priceUsd, source: "propertyfinder", timestamp: new Date() };
  } finally {
    if (browser) await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Exported scrape function with retry + fallback
// ---------------------------------------------------------------------------

/**
 * Scrape Dubai real estate $/sqft with retry and fallback logic.
 *
 * Tries DXBinteract up to `config.scrapeRetries` times with exponential
 * backoff, then falls back to Property Finder with the same retry policy.
 *
 * @returns {{ price: number, source: string, timestamp: Date }}
 */
async function scrapeDubai() {
  const sources = [
    { name: "DXBinteract", fn: scrapeDXBinteract },
    { name: "PropertyFinder", fn: scrapePropertyFinder },
  ];

  for (const { name, fn } of sources) {
    for (let attempt = 1; attempt <= config.scrapeRetries; attempt++) {
      try {
        const result = await fn();
        log(`Success on ${name} (attempt ${attempt}/${config.scrapeRetries})`);
        return result;
      } catch (err) {
        log(
          `${name} attempt ${attempt}/${config.scrapeRetries} failed: ${err.message}`
        );
        if (attempt < config.scrapeRetries) {
          const delay = 2000 * Math.pow(2, attempt - 1); // 2s, 4s, 8s
          log(`Retrying ${name} in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    log(`All ${config.scrapeRetries} attempts exhausted for ${name}; trying next source...`);
  }

  throw new Error("Dubai scrape failed: all sources and retries exhausted");
}

module.exports = { scrapeDubai };
