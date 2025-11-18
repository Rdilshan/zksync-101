import {ethers} from "hardhat";
import {
	createVoterMerkleTree,
	getRegisteredWalletsFromNICs,
} from "../../../utils/merkleTree";

/**
 * Create a ZK-enabled election with Merkle tree of eligible voters
 *
 * Usage:
 *   npx hardhat run deploy/4-paymaster/polygon/create-zk-election.ts --network polygonAmoy
 *
 * Environment variables:
 *   ZK_ELECTION_CONTRACT_ADDRESS - Address of deployed ZK_ElectionContract
 *   VOTER_ADDRESSES - Comma-separated list of voter addresses (optional, uses test addresses if not provided)
 */
async function main() {
	console.log("=== Creating ZK Election ===");

	const [deployer] = await ethers.getSigners();
	console.log("Deployer address:", deployer.address);

	// Get ZK Election Contract address
	const zkElectionAddress =
		process.env.ZK_ELECTION_CONTRACT_ADDRESS ||
		process.argv[2] ||
		"0x0000000000000000000000000000000000000000";

	if (zkElectionAddress === "0x0000000000000000000000000000000000000000") {
		console.error("❌ Error: ZK_ELECTION_CONTRACT_ADDRESS not provided");
		console.log(
			"Usage: npx hardhat run deploy/4-paymaster/polygon/create-zk-election.ts --network polygonAmoy -- <ZK_ELECTION_ADDRESS>"
		);
		process.exit(1);
	}

	console.log("ZK Election Contract address:", zkElectionAddress);

	// Connect to contract
	const ZKElectionContract = await ethers.getContractFactory(
		"ZK_ElectionContract"
	);
	const zkElection = ZKElectionContract.attach(zkElectionAddress);

	// Verify contract
	const owner = await zkElection.owner();
	console.log("Contract owner:", owner);
	console.log(
		"Deployer is owner:",
		owner.toLowerCase() === deployer.address.toLowerCase()
	);

	if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
		console.error("❌ Error: Deployer is not the contract owner");
		process.exit(1);
	}

	// Get NICWalletRegistry address from contract
	const nicRegistryAddress = await (zkElection as any).nicRegistry();
	console.log("NICWalletRegistry address:", nicRegistryAddress);

	// Connect to NICWalletRegistry
	const NICWalletRegistry = await ethers.getContractFactory(
		"NICWalletRegistry"
	);
	const nicRegistry = NICWalletRegistry.attach(nicRegistryAddress);

	// Get voter list - support both NIC numbers and addresses
	const voterNICsEnv = process.env.VOTER_NICS;
	const voterAddressesEnv = process.env.VOTER_ADDRESSES;
	let voterAddresses: string[];

	if (voterNICsEnv) {
		// Get registered wallets from NIC numbers
		console.log("\n--- Getting Registered Wallets from NIC Numbers ---");
		const nicNumbers = voterNICsEnv.split(",").map((nic) => nic.trim());
		console.log("NIC Numbers:", nicNumbers.length);
		voterAddresses = await getRegisteredWalletsFromNICs(
			nicNumbers,
			nicRegistry
		);
		console.log(
			"✅ Retrieved registered wallet addresses:",
			voterAddresses.length
		);
		if (voterAddresses.length === 0) {
			console.error("❌ Error: No registered wallets found for provided NICs");
			process.exit(1);
		}
	} else if (voterAddressesEnv) {
		// Use provided addresses directly (must be registered wallets)
		voterAddresses = voterAddressesEnv.split(",").map((addr) => addr.trim());
		console.log(
			"⚠️  Using voter addresses directly (ensure these are REGISTERED wallets from NIC)"
		);
		console.log("Voter addresses:", voterAddresses.length);
	} else {
		// Use test addresses (for testing only)
		voterAddresses = [
			deployer.address,
			"0x1111111111111111111111111111111111111111",
			"0x2222222222222222222222222222222222222222",
			"0x3333333333333333333333333333333333333333",
			"0x4444444444444444444444444444444444444444",
		];
		console.log(
			"⚠️  Using test voter addresses (for testing only):",
			voterAddresses.length
		);
	}

	// Get current election count
	const currentElectionCount = await zkElection.electionCount();
	const electionId = Number(currentElectionCount);

	console.log("\n--- Creating Merkle Tree ---");
	const {root} = createVoterMerkleTree(voterAddresses, electionId);
	console.log("Merkle root:", root);
	console.log("Number of voters:", voterAddresses.length);

	// Election parameters
	const electionTitle =
		process.env.ELECTION_TITLE || "ZK Privacy Election 2024";
	const electionDescription =
		process.env.ELECTION_DESCRIPTION ||
		"Election using Zero-Knowledge Proofs for vote privacy";
	const startDate = process.env.ELECTION_START_DATE
		? BigInt(process.env.ELECTION_START_DATE)
		: BigInt(Math.floor(Date.now() / 1000));
	const endDate = process.env.ELECTION_END_DATE
		? BigInt(process.env.ELECTION_END_DATE)
		: startDate + BigInt(86400 * 7); // 7 days from start

	const candidates = process.env.CANDIDATES
		? JSON.parse(process.env.CANDIDATES).map((c: any) => ({
				name: c.name,
				nic: c.nic,
				party: c.party || "",
				voteCount: c.voteCount || 0,
		  }))
		: [
				{name: "Candidate A", nic: "CA001", party: "Party Alpha", voteCount: 0},
				{name: "Candidate B", nic: "CB002", party: "Party Beta", voteCount: 0},
				{name: "Candidate C", nic: "CC003", party: "", voteCount: 0}, // Independent
		  ];

	console.log("\n--- Election Parameters ---");
	console.log("Title:", electionTitle);
	console.log("Description:", electionDescription);
	console.log("Start Date:", new Date(Number(startDate) * 1000).toISOString());
	console.log("End Date:", new Date(Number(endDate) * 1000).toISOString());
	console.log("Candidates:", candidates.length);
	candidates.forEach((c: any, i: number) => {
		console.log(`  ${i + 1}. ${c.name} (${c.party || "Independent"})`);
	});

	// Create election
	console.log("\n--- Creating Election ---");
	try {
		const createTx = await zkElection.createElection(
			electionTitle,
			electionDescription,
			startDate,
			endDate,
			candidates,
			root
		);

		console.log("Transaction hash:", createTx.hash);
		const receipt = await createTx.wait();
		console.log("✅ Election created successfully!");
		console.log("Gas used:", receipt?.gasUsed.toString());

		// Verify election was created
		const election = await zkElection.elections(electionId);
		console.log("\n--- Election Details ---");
		console.log("Election ID:", electionId.toString());
		console.log("Title:", election.electionTitle);
		console.log("Exists:", election.exists);
		console.log("Voters Merkle Root:", election.votersMerkleRoot);
		console.log("Total Votes:", election.totalVotes.toString());

		const electionInfo = {
			electionId: electionId.toString(),
			title: election.electionTitle,
			merkleRoot: election.votersMerkleRoot,
			voterAddresses: voterAddresses,
			candidates: candidates,
			startDate: Number(startDate),
			endDate: Number(endDate),
			createdAt: new Date().toISOString(),
		};

		console.log("\n=== Election Created Successfully ===");
		console.log(JSON.stringify(electionInfo, null, 2));

		console.log("\n📋 Save this information:");
		console.log("Election ID:", electionId);
		console.log("Merkle Root:", election.votersMerkleRoot);
		console.log("Voter Addresses:", voterAddresses.join(", "));

		console.log("\n🎯 Next Steps:");
		console.log("1. Voters can now generate ZK proofs");
		console.log("2. Use castVote() with ZK proof to vote");
		console.log("3. Results will be private but verifiable");
	} catch (error) {
		console.error("❌ Failed to create election:", error);
		process.exit(1);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
