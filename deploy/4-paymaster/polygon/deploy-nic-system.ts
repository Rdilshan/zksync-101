import {ethers} from "hardhat";

async function main() {
	console.log("=== Deploying NIC Wallet System ===");

	const [deployer] = await ethers.getSigners();
	console.log("Deploying contracts with account:", deployer.address);
	console.log(
		"Account balance:",
		ethers.formatEther(await deployer.provider.getBalance(deployer.address))
	);

	// Deploy NIC Wallet Registry first
	console.log("\n--- Deploying NIC Wallet Registry ---");
	const NICWalletRegistry = await ethers.getContractFactory(
		"NICWalletRegistry"
	);
	const registry = await NICWalletRegistry.deploy();
	await registry.waitForDeployment();

	const registryAddress = await registry.getAddress();
	console.log("NIC Wallet Registry deployed to:", registryAddress);

	// Deploy NIC Paymaster
	console.log("\n--- Deploying NIC Paymaster ---");
	const NICPaymaster = await ethers.getContractFactory("NICPaymaster");
	const paymaster = await NICPaymaster.deploy(registryAddress);
	await paymaster.waitForDeployment();

	const paymasterAddress = await paymaster.getAddress();
	console.log("NIC Paymaster deployed to:", paymasterAddress);

	// Fund the paymaster with some ETH for gas
	console.log("\n--- Funding Paymaster ---");
	const fundAmount = ethers.parseEther("0.1"); // 0.1 ETH
	const fundTx = await deployer.sendTransaction({
		to: paymasterAddress,
		value: fundAmount,
	});
	await fundTx.wait();
	console.log("Funded paymaster with:", ethers.formatEther(fundAmount), "ETH");

	// Verify deployment
	console.log("\n--- Verifying Deployment ---");
	const paymasterBalance = await paymaster.getBalance();
	console.log(
		"Paymaster balance:",
		ethers.formatEther(paymasterBalance),
		"ETH"
	);

	// Save deployment addresses
	const deploymentInfo = {
		network: "Polygon Amoy",
		chainId: 80002,
		contracts: {
			NICWalletRegistry: registryAddress,
			NICPaymaster: paymasterAddress,
		},
		deployer: deployer.address,
		deployedAt: new Date().toISOString(),
	};

	console.log("\n=== Deployment Summary ===");
	console.log(JSON.stringify(deploymentInfo, null, 2));

	// Test basic functionality
	console.log("\n--- Testing Basic Functionality ---");

	// Test wallet registration
	const testNIC = "123456789V";
	const testWallet = ethers.Wallet.createRandom();

	console.log("Testing wallet registration...");
	console.log("Test NIC:", testNIC);
	console.log("Test Wallet:", testWallet.address);

	try {
		const registerTx = await registry.registerWallet(
			testNIC,
			testWallet.address
		);
		await registerTx.wait();
		console.log("✅ Wallet registration successful");

		// Test wallet lookup
		const retrievedWallet = await registry.getWalletByNIC(testNIC);
		console.log("Retrieved wallet:", retrievedWallet);

		if (retrievedWallet.toLowerCase() === testWallet.address.toLowerCase()) {
			console.log("✅ Wallet lookup successful");
		} else {
			console.log("❌ Wallet lookup failed");
		}

		// Test session creation (need to use the wallet owner)
		console.log("Testing session creation...");
		const tempWallet = ethers.Wallet.createRandom();
		const sessionDuration = 3600; // 1 hour

		// Connect the test wallet to the provider and use it to create session
		const testWalletSigner = new ethers.Wallet(
			testWallet.privateKey,
			deployer.provider
		);

		const sessionTx = await registry
			.connect(deployer)
			.createSession(testNIC, tempWallet.address, sessionDuration);
		await sessionTx.wait();
		console.log("✅ Session creation successful");
		console.log("Temporary wallet:", tempWallet.address);

		// Test access validation
		const hasAccess = await registry.hasValidAccess(
			testWallet.address,
			tempWallet.address
		);
		console.log("Has valid access:", hasAccess);

		if (hasAccess) {
			console.log("✅ Access validation successful");
		} else {
			console.log("❌ Access validation failed");
		}
	} catch (error) {
		console.error("❌ Testing failed:", error);
	}

	console.log("\n=== Deployment Complete ===");
	console.log("Save these addresses for your frontend:");
	console.log("NIC_WALLET_REGISTRY_ADDRESS =", registryAddress);
	console.log("NIC_PAYMASTER_ADDRESS =", paymasterAddress);

	return {
		registry: registryAddress,
		paymaster: paymasterAddress,
	};
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
