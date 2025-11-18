import {ethers} from "hardhat";

/**
 * Update the verifier address in ZK Election Contract
 * 
 * Usage:
 *   npx hardhat run deploy/4-paymaster/polygon/set-verifier.ts --network polygonAmoy
 * 
 * Environment variables:
 *   ZK_ELECTION_CONTRACT_ADDRESS - Address of deployed ZK_ElectionContract
 *   VERIFIER_ADDRESS - New verifier contract address
 */
async function main() {
	console.log("=== Updating ZK Election Contract Verifier ===\n");

	const [deployer] = await ethers.getSigners();
	console.log("Deployer address:", deployer.address);

	const zkElectionAddress =
		process.env.ZK_ELECTION_CONTRACT_ADDRESS ||
		process.argv[2] ||
		"0x82537c95a9C7ff36ba982f51DB15898F1Dd53b0C";

	const newVerifierAddress =
		process.env.VERIFIER_ADDRESS ||
		process.argv[3] ||
		"0x0000000000000000000000000000000000000000";

	if (newVerifierAddress === "0x0000000000000000000000000000000000000000") {
		console.error("❌ Error: VERIFIER_ADDRESS is required");
		console.log(
			"Usage: npx hardhat run deploy/4-paymaster/polygon/set-verifier.ts --network polygonAmoy -- <zkElectionAddress> <verifierAddress>"
		);
		console.log(
			"Or set environment variables: VERIFIER_ADDRESS=0x..."
		);
		process.exit(1);
	}

	console.log("ZK Election Contract:", zkElectionAddress);
	console.log("New Verifier Address:", newVerifierAddress);

	// Connect to contract
	const ZKElectionContract = await ethers.getContractFactory(
		"ZK_ElectionContract"
	);
	const zkElection = ZKElectionContract.attach(zkElectionAddress);

	// Verify deployer is owner
	const owner = await zkElection.owner();
	if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
		console.error("❌ Error: Deployer is not the contract owner");
		console.log("Owner:", owner);
		process.exit(1);
	}

	// Get current verifier
	const currentVerifier = await zkElection.verifier();
	console.log("\nCurrent Verifier:", currentVerifier);

	if (currentVerifier.toLowerCase() === newVerifierAddress.toLowerCase()) {
		console.log("✅ Verifier is already set to this address");
		process.exit(0);
	}

	// Verify new verifier contract exists
	const verifierCode = await ethers.provider.getCode(newVerifierAddress);
	if (verifierCode === "0x") {
		console.error("❌ Error: No contract found at verifier address");
		process.exit(1);
	}

	console.log("✅ Verifier contract found");

	// Update verifier
	try {
		console.log("\n--- Updating Verifier ---");
		const tx = await zkElection.setVerifier(newVerifierAddress);
		console.log("Transaction hash:", tx.hash);
		
		const receipt = await tx.wait();
		console.log("✅ Verifier updated successfully!");
		console.log("Gas used:", receipt?.gasUsed.toString());

		// Verify update
		const updatedVerifier = await zkElection.verifier();
		console.log("\nUpdated Verifier:", updatedVerifier);

		if (updatedVerifier.toLowerCase() === newVerifierAddress.toLowerCase()) {
			console.log("✅ Verification successful!");
		} else {
			console.error("❌ Verification failed - addresses don't match");
			process.exit(1);
		}

		console.log("\n✅ Verifier updated successfully!");

		console.log("\n📋 Contract Addresses:");
		console.log("ZK Election Contract:", zkElectionAddress);
		console.log("Verifier:", updatedVerifier);
		console.log(
			"\nView on PolygonScan:",
			`https://amoy.polygonscan.com/address/${zkElectionAddress}`
		);
	} catch (error: any) {
		console.error("❌ Failed to update verifier:", error.message);
		if (error.data) {
			console.error("Error data:", error.data);
		}
		process.exit(1);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

