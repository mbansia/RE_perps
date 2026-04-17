import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    "integra-testnet": {
      url: process.env.INTEGRA_TESTNET_RPC_URL || "https://testnet.integralayer.com/evm",
      chainId: 26218,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    "integra-mainnet": {
      url: process.env.INTEGRA_MAINNET_RPC_URL || "https://mainnet.integralayer.com/evm",
      chainId: 26217,
      gasPrice: 5_000_000_000_000,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      "integra-testnet": "not-needed",
      "integra-mainnet": "not-needed",
    },
    customChains: [
      {
        network: "integra-testnet",
        chainId: 26218,
        urls: {
          apiURL: "https://testnet.blockscout.integralayer.com/api/",
          browserURL: "https://testnet.blockscout.integralayer.com",
        },
      },
      {
        network: "integra-mainnet",
        chainId: 26217,
        urls: {
          apiURL: "https://blockscout.integralayer.com/api",
          browserURL: "https://blockscout.integralayer.com",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
