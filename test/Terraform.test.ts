import hre from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const { ethers } = hre;

describe("Terraform", function () {
  async function deployFixture() {
    const [owner, trader, lp, liquidator] = await ethers.getSigners();

    // Deploy mock tUSDI
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tusdi = await MockERC20.deploy("Test USDI", "tUSDI", 18);

    // Deploy MockOracle
    const MockOracle = await ethers.getContractFactory("MockOracle");
    const oracle = await MockOracle.deploy();

    // Deploy MarketManager
    const MarketManager = await ethers.getContractFactory("MarketManager");
    const marketManager = await MarketManager.deploy();

    // Deploy LPToken
    const LPToken = await ethers.getContractFactory("LPToken");
    const lpToken = await LPToken.deploy();

    // Deploy LiquidityPool
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const liquidityPool = await LiquidityPool.deploy(
      await tusdi.getAddress(),
      await lpToken.getAddress()
    );

    // Deploy PerpEngine
    const PerpEngine = await ethers.getContractFactory("PerpEngine");
    const perpEngine = await PerpEngine.deploy(
      await tusdi.getAddress(),
      await oracle.getAddress(),
      await marketManager.getAddress(),
      await liquidityPool.getAddress()
    );

    // Configure
    await lpToken.setPool(await liquidityPool.getAddress());
    await liquidityPool.setPerpEngine(await perpEngine.getAddress());
    await liquidityPool.setTreasury(owner.address);

    // Add NYC market
    const nycId = ethers.keccak256(ethers.toUtf8Bytes("NYC"));
    await marketManager.addMarket("NYC", {
      name: "NYC",
      marketId: nycId,
      skewScale: ethers.parseUnits("100000", 18),  // 100k sqft
      maxFundingVelocity: ethers.parseUnits("0.1", 18), // 10%/day max
      takerFeeRate: ethers.parseUnits("0.001", 18), // 0.1%
      makerFeeRate: ethers.parseUnits("0.0005", 18), // 0.05%
      initialMarginRatio: ethers.parseUnits("0.1", 18), // 10%
      maintenanceMarginRatio: ethers.parseUnits("0.05", 18), // 5%
      liquidationFeeRate: ethers.parseUnits("0.01", 18), // 1%
      minPositionMargin: ethers.parseUnits("10", 18), // 10 tUSDI
      maxMarketSkew: ethers.parseUnits("50000", 18), // 50k sqft
      maxLongOI: ethers.parseUnits("100000", 18),
      maxShortOI: ethers.parseUnits("100000", 18),
      active: true,
    });

    // Set NYC price to $500/sqft
    await oracle.setPrice(nycId, ethers.parseUnits("500", 18));

    // Mint tUSDI to participants
    const mintAmount = ethers.parseUnits("100000", 18);
    await tusdi.mint(trader.address, mintAmount);
    await tusdi.mint(lp.address, mintAmount);

    return {
      owner, trader, lp, liquidator,
      tusdi, oracle, marketManager, lpToken, liquidityPool, perpEngine,
      nycId,
    };
  }

  describe("LiquidityPool", function () {
    it("should accept LP deposits and mint LP tokens", async function () {
      const { lp, tusdi, liquidityPool, lpToken } = await loadFixture(deployFixture);
      const amount = ethers.parseUnits("10000", 18);

      await tusdi.connect(lp).approve(await liquidityPool.getAddress(), amount);
      await liquidityPool.connect(lp).deposit(amount);

      expect(await lpToken.balanceOf(lp.address)).to.equal(amount);
      expect(await liquidityPool.poolValue()).to.equal(amount);
    });

    it("should enforce 24h withdrawal delay", async function () {
      const { lp, tusdi, liquidityPool, lpToken } = await loadFixture(deployFixture);
      const amount = ethers.parseUnits("10000", 18);

      await tusdi.connect(lp).approve(await liquidityPool.getAddress(), amount);
      await liquidityPool.connect(lp).deposit(amount);

      await liquidityPool.connect(lp).requestWithdrawal(amount);

      // Should fail before 24h
      await expect(liquidityPool.connect(lp).executeWithdrawal()).to.be.revertedWithCustomError(
        liquidityPool,
        "WithdrawalNotReady"
      );

      // Advance 24h
      await time.increase(86400);

      // Should succeed now
      await liquidityPool.connect(lp).executeWithdrawal();
      expect(await lpToken.balanceOf(lp.address)).to.equal(0);
    });
  });

  describe("PerpEngine - Collateral", function () {
    it("should accept collateral deposits", async function () {
      const { trader, tusdi, perpEngine } = await loadFixture(deployFixture);
      const amount = ethers.parseUnits("1000", 18);

      await tusdi.connect(trader).approve(await perpEngine.getAddress(), amount);
      await perpEngine.connect(trader).depositCollateral(amount);

      const account = await perpEngine.getAccount(trader.address);
      expect(account.collateral).to.equal(amount);
    });

    it("should enforce 24h withdrawal delay", async function () {
      const { trader, tusdi, perpEngine } = await loadFixture(deployFixture);
      const amount = ethers.parseUnits("1000", 18);

      await tusdi.connect(trader).approve(await perpEngine.getAddress(), amount);
      await perpEngine.connect(trader).depositCollateral(amount);

      // Should fail before 24h
      await expect(
        perpEngine.connect(trader).withdrawCollateral(amount)
      ).to.be.revertedWithCustomError(perpEngine, "WithdrawalDelayNotMet");

      await time.increase(86400);

      // Should succeed now
      await perpEngine.connect(trader).withdrawCollateral(amount);
      const account = await perpEngine.getAccount(trader.address);
      expect(account.collateral).to.equal(0);
    });
  });

  describe("PerpEngine - Trading", function () {
    it("should open a long position", async function () {
      const { trader, lp, tusdi, perpEngine, liquidityPool, nycId } =
        await loadFixture(deployFixture);

      // LP deposits first
      await tusdi.connect(lp).approve(await liquidityPool.getAddress(), ethers.parseUnits("50000", 18));
      await liquidityPool.connect(lp).deposit(ethers.parseUnits("50000", 18));

      // Trader deposits collateral
      await tusdi.connect(trader).approve(await perpEngine.getAddress(), ethers.parseUnits("10000", 18));
      await perpEngine.connect(trader).depositCollateral(ethers.parseUnits("10000", 18));

      // Open 100 sqft long
      const size = ethers.parseUnits("100", 18);
      await expect(perpEngine.connect(trader).openPosition(nycId, size))
        .to.emit(perpEngine, "PositionOpened");

      const positions = await perpEngine.getPositions(trader.address);
      expect(positions.length).to.equal(1);
      expect(positions[0].size).to.be.gt(0); // Positive = long
    });

    it("should open a short position", async function () {
      const { trader, lp, tusdi, perpEngine, liquidityPool, nycId } =
        await loadFixture(deployFixture);

      await tusdi.connect(lp).approve(await liquidityPool.getAddress(), ethers.parseUnits("50000", 18));
      await liquidityPool.connect(lp).deposit(ethers.parseUnits("50000", 18));

      await tusdi.connect(trader).approve(await perpEngine.getAddress(), ethers.parseUnits("10000", 18));
      await perpEngine.connect(trader).depositCollateral(ethers.parseUnits("10000", 18));

      // Open 100 sqft short (negative size)
      const size = ethers.parseUnits("-100", 18);
      await expect(perpEngine.connect(trader).openPosition(nycId, size))
        .to.emit(perpEngine, "PositionOpened");

      const positions = await perpEngine.getPositions(trader.address);
      expect(positions.length).to.equal(1);
      expect(positions[0].size).to.be.lt(0); // Negative = short
    });

    it("should close a position", async function () {
      const { trader, lp, tusdi, perpEngine, liquidityPool, nycId } =
        await loadFixture(deployFixture);

      await tusdi.connect(lp).approve(await liquidityPool.getAddress(), ethers.parseUnits("50000", 18));
      await liquidityPool.connect(lp).deposit(ethers.parseUnits("50000", 18));

      await tusdi.connect(trader).approve(await perpEngine.getAddress(), ethers.parseUnits("10000", 18));
      await perpEngine.connect(trader).depositCollateral(ethers.parseUnits("10000", 18));

      await perpEngine.connect(trader).openPosition(nycId, ethers.parseUnits("100", 18));

      await expect(perpEngine.connect(trader).closePosition(nycId))
        .to.emit(perpEngine, "PositionClosed");

      const positions = await perpEngine.getPositions(trader.address);
      expect(positions.length).to.equal(0);
    });

    it("should reject trades exceeding max skew", async function () {
      const { trader, lp, tusdi, perpEngine, liquidityPool, nycId } =
        await loadFixture(deployFixture);

      await tusdi.connect(lp).approve(await liquidityPool.getAddress(), ethers.parseUnits("50000", 18));
      await liquidityPool.connect(lp).deposit(ethers.parseUnits("50000", 18));

      await tusdi.connect(trader).approve(await perpEngine.getAddress(), ethers.parseUnits("100000", 18));
      await perpEngine.connect(trader).depositCollateral(ethers.parseUnits("100000", 18));

      // Try to open position exceeding max skew (50k)
      await expect(
        perpEngine.connect(trader).openPosition(nycId, ethers.parseUnits("60000", 18))
      ).to.be.revertedWithCustomError(perpEngine, "ExceedsMaxSkew");
    });

    it("should reject when insufficient margin", async function () {
      const { trader, lp, tusdi, perpEngine, liquidityPool, nycId } =
        await loadFixture(deployFixture);

      await tusdi.connect(lp).approve(await liquidityPool.getAddress(), ethers.parseUnits("50000", 18));
      await liquidityPool.connect(lp).deposit(ethers.parseUnits("50000", 18));

      // Deposit 100 tUSDI — not enough for a 10 sqft position at $500 ($5000 notional, needs $500+10 margin)
      await tusdi.connect(trader).approve(await perpEngine.getAddress(), ethers.parseUnits("100", 18));
      await perpEngine.connect(trader).depositCollateral(ethers.parseUnits("100", 18));

      // Try to open 10 sqft — needs ~$510 margin, only have $100
      await expect(
        perpEngine.connect(trader).openPosition(nycId, ethers.parseUnits("10", 18))
      ).to.be.revertedWithCustomError(perpEngine, "InsufficientMargin");
    });
  });

  describe("PerpEngine - Liquidation", function () {
    it("should liquidate undercollateralized accounts", async function () {
      const { trader, lp, liquidator, tusdi, perpEngine, liquidityPool, oracle, nycId } =
        await loadFixture(deployFixture);

      await tusdi.connect(lp).approve(await liquidityPool.getAddress(), ethers.parseUnits("50000", 18));
      await liquidityPool.connect(lp).deposit(ethers.parseUnits("50000", 18));

      // Trader deposits enough for 10 sqft at $500 ($5k notional, needs ~$510 margin)
      // Deposit $600 — just above initial margin requirement
      await tusdi.connect(trader).approve(await perpEngine.getAddress(), ethers.parseUnits("6000", 18));
      await perpEngine.connect(trader).depositCollateral(ethers.parseUnits("6000", 18));

      // Open a long 10 sqft at $500 (notional $5000, margin ~$510)
      await perpEngine.connect(trader).openPosition(nycId, ethers.parseUnits("10", 18));

      // Price drops sharply to $100 (80% drop) — massive loss
      // Loss = 10 * (100 - 500) = -$4000, account value = 6000 - fee - 4000 ≈ $1995
      // Maintenance margin = 5000 * 0.05 + 1% liq fee + 10 min ≈ $310
      // Still above maintenance... need bigger position or bigger drop.
      // Let's use 100 sqft instead. Notional = $50k, needs $5010 margin.
      // Actually let's re-approach: deposit $5100, open 100 sqft
      // After 10% drop to $450: loss = 100 * (450-500) = -$5000
      // Account value ≈ 5100 - fee - 5000 ≈ $50
      // Required margin = 45000 * 0.05 + 45000 * 0.01 + 10 = $2710
      // $50 < $2710 → liquidatable

      // Close the small position first
      await perpEngine.connect(trader).closePosition(nycId);

      // Re-deposit to exactly $5200 for tight margin
      // (account should still have ~$6000 minus small fees)
      // Open 100 sqft long
      await perpEngine.connect(trader).openPosition(nycId, ethers.parseUnits("100", 18));

      // Price drops to $450 (10% drop)
      await oracle.setPrice(nycId, ethers.parseUnits("450", 18));

      // Liquidate
      await expect(perpEngine.connect(liquidator).liquidate(trader.address))
        .to.emit(perpEngine, "PositionLiquidated");

      const positions = await perpEngine.getPositions(trader.address);
      expect(positions.length).to.equal(0);
    });

    it("should reject liquidation of healthy accounts", async function () {
      const { trader, lp, liquidator, tusdi, perpEngine, liquidityPool, nycId } =
        await loadFixture(deployFixture);

      await tusdi.connect(lp).approve(await liquidityPool.getAddress(), ethers.parseUnits("50000", 18));
      await liquidityPool.connect(lp).deposit(ethers.parseUnits("50000", 18));

      await tusdi.connect(trader).approve(await perpEngine.getAddress(), ethers.parseUnits("10000", 18));
      await perpEngine.connect(trader).depositCollateral(ethers.parseUnits("10000", 18));

      await perpEngine.connect(trader).openPosition(nycId, ethers.parseUnits("100", 18));

      // Should fail — account is well-collateralized
      await expect(
        perpEngine.connect(liquidator).liquidate(trader.address)
      ).to.be.revertedWithCustomError(perpEngine, "AccountNotLiquidatable");
    });
  });

  describe("MarketManager", function () {
    it("should add and retrieve markets", async function () {
      const { marketManager, nycId } = await loadFixture(deployFixture);

      const market = await marketManager.getMarket(nycId);
      expect(market.name).to.equal("NYC");
      expect(market.active).to.be.true;
    });

    it("should pause and unpause markets", async function () {
      const { marketManager, nycId } = await loadFixture(deployFixture);

      await marketManager.pauseMarket(nycId);
      expect(await marketManager.isMarketActive(nycId)).to.be.false;

      await marketManager.unpauseMarket(nycId);
      expect(await marketManager.isMarketActive(nycId)).to.be.true;
    });
  });
});
