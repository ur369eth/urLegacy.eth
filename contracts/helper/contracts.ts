// Define a type for chainlink addresses// Define a type for chainlink-related contract addresses
export type ChainlinkAddresses = {
  priceFeedETHUSD: string;
  // Add other Chainlink contracts if needed
};

// Define a type for contract addresses (including chainlink as an object)
type ContractAddresses = {
  [contractName: string]: string | ChainlinkAddresses;
};

// Define a type for networks with contracts
export type Networks = {
  [network: string]: ContractAddresses;
};

// Mapping contract names to their addresses on different networks
export const contractAddresses: Networks = {
  mainnet: {
    BUSD: "",
    USDT: "",
    GHO: "",
    Legacy: "",
    chainlink: {
      priceFeedETHUSD: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    },
  },
  sepolia: {
    BUSD: "",
    USDT: "",
    GHO: "",
    Legacy: "",
    chainlink: {
      priceFeedETHUSD: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    },
  },
  bscTestnet: {
    BUSD: "",
    USDT: "",
    GHO: "",
    Legacy: "",
    chainlink: {
      priceFeedETHUSD: "0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526",
    },
  },
  arbitrumSepolia: {
    BUSD: "",
    USDT: "",
    GHO: "",
    Legacy: "",
    chainlink: {
      priceFeedETHUSD: "0xD1092a65338d049DB68D7Be6bD89d17a0929945e",
    },
  },
  optimismSepolia: {
    BUSD: "",
    USDT: "",
    GHO: "",
    Legacy: "",
    chainlink: {
      priceFeedETHUSD: "0x8907a105E562C9F3d7F2ed46539Ae36D87a15590",
    },
  },
};
