import {ethers} from "hardhat";

// Contract addresses
const NIC_REGISTRY_ADDRESS = "0x24D2Caf2fd29D503e72AdD19a5c56C2452d2e5C1";
const COUNTER_ADDRESS = "0x1C92c2485d4512e304adD509499900Be39B22Af5";

// Test data
const TEST_NIC = "1234";
const REGISTERED_WALLET = "0x835a5220EC26fcFe855dC0957cE483f03A8Bb028";

async function main() {
	console.log("=== Testing executeOnBehalf with Counter ===");

	const signers = await ethers.getSigners();
	const deployer = signers[0];

	console.log("Deployer:", deployer.address);
	console.log("NIC Registry:", NIC_REGISTRY_ADDRESS);
	console.log("Counter:", COUNTER_ADDRESS);
	console.log("Test NIC:", TEST_NIC);
	console.log("Registered Wallet:", REGISTERED_WALLET);

	// Get contract instances
	const registry = await ethers.getContractAt(
		"NICWalletRegistry",
		NIC_REGISTRY_ADDRESS
	);
	const counter = await ethers.getContractAt("SimpleCounter", COUNTER_ADDRESS);

	try {
		// Step 1: Check initial counter state
		console.log("\n--- Initial Counter State ---");
		const initialCounter = await counter.getCounter();
		const initialUserCounter = await counter.getUserCounter(REGISTERED_WALLET);

		console.log("Global counter:", initialCounter.toString());
		console.log("User counter:", initialUserCounter.toString());

		// Step 2: Create temporary wallet
		console.log("\n--- Create Temporary Wallet ---");
		const tempWallet = ethers.Wallet.createRandom();
		console.log("Temporary wallet:", tempWallet.address);

		// Step 3: Fund temporary wallet
		console.log("\n--- Fund Temporary Wallet ---");
		const fundTx = await deployer.sendTransaction({
			to: tempWallet.address,
			value: ethers.parseEther("0.01"),
		});
		await fundTx.wait();
		console.log("✅ Temporary wallet funded");

		// Step 4: Create session
		console.log("\n--- Create Session ---");
		const sessionTx = await registry.createSession(
			TEST_NIC,
			tempWallet.address,
			24 * 3600 // 24 hours
		);
		await sessionTx.wait();
		console.log("✅ Session created");

		// Step 5: Verify session
		console.log("\n--- Verify Session ---");
		const hasAccess = await registry.hasValidAccess(
			REGISTERED_WALLET,
			tempWallet.address
		);
		console.log("Has access:", hasAccess);

		if (!hasAccess) {
			console.log("❌ No access - cannot proceed");
			return;
		}

		// Step 6: Prepare function data
		console.log("\n--- Prepare Function Data ---");
		const counterInterface = counter.interface;
		const functionData = counterInterface.encodeFunctionData(
			"incrementForUser",
			[REGISTERED_WALLET]
		);
		console.log("Function data:", functionData);

		// Step 7: Execute using executeOnBehalf
		console.log("\n--- Execute using executeOnBehalf ---");
		const tempWalletConnected = tempWallet.connect(ethers.provider);

		const tx = await registry
			.connect(tempWalletConnected)
			.executeOnBehalf(REGISTERED_WALLET, counter.target, functionData);

		console.log("Transaction hash:", tx.hash);
		const receipt = await tx.wait();
		console.log("✅ Transaction successful!");
		console.log("Gas used:", receipt?.gasUsed.toString() || "unknown");

		// Step 8: Check final state
		console.log("\n--- Final Counter State ---");
		const finalCounter = await counter.getCounter();
		const finalUserCounter = await counter.getUserCounter(REGISTERED_WALLET);

		console.log("Global counter:", finalCounter.toString());
		console.log("User counter:", finalUserCounter.toString());

		// Check if counter actually incremented
		if (finalCounter > initialCounter) {
			console.log("✅ Global counter incremented successfully!");
		} else {
			console.log("❌ Global counter did not increment");
		}

		if (finalUserCounter > initialUserCounter) {
			console.log("✅ User counter incremented successfully!");
		} else {
			console.log("❌ User counter did not increment");
		}

		console.log("\n🎉 executeOnBehalf test completed!");
	} catch (error) {
		console.error("❌ Test failed:", error);

		const errorMessage = error instanceof Error ? error.message : String(error);
		console.log("Error details:", errorMessage);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Unexpected error:", error);
		process.exit(1);
	});
