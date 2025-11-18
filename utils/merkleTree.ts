import {ethers} from "ethers";
import {MerkleTree} from "merkletreejs";
import keccak256 from "keccak256";

/**
 * Create a Merkle tree for eligible voters
 * @param voterAddresses Array of REGISTERED wallet addresses (from NIC, not temporary wallets)
 * @param electionId Election ID
 * @returns Merkle tree and root hash
 * @note Uses registered wallet addresses from NICWalletRegistry, not temporary session wallets
 */
export function createVoterMerkleTree(
	voterAddresses: string[],
	electionId: number
): {tree: MerkleTree; root: Buffer} {
	// Create leaves: hash(registeredWalletAddress, electionId)
	// IMPORTANT: voterAddresses must be REGISTERED wallet addresses (from NIC)
	const leaves = voterAddresses.map((address) => {
		const packed = ethers.solidityPacked(
			["address", "uint256"],
			[address, electionId]
		);
		return keccak256(packed);
	});

	// Create Merkle tree
	const tree = new MerkleTree(leaves, keccak256, {sortPairs: true});

	return {
		tree,
		root: tree.getRoot(),
	};
}

/**
 * Get Merkle proof for a voter
 * @param tree Merkle tree instance
 * @param registeredWalletAddress Voter's REGISTERED wallet address (from NIC, not temporary wallet)
 * @param electionId Election ID
 * @returns Array of proof hashes
 * @note Uses registered wallet address from NICWalletRegistry, not temporary session wallet
 */
export function getMerkleProof(
	tree: MerkleTree,
	registeredWalletAddress: string,
	electionId: number
): string[] {
	// Create leaf using registered wallet address (not temporary wallet)
	const leaf = keccak256(
		ethers.solidityPacked(
			["address", "uint256"],
			[registeredWalletAddress, electionId]
		)
	);
	const proof = tree.getProof(leaf);
	return proof.map((p: any) => "0x" + p.data.toString("hex"));
}

/**
 * Verify Merkle proof
 * @param root Merkle root
 * @param leaf Leaf hash
 * @param proof Merkle proof
 * @returns True if proof is valid
 */
export function verifyMerkleProof(
	root: Buffer,
	leaf: Buffer,
	proof: Buffer[]
): boolean {
	return MerkleTree.verify(proof, leaf, root, keccak256, {sortPairs: true});
}

/**
 * Generate voter secret from NIC number
 * @param nic NIC number
 * @param electionId Election ID
 * @returns Secret hash
 */
export function generateVoterSecret(nic: string, electionId: number): string {
	return ethers.keccak256(
		ethers.solidityPacked(["string", "uint256"], [nic, electionId])
	);
}

/**
 * Compute vote commitment
 * @param voterSecret Voter's secret
 * @param candidateIndex Candidate index
 * @param randomness Random value
 * @param electionId Election ID
 * @returns Commitment hash
 */
export function computeCommitment(
	voterSecret: string,
	candidateIndex: number,
	randomness: string,
	electionId: number
): string {
	return ethers.keccak256(
		ethers.solidityPacked(
			["bytes32", "uint256", "bytes32", "uint256"],
			[voterSecret, candidateIndex, randomness, electionId]
		)
	);
}

/**
 * Compute nullifier hash (prevents double voting)
 * @param voterSecret Voter's secret (generated from NIC)
 * @param electionId Election ID
 * @returns Nullifier hash
 */
export function computeNullifier(
	voterSecret: string,
	electionId: number
): string {
	return ethers.keccak256(
		ethers.solidityPacked(["bytes32", "uint256"], [voterSecret, electionId])
	);
}

/**
 * Get registered wallet addresses from NIC numbers
 * @param nicNumbers Array of NIC numbers
 * @param registryContract NICWalletRegistry contract instance
 * @returns Array of registered wallet addresses
 * @note Helper function to get registered wallets for Merkle tree creation
 */
export async function getRegisteredWalletsFromNICs(
	nicNumbers: string[],
	registryContract: any
): Promise<string[]> {
	const registeredWallets: string[] = [];

	for (const nic of nicNumbers) {
		try {
			const wallet = await registryContract.getWalletByNIC(nic);
			if (wallet && wallet !== ethers.ZeroAddress) {
				registeredWallets.push(wallet);
			}
		} catch (error) {
			console.warn(`Failed to get wallet for NIC ${nic}:`, error);
		}
	}

	return registeredWallets;
}
