import { defineChain } from "viem";

export const integraTestnet = defineChain({
  id: 26218,
  name: "Integra Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Integra",
    symbol: "IRL",
  },
  rpcUrls: {
    default: {
      http: ["https://testnet.integralayer.com/evm"],
      webSocket: ["wss://testnet.integralayer.com/evm/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://blockscout.integralayer.com",
    },
  },
  testnet: true,
});
