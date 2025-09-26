import {ethers} from "hardhat";
import * as hre from "hardhat";

async function main() {
	console.log("=== Deploying Polygon-Compatible Paymaster ===");

	const [deployer] = await ethers.getSigners();
	console.log("Deployer address:", deployer.address);

	const balance = await ethers.provider.getBalance(deployer.address);
	console.log("Deployer balance:", ethers.formatEther(balance), "ETH");

	// Deploy PolygonPaymaster
	console.log("\n--- Deploying PolygonPaymaster ---");
	const PolygonPaymaster = await ethers.getContractFactory("PolygonPaymaster");
	const paymaster = await PolygonPaymaster.deploy();
	await paymaster.waitForDeployment();

	console.log("✅ PolygonPaymaster deployed at:", paymaster.target);

	// Deploy SimpleCounter for testing
	console.log("\n--- Deploying SimpleCounter ---");
	const SimpleCounter = await ethers.getContractFactory("SimpleCounter");
	const counter = await SimpleCounter.deploy();
	await counter.waitForDeployment();

	console.log("✅ SimpleCounter deployed at:", counter.target);

	// Fund the paymaster with some ETH
	console.log("\n--- Funding Paymaster ---");
	const fundAmount = ethers.parseEther("0.01");
	const fundTx = await deployer.sendTransaction({
		to: paymaster.target,
		value: fundAmount,
	});
	await fundTx.wait();

	console.log(`✅ Funded paymaster with ${ethers.formatEther(fundAmount)} ETH`);

	const paymasterBalance = await ethers.provider.getBalance(paymaster.target);
	console.log(
		"Paymaster balance:",
		ethers.formatEther(paymasterBalance),
		"ETH"
	);

	console.log("\n=== Deployment Summary ===");
	console.log("PolygonPaymaster:", paymaster.target);
	console.log("SimpleCounter:", counter.target);
	console.log("Network:", hre.network.name);

	console.log("\n🎯 Next steps:");
	console.log("1. Save these addresses");
	console.log("2. Run the interaction script to test gasless transactions");
	console.log("3. Users can now increment counter without paying gas!");
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
