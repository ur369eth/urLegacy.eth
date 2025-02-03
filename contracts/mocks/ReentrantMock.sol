// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.0;

// import "../Legacy.sol";
// event ReentrancyAttempted();

// contract ReentrantMock {
//     Legacy public legacy;
//     bool private isAttackOngoing = false;

//     event ReentrancyAttempted();

//     constructor(address _legacyAddress) {
//         legacy = Legacy(_legacyAddress);
//     }

//     // Fallback function triggers during reentrancy
//     fallback() external payable {
//         console.log("Fallback triggered");
//         if (!isAttackOngoing) {
//             isAttackOngoing = true;
//             console.log("Attempting reentrancy attack");
//             emit ReentrancyAttempted();
//             legacy.activateSubscription{value: msg.value}(
//                 address(0),
//                 address(0), 
//             ); // Attempt reentrant call
//         }
//     }

//     function attack() external payable {
//         require(msg.value > 0, "Must send ETH to attack");
//         console.log("Calling activateSubscription with overpayment");

//         // First call to activateSubscription, which will trigger fallback if it sends ETH back
//         legacy.activateSubscription{value: msg.value}(
//             address(this),
//             address(0)
//         );
//     }

//     receive() external payable {}
// }
