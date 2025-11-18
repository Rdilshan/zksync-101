import {ethers} from "hardhat";
import {
	createVoterMerkleTree,
	getMerkleProof,
	generateVoterSecret,
	computeCommitment,
	computeNullifier,
	getRegisteredWalletsFromNICs,
} from "../../../utils/merkleTree";

/**
 * Complete Voting Flow Test Script
 * 
 * This script demonstrates the full voting flow:
 * 1. Register users with NIC numbers
 * 2. Create session wallets
 * 3. Generate ZK proofs (mock for testing)
 * 4. Cast votes through paymaster (gasless)
 * 
 * Usage:
 *   npx hardhat run deploy/4-paymaster/polygon/test-voting-flow.ts --network polygonAmoy
 * 
 * Environment variables:
 *   ZK_ELECTION_CONTRACT_ADDRESS - Address of deployed ZK_ElectionContract
 *   NIC_WALLET_REGISTRY_ADDRESS - Address of NICWalletRegistry
 *   NIC_PAYMASTER_ADDRESS - Address of NICPaymaster
 *   ELECTION_ID - Election ID (default: 0)
 */
async function main() {
	console.log("=== Testing Complete Voting Flow ===\n");

	const [deployer] = await ethers.getSigners();
	console.log("Deployer address:", deployer.address);

	// Get contract addresses
	const zkElectionAddress =
		process.env.ZK_ELECTION_CONTRACT_ADDRESS ||
		process.argv[2] ||
		"0x82537c95a9C7ff36ba982f51DB15898F1Dd53b0C";

	const nicRegistryAddress =
		process.env.NIC_WALLET_REGISTRY_ADDRESS ||
		process.argv[3] ||
		"0x24D2Caf2fd29D503e72AdD19a5c56C2452d2e5C1";

	const nicPaymasterAddress =
		process.env.NIC_PAYMASTER_ADDRESS ||
		process.argv[4] ||
		"0xE2D89a2f526e828579Da11AdeE60dDb645303440";

	const electionId = process.env.ELECTION_ID
		? parseInt(process.env.ELECTION_ID)
		: 2; // Use latest election ID (2 was just created)

	console.log("ZK Election Contract:", zkElectionAddress);
	console.log("NICWalletRegistry:", nicRegistryAddress);
	console.log("NICPaymaster:", nicPaymasterAddress);
	console.log("Election ID:", electionId);

	// Connect to contracts
	const ZKElectionContract = await ethers.getContractFactory(
		"ZK_ElectionContract"
	);
	const zkElection = ZKElectionContract.attach(zkElectionAddress);

	const NICWalletRegistry = await ethers.getContractFactory(
		"NICWalletRegistry"
	);
	const nicRegistry = NICWalletRegistry.attach(nicRegistryAddress);

	const NICPaymaster = await ethers.getContractFactory("NICPaymaster");
	const nicPaymaster = NICPaymaster.attach(nicPaymasterAddress);

	// ============================================
	// Step 1: Register Users with NIC Numbers
	// ============================================
	console.log("\n=== Step 1: Registering Users with NIC Numbers ===");

	// Test NIC numbers and their corresponding wallets
	const testUsers = [
		{
			nic: "NIC001",
			wallet: deployer.address, // Use deployer as first user
		},
		{
			nic: "NIC002",
			wallet: "0x1111111111111111111111111111111111111111",
		},
		{
			nic: "NIC003",
			wallet: "0x2222222222222222222222222222222222222222",
		},
	];

	for (const user of testUsers) {
		try {
			// Check if already registered
			const existingWallet = await nicRegistry.getWalletByNIC(user.nic);
			if (existingWallet !== ethers.ZeroAddress) {
				console.log(
					`✅ NIC ${user.nic} already registered: ${existingWallet}`
				);
			} else {
				// Register wallet
				const tx = await nicRegistry.registerWallet(user.nic, user.wallet);
				await tx.wait();
				console.log(
					`✅ Registered NIC ${user.nic} -> ${user.wallet}`
				);
			}
		} catch (error: any) {
			console.error(`❌ Failed to register NIC ${user.nic}:`, error.message);
		}
	}

	// ============================================
	// Step 2: Create Session Wallets
	// ============================================
	console.log("\n=== Step 2: Creating Session Wallets ===");

	const sessionWallets: Array<{
		nic: string;
		registeredWallet: string;
		temporaryWallet: ethers.Wallet;
		sessionExpiry: bigint;
	}> = [];

	for (const user of testUsers) {
		try {
			// Generate temporary wallet
			const temporaryWallet = ethers.Wallet.createRandom().connect(
				ethers.provider
			);
			const sessionDuration = 3600; // 1 hour in seconds (max is 7 days = 604800)

			// Create session (contract expects duration in seconds, not expiry timestamp)
			const tx = await nicRegistry.createSession(
				user.nic, // Use NIC number, not wallet address
				temporaryWallet.address,
				sessionDuration
			);
			await tx.wait();
			
			// Calculate expiry for reference
			const currentTime = BigInt(Math.floor(Date.now() / 1000));
			const sessionExpiry = currentTime + BigInt(sessionDuration);

			sessionWallets.push({
				nic: user.nic,
				registeredWallet: user.wallet,
				temporaryWallet: temporaryWallet,
				sessionExpiry: sessionExpiry,
			});

			console.log(
				`✅ Created session for NIC ${user.nic}:`
			);
			console.log(`   Registered: ${user.wallet}`);
			console.log(`   Temporary: ${temporaryWallet.address}`);
			console.log(`   Expires: ${new Date(Number(sessionExpiry) * 1000).toISOString()}`);
		} catch (error: any) {
			console.error(
				`❌ Failed to create session for NIC ${user.nic}:`,
				error.message
			);
		}
	}

	if (sessionWallets.length === 0) {
		console.error("❌ No session wallets created. Cannot proceed.");
		process.exit(1);
	}

	// ============================================
	// Step 3: Get Election Details & Merkle Tree
	// ============================================
	console.log("\n=== Step 3: Getting Election Details ===");

	const election = await zkElection.elections(electionId);
	console.log("Election Title:", election.electionTitle);
	console.log("Merkle Root:", election.votersMerkleRoot);

	// Get registered wallets for Merkle tree
	// IMPORTANT: Must use the SAME voter addresses that were used to create the election
	// Election was created with 5 test addresses, so we need all 5
	const registeredWallets = await getRegisteredWalletsFromNICs(
		testUsers.map((u) => u.nic),
		nicRegistry
	);

	if (registeredWallets.length === 0) {
		console.error("❌ No registered wallets found");
		process.exit(1);
	}

	// Add the test addresses that were used in election creation
	// These are the addresses from the election creation output
	const allVoterAddresses = [
		registeredWallets[0], // NIC001 -> deployer.address
		"0x1111111111111111111111111111111111111111", // NIC002
		"0x2222222222222222222222222222222222222222", // NIC003
		"0x3333333333333333333333333333333333333333", // Test address 4
		"0x4444444444444444444444444444444444444444", // Test address 5
	];

	console.log("Using voter addresses for Merkle tree:", allVoterAddresses.length);
	console.log("Voter addresses:", allVoterAddresses);

	// Create Merkle tree with ALL voter addresses (must match election creation)
	const {tree, root} = createVoterMerkleTree(allVoterAddresses, electionId);
	console.log("✅ Merkle tree created with", allVoterAddresses.length, "voters");
	console.log("Merkle root from tree:", ethers.hexlify(root));
	console.log("Merkle root from election:", election.votersMerkleRoot);
	
	// Verify Merkle roots match
	if (ethers.hexlify(root) !== election.votersMerkleRoot) {
		console.error("❌ ERROR: Merkle root mismatch!");
		console.error("Tree root:", ethers.hexlify(root));
		console.error("Election root:", election.votersMerkleRoot);
		console.error("This will cause 'Invalid voter proof' error");
		process.exit(1);
	}
	console.log("✅ Merkle roots match!");

	// ============================================
	// Step 4: Cast Votes (Gasless via Paymaster)
	// ============================================
	console.log("\n=== Step 4: Casting Votes (Gasless) ===");

	// Use first session wallet to cast a vote
	const voter = sessionWallets[0];
	const candidateIndex = 0; // Vote for Candidate A

	console.log(`\nVoting as NIC ${voter.nic}:`);
	console.log(`Registered Wallet: ${voter.registeredWallet}`);
	console.log(`Temporary Wallet: ${voter.temporaryWallet.address}`);
	console.log(`Candidate Index: ${candidateIndex}`);

	// Generate ZK proof components (mock for testing - replace with real ZK proof generation)
	const voterSecret = generateVoterSecret(voter.nic, electionId);
	const randomness = ethers.randomBytes(32);
	const commitment = computeCommitment(
		voterSecret,
		candidateIndex,
		ethers.hexlify(randomness),
		electionId
	);
	const nullifierHash = computeNullifier(voterSecret, electionId);

	// Get Merkle proof
	const merkleProof = getMerkleProof(
		tree,
		voter.registeredWallet,
		electionId
	);

	console.log("\nZK Proof Components:");
	console.log("Voter Secret:", voterSecret);
	console.log("Commitment:", commitment);
	console.log("Nullifier Hash:", nullifierHash);
	console.log("Merkle Proof Length:", merkleProof.length);

	// ZK proof compatible with RealZKVerifier
	// RealZKVerifier requires non-zero proof points within field modulus
	// Input format: [commitment, nullifierHash, candidateIndex, electionId]
	// Field modulus: 21888242871839275222246405745257275088548364400416034343698204186575808495617
	const FIELD_MODULUS = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
	
	// Use proof points that are definitely within field modulus
	// Field modulus is very large, so we use smaller values to ensure they're valid
	// These are NOT real ZK proofs, but pass RealZKVerifier's basic checks
	const mockProof = {
		a: [
			"0x0000000000000000000000000000000000000000000000000000000000000001", // 1
			"0x0000000000000000000000000000000000000000000000000000000000000002"  // 2
		],
		b: [
			[
				"0x0000000000000000000000000000000000000000000000000000000000000003", // 3
				"0x0000000000000000000000000000000000000000000000000000000000000004"  // 4
			],
			[
				"0x0000000000000000000000000000000000000000000000000000000000000005", // 5
				"0x0000000000000000000000000000000000000000000000000000000000000006"  // 6
			]
		],
		c: [
			"0x0000000000000000000000000000000000000000000000000000000000000007", // 7
			"0x0000000000000000000000000000000000000000000000000000000000000008"  // 8
		],
		input: [commitment, nullifierHash, candidateIndex, electionId], // 4 values
	};
	
	// Verify proof values are within field modulus (they should be, using small values)
	const a0 = BigInt(mockProof.a[0]);
	const a1 = BigInt(mockProof.a[1]);
	if (a0 >= FIELD_MODULUS || a1 >= FIELD_MODULUS) {
		console.error("❌ Proof point a exceeds field modulus");
		process.exit(1);
	}
	console.log("✅ Proof points are within field modulus");

	try {
		// Prepare function data for castVoteWithNIC
		const iface = zkElection.interface;
		const functionData = iface.encodeFunctionData("castVoteWithNIC", [
			electionId,
			voter.nic,
			voter.registeredWallet,
			voter.temporaryWallet.address,
			candidateIndex,
			nullifierHash,
			commitment,
			merkleProof,
			mockProof.a,
			mockProof.b,
			mockProof.c,
			mockProof.input,
		]);

		// Get nonce for paymaster (temporary wallet nonce)
		const nonce = await nicPaymaster.getTempWalletNonce(
			voter.temporaryWallet.address
		);

		// Create message hash for paymaster signature
		const messageHash = ethers.keccak256(
			ethers.solidityPacked(
				["address", "address", "address", "uint256", "bytes", "uint256", "address"],
				[
					voter.registeredWallet,
					voter.temporaryWallet.address,
					zkElectionAddress,
					0, // value
					functionData,
					nonce,
					nicPaymasterAddress,
				]
			)
		);

		// Sign with temporary wallet (paymaster expects temporary wallet signature)
		const signature = await voter.temporaryWallet.signMessage(
			ethers.getBytes(messageHash)
		);

		console.log("\n--- Executing Gasless Vote ---");
		console.log("Message Hash:", messageHash);
		console.log("Signature:", signature);

		// Execute through paymaster (relayer/deployer calls it, temporary wallet just signed)
		// The paymaster will pay for gas, but someone with ETH needs to initiate the transaction
		console.log("\nCalling paymaster...");
		const paymasterTx = await nicPaymaster
			.connect(deployer) // Relayer executes (has ETH for gas)
			.executeGaslessTemporaryTransaction(
				voter.registeredWallet,
				voter.temporaryWallet.address,
				zkElectionAddress,
				0,
				functionData,
				signature
			);

		console.log("Transaction hash:", paymasterTx.hash);
		const receipt = await paymasterTx.wait();
		
		// Check return value from paymaster
		// The paymaster returns (success, returnData)
		// We need to decode this to see if the inner call succeeded
		console.log("\nChecking paymaster return value...");
		try {
			const tx = await ethers.provider.getTransaction(paymasterTx.hash);
			const result = await ethers.provider.call(tx);
			console.log("Return data:", result);
			if (result === "0x") {
				console.log("⚠️  No return data - inner call may have reverted");
			}
		} catch (e) {
			console.log("Could not decode return data:", e);
		}
		
		// Check if transaction succeeded
		if (receipt?.status === 0) {
			console.error("❌ Transaction reverted!");
			// Try to decode revert reason
			if (receipt.logs && receipt.logs.length > 0) {
				console.error("Revert logs:", receipt.logs);
			}
			throw new Error("Transaction reverted");
		}
		
		console.log("✅ Vote cast successfully!");
		console.log("Gas used:", receipt?.gasUsed.toString());
		console.log("Transaction status:", receipt?.status === 1 ? "Success" : "Failed");

		// Wait a bit for state to update
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Verify vote was recorded
		const updatedElection = await zkElection.elections(electionId);
		console.log("\n--- Updated Election Stats ---");
		console.log("Total Votes:", updatedElection.totalVotes.toString());

		const candidate = await zkElection.getCandidateInfo(electionId, candidateIndex);
		console.log(`Candidate ${candidateIndex} (${candidate.name}) Votes:`, candidate.voteCount.toString());

		// Check nullifier
		const nullifierUsed = await zkElection.nullifiers(electionId, nullifierHash);
		console.log("Nullifier Used:", nullifierUsed);
		
		// Check commitment count
		const commitmentCount = await zkElection.voteCommitments(electionId, commitment);
		console.log("Commitment Count:", commitmentCount.toString());

		console.log("\n🎉 Voting flow test completed successfully!");
	} catch (error: any) {
		console.error("❌ Failed to cast vote:", error.message);
		if (error.data) {
			console.error("Error data:", error.data);
		}
		process.exit(1);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

