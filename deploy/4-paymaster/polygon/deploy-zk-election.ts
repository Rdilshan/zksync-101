import {ethers} from "hardhat";
import * as hre from "hardhat";
import {
	createVoterMerkleTree,
	generateVoterSecret,
} from "../../../utils/merkleTree";

async function main() {
	console.log("=== Deploying ZK Election Contract ===");

	const [deployer] = await ethers.getSigners();
	console.log("Deployer address:", deployer.address);

	const balance = await ethers.provider.getBalance(deployer.address);
	console.log("Deployer balance:", ethers.formatEther(balance), "ETH");

	// Check if verifier address is provided via environment variable or argument
	const verifierAddress = "0x0000000000000000000000000000000000000000";

	// Check if NICWalletRegistry address is provided
	const nicRegistryAddress =
		process.env.NIC_WALLET_REGISTRY_ADDRESS ||
		process.argv[3] ||
		"0x0000000000000000000000000000000000000000";

	if (nicRegistryAddress === "0x0000000000000000000000000000000000000000") {
		console.error("❌ Error: NIC_WALLET_REGISTRY_ADDRESS is required");
		console.log(
			"Usage: npx hardhat run deploy/4-paymaster/polygon/deploy-zk-election.ts --network polygonAmoy -- <verifierAddress> <nicRegistryAddress>"
		);
		console.log(
			"Or set environment variable: NIC_WALLET_REGISTRY_ADDRESS=0x..."
		);
		process.exit(1);
	}

	// Verify NICWalletRegistry contract exists
	const registryCode = await ethers.provider.getCode(nicRegistryAddress);
	if (registryCode === "0x") {
		console.error("❌ Error: No contract found at NICWalletRegistry address");
		process.exit(1);
	}
	console.log("✅ NICWalletRegistry verified at:", nicRegistryAddress);

	// Verifier address is required
	if (
		verifierAddress === "0x0000000000000000000000000000000000000000" ||
		verifierAddress === ""
	) {
		console.error(
			"\n❌ Error: Verifier address is required!"
		);
		console.error(
			"   Please provide ZK_VERIFIER_ADDRESS environment variable or deploy RealZKVerifier first:"
		);
		console.error("   npm run deploy:real-verifier:polygon");
		process.exit(1);
	}

	const finalVerifierAddress = verifierAddress;
	console.log("\n--- Using Verifier ---");
	console.log("Verifier address:", finalVerifierAddress);

	// Verify verifier contract exists
		const code = await ethers.provider.getCode(finalVerifierAddress);
		if (code === "0x") {
			console.error("❌ Error: No contract found at verifier address");
			process.exit(1);
		}
		console.log("✅ Verifier contract verified");
	}

	// Deploy ZK_ElectionContract
	console.log("\n--- Deploying ZK_ElectionContract ---");
	console.log("Verifier address:", finalVerifierAddress);
	console.log("NICWalletRegistry address:", nicRegistryAddress);
	const ZKElectionContract = await ethers.getContractFactory(
		"ZK_ElectionContract"
	);
	const zkElectionContract = await ZKElectionContract.deploy(
		finalVerifierAddress,
		nicRegistryAddress
	);
	await zkElectionContract.waitForDeployment();

	const zkElectionAddress = await zkElectionContract.getAddress();
	console.log("✅ ZK_ElectionContract deployed at:", zkElectionAddress);

	// Verify deployment
	console.log("\n--- Verifying Deployment ---");
	const owner = await (zkElectionContract as any).owner();
	const verifier = await (zkElectionContract as any).verifier();
	const nicRegistry = await (zkElectionContract as any).nicRegistry();
	const electionCount = await (zkElectionContract as any).electionCount();

	console.log("Contract owner:", owner);
	console.log("Verifier address:", verifier);
	console.log("NICWalletRegistry address:", nicRegistry);
	console.log("Initial election count:", electionCount.toString());
	console.log(
		"Deployer matches owner:",
		owner.toLowerCase() === deployer.address.toLowerCase()
	);
	console.log(
		"Registry address matches:",
		nicRegistry.toLowerCase() === nicRegistryAddress.toLowerCase()
	);

	// Optional: Create a test election if requested
	const createTestElection = process.env.CREATE_TEST_ELECTION === "true";

	if (createTestElection) {
		console.log("\n--- Creating Test Election ---");

		// Test data
		const testVoters = [
			deployer.address,
			"0x1111111111111111111111111111111111111111",
			"0x2222222222222222222222222222222222222222",
		];

		const testElectionId = 0;
		const {root} = createVoterMerkleTree(testVoters, testElectionId);
		console.log("Merkle root for test election:", root);

		const candidates = [
			{name: "Test Candidate 1", nic: "TC001", party: "Test Party A"},
			{name: "Test Candidate 2", nic: "TC002", party: "Test Party B"},
		];

		const startDate = Math.floor(Date.now() / 1000);
		const endDate = startDate + 86400; // 24 hours from now

		try {
			const createTx = await (zkElectionContract as any).createElection(
				"Test ZK Election",
				"Test election for ZK voting system",
				startDate,
				endDate,
				candidates,
				root
			);
			await createTx.wait();
			console.log("✅ Test election created successfully");

			const election = await (zkElectionContract as any).elections(0);
			console.log("Election title:", election.electionTitle);
			console.log("Election exists:", election.exists);
			console.log("Voters Merkle root:", election.votersMerkleRoot);
		} catch (error) {
			console.error("❌ Failed to create test election:", error);
		}
	}

	// Save deployment addresses
	const network = await ethers.provider.getNetwork();
	const deploymentInfo = {
		network: hre.network.name,
		chainId: Number(network.chainId), // Convert BigInt to number for JSON serialization
		contracts: {
			ZK_ElectionContract: zkElectionAddress,
			Verifier: finalVerifierAddress,
			NICWalletRegistry: nicRegistryAddress,
		},
		deployer: deployer.address,
		deployedAt: new Date().toISOString(),
	};

	console.log("\n=== Deployment Summary ===");
	console.log(JSON.stringify(deploymentInfo, null, 2));

	console.log("\n📋 Contract Addresses:");
	console.log("ZK_ElectionContract:", zkElectionAddress);
	console.log("Verifier:", finalVerifierAddress);
	console.log("NICWalletRegistry:", nicRegistryAddress);

	console.log("\n🎯 Next Steps:");
	console.log("1. Save the contract addresses");
	console.log("2. Get registered wallet addresses from NIC numbers");
	console.log(
		"3. Generate Merkle tree using REGISTERED wallet addresses (not temporary wallets)"
	);
	console.log("4. Create election using createElection() with Merkle root");
	console.log("5. Generate ZK proofs for votes");
	console.log(
		"6. Cast votes using castVoteWithNIC() through paymaster (gasless)"
	);

	return {
		zkElectionContract: zkElectionAddress,
		verifier: finalVerifierAddress,
		nicRegistry: nicRegistryAddress,
	};
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
