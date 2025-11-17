import {expect} from "chai";
import {ethers} from "hardhat";
import type {
	ElectionContract,
	NICPaymaster,
	NICWalletRegistry,
} from "../typechain-types";
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";

describe("Election Contract Gas Benchmark", function () {
	let electionContract: ElectionContract;
	let nicPaymaster: NICPaymaster;
	let nicRegistry: NICWalletRegistry;
	let owner: SignerWithAddress;
	let relayer: SignerWithAddress;
	let voter1: SignerWithAddress;
	let voter2: SignerWithAddress;

	// Test data
	const electionTitle = "Presidential Election 2024";
	const electionDescription = "Election for the President of the Republic";
	const startDate = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
	const endDate = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now

	const candidates = [
		{name: "John Doe", nic: "C001", party: "Party A"},
		{name: "Jane Smith", nic: "C002", party: "Party B"},
		{name: "Bob Johnson", nic: "C003", party: ""}, // Independent
	];

	const voterNICs = ["V001", "V002", "V003", "V004", "V005"];

	before(async function () {
		[owner, relayer, voter1, voter2] = await ethers.getSigners();

		// Deploy NICWalletRegistry
		const NICWalletRegistryFactory = await ethers.getContractFactory(
			"NICWalletRegistry"
		);
		nicRegistry = await NICWalletRegistryFactory.deploy();
		await nicRegistry.waitForDeployment();

		// Authorize relayer as system wallet
		await nicRegistry.authorizeSystemWallet(relayer.address, true);

		// Deploy NICPaymaster
		const NICPaymasterFactory = await ethers.getContractFactory("NICPaymaster");
		nicPaymaster = await NICPaymasterFactory.deploy(
			await nicRegistry.getAddress()
		);
		await nicPaymaster.waitForDeployment();

		// Fund paymaster
		await relayer.sendTransaction({
			to: await nicPaymaster.getAddress(),
			value: ethers.parseEther("1.0"),
		});

		// Deploy ElectionContract
		const ElectionContractFactory = await ethers.getContractFactory(
			"ElectionContract"
		);
		electionContract = await ElectionContractFactory.deploy();
		await electionContract.waitForDeployment();

		// Register wallets for voters
		await nicRegistry.registerWallet("V001", voter1.address);
		await nicRegistry.registerWallet("V002", voter2.address);

		// Create sessions for voters (for paymaster testing)
		const sessionDuration = 24 * 3600; // 24 hours
		await nicRegistry
			.connect(relayer)
			.createSession("V001", voter1.address, sessionDuration);
		await nicRegistry
			.connect(relayer)
			.createSession("V002", voter2.address, sessionDuration);
	});

	describe("Gas Benchmark Tests", function () {
		it("Should benchmark createElection gas cost", async function () {
			console.log("\n=== Benchmark: createElection ===");
			console.log(
				"Note: Candidates are added during createElection (no separate addCandidate function)"
			);

			// Convert candidates to the format expected by the contract
			const candidateStructs = candidates.map((c) => ({
				name: c.name,
				nic: c.nic,
				party: c.party,
				voteCount: 0,
			}));

			// Estimate gas
			const gasEstimate = await electionContract
				.connect(owner)
				.createElection.estimateGas(
					electionTitle,
					electionDescription,
					startDate,
					endDate,
					candidateStructs,
					voterNICs
				);

			console.log(`Gas Estimate: ${gasEstimate.toString()}`);

			// Execute and measure actual gas
			const tx = await electionContract
				.connect(owner)
				.createElection(
					electionTitle,
					electionDescription,
					startDate,
					endDate,
					candidateStructs,
					voterNICs
				);

			const receipt = await tx.wait();
			const gasUsed = receipt?.gasUsed || 0n;

			console.log(`Gas Used: ${gasUsed.toString()}`);
			console.log(`Transaction Hash: ${receipt?.hash}`);

			// Calculate cost (assuming 30 gwei gas price)
			const gasPrice = await ethers.provider.getFeeData();
			const cost = gasUsed * (gasPrice.gasPrice || 0n);
			console.log(
				`Estimated Cost: ${ethers.formatEther(
					cost
				)} ETH (at ${ethers.formatUnits(gasPrice.gasPrice || 0n, "gwei")} gwei)`
			);

			// Verify election was created
			const election = await electionContract.elections(0);
			expect(election.exists).to.be.true;
			expect(election.electionTitle).to.equal(electionTitle);

			// Calculate gas per candidate and per voter
			const gasPerCandidate = gasUsed / BigInt(candidates.length);
			const gasPerVoter = gasUsed / BigInt(voterNICs.length);
			console.log(`Gas per Candidate: ${gasPerCandidate.toString()}`);
			console.log(`Gas per Voter: ${gasPerVoter.toString()}`);
		});

		it("Should benchmark castVote (normal transaction) gas cost", async function () {
			console.log("\n=== Benchmark: castVote (Normal Transaction) ===");

			const electionId = 0;
			const voterNIC = "V001";
			const candidateIndex = 0;

			// Estimate gas
			const gasEstimate = await electionContract
				.connect(voter1)
				.vote.estimateGas(electionId, voterNIC, candidateIndex);

			console.log(`Gas Estimate: ${gasEstimate.toString()}`);

			// Execute and measure actual gas
			const tx = await electionContract
				.connect(voter1)
				.vote(electionId, voterNIC, candidateIndex);

			const receipt = await tx.wait();
			const gasUsed = receipt?.gasUsed || 0n;

			console.log(`Gas Used: ${gasUsed.toString()}`);
			console.log(`Transaction Hash: ${receipt?.hash}`);

			// Calculate cost
			const gasPrice = await ethers.provider.getFeeData();
			const cost = gasUsed * (gasPrice.gasPrice || 0n);
			console.log(
				`Estimated Cost: ${ethers.formatEther(
					cost
				)} ETH (at ${ethers.formatUnits(gasPrice.gasPrice || 0n, "gwei")} gwei)`
			);

			// Verify vote was cast
			const hasVoted = await electionContract.hasVoted(electionId, voterNIC);
			expect(hasVoted).to.be.true;
		});

		it("Should benchmark castVote (through paymaster) gas cost", async function () {
			console.log(
				"\n=== Benchmark: castVote (Through Paymaster - Gasless) ==="
			);

			const electionId = 0;
			const voterNIC = "V002";
			const candidateIndex = 1;

			// Get original wallet from NIC
			const originalWallet = await nicRegistry.getWalletByNIC(voterNIC);
			const temporaryWallet = voter2.address; // Using voter2 as temporary wallet

			// Verify session is valid
			const hasAccess = await nicRegistry.hasValidAccess(
				originalWallet,
				temporaryWallet
			);
			expect(hasAccess).to.be.true;

			// Encode the vote function call
			const electionInterface = electionContract.interface;
			const functionData = electionInterface.encodeFunctionData("vote", [
				electionId,
				voterNIC,
				candidateIndex,
			]);

			// Get current nonce for temporary wallet
			const nonce = await nicPaymaster.getTempWalletNonce(temporaryWallet);

			// Create message hash for signature (must match contract's abi.encodePacked)
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
						originalWallet,
						temporaryWallet,
						await electionContract.getAddress(),
						0, // value
						functionData,
						nonce,
						await nicPaymaster.getAddress(),
					]
				)
			);

			// Sign with temporary wallet (signMessage automatically adds Ethereum message prefix)
			const signature = await voter2.signMessage(ethers.getBytes(messageHash));

			// Estimate gas for paymaster execution
			const gasEstimate = await nicPaymaster
				.connect(relayer)
				.executeGaslessTemporaryTransaction.estimateGas(
					originalWallet,
					temporaryWallet,
					await electionContract.getAddress(),
					0,
					functionData,
					signature
				);

			console.log(`Gas Estimate (Paymaster): ${gasEstimate.toString()}`);

			// Get relayer balance before
			const relayerBalanceBefore = await ethers.provider.getBalance(
				relayer.address
			);

			// Execute through paymaster (relayer pays gas)
			const tx = await nicPaymaster
				.connect(relayer)
				.executeGaslessTemporaryTransaction(
					originalWallet,
					temporaryWallet,
					await electionContract.getAddress(),
					0,
					functionData,
					signature
				);

			const receipt = await tx.wait();
			const gasUsed = receipt?.gasUsed || 0n;

			// Get relayer balance after
			const relayerBalanceAfter = await ethers.provider.getBalance(
				relayer.address
			);
			const relayerCost = relayerBalanceBefore - relayerBalanceAfter;

			console.log(`Gas Used (Paymaster): ${gasUsed.toString()}`);
			console.log(`Transaction Hash: ${receipt?.hash}`);
			console.log(
				`Relayer Cost: ${ethers.formatEther(
					relayerCost
				)} ETH (includes gas + transaction fees)`
			);
			console.log(`User Cost: 0 ETH (completely gasless for the user!)`);

			// Calculate cost at current gas price
			const gasPrice = await ethers.provider.getFeeData();
			const estimatedCost = gasUsed * (gasPrice.gasPrice || 0n);
			console.log(
				`Estimated Cost: ${ethers.formatEther(
					estimatedCost
				)} ETH (at ${ethers.formatUnits(gasPrice.gasPrice || 0n, "gwei")} gwei)`
			);

			// Verify vote was cast
			const hasVoted = await electionContract.hasVoted(electionId, voterNIC);
			expect(hasVoted).to.be.true;
		});

		it("Should compare normal vs paymaster voting costs", async function () {
			console.log("\n=== Comparison: Normal vs Paymaster Voting ===");

			// Create a new election for comparison
			const candidateStructs = candidates.map((c) => ({
				name: c.name,
				nic: c.nic,
				party: c.party,
				voteCount: 0,
			}));

			await electionContract
				.connect(owner)
				.createElection(
					"Comparison Election",
					"Election for comparison",
					startDate,
					endDate,
					candidateStructs,
					["V003", "V004"]
				);

			const electionId = 1;

			// Normal vote
			const normalTx = await electionContract
				.connect(voter1)
				.vote(electionId, "V003", 0);
			const normalReceipt = await normalTx.wait();
			const normalGasUsed = normalReceipt?.gasUsed || 0n;

			// Paymaster vote (using voter2)
			const originalWallet2 = await nicRegistry.getWalletByNIC("V002");
			const tempWallet2 = voter2.address;

			const functionData2 = electionContract.interface.encodeFunctionData(
				"vote",
				[electionId, "V004", 1]
			);

			const nonce2 = await nicPaymaster.getTempWalletNonce(tempWallet2);
			const messageHash2 = ethers.keccak256(
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
						originalWallet2,
						tempWallet2,
						await electionContract.getAddress(),
						0,
						functionData2,
						nonce2,
						await nicPaymaster.getAddress(),
					]
				)
			);
			const signature2 = await voter2.signMessage(
				ethers.getBytes(messageHash2)
			);

			const paymasterTx = await nicPaymaster
				.connect(relayer)
				.executeGaslessTemporaryTransaction(
					originalWallet2,
					tempWallet2,
					await electionContract.getAddress(),
					0,
					functionData2,
					signature2
				);
			const paymasterReceipt = await paymasterTx.wait();
			const paymasterGasUsed = paymasterReceipt?.gasUsed || 0n;

			// Calculate costs
			const gasPrice = await ethers.provider.getFeeData();
			const normalCost = normalGasUsed * (gasPrice.gasPrice || 0n);
			const paymasterCost = paymasterGasUsed * (gasPrice.gasPrice || 0n);
			const overhead = paymasterGasUsed - normalGasUsed;
			const overheadPercentage =
				(Number(overhead) / Number(normalGasUsed)) * 100;

			console.log("\n--- Results ---");
			console.log(`Normal Vote Gas: ${normalGasUsed.toString()}`);
			console.log(`Paymaster Vote Gas: ${paymasterGasUsed.toString()}`);
			console.log(
				`Overhead: ${overhead.toString()} (${overheadPercentage.toFixed(2)}%)`
			);
			console.log(`Normal Vote Cost: ${ethers.formatEther(normalCost)} ETH`);
			console.log(
				`Paymaster Vote Cost: ${ethers.formatEther(
					paymasterCost
				)} ETH (paid by relayer)`
			);
			console.log(`User Savings: ${ethers.formatEther(normalCost)} ETH (100%)`);

			// Summary
			console.log("\n--- Summary ---");
			console.log("✅ Normal voting: User pays gas fees directly");
			console.log(
				"✅ Paymaster voting: User pays 0 ETH, relayer covers all costs"
			);
			console.log(
				`✅ Paymaster overhead: ${overheadPercentage.toFixed(
					2
				)}% additional gas for signature verification and access checks`
			);
		});
	});
});
