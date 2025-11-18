import {ethers} from "hardhat";
import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy Real ZK Verifier Contract
 * 
 * This script deploys the RealZKVerifier which performs cryptographic validation.
 * For full ZK verification, compile the Noir circuit and use the generated verifier.
 * 
 * Usage:
 *   npx hardhat run deploy/4-paymaster/polygon/deploy-real-verifier.ts --network polygonAmoy
 */
async function main() {
	console.log("=== Deploying Real ZK Verifier ===\n");

	const [deployer] = await ethers.getSigners();
	console.log("Deployer address:", deployer.address);
	
	const balance = await ethers.provider.getBalance(deployer.address);
	console.log("Deployer balance:", ethers.formatEther(balance), "ETH");

	// Check if generated verifier exists
	const generatedVerifierPath = path.join(
		__dirname,
		"../../../circuits/voting-circuit/contract/plonk_vk.sol"
	);
	
	let useGeneratedVerifier = false;
	let verifier: any; // Declare verifier outside blocks
	
	if (fs.existsSync(generatedVerifierPath)) {
		console.log("\n✅ Found generated verifier from Noir circuit!");
		console.log("Path:", generatedVerifierPath);
		console.log("⚠️  To use generated verifier, copy it to contracts directory first");
		useGeneratedVerifier = false; // Set to true after copying
	}

	if (useGeneratedVerifier) {
		console.log("\n--- Deploying Generated Verifier from Noir Circuit ---");
		// Deploy generated verifier
		const GeneratedVerifier = await ethers.getContractFactory("plonk_vk");
		verifier = await GeneratedVerifier.deploy();
		await verifier.waitForDeployment();
		const verifierAddress = await verifier.getAddress();
		console.log("✅ Generated Verifier deployed at:", verifierAddress);
	} else {
		console.log("\n--- Deploying RealZKVerifier (Intermediate Verifier) ---");
		console.log("⚠️  NOTE: This performs cryptographic checks but not full ZK verification");
		console.log("⚠️  For production, compile Noir circuit and use generated verifier");
		
		// Deploy RealZKVerifier
		const RealZKVerifier = await ethers.getContractFactory("RealZKVerifier");
		verifier = await RealZKVerifier.deploy();
		await verifier.waitForDeployment();
		const verifierAddress = await verifier.getAddress();
		
		console.log("✅ RealZKVerifier deployed at:", verifierAddress);
		
		// Test the verifier
		console.log("\n--- Testing Verifier ---");
		const fieldModulus = await verifier.getFieldModulus();
		console.log("Field Modulus:", fieldModulus.toString());
		
		// Test with valid-looking proof (values within field modulus)
		// Field modulus: 21888242871839275222246405745257275088548364400416034343698204186575808495617
		const FIELD_MODULUS = "0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001";
		const testProof = {
			a: [
				"0x1234567890123456789012345678901234567890123456789012345678901234",
				"0x2345678901234567890123456789012345678901234567890123456789012345"
			],
			b: [
				[
					"0x3456789012345678901234567890123456789012345678901234567890123456",
					"0x4567890123456789012345678901234567890123456789012345678901234567"
				],
				[
					"0x5678901234567890123456789012345678901234567890123456789012345678",
					"0x6789012345678901234567890123456789012345678901234567890123456789"
				]
			],
			c: [
				"0x7890123456789012345678901234567890123456789012345678901234567890",
				"0x8901234567890123456789012345678901234567890123456789012345678901"
			],
			input: [
				"0x1111111111111111111111111111111111111111111111111111111111111111", // commitment
				"0x2222222222222222222222222222222222222222222222222222222222222222", // nullifier
				0, // candidateIndex
				0, // electionId
			]
		};
		
		try {
			const isValid = await verifier.verifyProof(
				testProof.a,
				testProof.b,
				testProof.c,
				testProof.input
			);
			console.log("Test proof verification:", isValid ? "✅ PASSED" : "❌ FAILED");
		} catch (error: any) {
			console.log("Test proof verification:", "❌ FAILED");
			console.log("Error:", error.message);
		}
	}

	const network = await ethers.provider.getNetwork();
	const deploymentInfo = {
		network: hre.network.name,
		chainId: Number(network.chainId),
		contract: {
			Verifier: await verifier.getAddress(),
		},
		deployer: deployer.address,
		deployedAt: new Date().toISOString(),
		verifierType: useGeneratedVerifier ? "Generated (Noir)" : "RealZKVerifier (Intermediate)",
		note: useGeneratedVerifier 
			? "Full ZK verification with pairing checks"
			: "Cryptographic validation only - compile Noir circuit for full ZK verification"
	};

	console.log("\n=== Deployment Summary ===");
	console.log(JSON.stringify(deploymentInfo, null, 2));

	console.log("\n📋 Contract Address:");
	console.log("Verifier:", await verifier.getAddress());
	
	console.log("\n🎯 Next Steps:");
	if (!useGeneratedVerifier) {
		console.log("1. Compile Noir circuit: cd circuits/voting-circuit && nargo compile");
		console.log("2. Generate verifier: nargo codegen-verifier");
		console.log("3. Copy generated verifier to contracts directory");
		console.log("4. Redeploy using generated verifier");
	}
	console.log("5. Update election contract: npm run set:verifier:polygon");
	console.log("6. Test voting flow with real verifier");
	
	console.log("\n⚠️  IMPORTANT:");
	console.log("   - RealZKVerifier performs cryptographic checks but NOT full ZK verification");
	console.log("   - For production, use the verifier generated from Noir circuit");
	console.log("   - The generated verifier includes pairing checks for full ZK proof verification");
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

