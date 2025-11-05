// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ElectionContract
 * @dev A smart contract for managing elections with candidates and voters
 */
contract ElectionContract is Ownable {
    // Structs
    struct Candidate {
        string name;
        string nic;
        string party; // Can be empty string if independent
        uint256 voteCount;
    }

    struct Voter {
        string nic;
        bool hasVoted;
        uint256 candidateIndex; // Which candidate they voted for
    }

    struct Election {
        string electionTitle;
        string description;
        uint256 startDate;
        uint256 endDate;
        uint256 totalVotes;
        bool exists;
    }

    // State variables
    uint256 public electionCount;
    mapping(uint256 => Election) public elections;
    mapping(uint256 => Candidate[]) public electionCandidates;
    mapping(uint256 => mapping(string => Voter)) public electionVoters; // electionId => nic => Voter
    mapping(uint256 => string[]) public electionVoterNICs; // electionId => array of NICs

    // Events
    event ElectionCreated(
        uint256 indexed electionId,
        string electionTitle,
        uint256 startDate,
        uint256 endDate
    );
    
    event VoteCast(
        uint256 indexed electionId,
        string voterNIC,
        uint256 candidateIndex
    );

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Create a new election (only owner)
     * @param _electionTitle Title of the election
     * @param _description Description of the election
     * @param _startDate Start date/time as Unix timestamp
     * @param _endDate End date/time as Unix timestamp
     * @param _candidates Array of candidate data (name, nic, party)
     * @param _voterNICs Array of voter NICs
     */
    function createElection(
        string memory _electionTitle,
        string memory _description,
        uint256 _startDate,
        uint256 _endDate,
        Candidate[] memory _candidates,
        string[] memory _voterNICs
    ) public onlyOwner {
        require(_startDate < _endDate, "Start date must be before end date");
        require(_candidates.length > 0, "Must have at least one candidate");
        require(_voterNICs.length > 0, "Must have at least one voter");

        uint256 electionId = electionCount;
        
        elections[electionId] = Election({
            electionTitle: _electionTitle,
            description: _description,
            startDate: _startDate,
            endDate: _endDate,
            totalVotes: 0,
            exists: true
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

        // Add voters
        for (uint256 i = 0; i < _voterNICs.length; i++) {
            electionVoters[electionId][_voterNICs[i]] = Voter({
                nic: _voterNICs[i],
                hasVoted: false,
                candidateIndex: 0
            });
            electionVoterNICs[electionId].push(_voterNICs[i]);
        }

        electionCount++;
        emit ElectionCreated(electionId, _electionTitle, _startDate, _endDate);
    }

    /**
     * @dev Cast a vote in an election
     * @param _electionId The ID of the election
     * @param _voterNIC The NIC of the voter
     * @param _candidateIndex The index of the candidate being voted for
     */
    function vote(
        uint256 _electionId,
        string memory _voterNIC,
        uint256 _candidateIndex
    ) public {
        require(elections[_electionId].exists, "Election does not exist");
        require(
            block.timestamp >= elections[_electionId].startDate,
            "Election has not started"
        );
        require(
            block.timestamp <= elections[_electionId].endDate,
            "Election has ended"
        );
        require(
            bytes(electionVoters[_electionId][_voterNIC].nic).length > 0,
            "Voter not registered"
        );
        require(
            !electionVoters[_electionId][_voterNIC].hasVoted,
            "Voter has already voted"
        );
        require(
            _candidateIndex < electionCandidates[_electionId].length,
            "Invalid candidate index"
        );

        // Record the vote
        electionVoters[_electionId][_voterNIC].hasVoted = true;
        electionVoters[_electionId][_voterNIC].candidateIndex = _candidateIndex;
        electionCandidates[_electionId][_candidateIndex].voteCount++;
        elections[_electionId].totalVotes++;

        emit VoteCast(_electionId, _voterNIC, _candidateIndex);
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

    /**
     * @dev Get how many votes have been cast in an election
     * @param _electionId The ID of the election
     * @return uint256 Total number of votes cast
     */
    function getCurrentVoteCount(uint256 _electionId) public view returns (uint256) {
        require(elections[_electionId].exists, "Election does not exist");
        return elections[_electionId].totalVotes;
    }

    /**
     * @dev Check if a NIC is registered as a voter in an election
     * @param _electionId The ID of the election
     * @param _nic The NIC to check
     * @return bool True if voter is registered
     */
    function checkVoter(uint256 _electionId, string memory _nic) public view returns (bool) {
        require(elections[_electionId].exists, "Election does not exist");
        return bytes(electionVoters[_electionId][_nic].nic).length > 0;
    }

    /**
     * @dev Check if a voter has already voted
     * @param _electionId The ID of the election
     * @param _nic The NIC of the voter
     * @return bool True if voter has voted
     */
    function hasVoted(uint256 _electionId, string memory _nic) public view returns (bool) {
        require(elections[_electionId].exists, "Election does not exist");
        return electionVoters[_electionId][_nic].hasVoted;
    }

    /**
     * @dev Check if a candidate exists in an election
     * @param _electionId The ID of the election
     * @param _nic The NIC of the candidate
     * @return bool True if candidate exists
     */
    function checkCandidate(uint256 _electionId, string memory _nic) public view returns (bool) {
        require(elections[_electionId].exists, "Election does not exist");
        Candidate[] memory candidates = electionCandidates[_electionId];
        for (uint256 i = 0; i < candidates.length; i++) {
            if (keccak256(bytes(candidates[i].nic)) == keccak256(bytes(_nic))) {
                return true;
            }
        }
        return false;
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
     * @dev Get all election IDs
     * @return uint256[] Array of all election IDs
     */
    function getAllElectionList() public view returns (uint256[] memory) {
        uint256[] memory electionIds = new uint256[](electionCount);
        for (uint256 i = 0; i < electionCount; i++) {
            electionIds[i] = i;
        }
        return electionIds;
    }

    /**
     * @dev Get complete election data
     * @param _electionId The ID of the election
     * @return Election The election data
     * @return Candidate[] Array of candidates
     * @return uint256 Number of registered voters
     */
    function getElectionData(uint256 _electionId) public view returns (
        Election memory,
        Candidate[] memory,
        uint256
    ) {
        require(elections[_electionId].exists, "Election does not exist");
        return (
            elections[_electionId],
            electionCandidates[_electionId],
            electionVoterNICs[_electionId].length
        );
    }

    /**
     * @dev Get voter information
     * @param _electionId The ID of the election
     * @param _nic The NIC of the voter
     * @return Voter The voter data
     */
    function getVoterInfo(uint256 _electionId, string memory _nic) public view returns (Voter memory) {
        require(elections[_electionId].exists, "Election does not exist");
        require(bytes(electionVoters[_electionId][_nic].nic).length > 0, "Voter not found");
        return electionVoters[_electionId][_nic];
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
     * @dev Get candidate information by NIC
     * @param _electionId The ID of the election
     * @param _nic The NIC of the candidate
     * @return Candidate The candidate data
     * @return uint256 The index of the candidate
     */
    function getCandidateByNIC(uint256 _electionId, string memory _nic) public view returns (Candidate memory, uint256) {
        require(elections[_electionId].exists, "Election does not exist");
        Candidate[] memory candidates = electionCandidates[_electionId];
        for (uint256 i = 0; i < candidates.length; i++) {
            if (keccak256(bytes(candidates[i].nic)) == keccak256(bytes(_nic))) {
                return (candidates[i], i);
            }
        }
        revert("Candidate not found");
    }

    /**
     * @dev Get all elections where a voter NIC is registered
     * @param _voterNIC The NIC of the voter
     * @return uint256[] Array of election IDs where the voter is registered
     * @return Election[] Array of election data
     * @return Voter[] Array of voter information for each election
     */
    function getElectionsByVoterNIC(string memory _voterNIC) public view returns (
        uint256[] memory,
        Election[] memory,
        Voter[] memory
    ) {
        // First pass: count how many elections the voter is registered in
        uint256 count = 0;
        for (uint256 i = 0; i < electionCount; i++) {
            if (elections[i].exists && bytes(electionVoters[i][_voterNIC].nic).length > 0) {
                count++;
            }
        }

        // Initialize arrays
        uint256[] memory electionIds = new uint256[](count);
        Election[] memory electionData = new Election[](count);
        Voter[] memory voterData = new Voter[](count);

        // Second pass: populate arrays
        uint256 index = 0;
        for (uint256 i = 0; i < electionCount; i++) {
            if (elections[i].exists && bytes(electionVoters[i][_voterNIC].nic).length > 0) {
                electionIds[index] = i;
                electionData[index] = elections[i];
                voterData[index] = electionVoters[i][_voterNIC];
                index++;
            }
        }

        return (electionIds, electionData, voterData);
    }
}