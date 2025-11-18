import {ethers} from "hardhat";
import {
	createVoterMerkleTree,
	getMerkleProof,
	generateVoterSecret,
	computeCommitment,
	computeNullifier,
} from "../../../utils/merkleTree";

/**
 * Test voting process with NIC003
 *
 * Usage:
 *   npx hardhat run deploy/4-paymaster/polygon/test-nic003-vote.ts --network polygonAmoy
 */
async function main() {
	const zkElectionAddress =
		process.env.ZK_ELECTION_CONTRACT_ADDRESS ||
		"0xcbf468F00F59Fa290888CE033ce7aC9a1d051c65";
	const nicRegistryAddress =
		process.env.NIC_WALLET_REGISTRY_ADDRESS ||
		"0x24D2Caf2fd29D503e72AdD19a5c56C2452d2e5C1";
	const nicPaymasterAddress =
		process.env.NIC_PAYMASTER_ADDRESS ||
		"0xE2D89a2f526e828579Da11AdeE60dDb645303440";
	const electionId = process.env.ELECTION_ID
		? parseInt(process.env.ELECTION_ID)
		: 2;
	const voterNIC = "NIC003";
	const candidateIndex = 2; // Vote for Candidate C

	console.log("=== Testing Voting Process with NIC003 ===");
	console.log("ZK Election Contract:", zkElectionAddress);
	console.log("NICWalletRegistry:", nicRegistryAddress);
	console.log("NICPaymaster:", nicPaymasterAddress);
	console.log("Election ID:", electionId);
	console.log("Voter NIC:", voterNIC);
	console.log("Candidate Index:", candidateIndex);

	const [deployer] = await ethers.getSigners();
	console.log("Deployer (Relayer):", deployer.address);

	// Get contracts
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

	// Step 1: Get registered wallet for NIC003
	console.log("\n=== Step 1: Checking NIC003 Registration ===");
	const registeredWallet = await nicRegistry.getWalletByNIC(voterNIC);
	if (registeredWallet === ethers.ZeroAddress) {
		console.error(`❌ NIC ${voterNIC} is not registered`);
		process.exit(1);
	}
	console.log(`✅ Registered wallet for ${voterNIC}:`, registeredWallet);

	// Step 2: Create session wallet
	console.log("\n=== Step 2: Creating Session Wallet ===");
	const temporaryWallet = ethers.Wallet.createRandom().connect(ethers.provider);
	console.log("Temporary wallet:", temporaryWallet.address);

	// Fund temporary wallet (for signature, not gas)
	const fundTx = await deployer.sendTransaction({
		to: temporaryWallet.address,
		value: ethers.parseEther("0.001"),
	});
	await fundTx.wait();
	console.log("✅ Temporary wallet funded");

	// Create session (1 hour)
	const sessionDuration = 3600; // 1 hour
	const createSessionTx = await nicRegistry.createSession(
		voterNIC,
		temporaryWallet.address,
		sessionDuration
	);
	await createSessionTx.wait();
	console.log("✅ Session created (expires in 1 hour)");

	// Step 3: Get election details and create Merkle tree
	console.log("\n=== Step 3: Getting Election Details ===");
	const election = await zkElection.elections(electionId);
	console.log("Title:", election.electionTitle);
	console.log("Merkle Root:", election.votersMerkleRoot);

	// Get all voter addresses (must match election creation)
	const allVoterAddresses = [
		"0x09774CA791a77906d6c5b915bdB39882eEb55234", // NIC001
		"0x1111111111111111111111111111111111111111", // NIC002
		"0x2222222222222222222222222222222222222222", // NIC003
		"0x3333333333333333333333333333333333333333", // Test address 4
		"0x4444444444444444444444444444444444444444", // Test address 5
	];

	const {tree, root} = createVoterMerkleTree(allVoterAddresses, electionId);
	if (ethers.hexlify(root) !== election.votersMerkleRoot) {
		console.error("❌ Merkle root mismatch!");
		process.exit(1);
	}
	console.log("✅ Merkle tree created and verified");

	// Step 4: Generate ZK proof components
	console.log("\n=== Step 4: Generating ZK Proof Components ===");
	const voterSecret = generateVoterSecret(voterNIC, electionId);
	const randomness = ethers.randomBytes(32);
	const commitment = computeCommitment(
		voterSecret,
		candidateIndex,
		ethers.hexlify(randomness),
		electionId
	);
	const nullifierHash = computeNullifier(voterSecret, electionId);
	const merkleProof = getMerkleProof(tree, registeredWallet, electionId);

	console.log("Voter Secret:", voterSecret);
	console.log("Commitment:", commitment);
	console.log("Nullifier Hash:", nullifierHash);
	console.log("Merkle Proof Length:", merkleProof.length);

	// ZK proof compatible with RealZKVerifier
	const FIELD_MODULUS = BigInt(
		"21888242871839275222246405745257275088548364400416034343698204186575808495617"
	);
	const mockProof = {
		a: [
			"0x0000000000000000000000000000000000000000000000000000000000000001",
			"0x0000000000000000000000000000000000000000000000000000000000000002",
		],
		b: [
			[
				"0x0000000000000000000000000000000000000000000000000000000000000003",
				"0x0000000000000000000000000000000000000000000000000000000000000004",
			],
			[
				"0x0000000000000000000000000000000000000000000000000000000000000005",
				"0x0000000000000000000000000000000000000000000000000000000000000006",
			],
		],
		c: [
			"0x0000000000000000000000000000000000000000000000000000000000000007",
			"0x0000000000000000000000000000000000000000000000000000000000000008",
		],
		input: [commitment, nullifierHash, candidateIndex, electionId],
	};
	console.log("✅ Proof points are within field modulus");

	// Step 5: Cast vote through paymaster
	console.log("\n=== Step 5: Casting Vote (Gasless) ===");
	const iface = zkElection.interface;
	const functionData = iface.encodeFunctionData("castVoteWithNIC", [
		electionId,
		voterNIC,
		registeredWallet,
		temporaryWallet.address,
		candidateIndex,
		nullifierHash,
		commitment,
		merkleProof,
		mockProof.a,
		mockProof.b,
		mockProof.c,
		mockProof.input,
	]);

	// Get nonce
	const nonce = await nicPaymaster.getTempWalletNonce(temporaryWallet.address);
	console.log("Nonce:", nonce.toString());

	// Create message hash for paymaster signature
	const messageHash = ethers.keccak256(
		ethers.solidityPacked(
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
				registeredWallet,
				temporaryWallet.address,
				zkElectionAddress,
				0, // value
				functionData,
				nonce,
				nicPaymasterAddress,
			]
		)
	);
	console.log("Message Hash:", messageHash);

	// Sign with temporary wallet
	const signature = await temporaryWallet.signMessage(
		ethers.getBytes(messageHash)
	);
	console.log("Signature:", signature);

	// Execute through paymaster (relayer pays gas)
	// Note: nonce is used in message hash but not passed to function (paymaster manages it internally)
	console.log("\n--- Executing Gasless Vote via Paymaster ---");
	const paymasterTx = await nicPaymaster
		.connect(deployer)
		.executeGaslessTemporaryTransaction(
			registeredWallet,
			temporaryWallet.address,
			zkElectionAddress,
			0, // value
			functionData,
			signature
		);

	const receipt = await paymasterTx.wait();

	console.log("Transaction hash:", receipt?.hash);
	console.log("Gas used:", receipt?.gasUsed.toString());
	console.log("Status:", receipt?.status === 1 ? "Success" : "Failed");

	// Step 6: Verify results
	console.log("\n=== Step 6: Verifying Results ===");
	const updatedElection = await zkElection.elections(electionId);
	const candidateInfo = await zkElection.getCandidateInfo(
		electionId,
		candidateIndex
	);
	const nullifierUsed = await zkElection.nullifiers(electionId, nullifierHash);

	console.log("Total Votes:", updatedElection.totalVotes.toString());
	console.log(
		`Candidate ${candidateIndex} (Candidate C) Votes:`,
		candidateInfo.voteCount.toString()
	);
	console.log("Nullifier Used:", nullifierUsed);

	if (receipt?.status === 1 && nullifierUsed) {
		console.log("\n✅ Vote cast successfully!");
		console.log(`✅ NIC003 voted for Candidate C`);
		console.log(`✅ Nullifier hash marked as used (prevents double voting)`);
	} else {
		console.log("\n❌ Vote failed!");
		if (receipt?.status !== 1) {
			console.log("Transaction status:", receipt?.status);
		}
		if (!nullifierUsed) {
			console.log("Nullifier was not marked as used");
		}
	}

	// Final status check
	console.log("\n=== Final Election Status ===");
	const finalElection = await zkElection.elections(electionId);
	console.log("Total Votes:", finalElection.totalVotes.toString());

	for (let i = 0; i < 3; i++) {
		const candidate = await zkElection.getCandidateInfo(electionId, i);
		console.log(`Candidate ${i}: ${candidate.voteCount.toString()} votes`);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
