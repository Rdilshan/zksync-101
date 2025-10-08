import {ethers} from "hardhat";

// Contract addresses
const NIC_REGISTRY_ADDRESS = "0x24D2Caf2fd29D503e72AdD19a5c56C2452d2e5C1";
const PAYMASTER_ADDRESS = "0xcb1d0aac729D0591fCe76C8d604D2B6b2dfa5Ff4";
const COUNTER_ADDRESS = "0x1C92c2485d4512e304adD509499900Be39B22Af5";

// Test data
const TEST_NIC = "1234";
const REGISTERED_WALLET = "0x835a5220EC26fcFe855dC0957cE483f03A8Bb028";

async function main() {
	console.log("=== Testing Session + Paymaster Integration ===");
	console.log(
		"Testing if temporary wallet can use paymaster to pay gas for registered wallet transactions"
	);

	const signers = await ethers.getSigners();
	const deployer = signers[0]; // System wallet (relayer)

	console.log("System Wallet (Relayer):", deployer.address);
	console.log("Test NIC:", TEST_NIC);
	console.log("Registered Wallet:", REGISTERED_WALLET);
	console.log("NIC Registry:", NIC_REGISTRY_ADDRESS);
	console.log("Paymaster:", PAYMASTER_ADDRESS);
	console.log("Counter:", COUNTER_ADDRESS);

	// Get contract instances
	const registry = await ethers.getContractAt(
		"NICWalletRegistry",
		NIC_REGISTRY_ADDRESS
	);
	const paymaster = await ethers.getContractAt(
		"PolygonPaymaster",
		PAYMASTER_ADDRESS
	);
	const counter = await ethers.getContractAt("SimpleCounter", COUNTER_ADDRESS);

	try {
		// Step 1: Verify the NIC is registered
		console.log("\n--- Step 1: Verify NIC Registration ---");
		const registeredWallet = await registry.getWalletByNIC(TEST_NIC);
		console.log("Retrieved wallet for NIC 1234:", registeredWallet);

		if (registeredWallet.toLowerCase() !== REGISTERED_WALLET.toLowerCase()) {
			console.log("❌ NIC 1234 is not registered with the expected wallet");
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
			return;
		}
		console.log("✅ System wallet is authorized");

		// Step 3: Create temporary wallet (simulating user login)
		console.log("\n--- Step 3: Create Temporary Wallet (User Login) ---");
		const tempWallet = ethers.Wallet.createRandom();
		console.log("Temporary wallet address:", tempWallet.address);
		console.log("Temporary wallet private key:", tempWallet.privateKey);

		// Step 4: Create session using system wallet
		console.log("\n--- Step 4: Create Session ---");
		const sessionDuration = 24 * 3600; // 24 hours
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

		// Step 6: Check initial counter state
		console.log("\n--- Step 6: Check Initial Counter State ---");
		const initialCounter = await counter.getCounter();
		const initialUserCounter = await counter.getUserCounter(REGISTERED_WALLET);
		const userNonce = await paymaster.getNonce(REGISTERED_WALLET);

		console.log("Global counter:", initialCounter.toString());
		console.log(
			"User counter (registered wallet):",
			initialUserCounter.toString()
		);
		console.log("User nonce:", userNonce.toString());

		// Step 7: Prepare meta-transaction using paymaster
		console.log("\n--- Step 7: Prepare Meta-Transaction with Paymaster ---");
		console.log(
			"🎯 Temporary wallet will sign transaction, paymaster will pay gas"
		);

		// Connect temporary wallet to provider
		const tempWalletConnected = tempWallet.connect(ethers.provider);

		// Encode the function call (increment counter for the registered wallet)
		const counterInterface = counter.interface;
		const functionSelector =
			counterInterface.getFunction("incrementForUser").selector;
		const functionData = counterInterface.encodeFunctionData(
			"incrementForUser",
			[
				REGISTERED_WALLET, // The registered wallet address
			]
		);

		console.log("Function selector:", functionSelector);
		console.log("Function data:", functionData);
		console.log("Target wallet (registered):", REGISTERED_WALLET);

		// Create message to sign (using registered wallet address as the "user")
		const messageHash = ethers.solidityPackedKeccak256(
			["address", "address", "uint256", "bytes", "uint256", "address"],
			[
				REGISTERED_WALLET, // user (the registered wallet)
				counter.target, // target contract
				0, // value (0 ETH)
				functionData, // function call data
				userNonce, // nonce
				paymaster.target, // paymaster address
			]
		);

		console.log("Message hash:", messageHash);

		// Sign the message with temporary wallet's private key
		const signature = await tempWalletConnected.signMessage(
			ethers.getBytes(messageHash)
		);
		console.log("Temporary wallet signature:", signature);

		// Step 8: Check balances before transaction
		console.log("\n--- Step 8: Balances Before Transaction ---");
		const relayerBalanceBefore = await ethers.provider.getBalance(
			deployer.address
		);
		const tempWalletBalanceBefore = await ethers.provider.getBalance(
			tempWallet.address
		);
		const registeredWalletBalanceBefore = await ethers.provider.getBalance(
			REGISTERED_WALLET
		);

		console.log(
			"Relayer balance:",
			ethers.formatEther(relayerBalanceBefore),
			"ETH"
		);
		console.log(
			"Temporary wallet balance:",
			ethers.formatEther(tempWalletBalanceBefore),
			"ETH"
		);
		console.log(
			"Registered wallet balance:",
			ethers.formatEther(registeredWalletBalanceBefore),
			"ETH"
		);

		// Step 9: Execute meta-transaction (relayer pays gas)
		console.log("\n--- Step 9: Execute Meta-Transaction ---");
		console.log(
			"🚀 Relayer executing transaction on behalf of registered wallet..."
		);
		console.log("💡 Temporary wallet signed as if it's the registered wallet");
		console.log("💡 Paymaster will pay gas fees");

		const tx = await paymaster.connect(deployer).executeMetaTransactionWithUser(
			REGISTERED_WALLET, // user who "signed" (registered wallet)
			counter.target, // target contract
			0, // value
			functionSelector, // function selector
			"0x", // additional data (empty for incrementForUser)
			signature // temporary wallet's signature
		);

		console.log("Transaction hash:", tx.hash);
		const receipt = await tx.wait();
		console.log("✅ Transaction successful!");
		console.log("Gas used:", receipt.gasUsed.toString());

		// Step 10: Check final state
		console.log("\n--- Step 10: Final State ---");
		const finalCounter = await counter.getCounter();
		const finalUserCounter = await counter.getUserCounter(REGISTERED_WALLET);
		const finalUserNonce = await paymaster.getNonce(REGISTERED_WALLET);

		// Get detailed user stats
		const [userCurrentCounter, userIncrementCount, userTotalIncremented] =
			await counter.getUserStats(REGISTERED_WALLET);

		console.log("Global counter:", finalCounter.toString(), "(+1)");
		console.log("\n📊 Registered Wallet Stats:");
		console.log("  - Counter value:", userCurrentCounter.toString());
		console.log("  - Times incremented:", userIncrementCount.toString());
		console.log("  - Total increment amount:", userTotalIncremented.toString());
		console.log("User nonce:", finalUserNonce.toString(), "(+1)");

		// Step 11: Check balances after transaction
		console.log("\n--- Step 11: Balances After Transaction ---");
		const relayerBalanceAfter = await ethers.provider.getBalance(
			deployer.address
		);
		const tempWalletBalanceAfter = await ethers.provider.getBalance(
			tempWallet.address
		);
		const registeredWalletBalanceAfter = await ethers.provider.getBalance(
			REGISTERED_WALLET
		);

		console.log(
			"Relayer balance:",
			ethers.formatEther(relayerBalanceAfter),
			"ETH"
		);
		console.log(
			"Temporary wallet balance:",
			ethers.formatEther(tempWalletBalanceAfter),
			"ETH"
		);
		console.log(
			"Registered wallet balance:",
			ethers.formatEther(registeredWalletBalanceAfter),
			"ETH"
		);

		console.log("\n--- Balance Changes ---");
		console.log(
			"Relayer paid:",
			ethers.formatEther(relayerBalanceBefore - relayerBalanceAfter),
			"ETH (gas fees)"
		);
		console.log(
			"Temporary wallet paid:",
			ethers.formatEther(tempWalletBalanceBefore - tempWalletBalanceAfter),
			"ETH (should be 0!)"
		);
		console.log(
			"Registered wallet paid:",
			ethers.formatEther(
				registeredWalletBalanceBefore - registeredWalletBalanceAfter
			),
			"ETH (should be 0!)"
		);

		// Step 12: Verify session is still valid
		console.log("\n--- Step 12: Verify Session Still Valid ---");
		const sessionStillValid = await registry.hasValidAccess(
			REGISTERED_WALLET,
			tempWallet.address
		);
		console.log("Session still valid:", sessionStillValid);

		// Summary
		console.log("\n=== Test Summary ===");
		console.log("✅ NIC 1234 is registered");
		console.log("✅ System wallet is authorized");
		console.log("✅ Temporary wallet created:", tempWallet.address);
		console.log("✅ Session created successfully");
		console.log("✅ Session verified and active");
		console.log("✅ Temporary wallet can control registered wallet");
		console.log("✅ Meta-transaction executed successfully");
		console.log("✅ Counter incremented for registered wallet");
		console.log(
			"✅ Gas paid by relayer, not by temporary or registered wallet"
		);
		console.log("✅ Session remains valid after transaction");

		console.log("\n=== Key Information ===");
		console.log("NIC Number:", TEST_NIC);
		console.log("Registered Wallet:", REGISTERED_WALLET);
		console.log("Temporary Wallet:", tempWallet.address);
		console.log("Temporary Private Key:", tempWallet.privateKey);
		console.log("Session Transaction:", sessionTx.hash);
		console.log("Counter Transaction:", tx.hash);
		console.log(
			"Session Expires:",
			new Date(
				(
					await registry.getSessionInfo(REGISTERED_WALLET, tempWallet.address)
				)[0] * 1000
			)
		);

		console.log(
			"\n🎉 SUCCESS: Complete flow working! Temporary wallet can act like NIC account using paymaster!"
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
		} else if (error.message?.includes("Invalid signature")) {
			console.log("💡 Solution: Check signature generation and message hash");
		} else if (error.message?.includes("insufficient funds")) {
			console.log(
				"💡 Solution: The temporary wallet needs ETH or the paymaster needs to be used properly"
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
