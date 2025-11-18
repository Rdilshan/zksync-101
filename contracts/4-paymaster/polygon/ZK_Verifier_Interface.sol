// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ZK_Verifier_Interface
 * @dev Interface for ZK proof verification
 * @notice This interface matches the standard Groth16 verifier format
 * 
 * IMPORTANT: This is a template. You must generate the actual verifier
 * contract using:
 * - Circom + SnarkJS
 * - Noir (Aztec)
 * - Other ZK circuit compilers
 */
interface IZKVerifier {
    /**
     * @dev Verify a ZK proof
     * @param a G1 point (2 uint256 values)
     * @param b G2 point (2x2 uint256 matrix)
     * @param c G1 point (2 uint256 values)
     * @param input Public inputs to the circuit (2 uint256 values)
     * @return bool True if proof is valid
     */
    function verifyProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[4] memory input  // [commitment, nullifierHash, candidateIndex, electionId]
    ) external view returns (bool);
}


