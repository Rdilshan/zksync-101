import {ethers} from "hardhat";

// Contract addresses
const NIC_REGISTRY_ADDRESS = "0x24D2Caf2fd29D503e72AdD19a5c56C2452d2e5C1";
const NIC_PAYMASTER_ADDRESS = "0xcb1d0aac729D0591fCe76C8d604D2B6b2dfa5Ff4";
const COUNTER_ADDRESS = "0x1C92c2485d4512e304adD509499900Be39B22Af5";

// Test data
const TEST_NIC = "1234";
const REGISTERED_WALLET = "0x835a5220EC26fcFe855dC0957cE483f03A8Bb028";

async function main() {
	console.log("=== Debug Counter Call ===");

	const signers = await ethers.getSigners();
	const deployer = signers[0];

	console.log("Deployer:", deployer.address);

	// Get contract instances
	const registry = await ethers.getContractAt(
		"NICWalletRegistry",
		NIC_REGISTRY_ADDRESS
	);
	const nicPaymaster = await ethers.getContractAt(
		"NICPaymaster",
		NIC_PAYMASTER_ADDRESS
	);
	const counter = await ethers.getContractAt("SimpleCounter", COUNTER_ADDRESS);

	try {
		// Check initial state
		console.log("\n--- Initial State ---");
		const initialCounter = await counter.getCounter();
		const initialUserCounter = await counter.getUserCounter(REGISTERED_WALLET);

		console.log("Global counter:", initialCounter.toString());
		console.log("User counter:", initialUserCounter.toString());

		// Create temporary wallet
		const tempWallet = ethers.Wallet.createRandom();
		console.log("Temporary wallet:", tempWallet.address);

		// Create session
		const sessionTx = await registry.createSession(
			TEST_NIC,
			tempWallet.address,
			24 * 3600
		);
		await sessionTx.wait();
		console.log("✅ Session created");

		// Check session
		const hasAccess = await registry.hasValidAccess(
			REGISTERED_WALLET,
			tempWallet.address
		);
		console.log("Has access:", hasAccess);

		// Prepare function data
		const counterInterface = counter.interface;
		const functionData = counterInterface.encodeFunctionData(
			"incrementForUser",
			[REGISTERED_WALLET]
		);
		console.log("Function data:", functionData);

		// Try different approaches
		console.log("\n--- Approach 1: Direct executeOnBehalf ---");
		try {
			const tempWalletConnected = tempWallet.connect(ethers.provider);

			// Fund temp wallet first
			const fundTx = await deployer.sendTransaction({
				to: tempWallet.address,
				value: ethers.parseEther("0.01"),
			});
			await fundTx.wait();
			console.log("✅ Temp wallet funded");

			const tx1 = await registry
				.connect(tempWalletConnected)
				.executeOnBehalf(REGISTERED_WALLET, counter.target, functionData);
			await tx1.wait();
			console.log("✅ executeOnBehalf successful");

			const counterAfter1 = await counter.getCounter();
			console.log(
				"Global counter after executeOnBehalf:",
				counterAfter1.toString()
			);
		} catch (error) {
			console.log("❌ executeOnBehalf failed:", error.message);
		}

		// Check if NICPaymaster has the function
		console.log("\n--- Approach 2: Check NICPaymaster Functions ---");
		try {
			// Check if executeTemporaryWalletTransaction exists
			const hasFunction =
				await nicPaymaster.executeTemporaryWalletTransaction.staticCall(
					REGISTERED_WALLET,
					tempWallet.address,
					counter.target,
					0,
					functionData,
					"0x" // dummy signature
				);
			console.log("✅ executeTemporaryWalletTransaction exists");
		} catch (error) {
			console.log(
				"❌ executeTemporaryWalletTransaction not available:",
				error.message
			);
		}

		// Try executeMetaTransactionWithUser
		console.log("\n--- Approach 3: Try executeMetaTransactionWithUser ---");
		try {
			const tempWalletConnected = tempWallet.connect(ethers.provider);

			// Create signature for executeMetaTransactionWithUser
			const nonce = await nicPaymaster.getNonce(REGISTERED_WALLET);
			const messageHash = ethers.solidityPackedKeccak256(
				["address", "address", "uint256", "bytes", "uint256", "address"],
				[
					REGISTERED_WALLET,
					counter.target,
					0,
					functionData,
					nonce,
					nicPaymaster.target,
				]
			);

			const signature = await tempWalletConnected.signMessage(
				ethers.getBytes(messageHash)
			);

			const tx3 = await nicPaymaster
				.connect(deployer)
				.executeMetaTransactionWithUser(
					REGISTERED_WALLET,
					counter.target,
					0,
					"0x5f299717", // incrementForUser selector
					"0x", // additional data
					signature
				);
			await tx3.wait();
			console.log("✅ executeMetaTransactionWithUser successful");

			const counterAfter3 = await counter.getCounter();
			console.log(
				"Global counter after executeMetaTransactionWithUser:",
				counterAfter3.toString()
			);
		} catch (error) {
			console.log("❌ executeMetaTransactionWithUser failed:", error.message);
		}

		// Final state
		console.log("\n--- Final State ---");
		const finalCounter = await counter.getCounter();
		const finalUserCounter = await counter.getUserCounter(REGISTERED_WALLET);

		console.log("Global counter:", finalCounter.toString());
		console.log("User counter:", finalUserCounter.toString());

		if (finalCounter > initialCounter) {
			console.log("✅ Counter was incremented!");
		} else {
			console.log("❌ Counter was NOT incremented");
		}
	} catch (error) {
		console.error("❌ Debug failed:", error);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Unexpected error:", error);
		process.exit(1);
	});
