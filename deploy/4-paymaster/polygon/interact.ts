import {ethers} from "hardhat";

// Deployed contract addresses
const PAYMASTER_ADDRESS = "0xD8F5F67391dCFdcC5F7eE429b3D5DF4878f6DFAC";
const COUNTER_ADDRESS = "0xE2145A58917293B8D97a349dcf8e75230D9c290A";

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

	// Encode the function call (increment counter)
	const counterInterface = counter.interface;
	const functionData = counterInterface.encodeFunctionData("increment", []);

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
		const tx = await paymaster.connect(relayer).executeMetaTransaction(
			user.address, // user who signed
			counter.target, // target contract
			0, // value
			functionData, // function call data
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
		const finalUserNonce = await paymaster.getNonce(user.address);

		console.log("Global counter:", finalCounter.toString(), "(+1)");
		console.log("User counter:", finalUserCounter.toString(), "(+1)");
		console.log("User nonce:", finalUserNonce.toString(), "(+1)");

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
