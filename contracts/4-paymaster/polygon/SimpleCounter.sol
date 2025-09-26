// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title SimpleCounter
 * @dev A simple counter contract to test meta-transactions
 */
contract SimpleCounter {
    uint256 public counter;
    mapping(address => uint256) public userCounters;

    event CounterIncremented(address indexed user, uint256 newValue);
    event CounterReset(address indexed user);

    /**
     * @dev Increment the global counter
     */
    function increment() public {
        counter++;
        userCounters[msg.sender]++;
        emit CounterIncremented(msg.sender, counter);
    }

    /**
     * @dev Increment by a specific amount
     */
    function incrementBy(uint256 amount) public {
        counter += amount;
        userCounters[msg.sender] += amount;
        emit CounterIncremented(msg.sender, counter);
    }

    /**
     * @dev Reset user's counter
     */
    function resetUserCounter() public {
        userCounters[msg.sender] = 0;
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
}
