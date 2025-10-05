import {ethers} from "hardhat";

// Contract addresses
const NIC_REGISTRY_ADDRESS = "0x26c3f229bc85a514FA439567BE41728Ca333A83a";
const NIC_PAYMASTER_ADDRESS = "0xF394e30a676BCED0fE28c12e948B29Afeb3F766e";
const COUNTER_ADDRESS = "0x1C92c2485d4512e304adD509499900Be39B22Af5"; // Existing counter contract

async function main() {
	console.log("=== Testing Temporary Wallet Acting as NIC Account ===");

	const [deployer] = await ethers.getSigners();

	// Create a user wallet
	const originalWallet = ethers.Wallet.createRandom().connect(ethers.provider);
	console.log("Original Wallet (NIC Account):", originalWallet.address);

	// Fund the original wallet
	const fundTx = await deployer.sendTransaction({
		to: originalWallet.address,
		value: ethers.parseEther("0.05"),
	});
	await fundTx.wait();
	console.log("✅ Original wallet funded");

	// Get contract instances
	const registry = await ethers.getContractAt(
		"NICWalletRegistry",
		NIC_REGISTRY_ADDRESS
	);
	const paymaster = await ethers.getContractAt(
		"NICPaymaster",
		NIC_PAYMASTER_ADDRESS
	);
	const counter = await ethers.getContractAt("SimpleCounter", COUNTER_ADDRESS);

	// Step 1: Register the original wallet with NIC
	const nicNumber = "TEST123456789";
	console.log("\n--- Step 1: Register NIC Account ---");

	const registerTx = await registry
		.connect(originalWallet)
		.registerWallet(nicNumber, originalWallet.address);
	await registerTx.wait();
	console.log(
		"✅ NIC account registered:",
		nicNumber,
		"→",
		originalWallet.address
	);

	// Step 2: Create temporary wallet session
	console.log("\n--- Step 2: Create Temporary Session ---");

	const temporaryWallet = ethers.Wallet.createRandom().connect(ethers.provider);
	console.log("Temporary Wallet:", temporaryWallet.address);

	const sessionTx = await registry.connect(originalWallet).createSession(
		nicNumber,
		temporaryWallet.address,
		3600 // 1 hour
	);
	await sessionTx.wait();
	console.log(
		"✅ Session created - Temporary wallet can now act as NIC account"
	);

	// Step 3: Check initial counter states
	console.log("\n--- Step 3: Check Initial States ---");

	const globalCounter = await counter.getCounter();
	const originalWalletCounter = await counter.getUserCounter(
		originalWallet.address
	);
	const tempWalletCounter = await counter.getUserCounter(
		temporaryWallet.address
	);

	console.log("Global Counter:", globalCounter.toString());
	console.log("Original Wallet Counter:", originalWalletCounter.toString());
	console.log("Temporary Wallet Counter:", tempWalletCounter.toString());

	// Step 4: Use temporary wallet to act as the NIC account
	console.log("\n--- Step 4: Temporary Wallet Acting as NIC Account ---");

	// Get nonce for temporary wallet
	const tempWalletNonce = await paymaster.getTempWalletNonce(
		temporaryWallet.address
	);
	console.log("Temporary wallet nonce:", tempWalletNonce.toString());

	// Create function data for incrementForUser
	const counterInterface = new ethers.Interface([
		"function incrementForUser(address originalUser) external",
	]);
	const functionData = counterInterface.encodeFunctionData("incrementForUser", [
		originalWallet.address,
	]);

	// Create message hash for temporary wallet to sign
	const messageHash = ethers.solidityPackedKeccak256(
		["address", "address", "address", "uint256", "bytes", "uint256", "address"],
		[
			originalWallet.address, // original wallet (NIC account)
			temporaryWallet.address, // temporary wallet (signer)
			COUNTER_ADDRESS, // target contract
			0, // value
			functionData, // function data
			tempWalletNonce, // nonce
			NIC_PAYMASTER_ADDRESS, // paymaster address
		]
	);

	// Sign with temporary wallet
	const signature = await temporaryWallet.signMessage(
		ethers.getBytes(messageHash)
	);
	console.log("✅ Transaction signed by temporary wallet");

	// Execute transaction through paymaster (relayer pays gas)
	const paymasterWithRelayer = paymaster.connect(deployer);

	console.log("Executing transaction...");
	const tx = await paymasterWithRelayer.executeTemporaryWalletTransaction(
		originalWallet.address, // original wallet (gets the credit)
		temporaryWallet.address, // temporary wallet (signs the transaction)
		COUNTER_ADDRESS, // target contract
		0, // value
		functionData, // function data
		signature // temporary wallet's signature
	);

	const receipt = await tx.wait();
	console.log("✅ Transaction executed! Hash:", tx.hash);

	// Step 5: Check final states - WHO GOT THE CREDIT?
	console.log("\n--- Step 5: Check Final States (Who Got Credit?) ---");

	const newGlobalCounter = await counter.getCounter();
	const newOriginalWalletCounter = await counter.getUserCounter(
		originalWallet.address
	);
	const newTempWalletCounter = await counter.getUserCounter(
		temporaryWallet.address
	);

	console.log("=== RESULTS ===");
	console.log(
		"Global Counter:",
		globalCounter.toString(),
		"→",
		newGlobalCounter.toString()
	);
	console.log(
		"Original Wallet Counter:",
		originalWalletCounter.toString(),
		"→",
		newOriginalWalletCounter.toString()
	);
	console.log(
		"Temporary Wallet Counter:",
		tempWalletCounter.toString(),
		"→",
		newTempWalletCounter.toString()
	);

	// Analysis
	if (newOriginalWalletCounter > originalWalletCounter) {
		console.log("\n🎉 SUCCESS: Original Wallet (NIC Account) got the credit!");
		console.log("✅ Temporary wallet successfully acted as the NIC account");
	} else {
		console.log("\n❌ ISSUE: Original wallet didn't get credit");
	}

	if (newTempWalletCounter > tempWalletCounter) {
		console.log("⚠️  Temporary wallet also got credit (unexpected)");
	} else {
		console.log("✅ Temporary wallet correctly didn't get credit");
	}

	console.log("\n=== SUMMARY ===");
	console.log("1. Original Wallet (NIC Account):", originalWallet.address);
	console.log("2. Temporary Wallet (Session):", temporaryWallet.address);
	console.log("3. Who Signed Transaction:", "Temporary Wallet");
	console.log(
		"4. Who Got Credit:",
		newOriginalWalletCounter > originalWalletCounter
			? "Original Wallet ✅"
			: "Nobody ❌"
	);
	console.log("5. Gas Paid By:", "Relayer (Gasless for user) ✅");

	console.log("\n🎯 CONCLUSION:");
	console.log("The temporary wallet acts as a PROXY for the NIC account.");
	console.log(
		"User signs with temporary wallet, but original NIC account gets all benefits!"
	);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
