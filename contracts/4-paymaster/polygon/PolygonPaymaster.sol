// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title PolygonPaymaster
 * @dev A meta-transaction paymaster for Polygon that enables gasless transactions
 * @notice This contract allows users to execute transactions without paying gas fees
 */
contract PolygonPaymaster is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // Track nonces to prevent replay attacks
    mapping(address => uint256) public nonces;

    // Events
    event MetaTransactionExecuted(
        address indexed user,
        address indexed target,
        uint256 nonce,
        bool success,
        bytes returnData
    );

    event FundsDeposited(address indexed depositor, uint256 amount);
    event FundsWithdrawn(address indexed owner, uint256 amount);

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Execute a meta-transaction on behalf of a user
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
     * @dev Execute a meta-transaction that includes the original user address in the call
     * This is useful for contracts that need to know the original user (not the relayer)
     */
    function executeMetaTransactionWithUser(
        address user,
        address target,
        uint256 value,
        bytes4 functionSelector,
        bytes memory additionalData,
        bytes memory signature
    ) public returns (bool success, bytes memory returnData) {
        // Get the current nonce for this user
        uint256 currentNonce = nonces[user];

        // Create the complete function call data with user address as first parameter
        bytes memory data = abi.encodePacked(functionSelector, abi.encode(user), additionalData);

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
     * @dev Get the current nonce for a user
     */
    function getNonce(address user) public view returns (uint256) {
        return nonces[user];
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
        require(address(this).balance >= amount, "Insufficient balance");
        require(to != address(0), "Invalid recipient");

        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");

        emit FundsWithdrawn(to, amount);
    }

    /**
     * @dev Get the contract's ETH balance
     */
    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @dev Emergency function to withdraw all funds (owner only)
     */
    function emergencyWithdraw() public onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");

        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Emergency withdrawal failed");

        emit FundsWithdrawn(owner(), balance);
    }

    /**
     * @dev Allow the contract to receive ETH
     */
    receive() external payable {
        emit FundsDeposited(msg.sender, msg.value);
    }

    /**
     * @dev Fallback function
     */
    fallback() external payable {
        emit FundsDeposited(msg.sender, msg.value);
    }
}
