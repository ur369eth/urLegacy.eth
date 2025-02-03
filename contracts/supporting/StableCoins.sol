// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract BUSD is ERC20 {
    constructor() ERC20("BUSD", "BUSD") {}

    function mint(uint256 amount) public {
        _mint(msg.sender, amount);
    }
}

contract GHO is ERC20 {
    constructor() ERC20("GHO", "GHO") {}

    function mint(uint256 amount) public {
        _mint(msg.sender, amount);
    }
}

contract USDT is ERC20 {
    uint8 private _decimals;

    constructor(uint8 decimals_) ERC20("USDT", "USDT") {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(uint256 amount) public {
        _mint(msg.sender, amount);
    }
}
