import {ethers} from "hardhat";
import {
	generateVoterSecret,
	computeNullifier,
} from "../../../utils/merkleTree";

/**
 * Check if a user has already voted in an election
 * 
 * Usage:
 *   npx hardhat run deploy/4-paymaster/polygon/check-voting-status.ts --network polygonAmoy
 * 
 * Environment variables:
 *   ZK_ELECTION_CONTRACT_ADDRESS - Address of ZK Election Contract
 *   ELECTION_ID - Election ID (default: 0)
 *   VOTER_NIC - NIC number of the voter to check
 */
async function main() {
	console.log("=== Checking Voting Status ===\n");

	const zkElectionAddress =
		process.env.ZK_ELECTION_CONTRACT_ADDRESS ||
		process.argv[2] ||
		"0xcbf468F00F59Fa290888CE033ce7aC9a1d051c65";

	const electionId = process.env.ELECTION_ID
		? parseInt(process.env.ELECTION_ID)
		: 0;

	const voterNIC =
		process.env.VOTER_NIC ||
		process.argv[3] ||
		"NIC001";

	console.log("ZK Election Contract:", zkElectionAddress);
	console.log("Election ID:", electionId);
	console.log("Voter NIC:", voterNIC);

	// Connect to contract
	const ZKElectionContract = await ethers.getContractFactory(
		"ZK_ElectionContract"
	);
	const zkElection = ZKElectionContract.attach(zkElectionAddress);

	// Get election details
	const election = await zkElection.elections(electionId);
	console.log("\n=== Election Details ===");
	console.log("Title:", election.electionTitle);
	console.log("Total Votes:", election.totalVotes.toString());
	console.log("Start Date:", new Date(Number(election.startDate) * 1000).toISOString());
	console.log("End Date:", new Date(Number(election.endDate) * 1000).toISOString());
	console.log("Active:", 
		Number(election.startDate) <= Math.floor(Date.now() / 1000) &&
		Math.floor(Date.now() / 1000) <= Number(election.endDate)
	);

	// Get candidate information using checkResult
	const candidates = await zkElection.checkResult(electionId);
	console.log("\n=== Candidate Results ===");
	candidates.forEach((candidate: any, i: number) => {
		console.log(`Candidate ${i} (${candidate.name}): ${candidate.voteCount.toString()} votes`);
	});

	// Check if voter has voted using nullifier
	console.log("\n=== Checking Voter Status ===");
	console.log("Voter NIC:", voterNIC);
	
	// Generate nullifier hash (same as what would be used when voting)
	const voterSecret = generateVoterSecret(voterNIC, electionId);
	const nullifierHash = computeNullifier(voterSecret, electionId);
	
	console.log("Voter Secret:", voterSecret);
	console.log("Nullifier Hash:", nullifierHash);

	// Check if nullifier has been used
	const nullifierUsed = await zkElection.nullifiers(electionId, nullifierHash);
	
	if (nullifierUsed) {
		console.log("\n✅ STATUS: This voter HAS ALREADY VOTED");
		console.log("⚠️  The nullifier hash has been used, preventing double voting");
	} else {
		console.log("\n✅ STATUS: This voter HAS NOT VOTED YET");
		console.log("✅ The nullifier hash is available, voter can cast a vote");
	}

	// Additional checks
	console.log("\n=== Additional Information ===");
	
	// Get registered wallet for this NIC
	const NICWalletRegistry = await ethers.getContractFactory("NICWalletRegistry");
	const nicRegistry = NICWalletRegistry.attach("0x24D2Caf2fd29D503e72AdD19a5c56C2452d2e5C1");
	
	try {
		const registeredWallet = await nicRegistry.getWalletByNIC(voterNIC);
		if (registeredWallet !== ethers.ZeroAddress) {
			console.log("Registered Wallet:", registeredWallet);
			console.log("Wallet is registered: ✅");
		} else {
			console.log("⚠️  NIC not registered in NICWalletRegistry");
		}
	} catch (error) {
		console.log("⚠️  Could not check NIC registration");
	}

	console.log("\n=== Summary ===");
	console.log("Election ID:", electionId);
	console.log("Total Votes Cast:", election.totalVotes.toString());
	console.log("Voter NIC:", voterNIC);
	console.log("Has Voted:", nullifierUsed ? "✅ YES" : "❌ NO");
	console.log("\n💡 Note: In ZK voting, individual votes are private.");
	console.log("   We can only check if a specific voter has voted using their nullifier hash.");
	console.log("   The actual vote choice remains hidden.");
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

