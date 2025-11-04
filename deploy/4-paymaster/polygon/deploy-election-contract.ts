import {ethers} from "hardhat";
import * as hre from "hardhat";

async function main() {
	console.log("=== Deploying Election Contract ===");

	const [deployer] = await ethers.getSigners();
	console.log("Deployer address:", deployer.address);

	const balance = await ethers.provider.getBalance(deployer.address);
	console.log("Deployer balance:", ethers.formatEther(balance), "ETH");

	// Deploy ElectionContract
	console.log("\n--- Deploying ElectionContract ---");
	const ElectionContract = await ethers.getContractFactory("ElectionContract");
	const electionContract = await ElectionContract.deploy();
	await electionContract.waitForDeployment();

	const electionContractAddress = await electionContract.getAddress();
	console.log("✅ ElectionContract deployed at:", electionContractAddress);

	// Verify owner
	const owner = await electionContract.owner();
	console.log("Contract owner:", owner);
	console.log(
		"Deployer matches owner:",
		owner.toLowerCase() === deployer.address.toLowerCase()
	);

	// Check initial election count
	const electionCount = await electionContract.electionCount();
	console.log("Initial election count:", electionCount.toString());

	console.log("\n=== Deployment Summary ===");
	console.log("ElectionContract:", electionContractAddress);
	console.log("Owner:", owner);
	console.log("Network:", hre.network.name);

	console.log("\n🎯 Next steps:");
	console.log("1. Save the contract address:", electionContractAddress);
	console.log(
		"2. Use createElection() function to create elections (only owner)"
	);
	console.log("3. Use vote() function to cast votes during election period");
	console.log("4. Use checkResult() to view election results");
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
