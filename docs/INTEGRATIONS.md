# Terraform -- Integration Plan

> Perpetual-futures DEX on Integra testnet for city-level real estate price indices (NYC, Dubai).

---

## Table of Contents

1. [Integration Diagram](#integration-diagram)
2. [Web3Auth (Social Login)](#1-web3auth-social-login)
3. [XP System](#2-xp-system)
4. [Subdomain Hosting](#3-subdomain-hosting)
5. [Oracle Service](#4-oracle-service)
6. [tUSDI Token (Collateral)](#5-tusdi-token-collateral)
7. [Block Explorer](#6-block-explorer)
8. [Real-Time Event Subscriptions](#7-real-time-event-subscriptions)
9. [Faucet Onboarding Flow](#8-faucet-onboarding-flow)
10. [Environment Variables (.env.example)](#environment-variables)
11. [Dependency List](#dependency-list)

---

## Integration Diagram

```
+-------------------------------+
|        terraform.integralayer.com        |
|          (Caddy reverse proxy)           |
+-------------------------------+
                |
                v
+-------------------------------+
|     Next.js 14+ Frontend      |
|  (App Router, TypeScript,     |
|   Tailwind, shadcn/ui)        |
+-------+-----------+-----------+
        |           |
        v           v
+---------------+  +---------------------------+
| Web3Auth      |  | wagmi v2 + viem           |
| @integra/     |  | (contract reads/writes)   |
| web3auth-     |  +--+------+------+----------+
| provider      |     |      |      |
+-------+-------+     |      |      |
        |              v      v      v
        |     +--------+--+ +-+-----+------+ +--------+
        |     | TerraPerps | | PriceOracle  | | tUSDI  |
        |     | .sol       | | .sol         | | ERC-20 |
        |     +-----+------+ +------+-------+ +---+----+
        |           |               ^              |
        |           |               |              |
        |           |    +----------+----------+   |
        |           |    | Oracle Service       |   |
        |           |    | (Node.js + Playwright)|   |
        |           |    | Scrapes: Redfin,      |   |
        |           |    | Zillow, DXBinteract,  |   |
        |           |    | PropertyFinder        |   |
        |           |    | Runs 4x/day           |   |
        |           |    +---------------------+   |
        |           |                              |
        |           v                              v
        |    +------+------------------------------+------+
        |    |    Integra Testnet (Chain ID 26218)        |
        |    |    RPC: testnet.integralayer.com/evm        |
        |    |    WS:  wss://testnet.integralayer.com/evm/ws |
        |    +-----+-----------+-----------+--------------+
        |          |           |           |
        |          v           v           v
        |   +-----------+ +----------+ +----------+
        |   | XPAction  | | Position | | Oracle   |
        |   | events    | | events   | | Price    |
        |   +-----+-----+ +----+-----+ | events   |
        |         |             |       +----+-----+
        |         v             v            v
        |   +-----+-------------+------------+-----+
        |   |          XP Indexer                    |
        |   |     xp.integralayer.com                |
        |   +---------------------------------------+
        |
        v
+-------+-------------------------------+
|  Block Explorer                        |
|  blockscout.integralayer.com           |
+---------------------------------------+
```

---

## 1. Web3Auth (Social Login)

**Status:** REQUIRED

### Purpose

Terraform must onboard traders who have never used a crypto wallet. Web3Auth provides social login (Google, X/Twitter, Email) so users get an embedded wallet without installing MetaMask or managing seed phrases. This is the sole authentication mechanism for the dApp.

### Configuration

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` | `BM4-vTeJRs0OW-iD2zqCUdNEbgqW-dEGMWUS53FVYpUjnKZqaBP_0njivHaDPZnNzJ8jfDd6b8gY_p0ROmIs6Jc` |
| `NEXT_PUBLIC_WEB3AUTH_NETWORK` | `sapphire_devnet` |
| `NEXT_PUBLIC_NETWORK` | `testnet` |
| Chain ID | `26218` (hex `0x666A`) |
| RPC Target | `https://testnet.integralayer.com/evm` |
| JWKS endpoint | `https://api-auth.web3auth.io/.well-known/jwks.json` |

### Contract-Side

No contract changes required. Web3Auth produces a standard Ethereum EOA address. All contract interactions use standard `msg.sender` authentication.

### Frontend-Side

**Package:** `@integra/web3auth-provider` (shared package -- never install `@web3auth/modal` or `@web3auth/ethereum-provider` directly).

**Provider setup** (`frontend/components/providers/IntegraAuthProvider.tsx`):

The shared provider wraps the Web3Auth SDK and exposes:

| Export | Type | Description |
|--------|------|-------------|
| `IntegraAuthProvider` | Component | Wrap in `layout.tsx` at the root |
| `useWeb3Auth()` | Hook | Returns `{ web3auth, address, walletClient, isConnected, isLoading, connect, disconnect }` |
| `useAccount()` | Hook | Returns `{ address, isConnected }` |
| `useSigner()` | Hook | Returns `WalletClient` for signing transactions |

**Components:**

| Component | Location | Description |
|-----------|----------|-------------|
| `ConnectButton` | `frontend/components/shared/ConnectButton.tsx` | "Sign In" button (social login). Shows avatar + truncated address when connected. |
| `AccountMenu` | `frontend/components/shared/AccountMenu.tsx` | Dropdown with address, balances, disconnect option |

**UX flow:**

1. User lands on Terraform -- sees "Sign In" button (never "Connect Wallet")
2. Click opens Web3Auth modal with Google, X, Email options
3. After authentication, wallet is created silently
4. UI updates: button becomes avatar + address, header shows tUSDI balance
5. Tooltip on first connection: "Your wallet was created automatically. You're ready to trade!"

**Chain configuration passed to the provider:**

```typescript
const INTEGRA_TESTNET = {
  chainNamespace: "eip155",
  chainId: "0x666A",
  rpcTarget: "https://testnet.integralayer.com/evm",
  displayName: "Integra Testnet",
  blockExplorerUrl: "https://blockscout.integralayer.com",
  ticker: "IRL",
  tickerName: "Integra Real Life",
  logo: "https://integralayer.com/logo.png",
};
```

**UI config:**

```typescript
uiConfig: {
  appName: "Terraform",
  theme: { primary: "#FF6D49" },
  mode: "dark",
}
```

### Error Handling

| Error | User Message | Recovery |
|-------|-------------|----------|
| Web3Auth SDK fails to initialize | "Authentication service unavailable. Please refresh." | Retry button, check network connectivity |
| Social login cancelled | "Sign-in cancelled." | Show sign-in button again |
| Social login provider error | "Could not sign in with {provider}. Try another method." | Offer alternative providers |
| Network mismatch after connect | "Please switch to Integra Testnet." | Auto-switch via `wallet_addEthereumChain` |
| Session expired | "Your session has expired. Please sign in again." | Clear state, show sign-in button |

### Testing Approach

1. **Unit test:** Mock `@integra/web3auth-provider` to verify `ConnectButton` renders correct states (loading, disconnected, connected)
2. **Integration test:** Verify `IntegraAuthProvider` initializes without errors when `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` is set
3. **E2E test (Playwright):** Use Web3Auth's test accounts (`sapphire_devnet` allows testnet social logins) to verify full sign-in flow
4. **Manual test:** Sign in with Google, X, and Email on testnet. Verify address is consistent across sessions for the same social account.

---

## 2. XP System

**Status:** REQUIRED

### Purpose

Every user action in Terraform emits an `XPAction` event on-chain. The off-chain XP indexer at `xp.integralayer.com` aggregates these events across all Integra dApps. XP determines future airdrop allocations. Showing XP notifications keeps traders engaged and gamifies the experience.

### Configuration

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_XP_API_URL` | `https://xp.integralayer.com` |
| Indexer | Off-chain, reads `XPAction` events from Integra testnet |

### Contract-Side

**Event definition** (emit from every contract that handles user actions):

```solidity
event XPAction(address indexed user, string actionType, uint256 points);
```

**XP distribution table for Terraform:**

| Action | `actionType` string | Points | Trigger |
|--------|-------------------|--------|---------|
| First trade | `"first_trade"` | 200 | User's first `openPosition()` call (track via mapping) |
| Open position | `"open_position"` | 100 | Every `openPosition()` call |
| Close position | `"close_position"` | 75 | Every `closePosition()` call |
| LP deposit | `"lp_deposit"` | 100 | Every `depositLiquidity()` call |
| LP withdrawal | `"lp_withdraw"` | 50 | Every `withdrawLiquidity()` call |
| Perform liquidation | `"liquidation"` | 150 | Every `liquidatePosition()` call (awarded to liquidator) |
| First deposit | `"first_deposit"` | 200 | User's first `depositCollateral()` call (track via mapping) |

**Implementation in Solidity:**

```solidity
// In TerraPerps.sol (or a base contract)

mapping(address => bool) private _hasTraded;
mapping(address => bool) private _hasDeposited;

function openPosition(/* params */) external nonReentrant {
    // ... position logic ...

    if (!_hasTraded[msg.sender]) {
        _hasTraded[msg.sender] = true;
        emit XPAction(msg.sender, "first_trade", 200);
    }
    emit XPAction(msg.sender, "open_position", 100);
}

function closePosition(uint256 positionId) external nonReentrant {
    // ... close logic ...
    emit XPAction(msg.sender, "close_position", 75);
}

function depositCollateral(uint256 amount) external nonReentrant {
    // ... deposit logic ...
    if (!_hasDeposited[msg.sender]) {
        _hasDeposited[msg.sender] = true;
        emit XPAction(msg.sender, "first_deposit", 200);
    }
}

function depositLiquidity(uint256 amount) external nonReentrant {
    // ... LP deposit logic ...
    emit XPAction(msg.sender, "lp_deposit", 100);
}

function withdrawLiquidity(uint256 amount) external nonReentrant {
    // ... LP withdraw logic ...
    emit XPAction(msg.sender, "lp_withdraw", 50);
}

function liquidatePosition(uint256 positionId) external nonReentrant {
    // ... liquidation logic ...
    emit XPAction(msg.sender, "liquidation", 150);
}
```

### Frontend-Side

**Components:**

| Component | Location | Description |
|-----------|----------|-------------|
| `XPNotification` | `frontend/components/shared/XPNotification.tsx` | Toast that appears after XP-earning actions: "+100 XP -- Position Opened!" |
| `XPBadge` | `frontend/components/shared/XPBadge.tsx` | Small badge in header showing total XP earned |
| `XPHistory` | `frontend/components/portfolio/XPHistory.tsx` | Table on profile/portfolio page showing XP breakdown |

**Hook: `useXPNotification`**

```typescript
// Watch for XPAction events on the connected user's address
// When detected, show toast notification with action type and points
// Uses WebSocket subscription (see Integration #7)
```

**Hook: `useXPBalance`**

```typescript
// Fetch total XP from xp.integralayer.com API
// GET https://xp.integralayer.com/api/v1/users/{address}/xp
// Returns: { totalXP: number, rank: number, actions: XPAction[] }
// Poll every 30 seconds or refresh after transaction confirmation
```

**UX flow:**

1. User opens a position -- transaction confirms
2. WebSocket picks up `XPAction(user, "open_position", 100)` event
3. Toast slides in from top-right: gold accent, "+100 XP" with action label
4. XP badge in header increments
5. Portfolio page shows full XP history with breakdown by action type

### Error Handling

| Error | Impact | Recovery |
|-------|--------|----------|
| XP indexer API unreachable | XP badge shows stale data | Cache last known XP value, show "Last updated: {time}" tooltip |
| XP event not emitted (contract bug) | User misses XP for an action | Contract tests must verify every action path emits correct XPAction |
| Duplicate XP events | Inflated XP (critical) | Contract logic must emit exactly once per action. "First" events use mapping guards. |
| Toast notification missed | User doesn't see XP earned | XP history page provides complete record. Toast is supplementary. |

### Testing Approach

1. **Contract tests:** For every function that emits `XPAction`, assert the event is emitted with correct `actionType` and `points` values
2. **First-action guards:** Call `openPosition` twice from the same address -- assert `first_trade` emits only on the first call
3. **Frontend unit tests:** Mock `XPNotification` with test events, verify toast renders with correct message
4. **E2E test:** Open a position on testnet, verify XP toast appears and XP badge updates

---

## 3. Subdomain Hosting

**Status:** REQUIRED

### Purpose

All Integra ecosystem dApps are hosted at `*.integralayer.com`. Terraform will be accessible at `terraform.integralayer.com`. This provides a unified brand presence and simplifies DNS management.

### Configuration

| Property | Value |
|----------|-------|
| Subdomain | `terraform.integralayer.com` |
| Reverse proxy | Caddy on `*.integralayer.com` wildcard |
| SSL | Automatic via Caddy (Let's Encrypt) |
| Frontend build | `next build && next start` (or `next export` for static) |
| Port | Internal port assigned by deployer agent (typically 3000+) |

### Contract-Side

No contract changes required. Subdomain routing is infrastructure-only.

### Frontend-Side

**`next.config.ts` adjustments:**

```typescript
const nextConfig = {
  // Allow images and API calls from the integralayer.com domain
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.integralayer.com" },
    ],
  },
  // Base path if hosted at a subpath (not needed for subdomain)
  // basePath: "",
};
```

**CORS considerations:**

- The Next.js API routes (if any) should accept requests from `terraform.integralayer.com`
- RPC calls go directly to `testnet.integralayer.com/evm` -- no CORS issue (same parent domain)
- WebSocket connections to `wss://testnet.integralayer.com/evm/ws` work cross-subdomain

### Error Handling

| Error | Impact | Recovery |
|-------|--------|----------|
| Caddy misconfiguration | 502 Bad Gateway | Deployer agent validates Caddy config before activating. Manual rollback via Caddy admin API. |
| SSL certificate failure | HTTPS unavailable | Caddy auto-renews. If renewal fails, check domain DNS records. |
| Frontend crash loop | 502 errors | Health check endpoint at `/api/health`. Auto-restart via process manager (PM2 or systemd). |

### Testing Approach

1. **Pre-deploy:** `next build` must succeed with zero errors
2. **Post-deploy:** `curl -I https://terraform.integralayer.com` returns 200
3. **SSL check:** Verify certificate is valid and issued for `terraform.integralayer.com`
4. **Functional check:** Sign in via Web3Auth on the live subdomain, verify RPC connectivity

---

## 4. Oracle Service

**Status:** REQUIRED (custom infrastructure)

### Purpose

Terraform trades perpetual futures on real estate price indices. The oracle service scrapes real-world housing market data from public sources, signs it with EIP-712, and submits it to the `PriceOracle.sol` contract on-chain. This is the price source for all perps markets.

### Configuration

| Variable | Value |
|----------|-------|
| `ORACLE_SIGNER_PRIVATE_KEY` | Private key of the whitelisted oracle signer (server-side only, NEVER in frontend) |
| `ORACLE_CONTRACT_ADDRESS` | Address of deployed `PriceOracle.sol` |
| `ORACLE_RPC_URL` | `https://testnet.integralayer.com/evm` |
| `ORACLE_UPDATE_INTERVAL` | `21600000` (6 hours in ms) |
| `ORACLE_MAX_DEVIATION` | `500` (5% in basis points) |
| `ORACLE_MAX_STALENESS` | `43200` (12 hours in seconds) |

**Data sources:**

| Market | Source 1 | Source 2 |
|--------|----------|----------|
| NYC | Redfin NYC housing market page | Zillow NYC home values page |
| Dubai | DXBinteract (Dubai Land Department) | Property Finder market trends |

### Contract-Side

**`PriceOracle.sol` interface:**

```solidity
interface IPriceOracle {
    // Structs
    struct PriceData {
        string market;       // "NYC" or "DUBAI"
        uint256 price;       // Price index value (18 decimals)
        uint256 timestamp;   // Block timestamp of the update
        bytes signature;     // EIP-712 signature from whitelisted signer
    }

    // Events
    event OraclePriceUpdated(
        string indexed market,
        uint256 price,
        uint256 timestamp,
        address indexed signer
    );
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);

    // Functions
    function updatePrice(PriceData calldata data) external;
    function getPrice(string calldata market) external view returns (uint256 price, uint256 timestamp);
    function isSigner(address account) external view returns (bool);
    function addSigner(address signer) external; // onlyOwner
    function removeSigner(address signer) external; // onlyOwner
}
```

**Enforcement rules (in contract):**

| Rule | Implementation |
|------|---------------|
| Max deviation per update | `abs(newPrice - oldPrice) / oldPrice <= 5%` -- revert if exceeded |
| Max staleness | `block.timestamp - lastUpdate <= 12 hours` -- frontend warns, contract allows but marks stale |
| Signer whitelist | Only addresses in `signers` mapping can submit prices |
| EIP-712 verification | `ecrecover` on typed data hash must return a whitelisted signer |

**EIP-712 domain:**

```solidity
bytes32 constant DOMAIN_TYPEHASH = keccak256(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
);
// name: "TerraformOracle"
// version: "1"
// chainId: 26218
// verifyingContract: PriceOracle contract address
```

### Frontend-Side

**Components:**

| Component | Location | Description |
|-----------|----------|-------------|
| `PriceDisplay` | `frontend/components/trading/PriceDisplay.tsx` | Shows current index price for NYC and Dubai with last-updated timestamp |
| `PriceChart` | `frontend/components/trading/PriceChart.tsx` | Historical price chart using `OraclePriceUpdated` events |
| `StaleWarning` | `frontend/components/shared/StaleWarning.tsx` | Banner when price data is older than 12 hours |

**Hook: `useOraclePrice`**

```typescript
// Read current price from PriceOracle.sol via wagmi useReadContract
// Subscribe to OraclePriceUpdated events via WebSocket for live updates
// Returns: { price: bigint, timestamp: number, isStale: boolean, market: string }
```

### Oracle Service Architecture (Node.js)

```
oracle-service/
  src/
    index.ts           # Cron scheduler (runs every 6 hours)
    scrapers/
      nyc.ts           # Playwright: scrape Redfin + Zillow for NYC
      dubai.ts         # Playwright: scrape DXBinteract + PropertyFinder for Dubai
    signer.ts          # EIP-712 signing with oracle wallet
    submitter.ts       # Submit signed prices to PriceOracle.sol
    aggregator.ts      # Average/median from multiple sources, outlier detection
  package.json
  .env                 # ORACLE_SIGNER_PRIVATE_KEY (server-side only)
```

**Scraping flow:**

1. Playwright launches headless Chromium
2. Navigate to each data source, extract price index values
3. Aggregate: take median of all source values per market
4. Validate: check against previous price (reject if > 5% deviation from last known)
5. Sign with EIP-712 using oracle signer private key
6. Submit `updatePrice()` transaction to PriceOracle.sol
7. Log result, report errors via webhook/email

### Error Handling

| Error | Impact | Recovery |
|-------|--------|----------|
| Scraper fails (site layout change) | No price update for that cycle | Retry with backup source. Alert admin. If both sources fail, skip update (staleness timer starts). |
| EIP-712 signature rejected | Price not updated | Verify signer is in whitelist. Check domain separator matches deployed contract. |
| Deviation check fails | Price update reverted | Log the attempted price vs current. Possible market event. Admin can override with manual update or increase deviation threshold. |
| Staleness (>12h without update) | Frontend shows stale warning | Oracle service alerts admin. Users see yellow banner: "Price data may be outdated." |
| Gas failure | Transaction reverts | Gas is free on testnet. On mainnet, ensure oracle wallet has IRL balance. |
| Signer wallet compromised | Attacker could submit fake prices | Revoke signer immediately via `removeSigner()`. Add new signer. Deviation check limits damage. |

### Testing Approach

1. **Contract tests:** Deploy `PriceOracle.sol` to Hardhat local network. Test `updatePrice` with valid/invalid signatures, deviation checks, staleness logic, signer whitelist management.
2. **Scraper tests:** Mock HTTP responses from Redfin/Zillow/DXBinteract/PropertyFinder. Verify parser extracts correct values.
3. **EIP-712 tests:** Generate signed price data in tests, verify `ecrecover` returns expected signer address.
4. **Integration test:** Run full oracle cycle on testnet -- scrape, sign, submit, read back from contract.
5. **Deviation test:** Submit a price that exceeds 5% deviation, verify revert.
6. **Staleness test:** Advance block timestamp past 12 hours, verify `isStale` returns true.

---

## 5. tUSDI Token (Collateral)

**Status:** REQUIRED

### Purpose

tUSDI is the sole collateral token for all Terraform positions. Users deposit tUSDI to open perps positions, earn/lose tUSDI on P&L, and receive tUSDI when closing positions. The standard ERC-20 approval pattern is used for deposits.

### Configuration

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_TUSDI_ADDRESS` | `0xa640d8b5c9cb3b989881b8e63b0f30179c78a04f` |
| `NEXT_PUBLIC_WIRL_ADDRESS` | `0x5002000000000000000000000000000000000001` |
| Token standard | ERC-20 |
| Decimals | 18 |
| Faucet | `https://testnet.integralayer.com` (1,000 tUSDI per request) |

### Contract-Side

**tUSDI interaction in `TerraPerps.sol`:**

```solidity
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

using SafeERC20 for IERC20;

IERC20 public immutable collateralToken; // tUSDI

constructor(address _collateralToken, address _priceOracle) {
    collateralToken = IERC20(_collateralToken);
    // ...
}

function depositCollateral(uint256 amount) external nonReentrant {
    require(amount > 0, "Amount must be > 0");
    collateralToken.safeTransferFrom(msg.sender, address(this), amount);
    userCollateral[msg.sender] += amount;
    // ... emit events
}

function withdrawCollateral(uint256 amount) external nonReentrant {
    require(userCollateral[msg.sender] >= amount, "Insufficient collateral");
    require(freeCollateral(msg.sender) >= amount, "Collateral locked in positions");
    userCollateral[msg.sender] -= amount;
    collateralToken.safeTransfer(msg.sender, amount);
    // ... emit events
}
```

### Frontend-Side

**Components:**

| Component | Location | Description |
|-----------|----------|-------------|
| `BalanceDisplay` | `frontend/components/layout/BalanceDisplay.tsx` | tUSDI balance in header (formatted with commas, 2 decimal places) |
| `DepositModal` | `frontend/components/collateral/DepositModal.tsx` | Two-step flow: approve tUSDI, then deposit to Terraform contract |
| `WithdrawModal` | `frontend/components/collateral/WithdrawModal.tsx` | Withdraw free collateral back to wallet |
| `FaucetPrompt` | `frontend/components/onboarding/FaucetPrompt.tsx` | Shown when tUSDI balance is zero |

**Hook: `useTUSDIBalance`**

```typescript
// useReadContract to read tUSDI.balanceOf(userAddress)
// Returns formatted balance, raw balance, isZero flag
// Refreshes on block change or after user transactions
```

**Hook: `useTUSDIApproval`**

```typescript
// Check current allowance: tUSDI.allowance(user, terraPerpsAddress)
// If allowance < deposit amount, prompt approval
// useWriteContract for tUSDI.approve(terraPerpsAddress, amount)
// Returns: { needsApproval, approve, isApproving, allowance }
```

**Deposit UX flow:**

1. User clicks "Deposit Collateral"
2. Enter amount (with "MAX" button for full balance)
3. **If allowance insufficient:** Step 1 -- "Approve tUSDI" button. User signs approval tx. Wait for confirmation.
4. **Step 2:** "Deposit" button. User signs deposit tx. Wait for confirmation.
5. Success: balance updates, toast shows "+{amount} tUSDI deposited", XP notification if first deposit.

**Balance display format:**

- Show 2 decimal places: `1,234.56 tUSDI`
- If zero: show `0.00 tUSDI` with faucet link
- If very small (< 0.01): show `< 0.01 tUSDI`

### Error Handling

| Error | User Message | Recovery |
|-------|-------------|----------|
| `insufficient funds` during approval | "You don't have enough IRL for gas." | Show faucet link (gas is free on testnet, so this shouldn't happen -- but handle gracefully) |
| `insufficient funds` for deposit | "You don't have enough tUSDI." | Show current balance. Link to faucet. |
| Approval tx rejected by user | "Approval cancelled." | Show approve button again |
| Deposit tx reverts | "Deposit failed. Please try again." | Show error reason if available. Check approval is still valid. |
| Allowance already spent (race condition) | "Approval expired. Please approve again." | Re-prompt approval step |
| Network error during tx | "Network error. Please check your connection." | Retry button |

### Testing Approach

1. **Contract tests:** Test `depositCollateral` and `withdrawCollateral` with correct/incorrect amounts, insufficient balance, insufficient approval
2. **Approval flow test:** Verify deposit reverts without approval, succeeds after approval
3. **Frontend unit tests:** Mock tUSDI balance hook, verify `DepositModal` renders correct steps (approve vs deposit)
4. **E2E test:** On testnet, claim from faucet, approve tUSDI, deposit, verify balance updates in UI

---

## 6. Block Explorer

**Status:** REQUIRED

### Purpose

Link all on-chain activity to the Integra block explorer so users can independently verify transactions, inspect addresses, and audit contract state.

### Configuration

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_EXPLORER_URL` | `https://blockscout.integralayer.com` |

### Contract-Side

No contract changes required. The explorer indexes the chain independently.

### Frontend-Side

**Utility function** (`frontend/lib/explorer.ts`):

```typescript
const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL
  || "https://blockscout.integralayer.com";

export const explorerUrl = {
  tx: (hash: string) => `${EXPLORER_URL}/tx/${hash}`,
  address: (addr: string) => `${EXPLORER_URL}/address/${addr}`,
  token: (addr: string) => `${EXPLORER_URL}/token/${addr}`,
  block: (num: number) => `${EXPLORER_URL}/block/${num}`,
};
```

**Where to show explorer links:**

| Location | Link Target | UX |
|----------|-------------|-----|
| Trade confirmation modal | Transaction hash | "View on Explorer" link after tx confirms |
| Position history table | Each open/close/liquidation tx | Clickable tx hash column |
| LP activity table | Each deposit/withdraw tx | Clickable tx hash column |
| Collateral deposit/withdraw confirmation | Transaction hash | "View on Explorer" link |
| Header account menu | Connected address | "View on Explorer" link to user's address page |
| Contract info footer (optional) | TerraPerps and PriceOracle addresses | Link to verified contract |

**Component: `ExplorerLink`**

```typescript
// Reusable component: renders a truncated hash/address as a link to blockscout
// Props: type ("tx" | "address"), value (hash or address), truncate (boolean)
// Opens in new tab with rel="noopener noreferrer"
```

### Error Handling

| Error | Impact | Recovery |
|-------|--------|----------|
| Explorer is down | Links return 502 | Links still render. User sees explorer error page. No frontend impact. |
| Wrong explorer URL | Links go to wrong chain | Verify `NEXT_PUBLIC_EXPLORER_URL` in env. Hardcode fallback. |
| Transaction not found on explorer | User sees "not found" page | This happens when the explorer hasn't indexed the block yet. Add note: "If not found, wait a few seconds and refresh." |

### Testing Approach

1. **Unit test:** Verify `explorerUrl.tx("0xabc")` returns correct URL format
2. **Component test:** Render `ExplorerLink` with mock data, verify `href` attribute
3. **Manual test:** Click explorer links on testnet, verify they resolve to correct pages on blockscout

---

## 7. Real-Time Event Subscriptions

**Status:** REQUIRED

### Purpose

Terraform is a trading platform -- price updates, position changes, and liquidations must reflect in the UI instantly without page refresh. WebSocket subscriptions to contract events provide sub-second updates.

### Configuration

| Variable | Value |
|----------|-------|
| WebSocket endpoint | `wss://testnet.integralayer.com/evm/ws` |
| Reconnect strategy | Exponential backoff: 1s, 2s, 4s, 8s, max 30s |
| Heartbeat interval | 30s (ping/pong) |

### Contract-Side

**Events to emit (and subscribe to):**

```solidity
// Position events
event PositionOpened(
    address indexed trader,
    uint256 indexed positionId,
    string market,         // "NYC" or "DUBAI"
    bool isLong,
    uint256 size,          // Position size in tUSDI (18 decimals)
    uint256 entryPrice,    // Oracle price at entry (18 decimals)
    uint256 leverage       // Leverage multiplier (e.g., 10 = 10x)
);

event PositionClosed(
    address indexed trader,
    uint256 indexed positionId,
    uint256 exitPrice,
    int256 pnl             // Profit/loss in tUSDI (can be negative)
);

event PositionModified(
    address indexed trader,
    uint256 indexed positionId,
    uint256 newSize,
    uint256 newCollateral
);

event PositionLiquidated(
    address indexed trader,
    uint256 indexed positionId,
    address indexed liquidator,
    uint256 liquidationPrice,
    uint256 penalty
);

// Oracle events
event OraclePriceUpdated(
    string indexed market,
    uint256 price,
    uint256 timestamp,
    address indexed signer
);

// Liquidity pool events
event LPDeposited(
    address indexed provider,
    uint256 amount,
    uint256 shares
);

event LPWithdrawn(
    address indexed provider,
    uint256 amount,
    uint256 shares
);

// Funding rate events
event FundingUpdated(
    string indexed market,
    int256 fundingRate,    // Can be negative (shorts pay longs)
    uint256 timestamp
);
```

### Frontend-Side

**Hook: `useContractEvents`** (generic WebSocket event watcher)

```typescript
// Wraps viem's watchContractEvent with auto-reconnect
// Parameters: contractAddress, abi, eventName, onEvent callback
// Manages WebSocket lifecycle: connect, subscribe, reconnect on drop
```

**Specific event hooks:**

| Hook | Events Watched | UI Update |
|------|---------------|-----------|
| `usePositionUpdates` | `PositionOpened`, `PositionClosed`, `PositionModified`, `PositionLiquidated` | Position list, open positions count, P&L display |
| `useOraclePriceUpdates` | `OraclePriceUpdated` | Price display, chart, funding calculations |
| `useLPUpdates` | `LPDeposited`, `LPWithdrawn` | Pool stats, TVL, share price |
| `useFundingUpdates` | `FundingUpdated` | Funding rate display, position cost calculations |

**WebSocket management:**

```typescript
// In frontend/lib/websocket.ts
import { createPublicClient, webSocket } from "viem";

const wsClient = createPublicClient({
  transport: webSocket("wss://testnet.integralayer.com/evm/ws", {
    reconnect: {
      attempts: Infinity,
      delay: ({ count }) => Math.min(1000 * 2 ** count, 30000),
    },
  }),
});
```

**UI updates on events:**

| Event | UI Reaction |
|-------|-------------|
| `OraclePriceUpdated` | Price display flashes green/red, chart appends data point |
| `PositionOpened` (own) | Position appears in "My Positions" list, XP toast |
| `PositionOpened` (other) | Open interest counter updates |
| `PositionClosed` (own) | Position moves to history, P&L shown, XP toast |
| `PositionLiquidated` (own) | Red alert banner: "Position #X was liquidated", link to explorer |
| `PositionLiquidated` (other, user is liquidator) | Success toast: "Liquidation reward: +{amount} tUSDI", XP toast |
| `LPDeposited` / `LPWithdrawn` | Pool stats update (TVL, utilization, share price) |
| `FundingUpdated` | Funding rate display updates, position cost recalculated |

### Error Handling

| Error | Impact | Recovery |
|-------|--------|----------|
| WebSocket connection fails | No real-time updates | Fall back to polling via JSON-RPC every 10 seconds. Show "Live updates unavailable" indicator. |
| WebSocket drops mid-session | Updates stop | Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s). Show reconnecting indicator. |
| Event parsing error | One event missed | Log error, continue listening. UI state may be briefly stale until next event or poll. |
| Rate limiting on WS | Subscription throttled | Batch event processing. Don't subscribe to more events than necessary. |
| Stale state after reconnect | UI shows old data | On reconnect, fetch current state via JSON-RPC `eth_call` to catch up before resuming event stream. |

### Testing Approach

1. **Unit test:** Mock WebSocket events, verify hooks update state correctly
2. **Integration test:** Connect to testnet WebSocket, subscribe to events, trigger a test transaction, verify event received
3. **Reconnect test:** Simulate WebSocket drop (close connection), verify auto-reconnect and state recovery
4. **Load test:** Subscribe to all event types simultaneously, verify no missed events under normal trading volume
5. **Fallback test:** Disable WebSocket, verify polling fallback activates and UI still updates

---

## 8. Faucet Onboarding Flow

**Status:** REQUIRED

### Purpose

New users arrive with zero tUSDI and zero IRL. The onboarding flow detects this, guides them to the faucet, and walks them through their first deposit and trade. This is critical for testnet adoption -- users who don't get tokens immediately will abandon the dApp.

### Configuration

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_FAUCET_URL` | `https://testnet.integralayer.com` |
| Faucet distribution | 10 IRL + 1,000 tUSDI per request |
| Cooldown | 24 hours per address |

### Contract-Side

No contract changes required. The faucet is a separate Integra infrastructure service.

### Frontend-Side

**Components:**

| Component | Location | Description |
|-----------|----------|-------------|
| `FaucetPrompt` | `frontend/components/onboarding/FaucetPrompt.tsx` | Prominent card shown when tUSDI balance is zero. "Get free test tokens" CTA linking to faucet. |
| `OnboardingWizard` | `frontend/components/onboarding/OnboardingWizard.tsx` | "New to Terraform?" step-by-step guide for first-time visitors |
| `OnboardingStep` | `frontend/components/onboarding/OnboardingStep.tsx` | Individual step in the wizard (numbered, with progress indicator) |
| `BalanceWatcher` | `frontend/components/onboarding/BalanceWatcher.tsx` | Polls balance after faucet redirect, auto-dismisses prompt when tokens arrive |

**Hook: `useOnboarding`**

```typescript
// Tracks onboarding state in localStorage
// Returns: {
//   isFirstVisit: boolean,        // Never visited before
//   hasClaimedFaucet: boolean,    // Has non-zero tUSDI balance (or claimed)
//   hasDeposited: boolean,        // Has deposited collateral to Terraform
//   hasTraded: boolean,           // Has opened at least one position
//   currentStep: number,          // 0-3
//   dismissOnboarding: () => void
// }
```

**Onboarding flow:**

```
Step 0: Sign In
  └─ User connects via Web3Auth (social login)
  └─ Detect tUSDI balance === 0

Step 1: Get Test Tokens
  └─ Show FaucetPrompt: "You need test tokens to start trading."
  └─ CTA: "Get Free Tokens" → opens https://testnet.integralayer.com in new tab
  └─ BalanceWatcher polls every 5 seconds for up to 2 minutes
  └─ When balance > 0: auto-dismiss, show success toast "1,000 tUSDI received!"

Step 2: Deposit Collateral
  └─ Show guided prompt: "Deposit tUSDI to start trading"
  └─ Highlight the Deposit button with a pulsing indicator
  └─ After deposit: success state, move to step 3

Step 3: Make First Trade
  └─ Show guided prompt: "Open your first position on NYC or Dubai"
  └─ Highlight the trade form
  └─ After first trade: celebration animation, "+200 XP First Trade!" toast
  └─ Onboarding complete — dismiss wizard
```

**"New to Terraform?" indicator:**

- Shown in the header or sidebar for first-time visitors
- Clicking opens the `OnboardingWizard` overlay
- Dismissible with "Skip tutorial" link
- Re-accessible from Help menu: "Restart tutorial"

**Zero-balance detection logic:**

```typescript
// After wallet connection:
const { data: balance } = useReadContract({
  address: TUSDI_ADDRESS,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [userAddress],
});

const isZeroBalance = balance === 0n;
// If zero: show FaucetPrompt
// If non-zero: skip to deposit step (or skip onboarding entirely if already deposited)
```

### Error Handling

| Error | User Message | Recovery |
|-------|-------------|----------|
| Faucet is down | "The faucet is temporarily unavailable. Please try again later." | Show retry button. Link to alternative faucet at `docs.integralayer.com`. |
| Faucet cooldown active (claimed in last 24h) | "You already claimed tokens. Next claim available in {hours}h." | Show countdown timer. Suggest proceeding with existing balance. |
| Balance doesn't update after faucet claim | "Still waiting for tokens... This can take up to a minute." | Continue polling. Show manual refresh button. Link to explorer to verify tx. |
| User navigates away during onboarding | N/A | Save progress in localStorage. Resume from last step on return. |
| LocalStorage unavailable | Onboarding shows every visit | Graceful degradation -- onboarding repeats but is dismissible. Not critical. |

### Testing Approach

1. **Unit test:** Mock zero balance, verify `FaucetPrompt` renders. Mock non-zero balance, verify prompt is hidden.
2. **Onboarding flow test:** Step through each onboarding state, verify correct component renders for each step.
3. **localStorage test:** Set onboarding as complete, reload page, verify onboarding doesn't reappear.
4. **E2E test:** Fresh wallet on testnet (zero balance). Verify FaucetPrompt appears. Claim from faucet. Verify balance updates and prompt dismisses. Deposit collateral. Open first position. Verify all XP toasts.
5. **Edge case:** User with IRL but zero tUSDI. Verify faucet prompt still appears (need tUSDI for collateral).

---

## Environment Variables

Complete `.env.example` for the Terraform project:

```bash
# ============================================================
# Terraform -- Perpetual Futures DEX on Integra
# ============================================================

# === NETWORK ===
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_CHAIN_ID=26218
NEXT_PUBLIC_RPC_URL=https://testnet.integralayer.com/evm
NEXT_PUBLIC_WS_URL=wss://testnet.integralayer.com/evm/ws

# === BLOCK EXPLORER ===
NEXT_PUBLIC_EXPLORER_URL=https://blockscout.integralayer.com

# === WEB3AUTH ===
NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=BM4-vTeJRs0OW-iD2zqCUdNEbgqW-dEGMWUS53FVYpUjnKZqaBP_0njivHaDPZnNzJ8jfDd6b8gY_p0ROmIs6Jc
NEXT_PUBLIC_WEB3AUTH_NETWORK=sapphire_devnet

# === TOKEN ADDRESSES ===
NEXT_PUBLIC_TUSDI_ADDRESS=0xa640d8b5c9cb3b989881b8e63b0f30179c78a04f
NEXT_PUBLIC_WIRL_ADDRESS=0x5002000000000000000000000000000000000001

# === TERRAFORM CONTRACT ADDRESSES (filled after deployment) ===
NEXT_PUBLIC_TERRA_PERPS_ADDRESS=
NEXT_PUBLIC_PRICE_ORACLE_ADDRESS=
NEXT_PUBLIC_LIQUIDITY_POOL_ADDRESS=

# === INTEGRA SERVICES ===
NEXT_PUBLIC_FAUCET_URL=https://testnet.integralayer.com
NEXT_PUBLIC_XP_API_URL=https://xp.integralayer.com

# === DEPLOYER (server-side only, NEVER prefix with NEXT_PUBLIC_) ===
DEPLOYER_PRIVATE_KEY=

# === ORACLE SERVICE (server-side only, separate .env in oracle-service/) ===
# ORACLE_SIGNER_PRIVATE_KEY=
# ORACLE_CONTRACT_ADDRESS=
# ORACLE_RPC_URL=https://testnet.integralayer.com/evm
# ORACLE_UPDATE_INTERVAL=21600000
# ORACLE_MAX_DEVIATION=500
# ORACLE_MAX_STALENESS=43200
```

---

## Dependency List

### Frontend (`frontend/package.json`)

| Package | Purpose | Category |
|---------|---------|----------|
| `next` (14+) | App Router framework | Core |
| `react`, `react-dom` (18+) | UI library | Core |
| `typescript` | Type safety | Core |
| `tailwindcss` | Styling | Core |
| `@integra/web3auth-provider` | Social login wallet (wraps Web3Auth SDK) | Auth |
| `wagmi` (v2) | React hooks for Ethereum | Contracts |
| `viem` | Low-level Ethereum client, ABI encoding, WebSocket | Contracts |
| `@tanstack/react-query` | Async state management (wagmi peer dep) | State |
| `@radix-ui/react-*` | shadcn/ui primitives | UI |
| `class-variance-authority` | shadcn/ui variant helper | UI |
| `clsx` | Conditional class names | UI |
| `tailwind-merge` | Merge Tailwind classes | UI |
| `lucide-react` | Icons | UI |
| `recharts` or `lightweight-charts` | Price charts | Charts |
| `sonner` or `react-hot-toast` | Toast notifications (XP, confirmations) | UX |
| `zustand` (optional) | Complex state if hooks are insufficient | State |

### Oracle Service (`oracle-service/package.json`)

| Package | Purpose |
|---------|---------|
| `playwright` | Headless browser for scraping |
| `ethers` (v6) or `viem` | EIP-712 signing and contract interaction |
| `node-cron` | Schedule 4x/day execution |
| `dotenv` | Load environment variables |
| `winston` or `pino` | Structured logging |

### Smart Contracts (`package.json` root)

| Package | Purpose |
|---------|---------|
| `hardhat` | Solidity development framework |
| `@nomicfoundation/hardhat-toolbox` | Testing, coverage, gas reporting |
| `@openzeppelin/contracts` | ERC-20, ReentrancyGuard, Ownable, SafeERC20 |
| `ethers` (v6) | Contract interaction in tests and scripts |
| `hardhat-ignition` | Deployment modules |

### Dev Dependencies

| Package | Purpose |
|---------|---------|
| `vitest` | Frontend unit testing |
| `@playwright/test` | E2E testing |
| `eslint` | Linting |
| `prettier` | Code formatting |
| `@types/node`, `@types/react` | TypeScript definitions |

---

## Cross-Integration Touchpoints

These are places where multiple integrations interact and must be coordinated:

| Touchpoint | Integrations Involved | Detail |
|------------|----------------------|--------|
| First trade flow | Web3Auth + tUSDI + Faucet + XP | User signs in (Web3Auth), gets tokens (Faucet), deposits (tUSDI approval), trades (contract), earns XP (first_trade + open_position = 300 XP) |
| Position opened | Events + Explorer + XP | WebSocket picks up `PositionOpened` + `XPAction`, UI updates position list, toast shows XP, explorer link available |
| Liquidation | Events + Explorer + XP | `PositionLiquidated` event triggers UI alert for the trader, reward toast for the liquidator, both get explorer links, liquidator gets 150 XP |
| Oracle price update | Oracle + Events + Frontend | Oracle service submits price, `OraclePriceUpdated` fires, WebSocket picks it up, price display updates, all positions recalculate unrealized P&L |
| Zero-balance user | Faucet + tUSDI + Onboarding | Detect zero tUSDI, show faucet prompt, monitor balance via polling, transition to deposit step when tokens arrive |
| Transaction confirmation | Explorer + Events + XP + tUSDI | Every tx: wait for confirmation, show explorer link, emit XP event, update balances |
