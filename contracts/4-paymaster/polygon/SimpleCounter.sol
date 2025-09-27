// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title SimpleCounter
 * @dev A simple counter contract to test meta-transactions
 */
contract SimpleCounter {
    uint256 public counter;
    mapping(address => uint256) public userCounters;

    // Track who incremented and by how much
    mapping(address => uint256) public userIncrementCount;
    mapping(address => uint256) public userTotalIncremented;

    event CounterIncremented(address indexed user, uint256 newValue, uint256 incrementAmount);
    event CounterReset(address indexed user);

    /**
     * @dev Increment the global counter
     */
    function increment() public {
        counter++;
        userCounters[msg.sender]++;
        userIncrementCount[msg.sender]++;
        userTotalIncremented[msg.sender] += 1;
        emit CounterIncremented(msg.sender, counter, 1);
    }

    /**
     * @dev Increment the global counter on behalf of a specific user (for meta-transactions)
     */
    function incrementForUser(address originalUser) public {
        counter++;
        userCounters[originalUser]++;
        userIncrementCount[originalUser]++;
        userTotalIncremented[originalUser] += 1;
        emit CounterIncremented(originalUser, counter, 1);
    }

    /**
     * @dev Increment by a specific amount
     */
    function incrementBy(uint256 amount) public {
        counter += amount;
        userCounters[msg.sender] += amount;
        userIncrementCount[msg.sender]++;
        userTotalIncremented[msg.sender] += amount;
        emit CounterIncremented(msg.sender, counter, amount);
    }

    /**
     * @dev Increment by a specific amount on behalf of a user (for meta-transactions)
     */
    function incrementByForUser(address originalUser, uint256 amount) public {
        counter += amount;
        userCounters[originalUser] += amount;
        userIncrementCount[originalUser]++;
        userTotalIncremented[originalUser] += amount;
        emit CounterIncremented(originalUser, counter, amount);
    }

    /**
     * @dev Reset user's counter
     */
    function resetUserCounter() public {
        userCounters[msg.sender] = 0;
        userIncrementCount[msg.sender] = 0;
        userTotalIncremented[msg.sender] = 0;
        emit CounterReset(msg.sender);
    }

    /**
     * @dev Get the current counter value
     */
    function getCounter() public view returns (uint256) {
        return counter;
    }

    /**
     * @dev Get a user's counter value
     */
    function getUserCounter(address user) public view returns (uint256) {
        return userCounters[user];
    }

    /**
     * @dev Get how many times a user has incremented
     */
    function getUserIncrementCount(address user) public view returns (uint256) {
        return userIncrementCount[user];
    }

    /**
     * @dev Get total amount a user has incremented
     */
    function getUserTotalIncremented(address user) public view returns (uint256) {
        return userTotalIncremented[user];
    }

    /**
     * @dev Get comprehensive user stats
     */
    function getUserStats(address user) public view returns (
        uint256 currentCounter,
        uint256 incrementCount,
        uint256 totalIncremented
    ) {
        return (
            userCounters[user],
            userIncrementCount[user],
            userTotalIncremented[user]
        );
    }
}
