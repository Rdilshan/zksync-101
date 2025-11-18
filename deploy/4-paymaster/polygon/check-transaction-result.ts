import {ethers} from "hardhat";

/**
 * Check the actual result of a paymaster transaction
 */
async function main() {
	const txHash = process.env.TX_HASH || 
		"0x2f51cca2f725245bacb2a697af084774ddf519285a9a0ff8c9b7ac17e79c1ac3";
	
	console.log("=== Checking Transaction Result ===");
	console.log("Transaction hash:", txHash);
	
	const receipt = await ethers.provider.getTransactionReceipt(txHash);
	console.log("\nTransaction Receipt:");
	console.log("Status:", receipt?.status === 1 ? "Success" : "Failed");
	console.log("Gas Used:", receipt?.gasUsed.toString());
	console.log("Logs:", receipt?.logs.length);
	
	// Decode logs
	const NICPaymaster = await ethers.getContractFactory("NICPaymaster");
	const nicPaymaster = NICPaymaster.attach("0xE2D89a2f526e828579Da11AdeE60dDb645303440");
	
	const ZKElectionContract = await ethers.getContractFactory("ZK_ElectionContract");
	const zkElection = ZKElectionContract.attach("0xcbf468F00F59Fa290888CE033ce7aC9a1d051c65");
	
	console.log("\n=== Decoding Events ===");
	for (const log of receipt?.logs || []) {
		try {
			// Try Paymaster events
			const parsed = nicPaymaster.interface.parseLog({
				topics: log.topics as string[],
				data: log.data
			});
			if (parsed) {
				console.log("\n✅ Paymaster Event:", parsed.name);
				if (parsed.name === "TemporaryWalletTransactionExecuted") {
					console.log("Success:", parsed.args.success);
					console.log("Return Data:", parsed.args.returnData);
					if (!parsed.args.success) {
						console.log("❌ Inner transaction FAILED!");
						// Try to decode revert reason
						if (parsed.args.returnData && parsed.args.returnData !== "0x") {
							try {
								// Revert reason format: 0x08c379a0 (selector) + offset + length + string
								const returnData = parsed.args.returnData;
								if (returnData.startsWith("0x08c379a0")) {
									// Standard error(string) encoding
									const data = returnData.slice(10); // Remove selector
									const offset = parseInt(data.slice(0, 64), 16);
									const length = parseInt(data.slice(64, 128), 16);
									const reasonHex = data.slice(128, 128 + length * 2);
									const reason = Buffer.from(reasonHex, "hex").toString("utf8");
									console.log("Revert Reason:", reason);
								} else {
									console.log("Return Data:", returnData);
								}
							} catch (e) {
								console.log("Could not decode revert reason:", e);
								console.log("Return Data:", parsed.args.returnData);
							}
						}
					}
				}
			}
		} catch (e1) {
			try {
				// Try ZK Election events
				const parsed = zkElection.interface.parseLog({
					topics: log.topics as string[],
					data: log.data
				});
				if (parsed) {
					console.log("\n✅ ZK Election Event:", parsed.name);
					console.log("Args:", JSON.stringify(parsed.args, null, 2));
				}
			} catch (e2) {
				// Not a known event
			}
		}
	}
	
	// Check election state
	const election = await zkElection.elections(2);
	console.log("\n=== Election State (ID 2) ===");
	console.log("Total Votes:", election.totalVotes.toString());
}

main().catch(console.error);

