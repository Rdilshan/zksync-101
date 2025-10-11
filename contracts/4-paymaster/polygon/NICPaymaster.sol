// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./NICWalletRegistry.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title NICPaymaster
 * @dev Enhanced paymaster that works with NIC-based wallet system
 * @notice This paymaster allows both direct wallet transactions and temporary wallet transactions
 */
contract NICPaymaster is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    NICWalletRegistry public immutable walletRegistry;
    
    // Track nonces to prevent replay attacks
    mapping(address => uint256) public nonces;
    
    // Track temporary wallet nonces separately
    mapping(address => uint256) public tempWalletNonces;
    
    // Track temporary wallet to original wallet relationships
    mapping(address => address) public tempWalletToOriginal;

    // Events
    event MetaTransactionExecuted(
        address indexed user,
        address indexed target,
        uint256 nonce,
        bool success,
        bytes returnData
    );
    
    event TemporaryWalletTransactionExecuted(
        address indexed originalWallet,
        address indexed temporaryWallet,
        address indexed target,
        uint256 nonce,
        bool success,
        bytes returnData
    );

    event FundsDeposited(address indexed depositor, uint256 amount);
    event FundsWithdrawn(address indexed owner, uint256 amount);

    constructor(address _walletRegistry) Ownable(msg.sender) {
        require(_walletRegistry != address(0), "Invalid registry address");
        walletRegistry = NICWalletRegistry(_walletRegistry);
    }

    /**
     * @dev Execute a meta-transaction on behalf of a user (original functionality)
     * @param user The address of the user who signed the transaction
     * @param target The contract address to call
     * @param value The ETH value to send with the transaction
     * @param data The function call data
     * @param signature The user's signature authorizing this transaction
     */
    function executeMetaTransaction(
        address user,
        address target,
        uint256 value,
        bytes memory data,
        bytes memory signature
    ) public returns (bool success, bytes memory returnData) {
        // Get the current nonce for this user
        uint256 currentNonce = nonces[user];

        // Create the message hash
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                user,
                target,
                value,
                data,
                currentNonce,
                address(this)
            )
        );

        // Convert to Ethereum signed message hash
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();

        // Verify the signature
        address recoveredSigner = ethSignedMessageHash.recover(signature);
        require(recoveredSigner == user, "Invalid signature");

        // Increment nonce to prevent replay attacks
        nonces[user]++;

        // Execute the transaction
        (success, returnData) = target.call{value: value}(data);

        emit MetaTransactionExecuted(user, target, currentNonce, success, returnData);

        return (success, returnData);
    }

    /**
     * @dev Execute a meta-transaction using temporary wallet on behalf of original wallet
     * @param originalWallet The original wallet that owns the assets
     * @param temporaryWallet The temporary wallet that signed the transaction
     * @param target The contract address to call
     * @param value The ETH value to send with the transaction
     * @param data The function call data
     * @param signature The temporary wallet's signature
     */
    function executeTemporaryWalletTransaction(
        address originalWallet,
        address temporaryWallet,
        address target,
        uint256 value,
        bytes memory data,
        bytes memory signature
    ) public returns (bool success, bytes memory returnData) {
        // Verify that the temporary wallet has valid access
        require(
            walletRegistry.hasValidAccess(originalWallet, temporaryWallet),
            "Temporary wallet access expired or invalid"
        );

        // Get the current nonce for this temporary wallet
        uint256 currentNonce = tempWalletNonces[temporaryWallet];

        // Create the message hash (includes both wallets for security)
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                originalWallet,
                temporaryWallet,
                target,
                value,
                data,
                currentNonce,
                address(this)
            )
        );

        // Convert to Ethereum signed message hash
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();

        // Verify the signature from temporary wallet
        address recoveredSigner = ethSignedMessageHash.recover(signature);
        require(recoveredSigner == temporaryWallet, "Invalid temporary wallet signature");

        // Increment nonce to prevent replay attacks
        tempWalletNonces[temporaryWallet]++;

        // Execute the transaction directly with the provided data
        // The data should already be properly formatted with the original wallet parameter
        (success, returnData) = target.call{value: value}(data);

        emit TemporaryWalletTransactionExecuted(
            originalWallet, 
            temporaryWallet, 
            target, 
            currentNonce, 
            success, 
            returnData
        );

        return (success, returnData);
    }

    /**
     * @dev Execute meta-transaction with user parameter (enhanced version)
     * @param user The address of the user who signed the transaction
     * @param target The contract address to call
     * @param value The ETH value to send with the transaction
     * @param functionSelector The function selector to call
     * @param additionalData Additional data to append after the user parameter
     * @param signature The user's signature authorizing this transaction
     */
    function executeMetaTransactionWithUser(
        address user,
        address target,
        uint256 value,
        bytes4 functionSelector,
        bytes memory additionalData,
        bytes memory signature
    ) public returns (bool success, bytes memory returnData) {
        // Check if this is a temporary wallet transaction
        // We can detect this by checking if the user has valid access to another wallet
        address originalWallet = _findOriginalWallet(user);
        
        if (originalWallet != address(0) && originalWallet != user) {
            // This is a temporary wallet transaction
            bytes memory data = abi.encodePacked(functionSelector, abi.encode(originalWallet), additionalData);
            return executeTemporaryWalletTransaction(originalWallet, user, target, value, data, signature);
        } else {
            // This is a regular transaction
            bytes memory data = abi.encodePacked(functionSelector, abi.encode(user), additionalData);
            return executeMetaTransaction(user, target, value, data, signature);
        }
    }

    /**
     * @dev Register a temporary wallet relationship
     * @param temporaryWallet The temporary wallet address
     * @param originalWallet The original wallet address
     */
    function registerTemporaryWallet(address temporaryWallet, address originalWallet) external {
        require(temporaryWallet != address(0), "Invalid temporary wallet");
        require(originalWallet != address(0), "Invalid original wallet");
        require(
            walletRegistry.hasValidAccess(originalWallet, temporaryWallet),
            "Temporary wallet access not valid"
        );
        
        tempWalletToOriginal[temporaryWallet] = originalWallet;
    }

    /**
     * @dev Find the original wallet for a temporary wallet
     * @param temporaryWallet The temporary wallet address
     * @return The original wallet address, or address(0) if not found
     */
    function _findOriginalWallet(address temporaryWallet) private view returns (address) {
        return tempWalletToOriginal[temporaryWallet];
    }

    /**
     * @dev Get the current nonce for a user
     */
    function getNonce(address user) public view returns (uint256) {
        return nonces[user];
    }

    /**
     * @dev Get the current nonce for a temporary wallet
     */
    function getTempWalletNonce(address tempWallet) public view returns (uint256) {
        return tempWalletNonces[tempWallet];
    }

    /**
     * @dev Execute gasless transaction for temporary wallet (relayer pays gas)
     * @param originalWallet The original wallet that owns the assets
     * @param temporaryWallet The temporary wallet that signed the transaction
     * @param target The contract address to call
     * @param value The ETH value to send with the transaction
     * @param data The function call data
     * @param signature The temporary wallet's signature
     */
    function executeGaslessTemporaryTransaction(
        address originalWallet,
        address temporaryWallet,
        address target,
        uint256 value,
        bytes memory data,
        bytes memory signature
    ) external returns (bool success, bytes memory returnData) {
        // Verify that the temporary wallet has valid access
        require(
            walletRegistry.hasValidAccess(originalWallet, temporaryWallet),
            "Temporary wallet access expired or invalid"
        );

        // Get the current nonce for this temporary wallet
        uint256 currentNonce = tempWalletNonces[temporaryWallet];

        // Create the message hash (includes both wallets for security)
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                originalWallet,
                temporaryWallet,
                target,
                value,
                data,
                currentNonce,
                address(this)
            )
        );

        // Convert to Ethereum signed message hash
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();

        // Verify the signature from temporary wallet
        address recoveredSigner = ethSignedMessageHash.recover(signature);
        require(recoveredSigner == temporaryWallet, "Invalid temporary wallet signature");

        // Increment nonce to prevent replay attacks
        tempWalletNonces[temporaryWallet]++;

        // Execute the transaction directly with the provided data
        // The data should already be properly formatted with the original wallet parameter
        (success, returnData) = target.call{value: value}(data);

        emit TemporaryWalletTransactionExecuted(
            originalWallet, 
            temporaryWallet, 
            target, 
            currentNonce, 
            success, 
            returnData
        );

        return (success, returnData);
    }

    /**
     * @dev Deposit funds to the paymaster for covering gas fees
     */
    function deposit() public payable {
        require(msg.value > 0, "Must deposit some ETH");
        emit FundsDeposited(msg.sender, msg.value);
    }

    /**
     * @dev Withdraw funds from the paymaster (owner only)
     */
    function withdraw(address payable to, uint256 amount) public onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(amount <= address(this).balance, "Insufficient balance");
        
        to.transfer(amount);
        emit FundsWithdrawn(to, amount);
    }

    /**
     * @dev Get the balance of this paymaster contract
     */
    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @dev Allow the contract to receive ETH
     */
    receive() external payable {
        emit FundsDeposited(msg.sender, msg.value);
    }
}
