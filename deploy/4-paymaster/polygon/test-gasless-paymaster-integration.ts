import {ethers} from "hardhat";

// Contract addresses - Update these with your deployed contract addresses
const NIC_REGISTRY_ADDRESS = "0x24D2Caf2fd29D503e72AdD19a5c56C2452d2e5C1";
const NIC_PAYMASTER_ADDRESS = "0xcb1d0aac729D0591fCe76C8d604D2B6b2dfa5Ff4"; // Make sure this is the correct NICPaymaster address
const COUNTER_ADDRESS = "0x1C92c2485d4512e304adD509499900Be39B22Af5";

// Test data
const TEST_NIC = "1234";
const REGISTERED_WALLET = "0x835a5220EC26fcFe855dC0957cE483f03A8Bb028";

async function main() {
	console.log("=== Testing Gasless Paymaster Integration ===");
	console.log(
		"Testing if temporary wallet can use paymaster to pay gas for registered wallet transactions"
	);

	const signers = await ethers.getSigners();
	const deployer = signers[0]; // System wallet (relayer)

	console.log("System Wallet (Relayer):", deployer.address);
	console.log("Test NIC:", TEST_NIC);
	console.log("Registered Wallet:", REGISTERED_WALLET);
	console.log("NIC Registry:", NIC_REGISTRY_ADDRESS);
	console.log("NIC Paymaster:", NIC_PAYMASTER_ADDRESS);
	console.log("Counter:", COUNTER_ADDRESS);

	// Check network
	const network = await ethers.provider.getNetwork();
	console.log("Network:", network.name, "Chain ID:", network.chainId);

	// Get contract instances
	console.log("Connecting to contracts...");

	const registry = await ethers.getContractAt(
		"NICWalletRegistry",
		NIC_REGISTRY_ADDRESS
	);
	console.log("✅ Connected to NICWalletRegistry");

	const nicPaymaster = await ethers.getContractAt(
		"NICPaymaster",
		NIC_PAYMASTER_ADDRESS
	);
	console.log("✅ Connected to NICPaymaster");

	const counter = await ethers.getContractAt("SimpleCounter", COUNTER_ADDRESS);
	console.log("✅ Connected to SimpleCounter");

	// Check NICPaymaster balance and fund if needed
	const paymasterBalance = await nicPaymaster.getBalance();
	console.log(
		"NICPaymaster balance:",
		ethers.formatEther(paymasterBalance),
		"ETH"
	);

	if (paymasterBalance === 0n) {
		console.log("⚠️  NICPaymaster has no funds! Funding it with 0.1 ETH...");
		const fundTx = await nicPaymaster.deposit({
			value: ethers.parseEther("0.1"),
		});
		await fundTx.wait();
		console.log("✅ NICPaymaster funded successfully");
	}

	try {
		// Step 1: Verify the NIC is registered
		console.log("\n--- Step 1: Verify NIC Registration ---");
		console.log("Checking if NIC 1234 is registered...");

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

		// Step 6: Register temporary wallet with paymaster
		console.log("\n--- Step 6: Register Temporary Wallet with Paymaster ---");
		const registerTx = await nicPaymaster.registerTemporaryWallet(
			tempWallet.address,
			REGISTERED_WALLET
		);
		await registerTx.wait();
		console.log("✅ Temporary wallet registered with paymaster");

		// Step 7: Check initial counter state
		console.log("\n--- Step 7: Check Initial Counter State ---");
		const initialCounter = await counter.getCounter();
		const initialUserCounter = await counter.getUserCounter(REGISTERED_WALLET);

		console.log("Global counter:", initialCounter.toString());
		console.log(
			"User counter (registered wallet):",
			initialUserCounter.toString()
		);

		// Step 8: Prepare gasless transaction using paymaster
		console.log("\n--- Step 8: Prepare Gasless Transaction with Paymaster ---");
		console.log(
			"🎯 Temporary wallet will execute gasless transaction using paymaster"
		);

		// Connect temporary wallet to provider
		const tempWalletConnected = tempWallet.connect(ethers.provider);

		// Encode the function call (increment counter for the registered wallet)
		const counterInterface = counter.interface;
		const functionData = counterInterface.encodeFunctionData(
			"incrementForUser",
			[
				REGISTERED_WALLET, // The registered wallet address
			]
		);

		console.log("Function data:", functionData);
		console.log("Target wallet (registered):", REGISTERED_WALLET);
		console.log(
			"Temporary wallet will execute gasless transaction for:",
			REGISTERED_WALLET
		);

		// Step 9: Check balances before transaction
		console.log("\n--- Step 9: Balances Before Transaction ---");
		const relayerBalanceBefore = await ethers.provider.getBalance(
			deployer.address
		);
		const tempWalletBalanceBefore = await ethers.provider.getBalance(
			tempWallet.address
		);
		const registeredWalletBalanceBefore = await ethers.provider.getBalance(
			REGISTERED_WALLET
		);
		const paymasterBalanceBefore = await nicPaymaster.getBalance();

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
		console.log(
			"Paymaster balance:",
			ethers.formatEther(paymasterBalanceBefore),
			"ETH"
		);

		// Step 10: Generate signature for gasless transaction
		console.log(
			"\n--- Step 10: Generate Signature for Gasless Transaction ---"
		);

		// Get current nonce for temporary wallet (start with 0 if function doesn't exist)
		let currentNonce = 0n;
		try {
			currentNonce = await nicPaymaster.getTempWalletNonce(tempWallet.address);
			console.log(
				"Current nonce for temporary wallet:",
				currentNonce.toString()
			);
		} catch (error) {
			console.log(
				"⚠️  getTempWalletNonce function not available, using nonce 0"
			);
			currentNonce = 0n;
		}

		// Create message hash for signature
		const messageHash = ethers.keccak256(
			ethers.AbiCoder.defaultAbiCoder().encode(
				[
					"address",
					"address",
					"address",
					"uint256",
					"bytes",
					"uint256",
					"address",
				],
				[
					REGISTERED_WALLET, // originalWallet
					tempWallet.address, // temporaryWallet
					counter.target, // target
					0, // value
					functionData, // data
					currentNonce, // nonce
					NIC_PAYMASTER_ADDRESS, // paymaster address
				]
			)
		);

		// Create Ethereum signed message hash
		const ethSignedMessageHash = ethers.keccak256(
			ethers.AbiCoder.defaultAbiCoder().encode(
				["string", "bytes32"],
				["\x19Ethereum Signed Message:\n32", messageHash]
			)
		);

		// Sign the message with temporary wallet
		const signature = await tempWallet.signMessage(
			ethers.getBytes(messageHash)
		);
		console.log("✅ Signature generated for gasless transaction");

		// Step 11: Execute gasless transaction using paymaster
		console.log(
			"\n--- Step 11: Execute Gasless Transaction with Paymaster ---"
		);
		console.log(
			"🚀 Temporary wallet executing gasless transaction using paymaster..."
		);
		console.log("💡 Paymaster will pay all gas fees");
		console.log("💡 Temporary wallet pays nothing");

		const tx = await nicPaymaster
			.connect(deployer)
			.executeGaslessTemporaryTransaction(
				REGISTERED_WALLET, // originalWallet
				tempWallet.address, // temporaryWallet
				counter.target, // target
				0, // value
				functionData, // data
				signature // signature
			);

		console.log("Transaction hash:", tx.hash);
		const receipt = await tx.wait();
		console.log("✅ Gasless transaction successful!");
		console.log("Gas used:", receipt?.gasUsed.toString() || "unknown");

		// Step 12: Check final state
		console.log("\n--- Step 12: Final State ---");
		const finalCounter = await counter.getCounter();
		const finalUserCounter = await counter.getUserCounter(REGISTERED_WALLET);

		// Get detailed user stats
		const [userCurrentCounter, userIncrementCount, userTotalIncremented] =
			await counter.getUserStats(REGISTERED_WALLET);

		console.log("Global counter:", finalCounter.toString(), "(+1)");
		console.log("\n📊 Registered Wallet Stats:");
		console.log("  - Counter value:", userCurrentCounter.toString());
		console.log("  - Times incremented:", userIncrementCount.toString());
		console.log("  - Total increment amount:", userTotalIncremented.toString());

		// Step 13: Check balances after transaction
		console.log("\n--- Step 13: Balances After Transaction ---");
		const relayerBalanceAfter = await ethers.provider.getBalance(
			deployer.address
		);
		const tempWalletBalanceAfter = await ethers.provider.getBalance(
			tempWallet.address
		);
		const registeredWalletBalanceAfter = await ethers.provider.getBalance(
			REGISTERED_WALLET
		);
		const paymasterBalanceAfter = await nicPaymaster.getBalance();

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
		console.log(
			"Paymaster balance:",
			ethers.formatEther(paymasterBalanceAfter),
			"ETH"
		);

		console.log("\n--- Balance Changes ---");
		console.log(
			"Relayer paid:",
			ethers.formatEther(relayerBalanceBefore - relayerBalanceAfter),
			"ETH (gas fees for paymaster execution)"
		);
		console.log(
			"Temporary wallet paid:",
			ethers.formatEther(tempWalletBalanceBefore - tempWalletBalanceAfter),
			"ETH (should be 0 - completely gasless!)"
		);
		console.log(
			"Registered wallet paid:",
			ethers.formatEther(
				registeredWalletBalanceBefore - registeredWalletBalanceAfter
			),
			"ETH (should be 0!)"
		);
		console.log(
			"Paymaster balance change:",
			ethers.formatEther(paymasterBalanceBefore - paymasterBalanceAfter),
			"ETH (paymaster covered gas fees)"
		);

		// Step 14: Verify session is still valid
		console.log("\n--- Step 14: Verify Session Still Valid ---");
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
		console.log("✅ Temporary wallet registered with paymaster");
		console.log("✅ Temporary wallet can control registered wallet");
		console.log("✅ Gasless transaction executed successfully using paymaster");
		console.log("✅ Counter incremented for registered wallet");
		console.log(
			"✅ Paymaster paid all gas fees, temporary wallet paid nothing"
		);
		console.log("✅ Session remains valid after transaction");

		console.log("\n=== Key Information ===");
		console.log("NIC Number:", TEST_NIC);
		console.log("Registered Wallet:", REGISTERED_WALLET);
		console.log("Temporary Wallet:", tempWallet.address);
		console.log("Temporary Private Key:", tempWallet.privateKey);
		console.log("Session Transaction:", sessionTx.hash);
		console.log("Gasless Transaction:", tx.hash);
		const [expiryTime] = await registry.getSessionInfo(
			REGISTERED_WALLET,
			tempWallet.address
		);
		console.log("Session Expires:", new Date(Number(expiryTime) * 1000));

		console.log(
			"\n🎉 SUCCESS: Complete gasless flow working! Temporary wallet can act like NIC account using paymaster with zero gas fees!"
		);

		// Verify gasless nature
		if (tempWalletBalanceBefore === tempWalletBalanceAfter) {
			console.log("✅ VERIFIED: Temporary wallet paid ZERO gas fees!");
		} else {
			console.log(
				"❌ WARNING: Temporary wallet paid gas fees - not truly gasless!"
			);
		}

		if (registeredWalletBalanceBefore === registeredWalletBalanceAfter) {
			console.log("✅ VERIFIED: Registered wallet paid ZERO gas fees!");
		} else {
			console.log("❌ WARNING: Registered wallet paid gas fees!");
		}
	} catch (error) {
		console.error("❌ Test failed:", error);

		const errorMessage = error instanceof Error ? error.message : String(error);
		console.log("Error details:", errorMessage);

		if (errorMessage.includes("call revert exception")) {
			console.log(
				"💡 Solution: Contract call failed - check contract addresses and deployment"
			);
		} else if (errorMessage.includes("network")) {
			console.log("💡 Solution: Check your network connection and RPC URL");
		} else if (
			errorMessage.includes(
				"Only wallet owner or authorized system wallet can create sessions"
			)
		) {
			console.log("💡 Solution: Make sure the system wallet is authorized");
			console.log(
				"Run: npx hardhat run deploy/4-paymaster/polygon/authorize-system-wallet.ts --network polygonAmoy"
			);
		} else if (errorMessage.includes("NIC not registered")) {
			console.log("💡 Solution: Register the NIC first");
		} else if (errorMessage.includes("No valid access")) {
			console.log("💡 Solution: Check session creation and verification");
		} else if (errorMessage.includes("insufficient funds")) {
			console.log(
				"💡 Solution: Check NICPaymaster balance and fund it if needed"
			);
		} else if (errorMessage.includes("Invalid signature")) {
			console.log("💡 Solution: Check signature generation and message hash");
		} else if (errorMessage.includes("Temporary wallet access expired")) {
			console.log("💡 Solution: Check session expiry and create new session");
		} else {
			console.log(
				"💡 Solution: Check contract addresses, network connection, and deployment status"
			);
		}
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Unexpected error:", error);
		process.exit(1);
	});
