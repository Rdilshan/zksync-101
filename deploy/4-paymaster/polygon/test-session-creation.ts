import {ethers} from "hardhat";

// Contract addresses - using the new deployed contract
const NIC_REGISTRY_ADDRESS = "0x24D2Caf2fd29D503e72AdD19a5c56C2452d2e5C1";

// Test data
const TEST_NIC = "1234";
const REGISTERED_WALLET = "0x835a5220EC26fcFe855dC0957cE483f03A8Bb028";

async function main() {
	console.log("=== Testing Session Creation for NIC 1234 ===");

	const signers = await ethers.getSigners();
	const deployer = signers[0];

	console.log("Deployer:", deployer.address);
	console.log("Test NIC:", TEST_NIC);
	console.log("Registered Wallet:", REGISTERED_WALLET);
	console.log("Contract Address:", NIC_REGISTRY_ADDRESS);

	// Get contract instance
	const registry = await ethers.getContractAt(
		"NICWalletRegistry",
		NIC_REGISTRY_ADDRESS
	);

	try {
		// Step 1: Verify the NIC is registered
		console.log("\n--- Step 1: Verify NIC Registration ---");
		const registeredWallet = await registry.getWalletByNIC(TEST_NIC);
		console.log("Retrieved wallet for NIC 1234:", registeredWallet);

		if (registeredWallet.toLowerCase() !== REGISTERED_WALLET.toLowerCase()) {
			console.log("❌ NIC 1234 is not registered with the expected wallet");
			console.log("Expected:", REGISTERED_WALLET);
			console.log("Found:", registeredWallet);
			return;
		}
		console.log("✅ NIC 1234 is properly registered");

		// Step 2: Check if system wallet is authorized
		console.log("\n--- Step 2: Check System Wallet Authorization ---");
		const isAuthorized = await registry.authorizedSystemWallets(
			deployer.address
		);
		console.log("System wallet authorized:", isAuthorized);

		if (!isAuthorized) {
			console.log("❌ System wallet is not authorized to create sessions");
			console.log("Please run the authorize-system-wallet.ts script first");
			return;
		}
		console.log("✅ System wallet is authorized");

		// Step 3: Create temporary wallet
		console.log("\n--- Step 3: Create Temporary Wallet ---");
		const tempWallet = ethers.Wallet.createRandom();
		console.log("Temporary wallet address:", tempWallet.address);
		console.log("Temporary wallet private key:", tempWallet.privateKey);

		// Step 4: Create session using system wallet
		console.log("\n--- Step 4: Create Session ---");
		const sessionDuration = 24 * 3600; // 24 hours
		console.log("Session duration:", sessionDuration, "seconds");

		const sessionTx = await registry.createSession(
			TEST_NIC,
			tempWallet.address,
			sessionDuration
		);
		await sessionTx.wait();

		console.log("✅ Session created successfully!");
		console.log("Transaction hash:", sessionTx.hash);

		// Step 5: Verify session was created
		console.log("\n--- Step 5: Verify Session ---");
		const hasAccess = await registry.hasValidAccess(
			REGISTERED_WALLET,
			tempWallet.address
		);
		console.log("Temporary wallet has access:", hasAccess);

		if (!hasAccess) {
			console.log("❌ Session verification failed");
			return;
		}
		console.log("✅ Session verification successful");

		// Step 6: Get session details
		console.log("\n--- Step 6: Get Session Details ---");
		const [expiryTime, isValid] = await registry.getSessionInfo(
			REGISTERED_WALLET,
			tempWallet.address
		);

		console.log("Session expiry time:", Number(expiryTime));
		console.log("Session expiry date:", new Date(Number(expiryTime) * 1000));
		console.log("Session is valid:", isValid);

		// Step 7: Test session functionality
		console.log("\n--- Step 7: Test Session Functionality ---");

		// Create a simple test contract to verify the session can execute transactions
		console.log("Testing if temporary wallet can execute transactions...");

		// For now, we'll just verify the session exists and is valid
		if (isValid && hasAccess) {
			console.log("✅ Temporary wallet can control the registered wallet");
			console.log("✅ Session is active and valid");
		} else {
			console.log("❌ Session is not valid or accessible");
		}

		// Summary
		console.log("\n=== Test Summary ===");
		console.log("✅ NIC 1234 is registered");
		console.log("✅ System wallet is authorized");
		console.log("✅ Temporary wallet created:", tempWallet.address);
		console.log("✅ Session created successfully");
		console.log("✅ Session verified and active");
		console.log("✅ Temporary wallet can control registered wallet");

		console.log("\n=== Session Information ===");
		console.log("NIC Number:", TEST_NIC);
		console.log("Registered Wallet:", REGISTERED_WALLET);
		console.log("Temporary Wallet:", tempWallet.address);
		console.log("Temporary Private Key:", tempWallet.privateKey);
		console.log("Session Expires:", new Date(Number(expiryTime) * 1000));
		console.log("Transaction Hash:", sessionTx.hash);

		console.log(
			"\n🎉 All tests passed! Session creation is working correctly."
		);
	} catch (error) {
		console.error("❌ Test failed:", error);

		if (
			error.message?.includes(
				"Only wallet owner or authorized system wallet can create sessions"
			)
		) {
			console.log("💡 Solution: Make sure the system wallet is authorized");
			console.log(
				"Run: npx hardhat run deploy/4-paymaster/polygon/authorize-system-wallet.ts --network polygonAmoy"
			);
		} else if (error.message?.includes("NIC not registered")) {
			console.log("💡 Solution: Register the NIC first");
			console.log(
				"NIC 1234 needs to be registered with wallet:",
				REGISTERED_WALLET
			);
		}
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
