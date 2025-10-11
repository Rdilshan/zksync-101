import {ethers} from "hardhat";

// Contract addresses
const COUNTER_ADDRESS = "0x1C92c2485d4512e304adD509499900Be39B22Af5";
const REGISTERED_WALLET = "0x835a5220EC26fcFe855dC0957cE483f03A8Bb028";

async function main() {
	console.log("=== Testing Simple Counter Contract ===");

	const signers = await ethers.getSigners();
	const deployer = signers[0];

	console.log("Deployer:", deployer.address);
	console.log("Counter Address:", COUNTER_ADDRESS);
	console.log("Registered Wallet:", REGISTERED_WALLET);

	// Get contract instance
	const counter = await ethers.getContractAt("SimpleCounter", COUNTER_ADDRESS);
	console.log("✅ Connected to SimpleCounter");

	try {
		// Check initial state
		console.log("\n--- Initial State ---");
		const initialCounter = await counter.getCounter();
		const initialUserCounter = await counter.getUserCounter(REGISTERED_WALLET);

		console.log("Global counter:", initialCounter.toString());
		console.log("User counter:", initialUserCounter.toString());

		// Test 1: Direct increment by deployer
		console.log("\n--- Test 1: Direct Increment by Deployer ---");
		const tx1 = await counter.connect(deployer).increment();
		await tx1.wait();
		console.log("✅ Direct increment successful");

		const counterAfter1 = await counter.getCounter();
		console.log(
			"Global counter after direct increment:",
			counterAfter1.toString()
		);

		// Test 2: Increment for user by deployer
		console.log("\n--- Test 2: Increment for User by Deployer ---");
		const tx2 = await counter
			.connect(deployer)
			.incrementForUser(REGISTERED_WALLET);
		await tx2.wait();
		console.log("✅ Increment for user successful");

		const counterAfter2 = await counter.getCounter();
		const userCounterAfter2 = await counter.getUserCounter(REGISTERED_WALLET);

		console.log(
			"Global counter after user increment:",
			counterAfter2.toString()
		);
		console.log("User counter after increment:", userCounterAfter2.toString());

		// Test 3: Check user stats
		console.log("\n--- Test 3: User Stats ---");
		const [userCurrentCounter, userIncrementCount, userTotalIncremented] =
			await counter.getUserStats(REGISTERED_WALLET);

		console.log("User current counter:", userCurrentCounter.toString());
		console.log("User increment count:", userIncrementCount.toString());
		console.log("User total incremented:", userTotalIncremented.toString());

		console.log("\n🎉 All counter tests successful!");
		console.log("Counter contract is working correctly");
	} catch (error) {
		console.error("❌ Test failed:", error);

		const errorMessage = error instanceof Error ? error.message : String(error);
		console.log("Error details:", errorMessage);

		if (errorMessage.includes("call revert exception")) {
			console.log(
				"💡 Solution: Check if counter contract is deployed correctly"
			);
		} else if (errorMessage.includes("insufficient funds")) {
			console.log("💡 Solution: Check deployer balance");
		}
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Unexpected error:", error);
		process.exit(1);
	});
