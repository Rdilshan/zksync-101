import {run} from "hardhat";

async function main() {
	console.log("=== Verifying Smart Contracts ===");

	// Contract addresses
	const NIC_REGISTRY_ADDRESS = "0x24D2Caf2fd29D503e72AdD19a5c56C2452d2e5C1";
	const NIC_PAYMASTER_ADDRESS = "0xcb1d0aac729D0591fCe76C8d604D2B6b2dfa5Ff4";
	const COUNTER_ADDRESS = "0x1C92c2485d4512e304adD509499900Be39B22Af5";

	try {
		// Verify NICWalletRegistry
		console.log("\n--- Verifying NICWalletRegistry ---");
		await run("verify:verify", {
			address: NIC_REGISTRY_ADDRESS,
			constructorArguments: [],
		});
		console.log("✅ NICWalletRegistry verified");

		// Verify SimpleCounter
		console.log("\n--- Verifying SimpleCounter ---");
		await run("verify:verify", {
			address: COUNTER_ADDRESS,
			constructorArguments: [],
		});
		console.log("✅ SimpleCounter verified");

		// Verify NICPaymaster
		console.log("\n--- Verifying NICPaymaster ---");
		await run("verify:verify", {
			address: NIC_PAYMASTER_ADDRESS,
			constructorArguments: [NIC_REGISTRY_ADDRESS],
		});
		console.log("✅ NICPaymaster verified");

		console.log("\n🎉 All contracts verified successfully!");
	} catch (error) {
		console.error("❌ Verification failed:", error);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Unexpected error:", error);
		process.exit(1);
	});

