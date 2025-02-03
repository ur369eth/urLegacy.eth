// contracts/mocks/StableCoinMock.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract StableCoinMock is ERC20 {
    uint8 private _decimals;

    constructor(
        uint256 initialSupply,
        uint8 decimals_
    ) ERC20("StableCoin", "SC") {
        _decimals = decimals_;
        _mint(msg.sender, initialSupply);
    }

    function mint(uint256 amount) public {
        _mint(msg.sender, amount);
    }

    function decimals() public view override returns (uint8 decimals_) {
        decimals_ = _decimals;
    }
}
