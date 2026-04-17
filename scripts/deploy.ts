import hre from "hardhat";

const { ethers } = hre;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "IRL");

  const TUSDI = "0xa640d8b5c9cb3b989881b8e63b0f30179c78a04f";

  // 1. PriceOracle
  console.log("\n1. Deploying PriceOracle...");
  const PriceOracle = await ethers.getContractFactory("PriceOracle");
  const oracle = await PriceOracle.deploy();
  await oracle.waitForDeployment();
  const oracleAddr = await oracle.getAddress();
  console.log("   PriceOracle:", oracleAddr);

  // 2. MarketManager
  console.log("2. Deploying MarketManager...");
  const MarketManager = await ethers.getContractFactory("MarketManager");
  const marketManager = await MarketManager.deploy();
  await marketManager.waitForDeployment();
  const mmAddr = await marketManager.getAddress();
  console.log("   MarketManager:", mmAddr);

  // 3. LPToken
  console.log("3. Deploying LPToken...");
  const LPToken = await ethers.getContractFactory("LPToken");
  const lpToken = await LPToken.deploy();
  await lpToken.waitForDeployment();
  const lpAddr = await lpToken.getAddress();
  console.log("   LPToken:", lpAddr);

  // 4. LiquidityPool
  console.log("4. Deploying LiquidityPool...");
  const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
  const pool = await LiquidityPool.deploy(TUSDI, lpAddr);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("   LiquidityPool:", poolAddr);

  // 5. PerpEngine
  console.log("5. Deploying PerpEngine...");
  const PerpEngine = await ethers.getContractFactory("PerpEngine");
  const engine = await PerpEngine.deploy(TUSDI, oracleAddr, mmAddr, poolAddr);
  await engine.waitForDeployment();
  const engineAddr = await engine.getAddress();
  console.log("   PerpEngine:", engineAddr);

  // 6. Post-deployment configuration
  console.log("\n6. Configuring...");

  console.log("   Setting LPToken pool...");
  let tx = await lpToken.setPool(poolAddr);
  await tx.wait();

  console.log("   Setting LiquidityPool PerpEngine...");
  tx = await pool.setPerpEngine(engineAddr);
  await tx.wait();

  console.log("   Setting LiquidityPool treasury...");
  tx = await pool.setTreasury(deployer.address);
  await tx.wait();

  console.log("   Authorizing oracle signer...");
  tx = await oracle.setSigner(deployer.address, true);
  await tx.wait();

  // 7. Add markets
  console.log("\n7. Adding markets...");

  const nycConfig = {
    name: "NYC",
    marketId: ethers.keccak256(ethers.toUtf8Bytes("NYC")),
    skewScale: ethers.parseUnits("100000", 18),
    maxFundingVelocity: ethers.parseUnits("0.1", 18),
    takerFeeRate: ethers.parseUnits("0.001", 18),
    makerFeeRate: ethers.parseUnits("0.0005", 18),
    initialMarginRatio: ethers.parseUnits("0.1", 18),
    maintenanceMarginRatio: ethers.parseUnits("0.05", 18),
    liquidationFeeRate: ethers.parseUnits("0.01", 18),
    minPositionMargin: ethers.parseUnits("10", 18),
    maxMarketSkew: ethers.parseUnits("50000", 18),
    maxLongOI: ethers.parseUnits("100000", 18),
    maxShortOI: ethers.parseUnits("100000", 18),
    active: true,
  };

  console.log("   Adding NYC market...");
  tx = await marketManager.addMarket("NYC", nycConfig);
  await tx.wait();

  const dubaiConfig = {
    name: "DUBAI",
    marketId: ethers.keccak256(ethers.toUtf8Bytes("DUBAI")),
    skewScale: ethers.parseUnits("100000", 18),
    maxFundingVelocity: ethers.parseUnits("0.1", 18),
    takerFeeRate: ethers.parseUnits("0.001", 18),
    makerFeeRate: ethers.parseUnits("0.0005", 18),
    initialMarginRatio: ethers.parseUnits("0.1", 18),
    maintenanceMarginRatio: ethers.parseUnits("0.05", 18),
    liquidationFeeRate: ethers.parseUnits("0.01", 18),
    minPositionMargin: ethers.parseUnits("10", 18),
    maxMarketSkew: ethers.parseUnits("50000", 18),
    maxLongOI: ethers.parseUnits("100000", 18),
    maxShortOI: ethers.parseUnits("100000", 18),
    active: true,
  };

  console.log("   Adding DUBAI market...");
  tx = await marketManager.addMarket("DUBAI", dubaiConfig);
  await tx.wait();

  // 8. Set initial prices via oracle
  console.log("\n8. Setting initial prices...");

  const nycId = ethers.keccak256(ethers.toUtf8Bytes("NYC"));
  const dubaiId = ethers.keccak256(ethers.toUtf8Bytes("DUBAI"));
  const timestamp = Math.floor(Date.now() / 1000);

  // Sign and submit NYC price ($500/sqft)
  const nycPrice = ethers.parseUnits("500", 18);
  const dubaiPrice = ethers.parseUnits("350", 18); // ~1285 AED/sqft

  // EIP-712 batch signing
  const domain = {
    name: "TerraformOracle",
    version: "1",
    chainId: 26218,
    verifyingContract: oracleAddr,
  };

  const types = {
    BatchPriceUpdate: [
      { name: "marketIds", type: "bytes32[]" },
      { name: "prices", type: "uint256[]" },
      { name: "timestamps", type: "uint256[]" },
    ],
  };

  const value = {
    marketIds: [nycId, dubaiId],
    prices: [nycPrice, dubaiPrice],
    timestamps: [timestamp, timestamp],
  };

  const signature = await deployer.signTypedData(domain, types, value);

  console.log("   Submitting batch price update...");
  tx = await oracle.updatePricesBatch(
    [nycId, dubaiId],
    [nycPrice, dubaiPrice],
    [timestamp, timestamp],
    signature
  );
  await tx.wait();
  console.log("   Prices set: NYC=$500/sqft, DUBAI=$350/sqft");

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log(`PriceOracle:    ${oracleAddr}`);
  console.log(`MarketManager:  ${mmAddr}`);
  console.log(`LPToken:        ${lpAddr}`);
  console.log(`LiquidityPool:  ${poolAddr}`);
  console.log(`PerpEngine:     ${engineAddr}`);
  console.log(`tUSDI:          ${TUSDI}`);
  console.log("=".repeat(60));
  console.log("\nUpdate your .env with these addresses!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
