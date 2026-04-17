

# Terraform — Frontend Design Specification

> Perpetual-futures DEX for city-level real estate price indices on Integra testnet.
> Built with Next.js 14+ (App Router), TypeScript strict, Tailwind CSS, shadcn/ui, wagmi v2 + viem, Web3Auth.

---

## Table of Contents

1. [Design System Tokens](#1-design-system-tokens)
2. [Typography](#2-typography)
3. [Shared / Global Components](#3-shared--global-components)
4. [Page: Dashboard / Home (`/`)](#4-page-dashboard--home-)
5. [Page: Market (`/market/[slug]`)](#5-page-market-marketslug)
6. [Page: Portfolio (`/portfolio`)](#6-page-portfolio-portfolio)
7. [Page: LP Pool (`/pool`)](#7-page-lp-pool-pool)
8. [Page: Faucet / Onboarding (`/faucet`)](#8-page-faucet--onboarding-faucet)
9. [Custom Hooks](#9-custom-hooks)
10. [Responsive Behavior](#10-responsive-behavior)
11. [Accessibility & Performance Notes](#11-accessibility--performance-notes)

---

## 1. Design System Tokens

### 1.1 Color Palette

```ts
// tailwind.config.ts — extend.colors
const colors = {
  // ── Background Layers ──────────────────────────────────
  bg: {
    base:     '#0A0A0F',   // page background
    card:     '#12121A',   // card / panel surface
    elevated: '#1A1A24',   // elevated card, hover state, active row
    modal:    'rgba(4, 4, 8, 0.82)',  // modal backdrop (blur-xl behind)
    input:    '#0F0F17',   // form input wells
  },

  // ── Text ───────────────────────────────────────────────
  text: {
    primary:   '#F0F0F5',  // high-emphasis text
    secondary: '#A0A0B8',  // labels, descriptions
    muted:     '#5C5C72',  // disabled, timestamps, captions
    accent:    '#FF6D49',  // coral accent — links, interactive hints
    inverse:   '#0A0A0F',  // text on bright buttons
  },

  // ── Semantic / Trading ─────────────────────────────────
  long:    '#1FC16B',      // profit, long badges, positive change
  short:   '#FA3748',      // loss, short badges, negative change
  longMuted:  'rgba(31, 193, 107, 0.12)',  // long badge background
  shortMuted: 'rgba(250, 55, 72, 0.12)',   // short badge background
  neutral: '#3B82F6',      // informational, oracle, neutral stats
  warning: '#F59E0B',      // staleness warning, low health
  coral:   '#FF6D49',      // primary CTA, accent
  coralHover: '#FF8266',   // CTA hover

  // ── Border / Divider ──────────────────────────────────
  border: {
    DEFAULT:  '#1E1E2A',   // subtle card borders
    strong:   '#2A2A3A',   // active/focus borders
    accent:   '#FF6D49',   // highlighted borders (selected tab, focus ring)
  },
};
```

### 1.2 Shadows & Glassmorphism

```ts
const boxShadow = {
  card:      '0 1px 3px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.03)',
  elevated:  '0 4px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04)',
  glow: {
    long:    '0 0 20px rgba(31, 193, 107, 0.15)',
    short:   '0 0 20px rgba(250, 55, 72, 0.15)',
    coral:   '0 0 24px rgba(255, 109, 73, 0.25)',
  },
  modal:     '0 16px 64px rgba(0, 0, 0, 0.6)',
};

// Glassmorphism utility class
// .glass { @apply bg-bg-card/60 backdrop-blur-xl border border-border; }
```

### 1.3 Spacing Scale

Uses Tailwind default 4px base. Custom additions:

```ts
const spacing = {
  'panel-x': '20px',   // horizontal padding inside panels
  'panel-y': '16px',   // vertical padding inside panels
  'section': '32px',   // gap between page sections
  'page-x':  '24px',   // page-level horizontal gutter (mobile)
  'page-x-lg': '48px', // page-level horizontal gutter (desktop)
};
```

### 1.4 Border Radius

```ts
const borderRadius = {
  sm:   '6px',    // badges, chips
  md:   '10px',   // cards, inputs
  lg:   '14px',   // modals, elevated panels
  full: '9999px', // pills, toggles
};
```

---

## 2. Typography

### 2.1 Font Stack

```ts
const fontFamily = {
  sans:  ['Inter', 'system-ui', 'sans-serif'],   // headings, body, labels
  mono:  ['Geist Mono', 'JetBrains Mono', 'Menlo', 'monospace'],  // ALL prices, numbers, data
};
```

### 2.2 Type Scale

| Token           | Font     | Size   | Weight | Line Height | Letter Spacing | Usage                              |
|-----------------|----------|--------|--------|-------------|----------------|------------------------------------|
| `page-title`    | sans     | 28px   | 700    | 1.2         | -0.02em        | Page headings                      |
| `section-header`| sans     | 18px   | 600    | 1.3         | -0.01em        | Section / card titles              |
| `label`         | sans     | 13px   | 500    | 1.4         | 0.01em         | Input labels, stat labels          |
| `body`          | sans     | 14px   | 400    | 1.5         | 0              | Descriptions, paragraph text       |
| `data-lg`       | mono     | 22px   | 600    | 1.2         | -0.02em        | Hero prices, large numbers         |
| `data-md`       | mono     | 15px   | 500    | 1.3         | -0.01em        | Table cells, position values       |
| `data-sm`       | mono     | 13px   | 400    | 1.4         | 0              | Secondary data, timestamps         |
| `caption`       | sans     | 12px   | 400    | 1.4         | 0.02em         | Footnotes, help text               |

---

## 3. Shared / Global Components

### 3.1 `AppShell`

The root layout wrapper for every page.

```
┌─────────────────────────────────────────────────────────────┐
│  TopNav                                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  {children}  — page content                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

```tsx
// layout.tsx — root layout
interface AppShellProps {
  children: React.ReactNode;
}
```

No sidebar. Top navigation only. Content is full-width with `max-w-[1440px] mx-auto` centering.

---

### 3.2 `TopNav`

Sticky horizontal navigation bar at the top of every page.

**Visual:** Height 56px, bg-bg-card with bottom border. Glassmorphism when scrolled (`backdrop-blur-xl`).

**Layout:**

```
┌──────────────────────────────────────────────────────────────┐
│ [Logo]  Dashboard  Markets ▾  Portfolio  Pool  Faucet │ [WalletButton] │
└──────────────────────────────────────────────────────────────┘
```

```tsx
// No external props — internal state from hooks
// Components:
//   Logo          — "TERRAFORM" wordmark, sans 700, text-text-primary, letter-spacing: 0.08em
//   NavLink       — active state: text-text-primary + bottom coral underline (2px)
//                   inactive: text-text-secondary, hover: text-text-primary
//   MarketsDropdown — hover dropdown showing NYC + Dubai with live prices
//   WalletButton  — from ConnectKit/Web3Auth integration
```

**States:**
- **Disconnected:** WalletButton shows "Connect Wallet" in coral bg.
- **Connected:** WalletButton shows truncated address + small avatar. Clicking opens account popover with: address, tUSDI balance, "Disconnect" action.

---

### 3.3 `WalletButton`

```tsx
interface WalletButtonProps {
  className?: string;
}

// Data: useAccount(), useBalance() from wagmi
// Rendering:
//   disconnected → coral filled button "Connect Wallet"
//   connecting   → coral button with spinner
//   connected    → pill: [avatar] 0x1234...abcd [chevron]
//   on click (connected) → AccountPopover
```

---

### 3.4 `AccountPopover`

Floating popover from WalletButton click when connected.

```tsx
// Contents:
//   Full address (copyable)
//   tUSDI balance (data-md mono)
//   "View on Explorer" link
//   "Disconnect" button (text-short, hover underline)
```

---

### 3.5 Primitive UI Components

Built on top of shadcn/ui primitives, themed to Terraform brand:

#### `DataCell`

Displays a label/value pair. Used everywhere for stats.

```tsx
interface DataCellProps {
  label: string;            // rendered in `label` style, text-text-muted
  value: string | number;   // rendered in `data-md` mono, text-text-primary
  change?: number;          // optional — if provided, colored green/red with arrow
  unit?: string;            // e.g., "$/sqft", "tUSDI" — appended in text-text-muted
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;        // skeleton pulse
}
```

#### `PnlDisplay`

Shows a PnL value with automatic coloring and sign.

```tsx
interface PnlDisplayProps {
  value: number;            // positive = green, negative = red, zero = text-text-secondary
  format?: 'currency' | 'percent' | 'raw';
  size?: 'sm' | 'md' | 'lg';
  showSign?: boolean;       // default true — "+$1,234" or "-$567"
  prefix?: string;          // e.g., "$"
}

// Rendering:
//   positive → text-long, "+" prefix, up-arrow icon
//   negative → text-short, "-" prefix, down-arrow icon
//   zero     → text-text-secondary, no icon
```

#### `DirectionBadge`

```tsx
interface DirectionBadgeProps {
  direction: 'long' | 'short';
  size?: 'sm' | 'md';
}

// long  → bg-longMuted, text-long, "LONG"
// short → bg-shortMuted, text-short, "SHORT"
// rounded-sm, uppercase, font-sans weight-600, letter-spacing 0.04em
```

#### `HealthBar`

Visual indicator of account health (0–100%).

```tsx
interface HealthBarProps {
  healthFactor: number;     // 0 to 1
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

// Visual: horizontal bar, rounded-full
//   > 0.5  → bg-long (healthy)
//   0.25–0.5 → bg-warning (caution)
//   < 0.25 → bg-short (danger, pulses)
// Label shows percentage, data-sm mono
```

#### `SkeletonLoader`

Pulsing placeholder matching the shape of each component. Used in all loading states. Inherits component dimensions. bg-bg-elevated with animate-pulse.

#### `EmptyState`

```tsx
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

// Centered vertically in parent. Icon in text-text-muted, title in section-header,
// description in body text-text-secondary, action button in coral.
```

#### `ErrorState`

```tsx
interface ErrorStateProps {
  message: string;
  retry?: () => void;
}

// Similar to EmptyState but with warning icon in text-short.
// "Retry" button if retry callback provided.
```

#### `NumberInput`

Numeric input styled for trading. Monospaced value display.

```tsx
interface NumberInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  unit?: string;             // shown as suffix inside input
  max?: number;
  min?: number;
  step?: number;
  error?: string;
  disabled?: boolean;
}

// Visual: bg-bg-input, border border-border, rounded-md
// Focus: border-border-accent, shadow-glow-coral
// Value: font-mono data-md
// Unit: text-text-muted inside input, right-aligned
// Max button: small text link above input
```

#### `SliderInput`

For leverage selection.

```tsx
interface SliderInputProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  marks?: number[];         // labeled tick marks (e.g., [1, 2, 5, 10])
  label?: string;
  formatValue?: (v: number) => string;  // e.g., (v) => `${v}x`
}

// Track: bg-bg-elevated, h-1.5, rounded-full
// Filled portion: bg-coral gradient
// Thumb: 16px circle, bg-coral, shadow-glow-coral, border-2 border-bg-base
// Marks: small ticks below with label in caption style
```

#### `TabGroup`

```tsx
interface TabGroupProps {
  tabs: { id: string; label: string; count?: number }[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: 'underline' | 'pill';
}

// underline variant: bottom border indicator, coral when active
// pill variant: bg-bg-elevated when active, used for Long/Short toggle
```

#### `Modal`

```tsx
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full'; // full = mobile trade panel
}

// Overlay: bg-modal backdrop-blur-sm
// Panel: bg-bg-card, rounded-lg, shadow-modal, border border-border
// Close: X button top-right, text-text-muted hover:text-text-primary
```

#### `TransactionButton`

Primary action button that handles wallet connection, approval, and transaction states.

```tsx
interface TransactionButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;     // e.g., "Opening Position..."
  variant?: 'coral' | 'long' | 'short' | 'outline';
  fullWidth?: boolean;
}

// coral: bg-coral hover:bg-coralHover text-text-inverse
// long:  bg-long/90 hover:bg-long text-text-inverse
// short: bg-short/90 hover:bg-short text-text-inverse
// outline: border-border-strong bg-transparent text-text-primary hover:bg-bg-elevated
//
// States:
//   loading → spinner + loadingLabel, pointer-events-none, opacity-80
//   disabled → opacity-40, cursor-not-allowed
//   Wallet not connected → overrides label to "Connect Wallet", onClick triggers connect
```

#### `Tooltip`

```tsx
interface TooltipProps {
  content: string | React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

// bg-bg-elevated, border border-border-strong, rounded-md
// text caption style, max-w-[240px]
// 200ms open delay
```

#### `OracleStatusIndicator`

Small dot + text showing oracle freshness.

```tsx
interface OracleStatusIndicatorProps {
  lastUpdate: number;       // unix timestamp
  nextExpected: number;     // unix timestamp
}

// Data: useOracleStatus()
// Fresh (< 5 min): green dot, "Updated Xs ago"
// Aging (5–15 min): warning dot, "Updated Xm ago"
// Stale (> 15 min): red dot + pulse, "Oracle stale — Xm ago", text-short
```

---

## 4. Page: Dashboard / Home (`/`)

**Route:** `app/page.tsx`

**Purpose:** Landing page. Gives a snapshot of both markets and the user's account at a glance.

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  TopNav                                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [AccountSummaryBar]  ← full width, only if wallet connected    │
│                                                                 │
│  ┌────────────────────────┐  ┌────────────────────────┐         │
│  │   CityMarketCard NYC   │  │  CityMarketCard Dubai  │         │
│  └────────────────────────┘  └────────────────────────┘         │
│                                                                 │
│  [RecentActivityFeed]  ← full width table                       │
│                                                                 │
│  [ConnectWalletCTA]  ← only if wallet NOT connected             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Components

#### `DashboardPage`

```tsx
// app/page.tsx — Server Component shell
// No props. Wraps client components.
```

---

#### `AccountSummaryBar`

Horizontal bar summarizing the connected user's account.

```tsx
interface AccountSummaryBarProps {}
// Entirely self-contained — reads data from hooks.

// Data sources:
//   useAccountHealth(address) → collateral, unrealizedPnl, availableMargin, healthFactor
//   useAccount() → address, isConnected

// Visual:
//   Full-width card, bg-bg-card, border-b border-border, glass effect
//   Four DataCells in a row:
//     1. "Total Collateral" — value in tUSDI, data-md
//     2. "Unrealized PnL"  — PnlDisplay, data-md
//     3. "Available Margin" — value in tUSDI
//     4. "Account Health"   — HealthBar + percentage
//   Compact: 48px tall, items evenly spaced

// States:
//   loading    → four SkeletonLoader cells
//   connected  → show data
//   disconnected → component not rendered (parent hides it)
```

---

#### `CityMarketCard`

Large interactive card for each market. Primary navigation to market pages.

```tsx
interface CityMarketCardProps {
  marketId: 'nyc' | 'dubai';
  slug: string;             // URL slug for navigation
}

// Data sources:
//   useMarketData(marketId) → price, change24h, skew, fundingRate

// Visual:
//   Width: 50% on desktop (side by side, gap-6), 100% stacked on mobile
//   Height: ~220px
//   bg-bg-card, rounded-lg, border border-border, shadow-card
//   Glassmorphism: subtle bg gradient overlay (NYC: blue-tinted, Dubai: amber-tinted, both very low opacity ~0.04)
//   Hover: shadow-elevated, border-border-strong, translate-y -1px transition
//
//   Layout inside card:
//   ┌──────────────────────────────────────────┐
//   │  City Label (section-header)    [→ icon] │
//   │  "New York City" or "Dubai"              │
//   │                                          │
//   │  $487.23 /sqft        +2.34% ▲           │
//   │  (data-lg mono)       (PnlDisplay)       │
//   │                                          │
//   │  ┌──────┐ ┌──────┐ ┌──────────┐         │
//   │  │ Skew │ │  OI  │ │ Funding  │         │
//   │  │ 62%L │ │ 1.2M │ │+0.003%/h │         │
//   │  └──────┘ └──────┘ └──────────┘         │
//   └──────────────────────────────────────────┘
//
//   Skew visualized as a small horizontal bar: green portion = long%, red = short%
//   Clicking the card navigates to /market/[slug]

// States:
//   loading → SkeletonLoader matching card shape
//   error   → card shows ErrorState inline with retry
```

---

#### `RecentActivityFeed`

Table of the most recent trades across both markets.

```tsx
interface RecentActivityFeedProps {
  limit?: number;           // default 15
}

// Data sources:
//   Contract event logs — TradeOpened / TradeClosed events from both market contracts
//   Polled or WebSocket subscription

// Visual:
//   Section title: "Recent Activity" (section-header)
//   Table with columns:
//     Time (data-sm, text-text-muted, relative "2m ago")
//     Market (NYC/Dubai label)
//     Direction (DirectionBadge)
//     Size (data-md mono, "1,200 sqft")
//     Price (data-md mono, "$/sqft")
//     Trader (truncated address, text-text-muted, links to explorer)
//
//   Rows: bg-transparent, hover:bg-bg-elevated, border-b border-border
//   New rows slide in from top with subtle fade animation
//   Max height with overflow-y-auto if more than `limit` rows

// States:
//   loading → 5 skeleton rows
//   empty   → EmptyState "No trades yet. Be the first!"
//   error   → ErrorState with retry
```

---

#### `ConnectWalletCTA`

Shown only when no wallet is connected. Encourages connection.

```tsx
interface ConnectWalletCTAProps {}

// Visual:
//   Centered card, max-w-md, bg-bg-card, rounded-lg, border border-border
//   Glassmorphism, shadow-elevated
//   Icon: wallet icon, 48px, text-coral
//   Title: "Connect Your Wallet" (section-header)
//   Description: "Connect via Web3Auth or browser wallet to start trading real estate indices." (body, text-text-secondary)
//   Button: WalletButton (coral, large, full-width)
//
//   Positioned below the city cards, vertically centered in remaining space
```

---

## 5. Page: Market (`/market/[slug]`)

**Route:** `app/market/[slug]/page.tsx`

**Purpose:** The core trading view. Users analyze price action and open/close positions.

### Layout (Desktop)

```
┌────────────────────────────────────────────────────────────────────┐
│  TopNav                                                            │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [MarketHeader]  ← full width bar with market name + key stats     │
│                                                                    │
│  ┌──────────────────────────────┐  ┌───────────────────────┐       │
│  │                              │  │                       │       │
│  │     PriceChart               │  │    TradePanel         │       │
│  │     (line chart, ~65% w)     │  │    (sidebar, ~35% w)  │       │
│  │                              │  │                       │       │
│  │                              │  │                       │       │
│  └──────────────────────────────┘  └───────────────────────┘       │
│                                                                    │
│  [OpenPositionsTable]  ← only if user has positions in this market │
│                                                                    │
│  [MarketRecentTrades]  ← recent trades for this market only        │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Components

#### `MarketPage`

```tsx
// app/market/[slug]/page.tsx
interface MarketPageProps {
  params: { slug: string };  // 'nyc' | 'dubai'
}

// Resolves slug to marketId, renders sub-components.
// If slug is invalid, renders 404.
```

---

#### `MarketHeader`

Full-width bar with market identity and key statistics.

```tsx
interface MarketHeaderProps {
  marketId: 'nyc' | 'dubai';
}

// Data sources:
//   useMarketData(marketId) → price, change24h, totalOI, skew, fundingRate
//   useOracleStatus() → lastUpdate, nextExpected

// Visual:
//   Full-width, bg-bg-card, border-b border-border, py-4 px-panel-x
//
//   Left section:
//     Market name: "New York City" or "Dubai" (page-title)
//     Subtitle: "Real Estate Price Index" (caption, text-text-muted)
//
//   Right section — row of DataCells:
//     Current Price: $487.23/sqft (data-lg, text-text-primary)
//     24h Change: PnlDisplay (data-md)
//     Open Interest: "$2.4M" (data-md)
//     Skew: "62% Long" with mini bar
//     Funding Rate: "+0.003%/h" (data-md, colored green if positive = longs pay)
//     OracleStatusIndicator
//
//   All stats on one line, separated by subtle vertical dividers (border-r border-border, h-8)

// States:
//   loading → skeleton cells
//   error → inline error text where stats would be, with retry link
```

---

#### `PriceChart`

Line chart of the real estate price index over time.

```tsx
interface PriceChartProps {
  marketId: 'nyc' | 'dubai';
}

// Data sources:
//   Oracle price history (contract reads or indexed events)
//   Time range controlled by local state

// Visual:
//   Container: bg-bg-card, rounded-lg, border border-border, shadow-card
//   Padding: p-panel-x (top has time range selector)
//
//   Time range selector (top-right): TabGroup pill variant
//     Tabs: 1D | 1W | 1M
//     Default: 1W
//
//   Chart area:
//     Library: lightweight-charts (TradingView) or recharts
//     Line color: #FF6D49 (coral) — single clean line, no fill by default
//     Subtle gradient fill below line: coral → transparent (opacity 0.08)
//     Grid lines: border color at 0.05 opacity
//     Y-axis: data-sm mono, text-text-muted, right-aligned, $/sqft
//     X-axis: data-sm mono, text-text-muted, date/time labels
//     Crosshair: vertical + horizontal dashed lines (#5C5C72)
//     Tooltip on hover: date, price, 24h change — bg-bg-elevated, rounded-md, shadow-elevated
//
//   Minimum height: 380px
//   Responsive: fills available width (flex-1)

// States:
//   loading → skeleton rectangle matching chart area, subtle pulse
//   error   → ErrorState centered in chart area
//   no data → EmptyState "No price history available"
```

---

#### `TradePanel`

Right sidebar for placing trades. The core interaction surface.

```tsx
interface TradePanelProps {
  marketId: 'nyc' | 'dubai';
}

// Data sources:
//   useMarketData(marketId) → current price, skew (for fill price calculation)
//   useAccountHealth(address) → availableMargin, collateral
//   useTrade() → openPosition mutation
//   useAccount() → isConnected

// Visual:
//   Container: bg-bg-card, rounded-lg, border border-border, shadow-card
//   Sticky: position sticky, top: 72px (below nav)
//   Width: 380px fixed on desktop
//   Padding: p-panel-x
//
//   ┌─────────────────────────────┐
//   │  [DirectionToggle]          │   ← Long / Short pill toggle, full width
//   │                             │
//   │  Size (sqft)                │   ← NumberInput, unit="sqft"
//   │  ≈ $58,467 notional         │   ← computed, caption, text-text-muted
//   │                             │
//   │  Leverage                   │   ← SliderInput, 1x–10x, marks at 1,2,5,10
//   │  [ ──────●───── ] 5x       │
//   │                             │
//   │  ─── Order Summary ───      │   ← divider with label
//   │                             │
//   │  Entry Price    $488.12     │   ← DataCell (skew-adjusted price)
//   │  Margin Req.    $5,846.70   │   ← DataCell
//   │  Trading Fee    $11.69      │   ← DataCell
//   │  Liq. Price     $439.31     │   ← DataCell, text-warning if close to current
//   │                             │
//   │  [====== Open Long ======]  │   ← TransactionButton (long or short variant)
//   │                             │
//   │  Available: 12,500 tUSDI    │   ← caption, text-text-muted
//   └─────────────────────────────┘

// DirectionToggle:
//   Two-segment pill toggle, full width
//   Long selected:  left segment bg-long/20, text-long, border-long/30
//   Short selected: right segment bg-short/20, text-short, border-short/30
//   Unselected segment: bg-bg-input, text-text-muted
//   Transition: 150ms ease

// Order Summary:
//   Each row is a flex justify-between
//   Label: label style, text-text-secondary
//   Value: data-sm mono, text-text-primary
//   Liq. Price: text-warning if within 15% of entry price

// CTA Button:
//   Long mode:  variant="long", label="Open Long"
//   Short mode: variant="short", label="Open Short"
//   Disabled if: size=0, margin > available, wallet disconnected

// States:
//   disconnected → entire panel shows, but CTA is "Connect Wallet"
//   loading (account data) → skeleton where balance/summary would be
//   insufficient margin → CTA disabled, red caption "Insufficient margin"
//   submitting → CTA shows spinner + "Opening Position..."
//   success → brief green flash on panel border, toast notification
//   error → toast notification with error message
```

---

#### `OpenPositionsTable`

Shows the user's open positions for this specific market.

```tsx
interface OpenPositionsTableProps {
  marketId: 'nyc' | 'dubai';
}

// Data sources:
//   usePositions(address) → filtered to this marketId
//   useMarketData(marketId) → for current price (PnL calculation)

// Visual:
//   Section title: "Your Positions" (section-header)
//   Only rendered if user has >= 1 position in this market
//
//   Table columns:
//     Direction    — DirectionBadge
//     Size         — "1,200 sqft" (data-md mono)
//     Entry Price  — "$482.50" (data-md mono)
//     Current Price— "$487.23" (data-md mono)
//     Unrealized PnL — PnlDisplay (data-md)
//     Funding PnL  — PnlDisplay (data-sm, smaller)
//     Margin Used  — "$5,800" (data-sm mono)
//     Leverage     — "5.0x" (data-sm mono)
//     Action       — "Close" button (outline variant, small)
//
//   Row styling:
//     bg-bg-card, hover:bg-bg-elevated
//     Left border accent: 3px solid, long=green, short=red
//     border-b border-border between rows
//
//   Close button click → opens ClosePositionModal

// States:
//   loading       → 2 skeleton rows
//   no positions  → component not rendered
//   disconnected  → component not rendered
```

---

#### `ClosePositionModal`

Confirmation modal for closing a position.

```tsx
interface ClosePositionModalProps {
  position: Position;       // full position data
  open: boolean;
  onClose: () => void;
}

// Data sources:
//   useTrade() → closePosition mutation
//   useMarketData(position.marketId) → for current exit price

// Visual:
//   Modal size="sm"
//   Title: "Close Position"
//
//   Summary:
//     Market: NYC / Dubai
//     Direction: DirectionBadge
//     Size: "1,200 sqft"
//     Entry Price: "$482.50"
//     Exit Price: "$487.23" (skew-adjusted)
//     Realized PnL: PnlDisplay (data-lg, prominent)
//     Funding PnL: PnlDisplay (data-md)
//     Fee: "$11.20"
//
//   Two buttons:
//     "Cancel" — outline variant
//     "Confirm Close" — coral variant
//
// States:
//   submitting → "Confirm Close" shows spinner
//   success → modal closes, toast "Position closed"
//   error → inline error message above buttons
```

---

#### `MarketRecentTrades`

Recent trades table specific to this market.

```tsx
interface MarketRecentTradesProps {
  marketId: 'nyc' | 'dubai';
  limit?: number;           // default 20
}

// Same visual design as RecentActivityFeed but:
//   - No "Market" column (redundant)
//   - Section title: "Recent Trades"
//   - Only shows trades for this market

// Data sources:
//   Contract event logs filtered by marketId
```

---

## 6. Page: Portfolio (`/portfolio`)

**Route:** `app/portfolio/page.tsx`

**Purpose:** Complete view of the user's trading account: all positions, collateral management, and history.

### Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  TopNav                                                            │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [PortfolioAccountSummary]  ← top section, full width              │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  [AllPositionsTable]  ← full width                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐     │
│  │  CollateralManager      │  │  PnlHistory                 │     │
│  │  (deposit/withdraw)     │  │  (realized trades list)     │     │
│  └─────────────────────────┘  └─────────────────────────────┘     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Components

#### `PortfolioPage`

```tsx
// app/portfolio/page.tsx
// Requires wallet connection — if disconnected, show full-page ConnectWalletCTA
```

---

#### `PortfolioAccountSummary`

Expanded version of AccountSummaryBar with more detail.

```tsx
interface PortfolioAccountSummaryProps {}

// Data sources:
//   useAccountHealth(address) → all account metrics
//   usePositions(address) → to compute aggregate stats

// Visual:
//   Full-width card, bg-bg-card, rounded-lg, border border-border, shadow-card
//   Two rows:
//
//   Row 1 (primary metrics, large):
//     Total Collateral:  "$15,000.00" (data-lg)
//     Total Unrealized PnL: PnlDisplay (data-lg)
//     Available Margin: "$8,234.50" (data-lg)
//     Account Health: HealthBar (md) + percentage (data-lg)
//
//   Row 2 (secondary metrics, smaller):
//     Total Margin Used: "$6,765.50" (data-md)
//     Open Positions: "4 / 12" (data-md, mono)
//     Markets Active: "NYC, Dubai" or "NYC" or "—"
//
//   Account health section gets special treatment:
//     If health < 0.25: red border glow on the entire card, warning icon
//     Caption below: "Liquidation risk! Consider adding collateral or closing positions."

// States:
//   loading → skeleton cells
//   no positions → secondary row shows "No open positions"
```

---

#### `AllPositionsTable`

All positions across both markets.

```tsx
interface AllPositionsTableProps {}

// Data sources:
//   usePositions(address)
//   useMarketData('nyc'), useMarketData('dubai')

// Visual:
//   Section title: "Open Positions" (section-header)
//   Full-width table, bg-bg-card, rounded-lg, border border-border
//
//   Columns:
//     Market       — "NYC" / "Dubai" label (with tiny colored dot: blue for NYC, amber for Dubai)
//     Direction    — DirectionBadge
//     Size         — "1,200 sqft" (data-md mono)
//     Entry Price  — "$482.50" (data-md mono)
//     Current Price— "$487.23" (data-md mono)
//     Unrealized PnL — PnlDisplay (data-md)
//     Funding PnL  — PnlDisplay (data-sm)
//     Margin Used  — "$5,800" (data-md mono)
//     Leverage     — "5.0x" (data-md mono)
//     Actions      — icon buttons: [Close] [Modify]
//
//   Row left border: 3px, colored by direction (long=green, short=red)
//   Row hover: bg-bg-elevated
//   Sortable by any column (click header to sort, chevron indicator)
//
//   Modify click → opens ModifyPositionModal (adjust margin / partial close)
//   Close click  → opens ClosePositionModal

// States:
//   loading      → 3 skeleton rows
//   no positions → EmptyState "No open positions. Head to a market to open your first trade."
//                  with action button "Explore Markets"
//   error        → ErrorState with retry
```

---

#### `ModifyPositionModal`

Modal for adjusting an existing position's margin (add/remove margin to change leverage).

```tsx
interface ModifyPositionModalProps {
  position: Position;
  open: boolean;
  onClose: () => void;
}

// Data sources:
//   useTrade() → modifyPosition mutation
//   useAccountHealth(address) → available margin

// Visual:
//   Modal size="sm"
//   Title: "Modify Position"
//
//   Current stats:
//     Market, Direction, Size, Entry Price, Current Leverage
//
//   Action: TabGroup "Add Margin" / "Remove Margin"
//
//   NumberInput: amount of tUSDI to add/remove
//   Preview: new leverage, new liquidation price
//
//   "Confirm" button
```

---

#### `CollateralManager`

Card for depositing and withdrawing tUSDI collateral.

```tsx
interface CollateralManagerProps {}

// Data sources:
//   useCollateral() → deposit, withdraw mutations
//   useAccountHealth(address) → current collateral
//   useBalance() → tUSDI wallet balance (for deposit max)
//   useContractRead() → pending withdrawal info

// Visual:
//   Card: bg-bg-card, rounded-lg, border border-border, shadow-card
//   Title: "Collateral" (section-header)
//
//   TabGroup (underline variant): "Deposit" | "Withdraw"
//
//   Deposit tab:
//     Wallet balance display: "Wallet: 25,000 tUSDI" (caption)
//     NumberInput: amount, unit="tUSDI", Max button fills wallet balance
//     TransactionButton: "Deposit tUSDI" (coral)
//
//   Withdraw tab:
//     Available to withdraw: "8,234 tUSDI" (caption)
//     NumberInput: amount, unit="tUSDI", Max button fills available
//     ⚠️ Warning notice (bg-warning/10, border-l-2 border-warning, rounded-md):
//       "Withdrawals have a 24-hour delay. You will be able to claim
//        your funds after the delay period."
//     TransactionButton: "Request Withdrawal" (outline)
//
//   Pending withdrawal section (if applicable):
//     "Pending: 5,000 tUSDI"
//     "Available to claim in: 18h 34m" — countdown, data-sm mono
//     TransactionButton: "Claim" (coral, enabled only when ready)

// States:
//   loading → skeleton form
//   disconnected → not rendered (page-level guard)
//   success → toast "Deposit successful" / "Withdrawal requested"
```

---

#### `PnlHistory`

List of realized (closed) trades.

```tsx
interface PnlHistoryProps {}

// Data sources:
//   Contract event logs — TradeClosed events for connected address

// Visual:
//   Card: bg-bg-card, rounded-lg, border border-border, shadow-card
//   Title: "Trade History" (section-header)
//
//   List of closed trades (most recent first):
//   Each row:
//     Date/time (data-sm, text-text-muted)
//     Market + Direction (label + DirectionBadge)
//     Size: "800 sqft"
//     Entry → Exit: "$475.20 → $489.10"
//     Realized PnL: PnlDisplay (data-md, prominent)
//
//   Max 20 items shown, "Load More" button at bottom
//   Scrollable within card (max-h-[500px] overflow-y-auto)

// States:
//   loading → 3 skeleton items
//   empty   → EmptyState "No trade history yet"
```

---

## 7. Page: LP Pool (`/pool`)

**Route:** `app/pool/page.tsx`

**Purpose:** Deposit tUSDI into the LP pool to earn fees as the counterparty to traders.

### Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  TopNav                                                            │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [PoolHeader]  ← title + high-level stats                         │
│                                                                    │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐     │
│  │  PoolDepositWithdraw    │  │  PoolComposition            │     │
│  │  (form card)            │  │  (stats card)               │     │
│  └─────────────────────────┘  └─────────────────────────────┘     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Components

#### `PoolPage`

```tsx
// app/pool/page.tsx
// Accessible to both connected and disconnected users (stats visible, actions require connection)
```

---

#### `PoolHeader`

```tsx
interface PoolHeaderProps {}

// Data sources:
//   usePool() → tvl, userShare, apr, fees24h

// Visual:
//   Page title: "Liquidity Pool" (page-title)
//   Subtitle: "Earn fees as the counterparty to traders" (body, text-text-secondary)
//
//   Stats row (four DataCells):
//     Total Value Locked: "$1,240,000" (data-lg)
//     Your Share: "$12,400 (1.0%)" (data-lg) — or "—" if disconnected
//     Current APR: "14.2%" (data-lg, text-long)
//     24h Fees: "$1,840" (data-lg)

// States:
//   loading → skeleton cells
//   disconnected → "Your Share" shows "Connect wallet" link
```

---

#### `PoolDepositWithdraw`

Card for LP deposit and withdrawal.

```tsx
interface PoolDepositWithdrawProps {}

// Data sources:
//   usePool() → deposit, withdraw mutations, lpTokenBalance
//   useBalance() → tUSDI wallet balance
//   useAccount()

// Visual:
//   Card: bg-bg-card, rounded-lg, border border-border, shadow-card
//   Width: ~45% on desktop
//
//   TabGroup (underline): "Deposit" | "Withdraw"
//
//   Deposit tab:
//     Wallet balance: "25,000 tUSDI" (caption, with Max button)
//     NumberInput: amount, unit="tUSDI"
//     Preview: "You will receive: ~245.3 tfLP tokens" (caption, data-sm mono)
//     TransactionButton: "Deposit to Pool" (coral)
//
//   Withdraw tab:
//     LP token balance: "245.3 tfLP" (caption, with Max button)
//     NumberInput: amount, unit="tfLP"
//     Preview: "You will receive: ~12,400 tUSDI" (caption, data-sm mono)
//     ⚠️ Warning notice (same style as CollateralManager):
//       "Withdrawals have a 24-hour delay."
//     TransactionButton: "Request Withdrawal" (outline)
//
//   Pending withdrawal section (same pattern as CollateralManager)

// States:
//   disconnected → form visible but CTA is "Connect Wallet"
//   loading → skeleton form
//   success → toast notification
```

---

#### `PoolComposition`

Card showing the internal state of the LP pool.

```tsx
interface PoolCompositionProps {}

// Data sources:
//   usePool() → totalDeposits, traderPnlExposure, accumulatedFees, utilizationRate

// Visual:
//   Card: bg-bg-card, rounded-lg, border border-border, shadow-card
//   Width: ~55% on desktop
//   Title: "Pool Composition" (section-header)
//
//   Visual breakdown (stacked horizontal bar):
//     Deposits portion (coral)
//     Trader PnL exposure (green if pool is winning, red if losing)
//     Accumulated fees (neutral blue)
//     Bar: h-3, rounded-full, bg-bg-elevated base
//
//   Below bar, three DataCells:
//     Total Deposits: "$1,200,000"
//     Trader PnL Exposure: PnlDisplay "-$24,000" (from pool's perspective: negative means traders are winning)
//     Accumulated Fees: "$64,000"
//
//   Additional stats:
//     Pool Utilization: "42%" with progress bar
//     Net Pool Value: "$1,240,000"
//
//   Tooltip on "Trader PnL Exposure":
//     "This represents the unrealized profit/loss of all open trader positions.
//      Negative means traders are currently profitable (pool liability).
//      Positive means traders are currently at a loss (pool gain)."

// States:
//   loading → skeleton bar + cells
//   error → ErrorState
```

---

## 8. Page: Faucet / Onboarding (`/faucet`)

**Route:** `app/faucet/page.tsx`

**Purpose:** Help new users get testnet tokens and understand the basic flow.

### Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  TopNav                                                            │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│          ┌─────────────────────────────────────┐                   │
│          │                                     │                   │
│          │  FaucetCard                          │                   │
│          │  (centered, max-w-lg)               │                   │
│          │                                     │                   │
│          └─────────────────────────────────────┘                   │
│                                                                    │
│          ┌─────────────────────────────────────┐                   │
│          │  OnboardingSteps                    │                   │
│          │  (centered, max-w-lg)               │                   │
│          └─────────────────────────────────────┘                   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Components

#### `FaucetCard`

```tsx
interface FaucetCardProps {}

// Data sources:
//   useBalance() → tUSDI balance
//   useAccount() → address, isConnected

// Visual:
//   Card: bg-bg-card, rounded-lg, border border-border, shadow-elevated
//   Max-width: 480px, centered
//   Padding: p-8
//
//   Title: "Testnet Faucet" (page-title)
//   Description: "Get tUSDI tokens to start trading on Terraform testnet." (body, text-text-secondary)
//
//   If connected:
//     Current balance: "Your tUSDI Balance: 25,000.00" (data-lg, mono)
//     Wallet address: truncated, copyable (caption)
//
//   External link button:
//     "Get Testnet tUSDI" → opens Integra faucet URL in new tab
//     Styled as coral TransactionButton with external-link icon
//     Caption below: "Opens the Integra testnet faucet in a new tab"
//
//   If not connected:
//     WalletButton (coral, full-width)
//     Caption: "Connect your wallet to see your balance and access the faucet"

// States:
//   connected → balance + faucet link
//   disconnected → connect prompt
//   loading → skeleton balance
```

---

#### `OnboardingSteps`

Visual step-by-step guide for new users.

```tsx
interface OnboardingStepsProps {}

// No data sources — static content

// Visual:
//   Card: bg-bg-card, rounded-lg, border border-border, shadow-card
//   Max-width: 480px, centered, mt-6
//   Title: "Getting Started" (section-header)
//
//   Three steps, vertical layout:
//
//   Step 1: [circle "1"] "Get Testnet Tokens"
//     "Use the faucet above to receive tUSDI on Integra testnet."
//     Link: "Get Tokens →" (text-coral)
//
//   Step 2: [circle "2"] "Deposit Collateral"
//     "Deposit tUSDI into your margin account to enable trading."
//     Link: "Go to Portfolio →" (text-coral, links to /portfolio)
//
//   Step 3: [circle "3"] "Open Your First Trade"
//     "Choose NYC or Dubai, pick a direction, and open a position."
//     Link: "Explore Markets →" (text-coral, links to /)
//
//   Step circles: 28px, rounded-full, bg-coral/15, text-coral, font-sans weight-700
//   Step title: label weight-600, text-text-primary
//   Step description: caption, text-text-secondary
//   Vertical line connecting circles: 1px border-border, left offset at circle center
//
//   If wallet connected + balance > 0: step 1 gets a green checkmark
//   If user has collateral deposited: step 2 gets a green checkmark
//   If user has any position: step 3 gets a green checkmark
```

---

## 9. Custom Hooks

All hooks use wagmi v2's `useReadContract` / `useWriteContract` / `useWatchContractEvent` patterns. Addresses and ABIs imported from a shared `config/contracts.ts` file.

### `useMarketData(marketId: 'nyc' | 'dubai')`

```tsx
interface MarketData {
  marketId: 'nyc' | 'dubai';
  currentPrice: bigint;          // oracle price in 18-decimal USD
  priceFormatted: number;        // human-readable $/sqft
  change24h: number;             // percentage
  change24hAbsolute: number;     // absolute $ change
  totalOpenInterest: bigint;     // total OI in USD
  totalOIFormatted: number;
  longOpenInterest: bigint;
  shortOpenInterest: bigint;
  skew: number;                  // -1 to +1 (negative = short heavy)
  skewPercent: { long: number; short: number }; // e.g., { long: 62, short: 38 }
  fundingRate: number;           // per-hour rate
  maxLeverage: number;           // 10
}

interface UseMarketDataReturn {
  data: MarketData | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

// Implementation notes:
//   Reads from MarketManager contract: getMarketState(marketId)
//   Reads from Oracle contract: getPrice(marketId)
//   Polls every 15 seconds (refetchInterval: 15_000)
//   24h change computed by comparing current price to price 24h ago (separate query)
```

### `usePositions(address: `0x${string}` | undefined)`

```tsx
interface Position {
  id: bigint;                    // position ID from contract
  marketId: 'nyc' | 'dubai';
  direction: 'long' | 'short';
  size: bigint;                  // sqft in 18-decimal
  sizeFormatted: number;         // human-readable sqft
  entryPrice: bigint;            // 18-decimal $/sqft
  entryPriceFormatted: number;
  currentPrice: bigint;
  currentPriceFormatted: number;
  notionalValue: bigint;         // size * currentPrice
  notionalFormatted: number;
  unrealizedPnl: bigint;
  unrealizedPnlFormatted: number;
  fundingPnl: bigint;
  fundingPnlFormatted: number;
  marginUsed: bigint;
  marginUsedFormatted: number;
  leverage: number;              // current effective leverage
  liquidationPrice: bigint;
  liquidationPriceFormatted: number;
  openedAt: number;              // unix timestamp
}

interface UsePositionsReturn {
  positions: Position[];
  positionsByMarket: {
    nyc: Position[];
    dubai: Position[];
  };
  totalUnrealizedPnl: number;
  totalMarginUsed: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

// Implementation notes:
//   Reads from MarketManager: getPositions(address)
//   Enriches with current price from oracle for PnL calculation
//   Polls every 10 seconds
//   Returns empty array if address is undefined
```

### `useAccountHealth(address: `0x${string}` | undefined)`

```tsx
interface AccountHealth {
  collateral: bigint;            // total deposited collateral
  collateralFormatted: number;
  totalUnrealizedPnl: bigint;
  totalUnrealizedPnlFormatted: number;
  totalMarginUsed: bigint;
  totalMarginUsedFormatted: number;
  availableMargin: bigint;       // collateral + unrealizedPnl - marginUsed
  availableMarginFormatted: number;
  healthFactor: number;          // 0 to 1 (1 = fully healthy, 0 = liquidation)
  isLiquidatable: boolean;
  positionCount: number;
  maxPositions: number;          // 12
}

interface UseAccountHealthReturn {
  data: AccountHealth | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

// Implementation notes:
//   Reads from MarginAccount contract: getAccountHealth(address)
//   Polls every 10 seconds
//   healthFactor = availableMargin / totalMarginUsed (clamped 0–1)
//   isLiquidatable = healthFactor < threshold (from contract)
```

### `usePool()`

```tsx
interface PoolData {
  totalValueLocked: bigint;
  tvlFormatted: number;
  totalDeposits: bigint;
  totalDepositsFormatted: number;
  traderPnlExposure: bigint;    // net unrealized PnL of all traders (pool's liability)
  traderPnlExposureFormatted: number;
  accumulatedFees: bigint;
  accumulatedFeesFormatted: number;
  utilizationRate: number;       // 0 to 1
  apr: number;                   // estimated annual percentage rate
  fees24h: bigint;
  fees24hFormatted: number;
  userLpBalance: bigint;         // LP tokens held by connected user
  userLpBalanceFormatted: number;
  userSharePercent: number;      // user's share of pool
  userShareValue: bigint;        // user's share in tUSDI terms
  userShareValueFormatted: number;
  totalLpSupply: bigint;
}

interface UsePoolReturn {
  data: PoolData | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  deposit: UseMutationResult<...>;   // wagmi useWriteContract wrapper
  withdraw: UseMutationResult<...>;
  claim: UseMutationResult<...>;     // claim pending withdrawal
}

// Implementation notes:
//   Reads from LPPool contract: getPoolState(), balanceOf(address), totalSupply()
//   APR estimated from (fees24h * 365) / tvl
//   Polls every 30 seconds (pool state changes less frequently)
//   User-specific data only fetched if wallet connected
```

### `useOracleStatus()`

```tsx
interface OracleStatus {
  lastUpdateTimestamp: number;   // unix seconds
  lastUpdateAge: number;         // seconds since last update
  nextExpectedTimestamp: number;  // unix seconds
  isFresh: boolean;              // < 5 minutes old
  isAging: boolean;              // 5–15 minutes old
  isStale: boolean;              // > 15 minutes old
  status: 'fresh' | 'aging' | 'stale';
}

interface UseOracleStatusReturn {
  data: OracleStatus | undefined;
  isLoading: boolean;
  isError: boolean;
}

// Implementation notes:
//   Reads from Oracle contract: lastUpdateTimestamp()
//   `lastUpdateAge` recomputed every second via local timer (not a contract re-read)
//   nextExpected = lastUpdate + update interval (read from oracle config)
//   Polls contract every 60 seconds; local timer updates displayed age
```

### `useTrade()`

```tsx
interface UseTradeReturn {
  openPosition: (params: {
    marketId: 'nyc' | 'dubai';
    direction: 'long' | 'short';
    size: bigint;                // sqft in 18-decimal
    leverage: number;            // 1–10
  }) => Promise<`0x${string}`>; // returns tx hash

  closePosition: (params: {
    positionId: bigint;
  }) => Promise<`0x${string}`>;

  modifyPosition: (params: {
    positionId: bigint;
    addMargin?: bigint;          // add collateral to position
    removeMargin?: bigint;       // remove collateral from position
  }) => Promise<`0x${string}`>;

  isOpening: boolean;
  isClosing: boolean;
  isModifying: boolean;
  error: Error | null;
  reset: () => void;
}

// Implementation notes:
//   Uses useWriteContract for each mutation
//   openPosition calls MarketManager.openPosition(marketId, direction, size, leverage)
//   closePosition calls MarketManager.closePosition(positionId)
//   modifyPosition calls MarginAccount.modifyMargin(positionId, amount, isAdding)
//   Each mutation awaits tx confirmation via useWaitForTransactionReceipt
//   On success: triggers refetch of usePositions, useAccountHealth, useMarketData
//   Error handling: parses revert reasons into human-readable messages
```

### `useCollateral()`

```tsx
interface UseCollateralReturn {
  deposit: (amount: bigint) => Promise<`0x${string}`>;
  requestWithdraw: (amount: bigint) => Promise<`0x${string}`>;
  claimWithdraw: () => Promise<`0x${string}`>;

  pendingWithdrawal: {
    amount: bigint;
    amountFormatted: number;
    availableAt: number;         // unix timestamp when claimable
    isClaimable: boolean;
    timeRemaining: number;       // seconds until claimable (0 if ready)
  } | null;

  isDepositing: boolean;
  isRequestingWithdraw: boolean;
  isClaiming: boolean;
  error: Error | null;
  reset: () => void;
}

// Implementation notes:
//   deposit: first approves tUSDI spend (if needed), then calls MarginAccount.deposit(amount)
//   requestWithdraw: calls MarginAccount.requestWithdraw(amount) — begins 24h delay
//   claimWithdraw: calls MarginAccount.claimWithdraw() — only works after delay
//   pendingWithdrawal read from MarginAccount.getPendingWithdrawal(address)
//   timeRemaining recomputed every second via local timer
//   On success: triggers refetch of useAccountHealth, useBalance
```

---

## 10. Responsive Behavior

### Breakpoints

| Breakpoint | Width      | Name    |
|-----------|------------|---------|
| Default   | < 640px    | Mobile  |
| `sm`      | >= 640px   | —       |
| `md`      | >= 768px   | Tablet  |
| `lg`      | >= 1024px  | Desktop |
| `xl`      | >= 1280px  | Wide    |
| `2xl`     | >= 1440px  | Ultra   |

### Desktop (>= 1024px) — Primary

- Full layout as described in all page sections above
- TradePanel is a sticky right sidebar alongside PriceChart
- Two-column layouts for CollateralManager + PnlHistory, PoolDepositWithdraw + PoolComposition
- Tables show all columns
- TopNav shows all links horizontally

### Tablet (768px–1023px)

- **Market page:** TradePanel moves below PriceChart (full width, no longer sticky sidebar). Chart takes full width.
- **Dashboard:** CityMarketCards remain side by side (they compress well).
- **Portfolio:** CollateralManager and PnlHistory stack vertically.
- **Pool:** PoolDepositWithdraw and PoolComposition stack vertically.
- Tables: hide lower-priority columns (Funding PnL, Leverage) — accessible via row expand.
- TopNav: same horizontal layout but tighter spacing. May abbreviate labels.

### Mobile (< 768px)

- **TopNav:** Logo + hamburger menu. Menu opens as a slide-down panel with nav links + WalletButton.
- **Dashboard:** CityMarketCards stack vertically. AccountSummaryBar becomes 2x2 grid. RecentActivityFeed shows only 5 rows with "View All" link.
- **Market page:**
  - MarketHeader: stats wrap to 2 rows (price + change on first, OI + skew + funding on second).
  - PriceChart: full width, reduced height (280px min).
  - TradePanel: accessed via a sticky bottom bar "Trade" button that opens a full-screen modal (`Modal size="full"`). The modal contains the complete TradePanel UI.
  - OpenPositionsTable: card layout instead of table. Each position is a stacked card showing key data.
- **Portfolio:** AllPositionsTable becomes a list of cards. Each card shows the position summary with expand to see full details.
- **Pool / Faucet:** Single column, full width. Cards stack naturally.
- All DataCell components with `size="lg"` step down to `size="md"` on mobile.
- Page horizontal padding: `px-page-x` (24px) instead of `px-page-x-lg` (48px).

### Mobile Trade Bar (Market Page)

```tsx
interface MobileTradeBarProps {
  marketId: 'nyc' | 'dubai';
}

// Visual:
//   Fixed to bottom of viewport, height 56px
//   bg-bg-card, border-t border-border, glassmorphism
//   Shows: current price (data-md mono) + "Trade" button (coral, rounded-full)
//   Only visible on mobile (hidden lg:hidden)
//   Clicking "Trade" opens TradePanel in full-screen Modal
```

---

## 11. Accessibility & Performance Notes

### Accessibility

- All interactive elements must have visible focus rings (ring-2 ring-coral/50, ring-offset-2 ring-offset-bg-base).
- Color is never the only indicator — PnL values always include sign (+/-) and directional arrows alongside green/red coloring.
- DirectionBadge uses text ("LONG"/"SHORT") not just color.
- HealthBar includes a text percentage label alongside the visual bar.
- All images/icons have appropriate aria-labels.
- Modal traps focus and is closeable with Escape.
- Tables use proper `<thead>`, `<tbody>`, `<th scope="col">` semantics.
- Minimum touch target: 44x44px on mobile for all buttons and interactive elements.
- Reduced motion: respect `prefers-reduced-motion` — disable chart animations, pulsing effects, slide transitions.

### Performance

- **Code splitting:** Each page is a separate route chunk. TradePanel, PriceChart, and modals are dynamically imported (`next/dynamic`) to keep initial bundle small.
- **Data fetching:** All contract reads use wagmi's built-in caching and deduplication. Shared queries (e.g., market price used by multiple components) are automatically deduped by wagmi's query key.
- **Polling intervals:**
  - Price / positions / account health: 10–15 seconds
  - Pool data: 30 seconds
  - Oracle status (contract read): 60 seconds
  - Oracle age display (local timer): 1 second
- **Number formatting:** Use a shared `formatNumber` utility with memoization. All bigint-to-display conversions happen in hooks, not in render.
- **Chart:** Use lightweight-charts for minimal bundle size. Lazy-load chart data only when the market page is visited. Virtualize chart data for 1M+ timeframe.
- **Tables:** Virtualize rows if > 50 items (use `@tanstack/react-virtual`).
- **Skeleton loading:** Every component has a skeleton state matching its final dimensions to prevent layout shift (CLS = 0).
- **Images:** The design is data-driven with no hero images. Minimal asset footprint. City identity conveyed through subtle color tinting, not photographs.

---

*End of FRONTEND.md*agentId: a7cd3aee099f9a41b (use SendMessage with to: 'a7cd3aee099f9a41b' to continue this agent)
<usage>total_tokens: 27953
tool_uses: 0
duration_ms: 298129</usage>