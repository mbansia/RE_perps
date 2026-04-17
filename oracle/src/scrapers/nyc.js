const { chromium } = require("playwright");
const config = require("../config");

// ---------------------------------------------------------------------------
// Selector documentation — update these when the source sites change their
// markup.  Each scraper function below documents which selectors it relies on
// so the maintenance surface is obvious.
// ---------------------------------------------------------------------------

/**
 * PRIMARY SOURCE: Redfin NYC housing-market page
 * URL: https://www.redfin.com/city/30749/NY/New-York/housing-market
 *
 * We look for the "Median Sale Price per Sq Ft" stat, which Redfin renders
 * inside a <div> whose accessible text contains "price per square foot".
 * The actual dollar value sits in an element with the data-rf-test-id
 * "mediansaleprice" or inside a heading near the phrase.
 *
 * Selectors (may need periodic updates):
 *   STAT_LABEL  — text match "price per square foot" (case-insensitive)
 *   STAT_VALUE  — the sibling/child element with the dollar figure
 */
const REDFIN_URL = "https://www.redfin.com/city/30749/NY/New-York/housing-market";

/**
 * FALLBACK SOURCE: Zillow NYC home-values page
 * URL: https://www.zillow.com/home-values/6181/new-york-ny/
 *
 * We look for the "Typical Home Value" or median listing price metric.
 * Zillow renders these inside summary stat cards.
 *
 * Selectors (may need periodic updates):
 *   STAT_CONTAINER — a summary stats region near the top of the page
 *   DOLLAR_VALUE   — the first prominent dollar figure in that region
 */
const ZILLOW_URL = "https://www.zillow.com/home-values/6181/new-york-ny/";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
  console.log(`[${new Date().toISOString()}] [NYC] ${msg}`);
}

/**
 * Parse a dollar string like "$1,234" or "$1.2K" into a number.
 */
function parseDollar(raw) {
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
  const value = parseFloat(cleaned) * multiplier;
  return value;
}

/**
 * Validate that a price falls within the expected NYC $/sqft range.
 */
function validate(price) {
  const { min, max } = config.validation.NYC;
  if (typeof price !== "number" || isNaN(price)) {
    throw new Error(`NYC price is not a number: ${price}`);
  }
  if (price < min || price > max) {
    throw new Error(
      `NYC price $${price}/sqft is outside valid range [$${min}, $${max}]`
    );
  }
  return true;
}

// ---------------------------------------------------------------------------
// Scrapers
// ---------------------------------------------------------------------------

/**
 * Attempt to scrape the Redfin NYC housing-market page for median $/sqft.
 */
async function scrapeRedfin() {
  log("Scraping Redfin NYC housing market page...");
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    await page.goto(REDFIN_URL, {
      waitUntil: "domcontentloaded",
      timeout: config.scrapeTimeoutMs,
    });

    // Wait a moment for client-side rendering
    await page.waitForTimeout(3000);

    // Strategy 1: look for a stat element whose label mentions "square foot"
    // Redfin renders market stats in <div class="market-stats-section"> or
    // similar containers.  We try several selector strategies.
    let priceText = null;

    // Try: find any element containing "per square foot" text, then grab the
    // nearest dollar figure.
    const sqftLocator = page.locator(
      'text=/price per square foot|per sq\\.?\\s*ft/i'
    );
    const sqftCount = await sqftLocator.count();
    if (sqftCount > 0) {
      // Walk up to the stat card parent, then find the dollar value
      const parent = sqftLocator.first().locator("xpath=ancestor::*[contains(@class,'stat') or contains(@class,'metric') or contains(@class,'KeyMetric')]");
      const parentCount = await parent.count();
      if (parentCount > 0) {
        const dollars = parent.first().locator('text=/\\$[\\d,]+/');
        const dollarsCount = await dollars.count();
        if (dollarsCount > 0) {
          priceText = await dollars.first().textContent();
        }
      }
    }

    // Strategy 2: broader search — grab all dollar figures on the page and
    // pick the one that looks like a $/sqft value (typically $200-$2000).
    if (!priceText) {
      log("Strategy 1 missed; trying broad dollar-figure scan...");
      const allText = await page.textContent("body");
      const dollarMatches = allText.match(/\$[\d,]+/g) || [];
      for (const match of dollarMatches) {
        const val = parseDollar(match);
        if (val >= 200 && val <= 2000) {
          priceText = match;
          log(`Found plausible $/sqft value via broad scan: ${match}`);
          break;
        }
      }
    }

    if (!priceText) {
      throw new Error("Could not locate price-per-sqft element on Redfin page");
    }

    const price = parseDollar(priceText);
    validate(price);

    log(`Redfin NYC $/sqft: $${price}`);
    return { price, source: "redfin", timestamp: new Date() };
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Fallback: scrape Zillow NYC home-values page.
 * Zillow shows the "Typical Home Value" and sometimes a $/sqft metric.
 * If only total home value is available, we estimate $/sqft by dividing
 * by the NYC median home size (~750 sqft for condos).
 */
async function scrapeZillow() {
  log("Scraping Zillow NYC home values page (fallback)...");
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    await page.goto(ZILLOW_URL, {
      waitUntil: "domcontentloaded",
      timeout: config.scrapeTimeoutMs,
    });

    await page.waitForTimeout(3000);

    let priceText = null;

    // Strategy 1: look for per-sqft text
    const sqftLocator = page.locator('text=/per sq\\.?\\s*ft|per square foot/i');
    const sqftCount = await sqftLocator.count();
    if (sqftCount > 0) {
      const parent = sqftLocator.first().locator("xpath=ancestor::*[1]");
      const dollars = parent.locator('text=/\\$[\\d,]+/');
      const dollarsCount = await dollars.count();
      if (dollarsCount > 0) {
        priceText = await dollars.first().textContent();
      }
    }

    // Strategy 2: look for "Typical Home Value" and derive $/sqft
    if (!priceText) {
      log("No per-sqft figure found on Zillow; looking for home value...");
      const allText = await page.textContent("body");

      // Find dollar amounts in the $100K-$5M range (typical NYC home value)
      const dollarMatches = allText.match(/\$[\d,]+/g) || [];
      let homeValue = null;
      for (const match of dollarMatches) {
        const val = parseDollar(match);
        if (val >= 100_000 && val <= 5_000_000) {
          homeValue = val;
          log(`Found plausible home value: ${match} ($${val})`);
          break;
        }
      }

      if (homeValue) {
        // Estimate: NYC median condo ~750 sqft
        const estimatedSqft = 750;
        const pricePerSqft = Math.round(homeValue / estimatedSqft);
        log(`Estimated $/sqft from home value: $${homeValue} / ${estimatedSqft} sqft = $${pricePerSqft}`);
        validate(pricePerSqft);
        return { price: pricePerSqft, source: "zillow", timestamp: new Date() };
      }

      throw new Error("Could not locate any price data on Zillow page");
    }

    const price = parseDollar(priceText);
    validate(price);

    log(`Zillow NYC $/sqft: $${price}`);
    return { price, source: "zillow", timestamp: new Date() };
  } finally {
    if (browser) await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Exported scrape function with retry + fallback
// ---------------------------------------------------------------------------

/**
 * Scrape NYC real estate $/sqft with retry and fallback logic.
 *
 * Tries Redfin up to `config.scrapeRetries` times with exponential backoff,
 * then falls back to Zillow with the same retry policy.
 *
 * @returns {{ price: number, source: string, timestamp: Date }}
 */
async function scrapeNYC() {
  const sources = [
    { name: "Redfin", fn: scrapeRedfin },
    { name: "Zillow", fn: scrapeZillow },
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

  throw new Error("NYC scrape failed: all sources and retries exhausted");
}

module.exports = { scrapeNYC };
