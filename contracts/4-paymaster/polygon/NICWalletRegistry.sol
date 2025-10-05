// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title NICWalletRegistry
 * @dev A registry contract that maps NIC numbers to wallet addresses and manages temporary access
 * @notice This contract allows users to create wallets using their NIC number and manage temporary access
 */
contract NICWalletRegistry is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // Struct to store wallet information
    struct WalletInfo {
        address walletAddress;
        uint256 createdAt;
        bool isActive;
        mapping(address => bool) authorizedTemporaryWallets;
        mapping(address => uint256) temporaryWalletExpiry;
    }

    // Mapping from NIC hash to wallet info
    mapping(bytes32 => WalletInfo) private nicToWallet;
    
    // Mapping from wallet address to NIC hash (reverse lookup)
    mapping(address => bytes32) private walletToNic;
    
    // Mapping to track if a wallet address is already registered
    mapping(address => bool) private registeredWallets;

    // Session management
    mapping(address => mapping(address => uint256)) public sessionExpiry;
    mapping(address => uint256) public sessionNonce;

    // Events
    event WalletRegistered(bytes32 indexed nicHash, address indexed walletAddress, uint256 timestamp);
    event TemporaryAccessGranted(bytes32 indexed nicHash, address indexed temporaryWallet, uint256 expiryTime);
    event TemporaryAccessRevoked(bytes32 indexed nicHash, address indexed temporaryWallet);
    event SessionCreated(address indexed originalWallet, address indexed temporaryWallet, uint256 expiryTime);
    event TransactionExecuted(address indexed originalWallet, address indexed executor, address target, bytes data);

    // Constants
    uint256 public constant DEFAULT_SESSION_DURATION = 24 hours;
    uint256 public constant MAX_SESSION_DURATION = 7 days;

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Register a new wallet with NIC number
     * @param nicNumber The NIC number (will be hashed for privacy)
     * @param walletAddress The wallet address to associate with this NIC
     */
    function registerWallet(string memory nicNumber, address walletAddress) external {
        require(walletAddress != address(0), "Invalid wallet address");
        require(!registeredWallets[walletAddress], "Wallet already registered");
        
        bytes32 nicHash = keccak256(abi.encodePacked(nicNumber, block.chainid));
        require(nicToWallet[nicHash].walletAddress == address(0), "NIC already registered");

        // Store wallet information
        WalletInfo storage walletInfo = nicToWallet[nicHash];
        walletInfo.walletAddress = walletAddress;
        walletInfo.createdAt = block.timestamp;
        walletInfo.isActive = true;

        // Update reverse mapping
        walletToNic[walletAddress] = nicHash;
        registeredWallets[walletAddress] = true;

        emit WalletRegistered(nicHash, walletAddress, block.timestamp);
    }

    /**
     * @dev Get wallet address by NIC number
     * @param nicNumber The NIC number
     * @return The associated wallet address
     */
    function getWalletByNIC(string memory nicNumber) external view returns (address) {
        bytes32 nicHash = keccak256(abi.encodePacked(nicNumber, block.chainid));
        return nicToWallet[nicHash].walletAddress;
    }

    /**
     * @dev Create a temporary session for a registered wallet
     * @param nicNumber The NIC number of the original wallet
     * @param temporaryWallet The temporary wallet address that will have access
     * @param duration Session duration in seconds (max 7 days)
     */
    function createSession(
        string memory nicNumber, 
        address temporaryWallet, 
        uint256 duration
    ) external {
        require(temporaryWallet != address(0), "Invalid temporary wallet");
        require(duration <= MAX_SESSION_DURATION, "Duration too long");
        
        bytes32 nicHash = keccak256(abi.encodePacked(nicNumber, block.chainid));
        address originalWallet = nicToWallet[nicHash].walletAddress;
        require(originalWallet != address(0), "NIC not registered");
        require(nicToWallet[nicHash].isActive, "Wallet is inactive");

        // Only the original wallet owner can create sessions
        require(msg.sender == originalWallet, "Only wallet owner can create sessions");

        uint256 expiryTime = block.timestamp + (duration > 0 ? duration : DEFAULT_SESSION_DURATION);
        
        // Grant temporary access
        nicToWallet[nicHash].authorizedTemporaryWallets[temporaryWallet] = true;
        nicToWallet[nicHash].temporaryWalletExpiry[temporaryWallet] = expiryTime;
        
        // Update session mapping
        sessionExpiry[originalWallet][temporaryWallet] = expiryTime;
        sessionNonce[temporaryWallet] = block.timestamp;

        emit TemporaryAccessGranted(nicHash, temporaryWallet, expiryTime);
        emit SessionCreated(originalWallet, temporaryWallet, expiryTime);
    }

    /**
     * @dev Check if a temporary wallet has valid access to an original wallet
     * @param originalWallet The original wallet address
     * @param temporaryWallet The temporary wallet address
     * @return True if access is valid and not expired
     */
    function hasValidAccess(address originalWallet, address temporaryWallet) public view returns (bool) {
        bytes32 nicHash = walletToNic[originalWallet];
        if (nicHash == bytes32(0)) return false;
        
        return nicToWallet[nicHash].authorizedTemporaryWallets[temporaryWallet] && 
               nicToWallet[nicHash].temporaryWalletExpiry[temporaryWallet] > block.timestamp;
    }

    /**
     * @dev Execute a transaction on behalf of the original wallet
     * @param originalWallet The original wallet that owns the assets
     * @param target The contract to call
     * @param data The transaction data
     */
    function executeOnBehalf(
        address originalWallet, 
        address target, 
        bytes calldata data
    ) external returns (bool success, bytes memory returnData) {
        require(hasValidAccess(originalWallet, msg.sender), "No valid access");
        require(target != address(0), "Invalid target");

        // Execute the transaction
        (success, returnData) = target.call(data);
        
        emit TransactionExecuted(originalWallet, msg.sender, target, data);
        
        return (success, returnData);
    }

    /**
     * @dev Revoke access for a temporary wallet
     * @param nicNumber The NIC number
     * @param temporaryWallet The temporary wallet to revoke access for
     */
    function revokeAccess(string memory nicNumber, address temporaryWallet) external {
        bytes32 nicHash = keccak256(abi.encodePacked(nicNumber, block.chainid));
        address originalWallet = nicToWallet[nicHash].walletAddress;
        require(originalWallet != address(0), "NIC not registered");
        require(msg.sender == originalWallet, "Only wallet owner can revoke access");

        nicToWallet[nicHash].authorizedTemporaryWallets[temporaryWallet] = false;
        nicToWallet[nicHash].temporaryWalletExpiry[temporaryWallet] = 0;
        sessionExpiry[originalWallet][temporaryWallet] = 0;

        emit TemporaryAccessRevoked(nicHash, temporaryWallet);
    }

    /**
     * @dev Get session information
     * @param originalWallet The original wallet address
     * @param temporaryWallet The temporary wallet address
     * @return expiryTime When the session expires
     * @return isValid Whether the session is currently valid
     */
    function getSessionInfo(address originalWallet, address temporaryWallet) 
        external 
        view 
        returns (uint256 expiryTime, bool isValid) 
    {
        expiryTime = sessionExpiry[originalWallet][temporaryWallet];
        isValid = hasValidAccess(originalWallet, temporaryWallet);
    }

    /**
     * @dev Check if a wallet is registered
     * @param walletAddress The wallet address to check
     * @return True if the wallet is registered
     */
    function isWalletRegistered(address walletAddress) external view returns (bool) {
        return registeredWallets[walletAddress];
    }

    /**
     * @dev Get NIC hash for a registered wallet (for authorized users only)
     * @param walletAddress The wallet address
     * @return The NIC hash (only if caller is the wallet owner)
     */
    function getNICHash(address walletAddress) external view returns (bytes32) {
        require(msg.sender == walletAddress, "Only wallet owner can access NIC hash");
        return walletToNic[walletAddress];
    }

    /**
     * @dev Emergency function to deactivate a wallet (owner only)
     * @param nicNumber The NIC number
     */
    function deactivateWallet(string memory nicNumber) external onlyOwner {
        bytes32 nicHash = keccak256(abi.encodePacked(nicNumber, block.chainid));
        require(nicToWallet[nicHash].walletAddress != address(0), "NIC not registered");
        
        nicToWallet[nicHash].isActive = false;
    }

    /**
     * @dev Emergency function to reactivate a wallet (owner only)
     * @param nicNumber The NIC number
     */
    function reactivateWallet(string memory nicNumber) external onlyOwner {
        bytes32 nicHash = keccak256(abi.encodePacked(nicNumber, block.chainid));
        require(nicToWallet[nicHash].walletAddress != address(0), "NIC not registered");
        
        nicToWallet[nicHash].isActive = true;
    }
}
