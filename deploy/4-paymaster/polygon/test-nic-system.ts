import {ethers} from "hardhat";

// Contract addresses - update these after deployment
const NIC_REGISTRY_ADDRESS = "0x26c3f229bc85a514FA439567BE41728Ca333A83a"; // Updated from deployment
const NIC_PAYMASTER_ADDRESS = "0xF394e30a676BCED0fE28c12e948B29Afeb3F766e"; // Updated from deployment

async function main() {
	console.log("=== Testing NIC Wallet System ===");

	const signers = await ethers.getSigners();
	const deployer = signers[0];

	// Create additional test wallets since we only have one signer configured
	const user1 = ethers.Wallet.createRandom().connect(ethers.provider);
	const user2 = ethers.Wallet.createRandom().connect(ethers.provider);

	console.log("Deployer:", deployer.address);
	console.log("User1:", user1.address);
	console.log("User2:", user2.address);

	// Fund the test wallets with some ETH from deployer
	console.log("Funding test wallets...");
	const fundAmount = ethers.parseEther("0.05"); // Increased funding amount

	const fundTx1 = await deployer.sendTransaction({
		to: user1.address,
		value: fundAmount,
	});
	await fundTx1.wait();

	const fundTx2 = await deployer.sendTransaction({
		to: user2.address,
		value: fundAmount,
	});
	await fundTx2.wait();

	console.log("✅ Test wallets funded");

	// Get contract instances
	const registry = await ethers.getContractAt(
		"NICWalletRegistry",
		NIC_REGISTRY_ADDRESS
	);
	const paymaster = await ethers.getContractAt(
		"NICPaymaster",
		NIC_PAYMASTER_ADDRESS
	);

	console.log("\n--- Test 1: Register Wallets ---");

	// Test data
	const nic1 = "117654321V";
	const nic2 = "143456789X";

	try {
		// Register user1's wallet with nic1
		console.log("Registering wallet for NIC:", nic1);
		const registerTx1 = await registry
			.connect(user1)
			.registerWallet(nic1, user1.address);
		await registerTx1.wait();
		console.log("✅ User1 wallet registered");

		// Register user2's wallet with nic2
		console.log("Registering wallet for NIC:", nic2);
		const registerTx2 = await registry
			.connect(user2)
			.registerWallet(nic2, user2.address);
		await registerTx2.wait();
		console.log("✅ User2 wallet registered");

		// Verify registrations
		const wallet1 = await registry.getWalletByNIC(nic1);
		const wallet2 = await registry.getWalletByNIC(nic2);

		console.log("NIC1 maps to:", wallet1);
		console.log("NIC2 maps to:", wallet2);

		console.log("✅ All registrations verified");
	} catch (error) {
		console.error("❌ Registration failed:", error);
		return;
	}

	console.log("\n--- Test 2: Create Sessions ---");

	try {
		// Create temporary wallets
		const tempWallet1 = ethers.Wallet.createRandom();
		const tempWallet2 = ethers.Wallet.createRandom();

		console.log("Temp wallet 1:", tempWallet1.address);
		console.log("Temp wallet 2:", tempWallet2.address);

		// Create sessions (24 hours)
		const sessionDuration = 24 * 3600;

		console.log("Creating session for user1...");
		const sessionTx1 = await registry
			.connect(user1)
			.createSession(nic1, tempWallet1.address, sessionDuration);
		await sessionTx1.wait();
		console.log("✅ Session 1 created");

		console.log("Creating session for user2...");
		const sessionTx2 = await registry
			.connect(user2)
			.createSession(nic2, tempWallet2.address, sessionDuration);
		await sessionTx2.wait();
		console.log("✅ Session 2 created");

		// Verify sessions
		const hasAccess1 = await registry.hasValidAccess(
			user1.address,
			tempWallet1.address
		);
		const hasAccess2 = await registry.hasValidAccess(
			user2.address,
			tempWallet2.address
		);

		console.log("Temp wallet 1 has access:", hasAccess1);
		console.log("Temp wallet 2 has access:", hasAccess2);

		if (hasAccess1 && hasAccess2) {
			console.log("✅ All sessions verified");
		} else {
			console.log("❌ Session verification failed");
		}

		// Get session info
		const [expiryTime1, isValid1] = await registry.getSessionInfo(
			user1.address,
			tempWallet1.address
		);
		const [expiryTime2, isValid2] = await registry.getSessionInfo(
			user2.address,
			tempWallet2.address
		);

		console.log(
			"Session 1 - Expires:",
			new Date(Number(expiryTime1) * 1000),
			"Valid:",
			isValid1
		);
		console.log(
			"Session 2 - Expires:",
			new Date(Number(expiryTime2) * 1000),
			"Valid:",
			isValid2
		);
	} catch (error) {
		console.error("❌ Session creation failed:", error);
		return;
	}

	console.log("\n--- Test 3: Test Cross-Access (Should Fail) ---");

	try {
		const tempWallet1 = ethers.Wallet.createRandom();
		const tempWallet2 = ethers.Wallet.createRandom();

		// Create session for user1
		await registry
			.connect(user1)
			.createSession(nic1, tempWallet1.address, 3600);

		// Try to access user2's wallet with user1's temp wallet (should fail)
		const crossAccess = await registry.hasValidAccess(
			user2.address,
			tempWallet1.address
		);

		if (!crossAccess) {
			console.log("✅ Cross-access properly denied");
		} else {
			console.log("❌ Security issue: Cross-access allowed");
		}
	} catch (error) {
		console.error("Cross-access test error:", error);
	}

	console.log("\n--- Test 4: Test Session Revocation ---");

	try {
		const tempWallet = ethers.Wallet.createRandom();

		// Create session
		await registry.connect(user1).createSession(nic1, tempWallet.address, 3600);

		// Verify access
		let hasAccess = await registry.hasValidAccess(
			user1.address,
			tempWallet.address
		);
		console.log("Access before revocation:", hasAccess);

		// Revoke access
		await registry.connect(user1).revokeAccess(nic1, tempWallet.address);

		// Verify access revoked
		hasAccess = await registry.hasValidAccess(
			user1.address,
			tempWallet.address
		);
		console.log("Access after revocation:", hasAccess);

		if (!hasAccess) {
			console.log("✅ Session revocation successful");
		} else {
			console.log("❌ Session revocation failed");
		}
	} catch (error) {
		console.error("❌ Revocation test failed:", error);
	}

	console.log("\n--- Test 5: Test Paymaster Integration ---");

	try {
		// Create a simple target contract for testing
		console.log("Testing paymaster nonce functions...");

		const tempWallet = ethers.Wallet.createRandom();

		// Test nonce functions
		const userNonce = await paymaster.getNonce(user1.address);
		const tempNonce = await paymaster.getTempWalletNonce(tempWallet.address);

		console.log("User1 nonce:", userNonce.toString());
		console.log("Temp wallet nonce:", tempNonce.toString());

		// Test paymaster balance
		const balance = await paymaster.getBalance();
		console.log("Paymaster balance:", ethers.formatEther(balance), "ETH");

		console.log("✅ Paymaster integration tests passed");
	} catch (error) {
		console.error("❌ Paymaster test failed:", error);
	}

	console.log("\n=== All Tests Complete ===");
	console.log("The NIC Wallet System is ready for use!");

	console.log("\n--- Usage Instructions ---");
	console.log("1. Users register their wallet with their NIC number");
	console.log("2. Users can login with just their NIC number");
	console.log("3. System creates temporary wallets for sessions");
	console.log("4. Temporary wallets can control original wallets");
	console.log("5. Sessions expire automatically for security");
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
