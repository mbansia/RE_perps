import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const TUSDI_TESTNET = "0xa640d8b5c9cb3b989881b8e63b0f30179c78a04f";

const TerraformModule = buildModule("Terraform", (m) => {
  const collateralToken = m.getParameter("collateralToken", TUSDI_TESTNET);

  // 1. Deploy PriceOracle
  const priceOracle = m.contract("PriceOracle", []);

  // 2. Deploy MarketManager
  const marketManager = m.contract("MarketManager", []);

  // 3. Deploy LPToken
  const lpToken = m.contract("LPToken", []);

  // 4. Deploy LiquidityPool
  const liquidityPool = m.contract("LiquidityPool", [collateralToken, lpToken]);

  // 5. Deploy PerpEngine
  const perpEngine = m.contract("PerpEngine", [
    collateralToken,
    priceOracle,
    marketManager,
    liquidityPool,
  ]);

  // 6. Post-deployment configuration
  // Set LPToken pool to LiquidityPool
  m.call(lpToken, "setPool", [liquidityPool]);

  // Set LiquidityPool's PerpEngine
  m.call(liquidityPool, "setPerpEngine", [perpEngine]);

  return { priceOracle, marketManager, lpToken, liquidityPool, perpEngine };
});

export default TerraformModule;
