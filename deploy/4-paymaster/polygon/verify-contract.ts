import {run} from "hardhat";

/**
 * Verify a smart contract on PolygonScan
 *
 * Usage:
 *   npx hardhat run deploy/4-paymaster/polygon/verify-contract.ts --network polygonAmoy
 *
 * Or set environment variables:
 *   CONTRACT_ADDRESS=0x... npm run verify:contract:polygon
 *   CONTRACT_NAME=MockZKVerifier (optional - for better error messages)
 *   CONSTRUCTOR_ARGS=[] (optional - JSON array of constructor arguments)
 */
async function main() {
	const contractAddress =
		process.env.CONTRACT_ADDRESS ||
		process.argv[2] ||
		"0x22B5c50Abd88db14F8Fee8009372A7a14cfd12F7";

	const contractName = process.env.CONTRACT_NAME || "Contract";
	const constructorArgsEnv = process.env.CONSTRUCTOR_ARGS;

	let constructorArguments: any[] = [];

	if (constructorArgsEnv) {
		try {
			constructorArguments = JSON.parse(constructorArgsEnv);
		} catch (error) {
			console.error("❌ Failed to parse CONSTRUCTOR_ARGS:", error);
			console.log('Expected format: CONSTRUCTOR_ARGS=\'["0x...","0x..."]\'');
			process.exit(1);
		}
	} else if (process.argv[3]) {
		// Try to parse from command line arguments
		try {
			constructorArguments = JSON.parse(process.argv[3]);
		} catch (error) {
			console.log(
				"⚠️  Could not parse constructor arguments from command line"
			);
			console.log(
				"Using empty constructor arguments (for contracts with no constructor params)"
			);
		}
	}

	console.log("=== Verifying Smart Contract ===");
	console.log(`Contract Address: ${contractAddress}`);
	console.log(`Contract Name: ${contractName}`);
	console.log(`Constructor Arguments: ${JSON.stringify(constructorArguments)}`);

	try {
		await run("verify:verify", {
			address: contractAddress,
			constructorArguments: constructorArguments,
		});
		console.log(`\n✅ ${contractName} verified successfully!`);
		console.log(
			`View on PolygonScan: https://amoy.polygonscan.com/address/${contractAddress}`
		);
	} catch (error: any) {
		if (error.message?.includes("Already Verified")) {
			console.log(`\n✅ ${contractName} is already verified!`);
			console.log(
				`View on PolygonScan: https://amoy.polygonscan.com/address/${contractAddress}`
			);
		} else {
			console.error(`\n❌ Verification failed for ${contractName}:`);
			console.error(error.message || error);
			console.log("\n💡 Common issues:");
			console.log("1. Check that CONSTRUCTOR_ARGS matches the deployment");
			console.log("2. Ensure POLYGONSCAN_API_KEY is set in .env");
			console.log("3. Wait a few minutes after deployment before verifying");
			process.exit(1);
		}
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Unexpected error:", error);
		process.exit(1);
	});
