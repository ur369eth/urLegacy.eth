// contracts/mocks/AggregatorV3Mock.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract AggregatorV3Mock {
    int256 private price;

    constructor() {
        price = 3000 * 10 ** 8; // Mock price for ETH/USD (3000 USD)
    }

    function setPrice(int256 _price) public {
        price = _price;
    }

    function latestRoundData()
        public
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (0, price, 0, 0, 0);
    }
}
