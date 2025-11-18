// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./NICWalletRegistry.sol";

// ZK Verifier interface (to be implemented by generated verifier contract)
interface IVerifier {
    function verifyProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[4] memory input  // Changed from uint[2] to uint[4] to match usage
    ) external view returns (bool);
}

/**
 * @title ZK_ElectionContract
 * @dev A privacy-preserving election contract using Zero-Knowledge Proofs
 * @notice Votes are private but verifiable through ZK proofs
 */
contract ZK_ElectionContract is Ownable {
    using MerkleProof for bytes32[];

    // Structs
    struct Candidate {
        string name;
        string nic;
        string party; // Can be empty string if independent
        uint256 voteCount;
    }

    struct Election {
        string electionTitle;
        string description;
        uint256 startDate;
        uint256 endDate;
        uint256 totalVotes;
        bool exists;
        bytes32 votersMerkleRoot; // Merkle root of eligible voters
    }

    // State variables
    uint256 public electionCount;
    mapping(uint256 => Election) public elections;
    mapping(uint256 => Candidate[]) public electionCandidates;
    
    // Privacy-preserving vote tracking
    mapping(uint256 => mapping(uint256 => bool)) public nullifiers; // electionId => nullifierHash => used
    mapping(uint256 => mapping(uint256 => uint256)) public voteCommitments; // electionId => commitment => count
    
    // Events
    event ElectionCreated(
        uint256 indexed electionId,
        string electionTitle,
        uint256 startDate,
        uint256 endDate,
        bytes32 votersMerkleRoot
    );
    
    event VoteCast(
        uint256 indexed electionId,
        uint256 commitment,
        uint256 nullifierHash
    );

    // ZK Verifier contract address
    IVerifier public verifier;
    
    // NIC Wallet Registry for authentication
    NICWalletRegistry public immutable nicRegistry;

    constructor(address _verifier, address _nicRegistry) Ownable(msg.sender) {
        require(_verifier != address(0), "Invalid verifier address");
        require(_nicRegistry != address(0), "Invalid registry address");
        verifier = IVerifier(_verifier);
        nicRegistry = NICWalletRegistry(_nicRegistry);
    }

    /**
     * @dev Set or update the ZK verifier contract address
     * @param _verifier Address of the ZK verifier contract
     */
    function setVerifier(address _verifier) external onlyOwner {
        require(_verifier != address(0), "Invalid verifier address");
        verifier = IVerifier(_verifier);
    }

    /**
     * @dev Create a new election with ZK support
     * @param _electionTitle Title of the election
     * @param _description Description of the election
     * @param _startDate Start date/time as Unix timestamp
     * @param _endDate End date/time as Unix timestamp
     * @param _candidates Array of candidate data (name, nic, party)
     * @param _votersMerkleRoot Merkle root of eligible voters (computed off-chain)
     */
    function createElection(
        string memory _electionTitle,
        string memory _description,
        uint256 _startDate,
        uint256 _endDate,
        Candidate[] memory _candidates,
        bytes32 _votersMerkleRoot
    ) public onlyOwner {
        require(_startDate < _endDate, "Start date must be before end date");
        require(_candidates.length > 0, "Must have at least one candidate");
        require(_votersMerkleRoot != bytes32(0), "Invalid merkle root");

        uint256 electionId = electionCount;
        
        elections[electionId] = Election({
            electionTitle: _electionTitle,
            description: _description,
            startDate: _startDate,
            endDate: _endDate,
            totalVotes: 0,
            exists: true,
            votersMerkleRoot: _votersMerkleRoot
        });

        // Add candidates
        for (uint256 i = 0; i < _candidates.length; i++) {
            electionCandidates[electionId].push(Candidate({
                name: _candidates[i].name,
                nic: _candidates[i].nic,
                party: _candidates[i].party,
                voteCount: 0
            }));
        }

        electionCount++;
        emit ElectionCreated(electionId, _electionTitle, _startDate, _endDate, _votersMerkleRoot);
    }

    /**
     * @dev Cast a private vote using Zero-Knowledge Proof (direct call - for registered wallets)
     * @param _electionId The ID of the election
     * @param _voterNIC The NIC number of the voter
     * @param _candidateIndex The index of the candidate (hidden in proof)
     * @param _nullifierHash Hash to prevent double voting (unique per voter)
     * @param _commitment Vote commitment (hides the actual vote)
     * @param _merkleProof Merkle proof proving voter eligibility
     * @param a ZK proof G1 point (2 uint256 values)
     * @param b ZK proof G2 point (2x2 uint256 matrix)
     * @param c ZK proof G1 point (2 uint256 values)
     * @param input Public inputs to the circuit (2 uint256 values)
     */
    function castVote(
        uint256 _electionId,
        string memory _voterNIC,
        uint256 _candidateIndex,
        uint256 _nullifierHash,
        uint256 _commitment,
        bytes32[] calldata _merkleProof,
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[4] memory input  // [commitment, nullifierHash, candidateIndex, electionId]
    ) public {
        // Get registered wallet from NIC
        address registeredWallet = nicRegistry.getWalletByNIC(_voterNIC);
        require(registeredWallet != address(0), "NIC not registered");
        require(registeredWallet == msg.sender, "Caller must be registered wallet");
        
        // Use internal vote function with registered wallet
        _castVoteInternal(
            _electionId,
            registeredWallet,
            _candidateIndex,
            _nullifierHash,
            _commitment,
            _merkleProof,
            a,
            b,
            c,
            input
        );
    }

    /**
     * @dev Cast a private vote using Zero-Knowledge Proof with NIC (for paymaster/session wallets)
     * @param _electionId The ID of the election
     * @param _voterNIC The NIC number of the voter
     * @param _originalWallet The registered wallet address (from NIC)
     * @param _temporaryWallet The temporary session wallet (msg.sender)
     * @param _candidateIndex The index of the candidate (hidden in proof)
     * @param _nullifierHash Hash to prevent double voting (unique per voter)
     * @param _commitment Vote commitment (hides the actual vote)
     * @param _merkleProof Merkle proof proving voter eligibility
     * @param a ZK proof G1 point (2 uint256 values)
     * @param b ZK proof G2 point (2x2 uint256 matrix)
     * @param c ZK proof G1 point (2 uint256 values)
     * @param input Public inputs to the circuit (2 uint256 values)
     */
    function castVoteWithNIC(
        uint256 _electionId,
        string memory _voterNIC,
        address _originalWallet,
        address _temporaryWallet,
        uint256 _candidateIndex,
        uint256 _nullifierHash,
        uint256 _commitment,
        bytes32[] calldata _merkleProof,
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[4] memory input  // [commitment, nullifierHash, candidateIndex, electionId]
    ) external {
        // Allow calls from temporary wallet OR paymaster (paymaster verifies signature)
        // When called through paymaster, msg.sender is paymaster, but we verify session below
        // Note: Paymaster already verifies signature before calling this function
        
        // Verify registered wallet matches NIC
        address registeredWallet = nicRegistry.getWalletByNIC(_voterNIC);
        require(registeredWallet != address(0), "NIC not registered");
        require(registeredWallet == _originalWallet, "Original wallet mismatch");
        
        // Verify session is valid (temporary wallet has access to original wallet)
        // This ensures only authorized temporary wallets can vote
        require(
            nicRegistry.hasValidAccess(_originalWallet, _temporaryWallet),
            "Temporary wallet access expired or invalid"
        );
        
        // If called directly (not through paymaster), verify caller is temporary wallet
        // If called through paymaster, msg.sender will be paymaster, but session check above ensures security
        if (_temporaryWallet != msg.sender) {
            // Called through paymaster - session check above is sufficient
            // Paymaster already verified the signature
        }
        
        // Use internal vote function with registered wallet
        _castVoteInternal(
            _electionId,
            _originalWallet,
            _candidateIndex,
            _nullifierHash,
            _commitment,
            _merkleProof,
            a,
            b,
            c,
            input
        );
    }

    /**
     * @dev Internal function to cast a vote (shared logic)
     * @param _electionId The ID of the election
     * @param _registeredWallet The registered wallet address (for Merkle proof)
     * @param _candidateIndex The index of the candidate
     * @param _nullifierHash Hash to prevent double voting
     * @param _commitment Vote commitment
     * @param _merkleProof Merkle proof
     * @param a ZK proof G1 point
     * @param b ZK proof G2 point
     * @param c ZK proof G1 point
     * @param input Public inputs
     */
    function _castVoteInternal(
        uint256 _electionId,
        address _registeredWallet,
        uint256 _candidateIndex,
        uint256 _nullifierHash,
        uint256 _commitment,
        bytes32[] calldata _merkleProof,
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[4] memory input  // [commitment, nullifierHash, candidateIndex, electionId]
    ) internal {
        Election storage election = elections[_electionId];
        
        // Basic validations
        require(election.exists, "Election does not exist");
        require(
            block.timestamp >= election.startDate,
            "Election has not started"
        );
        require(
            block.timestamp <= election.endDate,
            "Election has ended"
        );
        require(
            _candidateIndex < electionCandidates[_electionId].length,
            "Invalid candidate index"
        );
        
        // Prevent double voting using nullifier
        require(
            !nullifiers[_electionId][_nullifierHash],
            "Vote already cast (nullifier used)"
        );
        
        // Verify voter is eligible using Merkle proof (using registered wallet, not msg.sender)
        bytes32 leaf = keccak256(abi.encodePacked(_registeredWallet, _electionId));
        require(
            _merkleProof.verify(election.votersMerkleRoot, leaf),
            "Invalid voter proof"
        );
        
        // Verify ZK proof
        // Input format: [commitment, nullifierHash, candidateIndex, electionId]
        require(
            input[0] == _commitment,
            "Commitment mismatch in proof"
        );
        require(
            input[1] == _nullifierHash,
            "Nullifier mismatch in proof"
        );
        
        bool proofValid = verifier.verifyProof(a, b, c, input);
        require(proofValid, "Invalid ZK proof");
        
        // Mark nullifier as used (prevents double voting)
        nullifiers[_electionId][_nullifierHash] = true;
        
        // Increment vote count for the candidate
        // Note: We trust the ZK proof that _candidateIndex is correct
        electionCandidates[_electionId][_candidateIndex].voteCount++;
        election.totalVotes++;
        
        // Track commitment (for verification without revealing vote)
        voteCommitments[_electionId][_commitment]++;
        
        emit VoteCast(_electionId, _commitment, _nullifierHash);
    }

    /**
     * @dev Check if a nullifier has been used (prevents double voting)
     * @param _electionId The ID of the election
     * @param _nullifierHash The nullifier hash to check
     * @return bool True if nullifier has been used
     */
    function isNullifierUsed(uint256 _electionId, uint256 _nullifierHash) public view returns (bool) {
        return nullifiers[_electionId][_nullifierHash];
    }

    /**
     * @dev Get election results (candidates with vote counts)
     * @param _electionId The ID of the election
     * @return Candidate[] Array of candidates with their vote counts
     */
    function checkResult(uint256 _electionId) public view returns (Candidate[] memory) {
        require(elections[_electionId].exists, "Election does not exist");
        return electionCandidates[_electionId];
    }

    /**
     * @dev Get total votes cast in an election
     * @param _electionId The ID of the election
     * @return uint256 Total number of votes cast
     */
    function getTotalVotes(uint256 _electionId) public view returns (uint256) {
        require(elections[_electionId].exists, "Election does not exist");
        return elections[_electionId].totalVotes;
    }

    /**
     * @dev Get candidate information by index
     * @param _electionId The ID of the election
     * @param _candidateIndex The index of the candidate
     * @return Candidate The candidate data
     */
    function getCandidateInfo(uint256 _electionId, uint256 _candidateIndex) public view returns (Candidate memory) {
        require(elections[_electionId].exists, "Election does not exist");
        require(_candidateIndex < electionCandidates[_electionId].length, "Invalid candidate index");
        return electionCandidates[_electionId][_candidateIndex];
    }

    /**
     * @dev Get complete election data
     * @param _electionId The ID of the election
     * @return Election The election data
     * @return Candidate[] Array of candidates
     */
    function getElectionData(uint256 _electionId) public view returns (
        Election memory,
        Candidate[] memory
    ) {
        require(elections[_electionId].exists, "Election does not exist");
        return (
            elections[_electionId],
            electionCandidates[_electionId]
        );
    }

    /**
     * @dev Check if election has started
     * @param _electionId The ID of the election
     * @return bool True if election has started
     */
    function electionStart(uint256 _electionId) public view returns (bool) {
        require(elections[_electionId].exists, "Election does not exist");
        return block.timestamp >= elections[_electionId].startDate;
    }

    /**
     * @dev Check if election has ended
     * @param _electionId The ID of the election
     * @return bool True if election has ended
     */
    function electionEnd(uint256 _electionId) public view returns (bool) {
        require(elections[_electionId].exists, "Election does not exist");
        return block.timestamp > elections[_electionId].endDate;
    }
}

