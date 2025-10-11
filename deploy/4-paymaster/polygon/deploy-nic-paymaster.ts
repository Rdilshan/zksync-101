import {ethers} from "hardhat";

async function main() {
	console.log("=== Deploying Updated NICPaymaster ===");

	const signers = await ethers.getSigners();
	const deployer = signers[0];

	console.log("Deployer:", deployer.address);

	// Get the NICWalletRegistry address (update this with your deployed address)
	const NIC_REGISTRY_ADDRESS = "0x24D2Caf2fd29D503e72AdD19a5c56C2452d2e5C1";

	console.log("NIC Registry Address:", NIC_REGISTRY_ADDRESS);

	// Deploy the updated NICPaymaster
	console.log("\n--- Deploying NICPaymaster ---");
	const NICPaymaster = await ethers.getContractFactory("NICPaymaster");
	const nicPaymaster = await NICPaymaster.deploy(NIC_REGISTRY_ADDRESS);
	await nicPaymaster.waitForDeployment();

	const nicPaymasterAddress = await nicPaymaster.getAddress();
	console.log("✅ NICPaymaster deployed at:", nicPaymasterAddress);

	// Fund the paymaster with ETH for gasless transactions
	console.log("\n--- Funding NICPaymaster ---");
	const fundTx = await deployer.sendTransaction({
		to: nicPaymasterAddress,
		value: ethers.parseEther("0.5"), // Send 0.5 ETH for gasless transactions
	});
	await fundTx.wait();
	console.log("✅ NICPaymaster funded with 0.5 ETH");
	console.log("Funding transaction:", fundTx.hash);

	// Check balance
	const balance = await nicPaymaster.getBalance();
	console.log("NICPaymaster balance:", ethers.formatEther(balance), "ETH");

	console.log("\n=== Deployment Summary ===");
	console.log("NICPaymaster Address:", nicPaymasterAddress);
	console.log("NIC Registry Address:", NIC_REGISTRY_ADDRESS);
	console.log("Balance:", ethers.formatEther(balance), "ETH");
	console.log("Deployer:", deployer.address);

	console.log("\n🎉 NICPaymaster deployed and funded successfully!");
	console.log(
		"Update your test file with the new address:",
		nicPaymasterAddress
	);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("❌ Deployment failed:", error);
		process.exit(1);
	});
