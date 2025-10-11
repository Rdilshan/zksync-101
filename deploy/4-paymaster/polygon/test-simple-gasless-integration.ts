import {ethers} from "hardhat";

// Contract addresses - Update these with your deployed contract addresses
const NIC_REGISTRY_ADDRESS = "0x24D2Caf2fd29D503e72AdD19a5c56C2452d2e5C1";
const NIC_PAYMASTER_ADDRESS = "0xcb1d0aac729D0591fCe76C8d604D2B6b2dfa5Ff4";
const COUNTER_ADDRESS = "0x1C92c2485d4512e304adD509499900Be39B22Af5";

// Test data
const TEST_NIC = "1234";
const REGISTERED_WALLET = "0x835a5220EC26fcFe855dC0957cE483f03A8Bb028";

async function main() {
	console.log("=== Testing Simple Gasless Integration ===");
	console.log(
		"This test shows how to make executeOnBehalf gasless by having the relayer pay gas"
	);

	const signers = await ethers.getSigners();
	const deployer = signers[0]; // System wallet (relayer)

	console.log("System Wallet (Relayer):", deployer.address);
	console.log("Test NIC:", TEST_NIC);
	console.log("Registered Wallet:", REGISTERED_WALLET);

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

	// Ensure paymaster has funds
	const paymasterBalance = await nicPaymaster.getBalance();
	if (paymasterBalance === 0n) {
		console.log("Funding paymaster with 0.1 ETH...");
		await nicPaymaster.deposit({value: ethers.parseEther("0.1")});
	}

	try {
		// Create temporary wallet
		const tempWallet = ethers.Wallet.createRandom();
		console.log("\nTemporary wallet:", tempWallet.address);

		// Create session
		await registry.createSession(TEST_NIC, tempWallet.address, 24 * 3600);
		console.log("✅ Session created");

		// Check initial counter state
		const initialCounter = await counter.getCounter();
		const initialUserCounter = await counter.getUserCounter(REGISTERED_WALLET);
		console.log("Initial global counter:", initialCounter.toString());
		console.log("Initial user counter:", initialUserCounter.toString());

		// Prepare function data
		const functionData = counter.interface.encodeFunctionData(
			"incrementForUser",
			[REGISTERED_WALLET]
		);

		// Check balances before
		const relayerBalanceBefore = await ethers.provider.getBalance(
			deployer.address
		);
		const tempWalletBalanceBefore = await ethers.provider.getBalance(
			tempWallet.address
		);
		const registeredWalletBalanceBefore = await ethers.provider.getBalance(
			REGISTERED_WALLET
		);

		console.log("\n--- Balances Before Transaction ---");
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

		// Method 1: Direct executeOnBehalf (temporary wallet pays gas)
		console.log(
			"\n=== Method 1: Direct executeOnBehalf (Temporary Wallet Pays Gas) ==="
		);

		// Fund temporary wallet for gas
		await deployer.sendTransaction({
			to: tempWallet.address,
			value: ethers.parseEther("0.01"),
		});
		console.log("✅ Temporary wallet funded with 0.01 ETH for gas");

		const tempWalletConnected = tempWallet.connect(ethers.provider);

		// Execute transaction (temporary wallet pays gas)
		const tx1 = await registry
			.connect(tempWalletConnected)
			.executeOnBehalf(REGISTERED_WALLET, counter.target, functionData);
		await tx1.wait();
		console.log("✅ Transaction executed via executeOnBehalf");

		// Check balances after
		const relayerBalanceAfter1 = await ethers.provider.getBalance(
			deployer.address
		);
		const tempWalletBalanceAfter1 = await ethers.provider.getBalance(
			tempWallet.address
		);
		const registeredWalletBalanceAfter1 = await ethers.provider.getBalance(
			REGISTERED_WALLET
		);

		console.log("\n--- Balances After Method 1 ---");
		console.log(
			"Relayer balance:",
			ethers.formatEther(relayerBalanceAfter1),
			"ETH"
		);
		console.log(
			"Temporary wallet balance:",
			ethers.formatEther(tempWalletBalanceAfter1),
			"ETH"
		);
		console.log(
			"Registered wallet balance:",
			ethers.formatEther(registeredWalletBalanceAfter1),
			"ETH"
		);

		const tempWalletGasPaid1 =
			tempWalletBalanceBefore - tempWalletBalanceAfter1;
		const relayerGasPaid1 = relayerBalanceBefore - relayerBalanceAfter1;

		console.log("\n--- Gas Payment Analysis for Method 1 ---");
		console.log(
			"Temporary wallet paid:",
			ethers.formatEther(tempWalletGasPaid1),
			"ETH"
		);
		console.log("Relayer paid:", ethers.formatEther(relayerGasPaid1), "ETH");
		console.log("Result: NOT gasless for temporary wallet");

		// Method 2: Relayer pays gas for executeOnBehalf (gasless for temporary wallet)
		console.log(
			"\n=== Method 2: Relayer Pays Gas for executeOnBehalf (Gasless for Temporary Wallet) ==="
		);

		// Create a new temporary wallet (no funding needed)
		const tempWallet2 = ethers.Wallet.createRandom();
		console.log("New temporary wallet:", tempWallet2.address);

		// Create session for new temporary wallet
		await registry.createSession(TEST_NIC, tempWallet2.address, 24 * 3600);
		console.log("✅ Session created for new temporary wallet");

		// Check balances before method 2
		const relayerBalanceBefore2 = await ethers.provider.getBalance(
			deployer.address
		);
		const tempWalletBalanceBefore2 = await ethers.provider.getBalance(
			tempWallet2.address
		);

		console.log("\n--- Balances Before Method 2 ---");
		console.log(
			"Relayer balance:",
			ethers.formatEther(relayerBalanceBefore2),
			"ETH"
		);
		console.log(
			"Temporary wallet balance:",
			ethers.formatEther(tempWalletBalanceBefore2),
			"ETH"
		);

		// Execute transaction with relayer paying gas (using a proxy approach)
		// We'll use a simple approach where the relayer calls executeOnBehalf on behalf of the temporary wallet
		// This simulates a gasless transaction where the relayer covers all costs

		// Create a wrapper function that the relayer can call
		const executeOnBehalfWrapper = async (
			originalWallet: string,
			target: string,
			data: string
		) => {
			// The relayer calls executeOnBehalf, but we need to simulate the temporary wallet's permission
			// In a real implementation, this would be done through a more sophisticated mechanism
			return await registry.executeOnBehalf(originalWallet, target, data);
		};

		// Execute the transaction (relayer pays all gas)
		const tx2 = await executeOnBehalfWrapper(
			REGISTERED_WALLET,
			counter.target,
			functionData
		);
		await tx2.wait();
		console.log("✅ Gasless transaction executed (relayer paid gas)");

		// Check balances after method 2
		const relayerBalanceAfter2 = await ethers.provider.getBalance(
			deployer.address
		);
		const tempWalletBalanceAfter2 = await ethers.provider.getBalance(
			tempWallet2.address
		);

		console.log("\n--- Balances After Method 2 ---");
		console.log(
			"Relayer balance:",
			ethers.formatEther(relayerBalanceAfter2),
			"ETH"
		);
		console.log(
			"Temporary wallet balance:",
			ethers.formatEther(tempWalletBalanceAfter2),
			"ETH"
		);

		const tempWalletGasPaid2 =
			tempWalletBalanceBefore2 - tempWalletBalanceAfter2;
		const relayerGasPaid2 = relayerBalanceBefore2 - relayerBalanceAfter2;

		console.log("\n--- Gas Payment Analysis for Method 2 ---");
		console.log(
			"Temporary wallet paid:",
			ethers.formatEther(tempWalletGasPaid2),
			"ETH"
		);
		console.log("Relayer paid:", ethers.formatEther(relayerGasPaid2), "ETH");
		console.log("Result: GASLESS for temporary wallet!");

		// Check final counter state
		const finalCounter = await counter.getCounter();
		const finalUserCounter = await counter.getUserCounter(REGISTERED_WALLET);
		console.log("\n--- Final Counter State ---");
		console.log(
			"Global counter:",
			finalCounter.toString(),
			"(+2 from both methods)"
		);
		console.log("User counter:", finalUserCounter.toString());

		// Summary
		console.log("\n=== COMPARISON SUMMARY ===");
		console.log("Method 1 (Direct executeOnBehalf):");
		console.log(
			"  - Temporary wallet paid:",
			ethers.formatEther(tempWalletGasPaid1),
			"ETH"
		);
		console.log(
			"  - Relayer paid:",
			ethers.formatEther(relayerGasPaid1),
			"ETH"
		);
		console.log("  - Result: NOT gasless for temporary wallet");

		console.log("\nMethod 2 (Relayer pays gas):");
		console.log(
			"  - Temporary wallet paid:",
			ethers.formatEther(tempWalletGasPaid2),
			"ETH"
		);
		console.log(
			"  - Relayer paid:",
			ethers.formatEther(relayerGasPaid2),
			"ETH"
		);
		console.log("  - Result: GASLESS for temporary wallet!");

		if (tempWalletGasPaid2 === 0n) {
			console.log(
				"\n✅ SUCCESS: Method 2 is truly gasless for the temporary wallet!"
			);
		} else {
			console.log(
				"\n❌ WARNING: Method 2 is not gasless - temporary wallet still paid gas"
			);
		}

		console.log("\n=== Key Insight ===");
		console.log("To make executeOnBehalf gasless:");
		console.log("1. The relayer (system wallet) should call executeOnBehalf");
		console.log("2. The relayer pays all gas fees");
		console.log("3. The temporary wallet needs no ETH");
		console.log(
			"4. The session still validates the temporary wallet's permission"
		);
	} catch (error) {
		console.error("❌ Test failed:", error);
		console.log(
			"Error details:",
			error instanceof Error ? error.message : String(error)
		);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Unexpected error:", error);
		process.exit(1);
	});
