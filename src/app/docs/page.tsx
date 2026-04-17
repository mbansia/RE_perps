"use client";

import Link from "next/link";
import {
  MAX_LEVERAGE,
  MAX_POSITIONS,
  WITHDRAWAL_DELAY_HOURS,
  PRICE_ORACLE_ADDRESS,
  MARKET_MANAGER_ADDRESS,
  LIQUIDITY_POOL_ADDRESS,
  PERP_ENGINE_ADDRESS,
  LP_TOKEN_ADDRESS,
  TUSDI_ADDRESS,
  EXPLORER_URL,
  CHAIN_ID,
} from "@/lib/constants";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "markets", label: "Markets" },
  { id: "trading", label: "How Trading Works" },
  { id: "funding", label: "Funding" },
  { id: "liquidation", label: "Liquidation" },
  { id: "lp", label: "LP Pool" },
  { id: "oracle", label: "Oracle" },
  { id: "contracts", label: "Contracts" },
  { id: "faq", label: "FAQ" },
];

function ContractRow({ name, address }: { name: string; address: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="label">{name}</span>
      <Link
        href={`${EXPLORER_URL}/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs text-terra hover:text-terra-hover transition-colors"
      >
        {address.slice(0, 10)}…{address.slice(-6)}
      </Link>
    </div>
  );
}

function Section({
  id,
  title,
  kicker,
  children,
}: {
  id: string;
  title: string;
  kicker?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 mb-14">
      {kicker && (
        <div className="ticker-strip mb-2 text-terra">
          <span className="signal-dot mr-2 inline-block align-middle" />
          {kicker}
        </div>
      )}
      <h2 className="heading-display text-2xl md:text-3xl text-text-primary tracking-[0.15em] mb-4">
        {title}
      </h2>
      <div className="space-y-4 text-text-secondary leading-relaxed">{children}</div>
    </section>
  );
}

export default function DocsPage() {
  return (
    <div className="animate-slide-up">
      {/* Hero */}
      <div className="mb-10">
        <div className="ticker-strip mb-2">
          <span className="signal-dot mr-2 inline-block align-middle" />
          <span className="text-long">MISSION BRIEFING</span>
        </div>
        <h1 className="heading-display text-3xl md:text-5xl text-text-primary tracking-[0.15em]">
          DOCUMENTATION
        </h1>
        <p className="text-text-secondary mt-3 max-w-2xl">
          Everything you need to trade city-level real estate indices as perpetual futures on Integra.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-10">
        {/* Sticky nav */}
        <aside className="hidden lg:block">
          <div className="sticky top-28">
            <div className="ticker-strip mb-4">NAV</div>
            <nav className="space-y-1">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block text-sm text-text-muted hover:text-terra px-3 py-1.5 rounded-md hover:bg-terra/5 transition-all tracking-wide"
                >
                  {s.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <div className="max-w-3xl">
          <Section id="overview" title="Overview" kicker="01 // SURFACE">
            <p>
              <strong className="text-text-primary">Terraform</strong> is a perpetual-futures DEX for
              city-level real estate price indices. Users go long or short on the median $/sqft of
              New York City or Dubai using <code className="font-mono text-terra">tUSDI</code> as
              collateral, with leverage up to <strong>{MAX_LEVERAGE}x</strong>.
            </p>
            <p>
              The protocol follows a <strong>peer-to-pool AMM</strong> model (Parcl v3): the LP pool
              acts as the counterparty to every trade. Traders&apos; PnL is paid from / absorbed by the
              pool. LPs collect <strong>80%</strong> of trading fees; the protocol keeps the other
              20%.
            </p>
            <p>
              Prices are pushed on-chain 4× per day by a self-hosted Playwright scraper pulling
              median sale data from Redfin / Zillow (NYC) and DXBinteract / Property Finder (Dubai),
              signed with EIP-712 by an authorized oracle signer.
            </p>
          </Section>

          <Section id="markets" title="Markets" kicker="02 // SECTORS">
            <p>Two markets are live on Integra testnet (Chain ID {CHAIN_ID}):</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card p-5">
                <div className="text-2xl mb-2">🗽</div>
                <h3 className="heading-display text-lg text-text-primary tracking-widest">
                  NYC-PERP
                </h3>
                <p className="text-sm mt-1 text-text-muted">
                  Median $/sqft of New York City residential listings, sourced from Redfin with
                  Zillow fallback.
                </p>
              </div>
              <div className="card p-5">
                <div className="text-2xl mb-2">🏗️</div>
                <h3 className="heading-display text-lg text-text-primary tracking-widest">
                  DUBAI-PERP
                </h3>
                <p className="text-sm mt-1 text-text-muted">
                  Median AED/sqft from DXBinteract with Property Finder fallback, converted to USD
                  at the daily AED/USD rate.
                </p>
              </div>
            </div>
          </Section>

          <Section id="trading" title="How Trading Works" kicker="03 // PROTOCOL">
            <p>
              Position size is measured in <strong>sqft</strong>. The notional of a position is
              <span className="font-mono mx-2 text-text-primary">|sqft| × fillPrice</span>.
              Cross-margin is shared across all your open positions, up to{" "}
              <strong>{MAX_POSITIONS}</strong> positions per account.
            </p>
            <ul className="list-none space-y-2 pl-0">
              <li className="flex gap-3">
                <span className="text-terra font-mono">◦</span>
                <span>
                  <strong className="text-text-primary">Deposit</strong> tUSDI into the PerpEngine to
                  back your positions.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-terra font-mono">◦</span>
                <span>
                  <strong className="text-text-primary">Open</strong> a long ({" "}
                  <span className="text-long">+sqft</span>) or short (
                  <span className="text-short">−sqft</span>) — leverage is implicit from your
                  notional ÷ collateral.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-terra font-mono">◦</span>
                <span>
                  Fill price is <strong>skew-adjusted</strong>: trades that push skew further from
                  zero pay a premium; rebalancing trades get a discount.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-terra font-mono">◦</span>
                <span>
                  Withdrawals have a <strong>{WITHDRAWAL_DELAY_HOURS}-hour delay</strong> on
                  collateral for safety.
                </span>
              </li>
            </ul>
          </Section>

          <Section id="funding" title="Funding" kicker="04 // BALANCE">
            <p>
              Funding uses a <strong>velocity model</strong> (Synthetix v3 / Parcl v3): the funding
              rate doesn&apos;t snap to skew — it <em>accelerates</em> while skew persists.
            </p>
            <pre className="card p-4 text-xs font-mono overflow-x-auto">
{`velocity   = clamp(skew / skewScale, −1, +1) × maxVelocity
rate(t)    = rate(t₀) + velocity × Δt
fundingPnL = −avgRate × Δt × indexPrice × positionSize`}
            </pre>
            <p>
              If longs dominate, the rate becomes positive and longs pay shorts (and the LP pool
              collects the spread). The longer skew stays one-sided, the faster the rate climbs,
              incentivizing arbitrage.
            </p>
          </Section>

          <Section id="liquidation" title="Liquidation" kicker="05 // SAFETY">
            <p>
              Terraform uses <strong>full-account liquidation</strong>: when an account&apos;s total
              value falls below the maintenance margin, <em>all</em> of its positions are closed at
              once and a liquidation fee is paid to the liquidator.
            </p>
            <ul className="list-disc pl-5 text-sm space-y-1">
              <li>Initial margin: 10% of notional (max 10× leverage)</li>
              <li>Maintenance margin: 5% of notional</li>
              <li>Liquidation fee: 1% of notional (paid to liquidator)</li>
            </ul>
          </Section>

          <Section id="lp" title="LP Pool" kicker="06 // LIQUIDITY">
            <p>
              The LP pool is the counterparty to every trade. Depositing tUSDI mints LP tokens
              <code className="font-mono mx-1 text-terra">tfLP</code> at the current NAV. The pool
              collects 80% of fees and absorbs net trader PnL.
            </p>
            <p>
              Because LPs take the other side of every trade, their return is a function of (fees
              earned) minus (net trader profit). In balanced markets fees dominate; in strongly
              trending markets trader PnL can bite into the pool.
            </p>
          </Section>

          <Section id="oracle" title="Oracle" kicker="07 // TELEMETRY">
            <p>
              Prices are <strong>not trader-posted</strong>. A self-hosted Node.js service runs on a
              6-hour cron:
            </p>
            <ol className="list-decimal pl-5 text-sm space-y-1">
              <li>Playwright launches a headless browser, scrapes Redfin (NYC) and DXBinteract (Dubai)</li>
              <li>Fallback sources: Zillow, Property Finder</li>
              <li>Values are validated against per-city ranges (NYC: $200–$2000, Dubai: AED 800–5000)</li>
              <li>Signed with EIP-712 by an authorized signer</li>
              <li>Submitted to <code className="font-mono text-terra">PriceOracle.updatePricesBatch</code></li>
            </ol>
            <p>
              The contract enforces a staleness window (12h default) and a max per-update deviation
              so a compromised signer can&apos;t push wild values.
            </p>
          </Section>

          <Section id="contracts" title="Contracts" kicker="08 // DEPLOYMENTS">
            <p>All on Integra testnet (Chain {CHAIN_ID}). Click to view on Blockscout.</p>
            <div className="card p-5">
              <ContractRow name="PriceOracle" address={PRICE_ORACLE_ADDRESS} />
              <ContractRow name="MarketManager" address={MARKET_MANAGER_ADDRESS} />
              <ContractRow name="PerpEngine" address={PERP_ENGINE_ADDRESS} />
              <ContractRow name="LiquidityPool" address={LIQUIDITY_POOL_ADDRESS} />
              <ContractRow name="LPToken (tfLP)" address={LP_TOKEN_ADDRESS} />
              <ContractRow name="tUSDI" address={TUSDI_ADDRESS} />
            </div>
          </Section>

          <Section id="faq" title="FAQ" kicker="09 // SIGNAL">
            <div className="space-y-5">
              <div>
                <h3 className="text-text-primary font-semibold mb-1">
                  Is this mainnet? Can I lose real money?
                </h3>
                <p className="text-sm">
                  No. Terraform currently runs on Integra <strong>testnet</strong>. tUSDI is a test
                  stablecoin — get some from the <Link href="/faucet" className="text-terra hover:text-terra-hover">faucet</Link>. Gas is free on testnet.
                </p>
              </div>
              <div>
                <h3 className="text-text-primary font-semibold mb-1">
                  Why is the funding rate 0?
                </h3>
                <p className="text-sm">
                  Funding is only re-computed when someone trades. If a market has tiny volume and a
                  balanced book, the rate stays near zero. Once skew persists, the velocity model
                  pushes it up sharply.
                </p>
              </div>
              <div>
                <h3 className="text-text-primary font-semibold mb-1">
                  What happens if the oracle goes offline?
                </h3>
                <p className="text-sm">
                  Prices older than the staleness window (12h) are rejected by the contract — reads
                  revert with <code className="font-mono text-terra">PriceOracle: stale</code> and
                  trading on the affected market halts automatically.
                </p>
              </div>
              <div>
                <h3 className="text-text-primary font-semibold mb-1">
                  Why a {WITHDRAWAL_DELAY_HOURS}h withdrawal delay?
                </h3>
                <p className="text-sm">
                  It gives LPs a window to react to extreme market conditions and discourages
                  deposit-open-exploit-withdraw attacks.
                </p>
              </div>
            </div>
          </Section>

          <div className="mt-16 pt-8 border-t border-border/50">
            <p className="ticker-strip">
              END OF TRANSMISSION // TERRAFORM-01
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
