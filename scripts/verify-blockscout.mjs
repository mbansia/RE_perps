/**
 * Verify contracts on Blockscout v2 API (standard-json-input method).
 * Usage: node scripts/verify-blockscout.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const BLOCKSCOUT_URL = "https://testnet.blockscout.integralayer.com";

const CONTRACTS = [
  {
    name: "PriceOracle",
    address: "0xECc3439E727Bf2DC7D85B8a5ED33B9Ed2b3510c7",
    contractPath: "contracts/core/PriceOracle.sol:PriceOracle",
    constructorArgs: "",
  },
  {
    name: "MarketManager",
    address: "0x6EcE231b415e4ebB51D0B6484cBA56d7eada8de4",
    contractPath: "contracts/core/MarketManager.sol:MarketManager",
    constructorArgs: "",
  },
  {
    name: "LPToken",
    address: "0xbeE437e7290b6019aF43fA74726F679152475fe8",
    contractPath: "contracts/core/LPToken.sol:LPToken",
    constructorArgs: "",
  },
  {
    name: "LiquidityPool",
    address: "0xb078F1641d69A519092D78067b57012c87d2d490",
    contractPath: "contracts/core/LiquidityPool.sol:LiquidityPool",
    // constructor(IERC20 _collateralToken, LPToken _lpToken)
    constructorArgs:
      "000000000000000000000000a640d8b5c9cb3b989881b8e63b0f30179c78a04f000000000000000000000000bee437e7290b6019af43fa74726f679152475fe8",
  },
  {
    name: "PerpEngine",
    address: "0x4fBd5d49a9795F648C268d0e901e16efD528d621",
    contractPath: "contracts/core/PerpEngine.sol:PerpEngine",
    // constructor(IERC20 _collateral, IPriceOracle _oracle, IMarketManager _marketManager, ILiquidityPool _pool)
    constructorArgs:
      "000000000000000000000000a640d8b5c9cb3b989881b8e63b0f30179c78a04f000000000000000000000000ecc3439e727bf2dc7d85b8a5ed33b9ed2b3510c70000000000000000000000006ece231b415e4ebb51d0b6484cba56d7eada8de4000000000000000000000000b078f1641d69a519092d78067b57012c87d2d490",
  },
];

// Read build info (standard JSON input)
const buildInfoDir = path.join(ROOT, "artifacts", "build-info");
const buildFiles = fs.readdirSync(buildInfoDir);
const buildInfo = JSON.parse(
  fs.readFileSync(path.join(buildInfoDir, buildFiles[0]), "utf8")
);
const standardInput = JSON.stringify(buildInfo.input);
const compilerVersion = `v${buildInfo.solcLongVersion}`;

console.log(`Compiler: ${compilerVersion}`);
console.log(`Build info file: ${buildFiles[0]}`);
console.log(`Source files: ${Object.keys(buildInfo.input.sources).length}`);
console.log();

async function verifyContract(contract) {
  const { name, address, contractPath, constructorArgs } = contract;
  console.log(`--- Verifying ${name} at ${address} ---`);

  // Check if already verified
  try {
    const checkRes = await fetch(
      `${BLOCKSCOUT_URL}/api/v2/smart-contracts/${address}`
    );
    const checkData = await checkRes.json();
    if (checkData.is_verified) {
      console.log(`  Already verified!`);
      return { name, status: "already-verified" };
    }
  } catch (e) {
    // ignore
  }

  // Build multipart form data manually
  const boundary = `----NodeFormBoundary${Date.now()}${Math.random().toString(36)}`;

  function field(name, value) {
    return `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}`;
  }

  function fileField(name, filename, content, contentType = "application/json") {
    return `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n${content}`;
  }

  const parts = [
    field("compiler_version", compilerVersion),
    field("autodetect_constructor_args", constructorArgs ? "false" : "true"),
  ];

  if (constructorArgs) {
    parts.push(field("constructor_args", constructorArgs));
  }

  if (contractPath) {
    parts.push(field("contract_name", contractPath));
  }

  parts.push(fileField("files[0]", "input.json", standardInput));

  const body = parts.join("\r\n") + `\r\n--${boundary}--\r\n`;

  try {
    const res = await fetch(
      `${BLOCKSCOUT_URL}/api/v2/smart-contracts/${address}/verification/via/standard-input`,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      }
    );

    const text = await res.text();
    console.log(`  Response (${res.status}): ${text}`);

    if (res.status === 200 && text.includes("started")) {
      // Poll for verification completion
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise((r) => setTimeout(r, 5000));
        const checkRes = await fetch(
          `${BLOCKSCOUT_URL}/api/v2/smart-contracts/${address}`
        );
        const checkData = await checkRes.json();
        if (checkData.is_verified) {
          console.log(`  Verified successfully! Name: ${checkData.name}`);
          return { name, status: "verified" };
        }
        if (checkData.name) {
          console.log(`  Verified successfully! Name: ${checkData.name}`);
          return { name, status: "verified" };
        }
        console.log(`  Polling... (attempt ${attempt + 1}/12)`);
      }
      console.log(`  Verification started but could not confirm completion.`);
      return { name, status: "pending" };
    } else if (res.status === 200) {
      // May have verified immediately
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {}
      if (parsed && parsed.is_verified) {
        console.log(`  Verified successfully!`);
        return { name, status: "verified" };
      }
      return { name, status: "submitted", response: text };
    } else {
      return { name, status: "failed", response: text };
    }
  } catch (e) {
    console.log(`  Error: ${e.message}`);
    return { name, status: "error", error: e.message };
  }
}

const results = [];
for (const contract of CONTRACTS) {
  const result = await verifyContract(contract);
  results.push(result);
  console.log();
}

console.log("\n=== SUMMARY ===");
for (const r of results) {
  console.log(`  ${r.name}: ${r.status}`);
}
