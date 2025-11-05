import {ethers} from "hardhat";
import * as hre from "hardhat";

// Deployed contract address on Polygon Amoy
const ELECTION_CONTRACT_ADDRESS = "0xa85F3942AB544ece211Dc73819f36940013Fdc02";

async function main() {
	console.log("=== Creating Demo Election ===");

	const [deployer] = await ethers.getSigners();
	console.log("Deployer address:", deployer.address);

	const balance = await ethers.provider.getBalance(deployer.address);
	console.log("Deployer balance:", ethers.formatEther(balance), "MATIC");

	// Get contract instance
	const ElectionContract = await ethers.getContractAt(
		"ElectionContract",
		ELECTION_CONTRACT_ADDRESS
	);

	// Verify we're the owner
	const owner = await ElectionContract.owner();
	console.log("Contract owner:", owner);
	console.log(
		"Deployer is owner:",
		owner.toLowerCase() === deployer.address.toLowerCase()
	);

	if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
		console.error("❌ Error: Deployer is not the contract owner!");
		console.error("Please use the owner account to create elections.");
		process.exit(1);
	}

	// Get current election count
	const currentElectionCount = await ElectionContract.electionCount();
	console.log("Current election count:", currentElectionCount.toString());

	// Prepare election data
	const electionTitle = "test-election";
	const description = "this demo election description";

	// Set dates: today for start, next year for end
	const now = Math.floor(Date.now() / 1000); // Current Unix timestamp
	const oneYearFromNow = now + 365 * 24 * 60 * 60; // One year from now

	console.log("\n--- Election Details ---");
	console.log("Title:", electionTitle);
	console.log("Description:", description);
	console.log("Start Date:", new Date(now * 1000).toISOString());
	console.log("End Date:", new Date(oneYearFromNow * 1000).toISOString());

	// Prepare candidates
	// Candidate with NIC "12345"
	const candidates = [
		{
			name: "Candidate 12345",
			nic: "12345",
			party: "", // Empty string for independent candidate
			voteCount: 0, // Initial vote count
		},
	];

	console.log("\n--- Candidates ---");
	candidates.forEach((candidate, index) => {
		console.log(`Candidate ${index}:`, {
			name: candidate.name,
			nic: candidate.nic,
			party: candidate.party || "(Independent)",
		});
	});

	// Prepare voter NICs
	const voterNICs = ["1234", "4321"];

	console.log("\n--- Registered Voters ---");
	console.log("Voter NICs:", voterNICs);
	console.log("\nNIC to Wallet Mapping:");
	console.log("  1234  -> 0x835a5220EC26fcFe855dC0957cE483f03A8Bb028");
	console.log("  12345 -> 0x1E4D9bAF95b32c511acE61145289E2b5f4c6aBA8");
	console.log("  4321  -> 0x704D9ED24a11009577A73635D2C5Bc6DEE5C0782");

	// Create the election
	console.log("\n--- Creating Election ---");
	try {
		const tx = await ElectionContract.createElection(
			electionTitle,
			description,
			now,
			oneYearFromNow,
			candidates,
			voterNICs
		);

		console.log("Transaction hash:", tx.hash);
		console.log("Waiting for confirmation...");

		const receipt = await tx.wait();
		console.log("✅ Transaction confirmed!");
		console.log("Block number:", receipt?.blockNumber);
		console.log("Gas used:", receipt?.gasUsed?.toString());

		// Get the new election ID (should be currentElectionCount)
		const newElectionCount = await ElectionContract.electionCount();
		const electionId = Number(newElectionCount) - 1;

		console.log("\n=== Election Created Successfully ===");
		console.log("Election ID:", electionId);
		console.log("Contract Address:", ELECTION_CONTRACT_ADDRESS);
		console.log(
			"View on PolygonScan:",
			`https://amoy.polygonscan.com/address/${ELECTION_CONTRACT_ADDRESS}`
		);

		// Verify election data
		console.log("\n--- Verifying Election Data ---");
		const electionData = await ElectionContract.getElectionData(electionId);
		console.log("Election Title:", electionData[0].electionTitle);
		console.log("Description:", electionData[0].description);
		console.log(
			"Start Date:",
			new Date(Number(electionData[0].startDate) * 1000).toISOString()
		);
		console.log(
			"End Date:",
			new Date(Number(electionData[0].endDate) * 1000).toISOString()
		);
		console.log("Total Votes:", electionData[0].totalVotes.toString());
		console.log("Number of Candidates:", electionData[1].length);
		console.log("Number of Registered Voters:", electionData[2].toString());

		console.log("\n--- Candidate Details ---");
		for (let i = 0; i < electionData[1].length; i++) {
			const candidate = electionData[1][i];
			console.log(`Candidate ${i}:`, {
				name: candidate.name,
				nic: candidate.nic,
				party: candidate.party || "(Independent)",
				voteCount: candidate.voteCount.toString(),
			});
		}

		console.log("\n--- Voter Verification ---");
		for (const nic of voterNICs) {
			const isRegistered = await ElectionContract.checkVoter(electionId, nic);
			const hasVoted = await ElectionContract.hasVoted(electionId, nic);
			console.log(`NIC ${nic}:`, {
				registered: isRegistered,
				hasVoted: hasVoted,
			});
		}

		console.log("\n🎯 Next Steps:");
		console.log("1. Voters can now cast votes using the vote() function");
		console.log("2. Use election ID:", electionId);
		console.log("3. Voters must use their registered NIC to vote");
		console.log("4. Check results using checkResult(electionId)");
	} catch (error: any) {
		console.error("❌ Error creating election:", error.message);
		if (error.reason) {
			console.error("Reason:", error.reason);
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
