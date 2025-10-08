import {ethers} from "hardhat";

// Contract addresses - update these after deployment
const NIC_REGISTRY_ADDRESS = "0x24D2Caf2fd29D503e72AdD19a5c56C2452d2e5C1"; // New deployed contract

// Your system wallet address that needs authorization
const SYSTEM_WALLET_ADDRESS = "0x09774CA791a77906d6c5b915bdB39882eEb55234";

async function main() {
	console.log("=== Authorizing System Wallet ===");

	const signers = await ethers.getSigners();
	const deployer = signers[0];

	console.log("Deployer:", deployer.address);
	console.log("System Wallet to authorize:", SYSTEM_WALLET_ADDRESS);
	console.log("Contract Address:", NIC_REGISTRY_ADDRESS);

	// Get contract instance
	const registry = await ethers.getContractAt(
		"NICWalletRegistry",
		NIC_REGISTRY_ADDRESS
	);

	try {
		// Check current authorization status
		const isAuthorized = await registry.authorizedSystemWallets(
			SYSTEM_WALLET_ADDRESS
		);
		console.log("Current authorization status:", isAuthorized);

		if (isAuthorized) {
			console.log("✅ System wallet is already authorized");
			return;
		}

		// Authorize the system wallet
		console.log("Authorizing system wallet...");
		const authTx = await registry.authorizeSystemWallet(
			SYSTEM_WALLET_ADDRESS,
			true
		);
		await authTx.wait();

		console.log("✅ System wallet authorized successfully!");
		console.log("Transaction hash:", authTx.hash);

		// Verify authorization
		const newStatus = await registry.authorizedSystemWallets(
			SYSTEM_WALLET_ADDRESS
		);
		console.log("New authorization status:", newStatus);

		if (newStatus) {
			console.log(
				"🎉 System wallet can now create sessions for any registered NIC!"
			);
		} else {
			console.log("❌ Authorization failed");
		}
	} catch (error) {
		console.error("❌ Authorization failed:", error);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
