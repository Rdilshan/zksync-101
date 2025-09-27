import {ethers} from "hardhat";

// Updated contract addresses with new user tracking functionality
const PAYMASTER_ADDRESS = "0xcb1d0aac729D0591fCe76C8d604D2B6b2dfa5Ff4";
const COUNTER_ADDRESS = "0x1C92c2485d4512e304adD509499900Be39B22Af5";

async function main() {
	console.log("=== Testing Polygon Gasless Transactions ===");

	const signers = await ethers.getSigners();
	const relayer = signers[0];
	// Create a second account for testing (you can also use a different wallet)
	const user = ethers.Wallet.createRandom().connect(ethers.provider);

	console.log("Relayer (pays gas):", relayer.address);
	console.log("User (signs transaction):", user.address);

	// Get contract instances
	const paymaster = await ethers.getContractAt(
		"PolygonPaymaster",
		PAYMASTER_ADDRESS
	);
	const counter = await ethers.getContractAt("SimpleCounter", COUNTER_ADDRESS);

	// Check initial state
	console.log("\n--- Initial State ---");
	const initialCounter = await counter.getCounter();
	const userCounter = await counter.getUserCounter(user.address);
	const userNonce = await paymaster.getNonce(user.address);

	console.log("Global counter:", initialCounter.toString());
	console.log("User counter:", userCounter.toString());
	console.log("User nonce:", userNonce.toString());

	// Prepare meta-transaction
	console.log("\n--- Preparing Meta-Transaction ---");

	// Encode the function call (increment counter for specific user)
	const counterInterface = counter.interface;
	const functionSelector =
		counterInterface.getFunction("incrementForUser").selector;
	const functionData = counterInterface.encodeFunctionData("incrementForUser", [
		user.address,
	]);

	console.log("Function selector:", functionSelector);
	console.log("Using incrementForUser to track original user");

	console.log("Function data:", functionData);

	// Create message to sign
	const messageHash = ethers.solidityPackedKeccak256(
		["address", "address", "uint256", "bytes", "uint256", "address"],
		[
			user.address, // user
			counter.target, // target contract
			0, // value (0 ETH)
			functionData, // function call data
			userNonce, // nonce
			paymaster.target, // paymaster address
		]
	);

	console.log("Message hash:", messageHash);

	// Sign the message with user's private key
	const signature = await user.signMessage(ethers.getBytes(messageHash));
	console.log("User signature:", signature);

	// Check balances before transaction
	console.log("\n--- Balances Before Transaction ---");
	const relayerBalanceBefore = await ethers.provider.getBalance(
		relayer.address
	);
	const userBalanceBefore = await ethers.provider.getBalance(user.address);
	const paymasterBalanceBefore = await ethers.provider.getBalance(
		paymaster.target
	);

	console.log(
		"Relayer balance:",
		ethers.formatEther(relayerBalanceBefore),
		"ETH"
	);
	console.log("User balance:", ethers.formatEther(userBalanceBefore), "ETH");
	console.log(
		"Paymaster balance:",
		ethers.formatEther(paymasterBalanceBefore),
		"ETH"
	);

	// Execute meta-transaction (relayer pays gas)
	console.log("\n--- Executing Meta-Transaction ---");
	console.log("🚀 Relayer executing transaction on behalf of user...");

	try {
		// Use the new function that properly tracks the original user
		const tx = await paymaster.connect(relayer).executeMetaTransactionWithUser(
			user.address, // user who signed
			counter.target, // target contract
			0, // value
			functionSelector, // function selector
			"0x", // additional data (empty for incrementForUser)
			signature // user's signature
		);

		console.log("Transaction hash:", tx.hash);

		const receipt = await tx.wait();
		console.log("✅ Transaction successful!");
		console.log("Gas used:", receipt.gasUsed.toString());

		// Check final state
		console.log("\n--- Final State ---");
		const finalCounter = await counter.getCounter();
		const finalUserCounter = await counter.getUserCounter(user.address);
		const finalRelayerCounter = await counter.getUserCounter(relayer.address);
		const finalUserNonce = await paymaster.getNonce(user.address);

		// Get detailed user stats
		const [userCurrentCounter, userIncrementCount, userTotalIncremented] =
			await counter.getUserStats(user.address);
		const [
			relayerCurrentCounter,
			relayerIncrementCount,
			relayerTotalIncremented,
		] = await counter.getUserStats(relayer.address);

		console.log("Global counter:", finalCounter.toString(), "(+1)");
		console.log("\n📊 User Stats (should show increment now!):");
		console.log("  - Counter value:", userCurrentCounter.toString());
		console.log("  - Times incremented:", userIncrementCount.toString());
		console.log("  - Total increment amount:", userTotalIncremented.toString());

		console.log("\n📊 Relayer Stats (should be 0 now):");
		console.log("  - Counter value:", relayerCurrentCounter.toString());
		console.log("  - Times incremented:", relayerIncrementCount.toString());
		console.log(
			"  - Total increment amount:",
			relayerTotalIncremented.toString()
		);

		console.log("\nUser nonce:", finalUserNonce.toString(), "(+1)");

		// Check balances after transaction
		console.log("\n--- Balances After Transaction ---");
		const relayerBalanceAfter = await ethers.provider.getBalance(
			relayer.address
		);
		const userBalanceAfter = await ethers.provider.getBalance(user.address);
		const paymasterBalanceAfter = await ethers.provider.getBalance(
			paymaster.target
		);

		console.log(
			"Relayer balance:",
			ethers.formatEther(relayerBalanceAfter),
			"ETH"
		);
		console.log("User balance:", ethers.formatEther(userBalanceAfter), "ETH");
		console.log(
			"Paymaster balance:",
			ethers.formatEther(paymasterBalanceAfter),
			"ETH"
		);

		console.log("\n--- Balance Changes ---");
		console.log(
			"Relayer paid:",
			ethers.formatEther(relayerBalanceBefore - relayerBalanceAfter),
			"ETH (gas fees)"
		);
		console.log(
			"User paid:",
			ethers.formatEther(userBalanceBefore - userBalanceAfter),
			"ETH (should be 0!)"
		);
		console.log(
			"Paymaster change:",
			ethers.formatEther(paymasterBalanceAfter - paymasterBalanceBefore),
			"ETH"
		);

		console.log("\n🎉 SUCCESS: User executed transaction without paying gas!");
	} catch (error) {
		console.error("❌ Transaction failed:", error.message);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
