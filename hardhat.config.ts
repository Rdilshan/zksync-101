import type {HardhatUserConfig} from "hardhat/config";

import "@nomicfoundation/hardhat-toolbox";
import "@typechain/hardhat";
import "@nomicfoundation/hardhat-chai-matchers";
import "@matterlabs/hardhat-zksync";

import dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
	defaultNetwork: "polygonAmoy",
	etherscan: {
		apiKey: process.env.POLYGONSCAN_API_KEY || "dummy-key",
		customChains: [
			{
				network: "polygonAmoy",
				chainId: 80002,
				urls: {
					apiURL: "https://api-amoy.polygonscan.com/api",
					browserURL: "https://amoy.polygonscan.com",
				},
			},
		],
	},
	networks: {
		ZKsyncEraSepolia: {
			url: "https://sepolia.era.zksync.dev",
			ethNetwork: "sepolia",
			zksync: true,
			verifyURL:
				"https://explorer.sepolia.era.zksync.dev/contract_verification",
			accounts: process.env.WALLET_PRIVATE_KEY
				? [process.env.WALLET_PRIVATE_KEY]
				: [],
		},
		anvilZKsync: {
			url: "http://127.0.0.1:8011",
			ethNetwork: "http://127.0.0.1:8545",
			zksync: true,
			accounts: process.env.WALLET_PRIVATE_KEY
				? [process.env.WALLET_PRIVATE_KEY]
				: [],
		},
		polygonAmoy: {
			url: "https://polygon-amoy.infura.io/v3/c509154e05734c82890468ae9aac1450",
			chainId: 80002,
			accounts: process.env.WALLET_PRIVATE_KEY
				? [process.env.WALLET_PRIVATE_KEY]
				: [],
		},
	},
	zksolc: {
		version: "1.5.15",
		settings: {
			codegen: "yul",
			// find all available options in the official documentation
			// https://docs.zksync.io/build/tooling/hardhat/hardhat-zksync-solc#configuration
		},
	},
	solidity: {
		version: "0.8.30",
		settings: {
			optimizer: {
				enabled: true,
				runs: 200,
			},
			viaIR: true, // Enable IR-based compilation to handle stack too deep errors
		},
	},
};

export default config;
