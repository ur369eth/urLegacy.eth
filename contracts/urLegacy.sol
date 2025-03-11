// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "hardhat/console.sol";

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract urLegacy is Ownable, ReentrancyGuard, AutomationCompatibleInterface {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.UintSet;
    // ========================
    // Events
    // ========================
    event SubscriptionActivated(
        address indexed user,
        uint256 indexed subscriptionId,
        uint256 startTime,
        uint256 subScriptionLimit,
        address heirAddress,
        bool isPaidinNative,
        address stableToken
    );

    event SubscriptionRenewed(
        address indexed user,
        uint256 indexed subscriptionId,
        uint256 renewalTime,
        uint256 subscriptionLimit,
        bool isPaidinNative,
        address stableToken
    );

    event EthGasFeeTransfered(
        address sender,
        uint256 amount,
        uint256 subscriptionID,
        uint256 timestamp
    );
    event ETHGasFeeTransferedForTokensDeposit(
        address sender,
        // address receiver,
        uint256 tokensLength,
        uint256 amount,
        uint256 subscriptionID,
        uint256 timestamp
    );
    event StableCoinGasFeeTransfered(
        address sender,
        address token,
        uint256 amount,
        uint256 subscpriptionID,
        uint256 timestamp
    );
    event FundsDepositedinETH(
        address indexed user,
        uint256 subscriptionId,
        uint256 ethAmount,
        uint256 time
    );
    event FundsDepositedinToken(
        address indexed user,
        uint256 subscriptionId,
        address token,
        uint256 amount,
        uint256 time
    );
    event FundsDeposited_Consolidated(
        address indexed user,
        uint256 subscriptionId,
        uint256 ethAmount,
        address[] tokens,
        uint256[] amounts,
        uint256 time
    );

    event FundsWithdrawninETH(
        address indexed user,
        uint256 subscriptionId,
        uint256 ethAmount,
        uint256 time
    );
    event FundsWithdrawninToken(
        address indexed user,
        uint256 subscriptionId,
        address token,
        uint256 amount,
        uint256 time
    );
    event FundsWithdrawn_Consolidated(
        address indexed user,
        uint256 subscriptionId,
        uint256 ethAmount,
        address[] tokens,
        uint256[] amounts,
        uint256 time
    );

    event HeirChanged(
        address indexed owner,
        uint256 subscriptionId,
        uint256 time,
        address newHeir
    );

    event SubscriptionDeactivated(
        uint256 subscriptionId,
        address user,
        address heir,
        uint256 time
    );

    // ========================
    // State Variables
    // ========================

    // Global Data
    // ========================
    address public feeReceiver1 = 0x3162210648CC77ba625bC091c834BDd730fDB9a6; // 43%
    address public feeReceiver2 = 0xD6A43D33dEbE97E86f10870c95BBE45453C0ff79; // 43%
    address public keeperFeeReceiver =
        0xe4A8855fbF1f49412f63EC4e2E7B487AE3304f79; // 4%
    address public devAddress = 0x5F7B6950e5A173dDAc168b12c1Fa7fBAFb78e414; // 10%
    uint256 public gasFeeReceiverPercent = 43; // 43%
    uint256 public keeperFeeReceiverPercent = 4; // 4%
    uint256 public devAddressPercent = 10; // 10%

    // fee of activation
    uint public THRESHOLD_TIME_1 = 10 days; // For 1-10 days, user will pay 1 USD
    uint public feeForThresholdTime1 = 1; // 1 USD
    uint public THRESHOLD_TIME_2 = 20 days; // For 11-20 days, user will pay 2 USD
    uint public feeForThresholdTime2 = 2; // 2 USD
    uint public THRESHOLD_TIME_3 = 30 days; // For 21-30 days, user will pay 3 USD
    uint public feeForThresholdTime3 = 3; // 3 USD
    uint public subscriptionFeeCapThresholdDays = 200;

    uint private feeInUSDPerTokenDeposit = 2; // on each token deposit 2 USD will be transfered to fund address used to sent funds to the heir

    EnumerableSet.UintSet private activeIdsOfSystem;
    // Unique subscription ID tracker
    uint public subscriptionCounter;
    // id => boolean
    mapping(uint256 => bool) public idStatus; // id is active or not active
    mapping(uint256 => address) public idActivatedBy; // id => activator address

    AggregatorV3Interface public priceFeed; // Chainlink ETH/USD Price Feed

    // Set to store allowed stablecoins
    EnumerableSet.AddressSet private allowedStablecoins; // USDT or any other ERC20 stablecoin contract

    // Set to store user addresses
    EnumerableSet.AddressSet private users; // A set to store all unique users who enter the system

    struct Subscription {
        uint id;
        string heirName;
        uint ethBalance; // eth amount deposited in the id
        uint activationTime; // time at which id is created
        uint subscriptionTimeLimit; // times in seconds, for which this id will be activated
        address heir;
        bool activationStatus; // activation is activated or not
        mapping(address => uint256) tokenBalance; // token-address => amount
        EnumerableSet.AddressSet depositedTokens; // deposited tokens in the id
    }

    // User Related Data
    // ========================
    // userAddress => id => Subscription data
    mapping(address => mapping(uint256 => Subscription))
        private subscriptionOfUserAgainstId;
    // userAddress => all ids
    mapping(address => EnumerableSet.UintSet) private allIdsOf;
    // userAddress => active ids
    mapping(address => EnumerableSet.UintSet) private activeIdsOf;
    // userAddress => inactive ids
    mapping(address => EnumerableSet.UintSet) private inactiveIdsOf;

    // Logic Implementation
    // ========================

    constructor(address _priceFeedAddress) Ownable(msg.sender) {
        priceFeed = AggregatorV3Interface(_priceFeedAddress); // Chainlink ETH/USD price feed
    }

    // ========================
    // State-Changing Functions
    // ========================

    // Activate subscription (pay in either ETH or stablecoin)
    function activateSubscription(
        address _heir,
        string memory _heirName,
        address _stableCoin,
        uint256 _subscriptionTimeLimit,
        // deposits funds details
        uint256 _ETHDeposited, // eth amount deposited in subscription
        address[] calldata _tokens, // tokens deposited in subscription
        uint256[] calldata _amounts // amounts respective to tokens deposited in subscription
    ) public payable nonReentrant {
        address msgSender = msg.sender;
        bool payInETH = _stableCoin == address(0);
        bool isDepositInETH = _ETHDeposited > 0;
        uint256 _ETHFeeForTokensDeposit;
        if (_tokens.length > 0) {
            _ETHFeeForTokensDeposit = getDepositTokensFeeInETH(_tokens.length);
        }

        require(_heir != address(0), "Invalid heir address");
        require(
            _tokens.length == _amounts.length,
            "Tokens and amounts length mismatch"
        );

        // Activate this id to the current user and initialize the subscription
        subscriptionCounter++;
        idStatus[subscriptionCounter] = true;
        activeIdsOf[msgSender].add(subscriptionCounter);
        allIdsOf[msgSender].add(subscriptionCounter);
        idActivatedBy[subscriptionCounter] = msgSender;

        Subscription storage newSubscription = subscriptionOfUserAgainstId[
            msgSender
        ][subscriptionCounter];
        newSubscription.id = subscriptionCounter;
        newSubscription.heirName = _heirName;
        newSubscription.activationTime = block.timestamp;
        newSubscription.subscriptionTimeLimit = _subscriptionTimeLimit;
        newSubscription.activationStatus = true;
        newSubscription.heir = payable(_heir);

        uint256 feeInStableCoin = getStableCoinFee(_subscriptionTimeLimit);
        uint requiredETHFee;
        if (payInETH) {
            // Payment in ETH
            requiredETHFee = calculateETHFee(feeInStableCoin);
            uint totalFee = requiredETHFee +
                _ETHDeposited +
                _ETHFeeForTokensDeposit;
            require(msg.value >= totalFee, "Incorrect ETH amount");

            // Return extra eth back to the user
            if (msg.value > totalFee) {
                payable(msgSender).transfer(msg.value - totalFee);
            }

            emit EthGasFeeTransfered(
                msgSender,
                requiredETHFee,
                subscriptionCounter,
                block.timestamp
            );
        } else {
            // Payment in stablecoin (USDT or any other ERC20)
            require(
                allowedStablecoins.contains(_stableCoin),
                "Incorrect stablecoin address"
            );

            // Retrieve token decimals dynamically
            uint8 decimals = IERC20Metadata(_stableCoin).decimals(); // IERC20Metadata has the decimals() method

            // Adjust the required fee and gas fee based on token decimals
            uint adjustedFeeInStableCoin = feeInStableCoin /
                (10 ** (18 - decimals));

            // transfer the fee to the respective addresses
            // -----------------------------
            // 43% to each feeReceiver1 & feeReceiver2
            // 4% to keeper Fee Transfer Address
            // 10% to dev Address
            // -----------------------------
            uint _feeReceiversAmount = (adjustedFeeInStableCoin *
                gasFeeReceiverPercent) / 100; // 43%
            require(
                IERC20(_stableCoin).transferFrom(
                    msgSender,
                    feeReceiver1,
                    _feeReceiversAmount
                ),
                "Stablecoin transfer failed for gas fee"
            );
            require(
                IERC20(_stableCoin).transferFrom(
                    msgSender,
                    feeReceiver2,
                    _feeReceiversAmount
                ),
                "Stablecoin transfer failed for gas fee"
            );
            uint _keeperFeeAmount = (adjustedFeeInStableCoin *
                keeperFeeReceiverPercent) / 100;
            require(
                IERC20(_stableCoin).transferFrom(
                    msgSender,
                    keeperFeeReceiver,
                    _keeperFeeAmount
                ),
                "Stablecoin transfer failed for gas fee"
            );
            uint _remaining = adjustedFeeInStableCoin -
                (_feeReceiversAmount * 2 + _keeperFeeAmount); // remaining 10%
            require(
                IERC20(_stableCoin).transferFrom(
                    msgSender,
                    devAddress,
                    _remaining
                ),
                "Stablecoin transfer failed for gas fee"
            );

            emit StableCoinGasFeeTransfered(
                msgSender,
                _stableCoin,
                adjustedFeeInStableCoin,
                subscriptionCounter,
                block.timestamp
            );
        }

        // ---------- Deposits ------------- //
        // handle ETHs deposited
        if (isDepositInETH) {
            newSubscription.ethBalance += _ETHDeposited;
            emit FundsDepositedinETH(
                msgSender,
                subscriptionCounter,
                _ETHDeposited,
                block.timestamp
            );
        }
        if (_tokens.length > 0) {
            // transfer tokens deposits fee in ETH to fund address
            // -----------------------------
            // 43% to each feeReceiver1 & feeReceiver2
            // 4% to keeper Fee Transfer Address
            // 10% to dev Address
            // -----------------------------
            uint _totalETHFeeTransfered = requiredETHFee +
                _ETHFeeForTokensDeposit;
            uint _feeReceiversAmount = (_totalETHFeeTransfered *
                gasFeeReceiverPercent) / 100;
            payable(feeReceiver1).transfer(_feeReceiversAmount);
            payable(feeReceiver2).transfer(_feeReceiversAmount);
            uint _keeperFeeAmount = (_totalETHFeeTransfered *
                keeperFeeReceiverPercent) / 100;
            payable(keeperFeeReceiver).transfer(_keeperFeeAmount);
            uint _remaining = _totalETHFeeTransfered -
                (_feeReceiversAmount * 2 + _keeperFeeAmount); // remaining 10%
            payable(devAddress).transfer(_remaining);

            emit ETHGasFeeTransferedForTokensDeposit(
                msgSender,
                // gasFeeReceiver,
                _tokens.length,
                _ETHFeeForTokensDeposit,
                subscriptionCounter,
                block.timestamp
            );
            // loop through each token and amount
            for (uint i = 0; i < _tokens.length; i++) {
                address token = _tokens[i];
                uint amount = _amounts[i];

                require(amount > 0, "Invalid amount");

                // Add the amount to the user's balance
                require(
                    IERC20(token).transferFrom(
                        msgSender,
                        address(this),
                        amount
                    ),
                    "Token transfer failed"
                );

                newSubscription.depositedTokens.add(token); // it is first time, so there is no need to check for already added.
                newSubscription.tokenBalance[token] += amount;

                emit FundsDepositedinToken(
                    msgSender,
                    subscriptionCounter,
                    token,
                    amount,
                    block.timestamp
                );
            }
        } else {
            // transfer tokens deposits fee in ETH to fund address
            // -----------------------------
            // 43% to each feeReceiver1 & feeReceiver2
            // 4% to keeper Fee Transfer Address
            // 10% to dev Address
            // -----------------------------
            uint _feeReceiversAmount = (requiredETHFee *
                gasFeeReceiverPercent) / 100;
            payable(feeReceiver1).transfer(_feeReceiversAmount);
            payable(feeReceiver2).transfer(_feeReceiversAmount);
            uint _keeperFeeAmount = (requiredETHFee *
                keeperFeeReceiverPercent) / 100;
            payable(keeperFeeReceiver).transfer(_keeperFeeAmount);
            uint _remaining = requiredETHFee -
                (_feeReceiversAmount * 2 + _keeperFeeAmount); // remaining 10%
            payable(devAddress).transfer(_remaining);
        }
        emit FundsDeposited_Consolidated(
            msgSender,
            subscriptionCounter,
            _ETHDeposited,
            _tokens,
            _amounts,
            block.timestamp
        );

        // Add the user to the set of users if it's their first time activating a subscription
        if (!users.contains(msgSender)) {
            users.add(msgSender);
        }

        activeIdsOfSystem.add(subscriptionCounter);

        emit SubscriptionActivated(
            msgSender,
            subscriptionCounter,
            block.timestamp,
            _subscriptionTimeLimit,
            _heir,
            payInETH,
            _stableCoin
        );
    }

    // Deposit funds (user can deposit in ETH or stablecoin)
    function depositFunds(
        address[] calldata _tokens,
        uint256[] calldata _amounts,
        uint256 _ETHDeposited, // eth amount deposited in subscription
        uint256 _subscriptionId
    ) external payable nonReentrant {
        address msgSender = msg.sender;
        uint256 msgValue = msg.value;
        uint256 _ETHFeeForTokensDeposit = getDepositTokensFeeInETH(
            _tokens.length
        );

        require(
            msgValue >= _ETHDeposited + _ETHFeeForTokensDeposit,
            "Incorrect ETH amount"
        );
        require(_tokens.length > 0 || msgValue != 0, "No funds provided");
        require(
            _tokens.length == _amounts.length,
            "Tokens and amounts length mismatch"
        );
        require(idStatus[_subscriptionId], "Invalid ID");
        require(
            activeIdsOf[msgSender].contains(_subscriptionId),
            "Not activated by you"
        );
        require(getSubscriptionActiveStatus(_subscriptionId), "Time Elapsed");

        Subscription storage sub = subscriptionOfUserAgainstId[msgSender][
            _subscriptionId
        ];

        if (_ETHDeposited > 0) {
            sub.ethBalance += msgValue - _ETHFeeForTokensDeposit;
            emit FundsDepositedinETH(
                msgSender,
                _subscriptionId,
                msgValue - _ETHFeeForTokensDeposit,
                block.timestamp
            );
        }
        if (_tokens.length > 0) {
            // transfer tokens deposits fee in ETH to fund address
            // -----------------------------
            // 43% to each feeReceiver1 & feeReceiver2
            // 4% to keeper Fee Transfer Address
            // 10% to dev Address
            // -----------------------------
            uint _feeReceiversAmount = (_ETHFeeForTokensDeposit *
                gasFeeReceiverPercent) / 100;
            payable(feeReceiver1).transfer(_feeReceiversAmount);
            payable(feeReceiver2).transfer(_feeReceiversAmount);
            uint _keeperFeeAmount = (_ETHFeeForTokensDeposit *
                keeperFeeReceiverPercent) / 100;
            payable(keeperFeeReceiver).transfer(_keeperFeeAmount);
            uint _remaining = _ETHFeeForTokensDeposit -
                (_feeReceiversAmount * 2 + _keeperFeeAmount); // remaining 10%
            payable(devAddress).transfer(_remaining);
            emit ETHGasFeeTransferedForTokensDeposit(
                msgSender,
                _tokens.length,
                _ETHFeeForTokensDeposit,
                subscriptionCounter,
                block.timestamp
            );

            // loop through each token and amount
            for (uint i = 0; i < _tokens.length; i++) {
                address token = _tokens[i];
                uint amount = _amounts[i];

                require(amount > 0, "Invalid amount");

                // Add the amount to the user's balance
                require(
                    IERC20(token).transferFrom(
                        msgSender,
                        address(this),
                        amount
                    ),
                    "Token transfer failed"
                );

                if (!sub.depositedTokens.contains(token)) {
                    sub.depositedTokens.add(token);
                }

                sub.tokenBalance[token] += amount;

                emit FundsDepositedinToken(
                    msgSender,
                    _subscriptionId,
                    token,
                    amount,
                    block.timestamp
                );
            }
        }

        emit FundsDeposited_Consolidated(
            msgSender,
            _subscriptionId,
            msgValue,
            _tokens,
            _amounts,
            block.timestamp
        );
    }

    // Withdraw funds (user can withdraw in ETH or stablecoin)
    function withdrawFunds(
        uint _ethAmount,
        address[] calldata _tokens,
        uint256[] calldata _amounts,
        uint256 _subscriptionId
    ) public nonReentrant {
        address msgSender = msg.sender;
        bool withdrawInETH = _ethAmount != 0;

        require(
            _tokens.length == _amounts.length,
            "Tokens and amounts length mismatch"
        );
        require(idStatus[_subscriptionId], "Invalid ID");
        require(
            activeIdsOf[msgSender].contains(_subscriptionId),
            "Not activated by you"
        );
        require(getSubscriptionActiveStatus(_subscriptionId), "Time Elapsed");

        Subscription storage sub = subscriptionOfUserAgainstId[msgSender][
            _subscriptionId
        ];

        if (withdrawInETH) {
            require(sub.ethBalance >= _ethAmount, "Insufficient ETH balance"); // Check if user has enough ETH
            sub.ethBalance -= _ethAmount;
            payable(msg.sender).transfer(_ethAmount); // Withdraw in ETH

            emit FundsWithdrawninETH(
                msgSender,
                _subscriptionId,
                _ethAmount,
                block.timestamp
            );
        }
        if (_tokens.length > 0) {
            for (uint i = 0; i < _tokens.length; i++) {
                address token = _tokens[i];
                uint amount = _amounts[i];

                require(amount > 0, "Invalid amount");
                require(
                    sub.depositedTokens.contains(token),
                    "Token not deposited"
                );
                require(
                    sub.tokenBalance[token] >= amount,
                    "Insufficient token balance"
                );

                require(
                    IERC20(token).transfer(msgSender, amount),
                    "Token transfer failed"
                );

                sub.tokenBalance[token] -= amount;

                if (sub.tokenBalance[token] == 0) {
                    sub.depositedTokens.remove(token);
                }

                emit FundsWithdrawninToken(
                    msgSender,
                    _subscriptionId,
                    token,
                    amount,
                    block.timestamp
                );
            }
        }
        emit FundsWithdrawn_Consolidated(
            msgSender,
            _subscriptionId,
            _ethAmount,
            _tokens,
            _amounts,
            block.timestamp
        );
    }

    // Renew subscription (pay in either ETH or stablecoin)
    function renewSubscription(
        address _stableCoin,
        uint256 _subscriptionId,
        uint256 _subscriptionTimeLimit
    ) public payable nonReentrant {
        require(idStatus[_subscriptionId], "Invalid ID");
        address msgSender = msg.sender;
        bool payInETH = msg.value != 0;

        Subscription storage sub = subscriptionOfUserAgainstId[msgSender][
            _subscriptionId
        ];
        require(getSubscriptionActiveStatus(_subscriptionId), "Time Elapsed");

        uint256 feeInStableCoin = getStableCoinFee(_subscriptionTimeLimit);
        if (payInETH) {
            uint256 requiredFee = calculateETHFee(feeInStableCoin);
            require(msg.value >= requiredFee, "Incorrect ETH subscription fee");

            // Refund excess ETH
            if (msg.value > requiredFee) {
                payable(msgSender).transfer(msg.value - requiredFee);
            }

            // transfer tokens deposits fee in ETH to fund address
            // -----------------------------
            // 43% to each feeReceiver1 & feeReceiver2
            // 4% to keeper Fee Transfer Address
            // 10% to dev Address
            // -----------------------------
            uint _feeReceiversAmount = (requiredFee * gasFeeReceiverPercent) /
                100;
            payable(feeReceiver1).transfer(_feeReceiversAmount);
            payable(feeReceiver2).transfer(_feeReceiversAmount);
            uint _keeperFeeAmount = (requiredFee * keeperFeeReceiverPercent) /
                100;
            payable(keeperFeeReceiver).transfer(_keeperFeeAmount);
            uint _remaining = requiredFee -
                (_feeReceiversAmount * 2 + _keeperFeeAmount); // remaining 10%
            payable(devAddress).transfer(_remaining);
            emit EthGasFeeTransfered(
                msgSender,
                requiredFee,
                subscriptionCounter,
                block.timestamp
            );
        } else {
            // Payment in stablecoin (USDT or any other ERC20)
            require(
                allowedStablecoins.contains(_stableCoin),
                "Incorrect stablecoin address"
            );
            // Retrieve token decimals dynamically
            uint8 decimals = IERC20Metadata(_stableCoin).decimals(); // IERC20Metadata has the decimals() method

            // Adjust the required fee and gas fee based on token decimals
            uint adjustedFeeInStableCoin = feeInStableCoin /
                (10 ** (18 - decimals));

            // transfer the fee to the respective addresses
            // -----------------------------
            // 43% to each feeReceiver1 & feeReceiver2
            // 4% to keeper Fee Transfer Address
            // 10% to dev Address
            // -----------------------------
            uint _feeReceiversAmount = (adjustedFeeInStableCoin *
                gasFeeReceiverPercent) / 100; // 43%
            require(
                IERC20(_stableCoin).transferFrom(
                    msgSender,
                    feeReceiver1,
                    _feeReceiversAmount
                ),
                "Stablecoin transfer failed for gas fee"
            );
            require(
                IERC20(_stableCoin).transferFrom(
                    msgSender,
                    feeReceiver2,
                    _feeReceiversAmount
                ),
                "Stablecoin transfer failed for gas fee"
            );
            uint _keeperFeeAmount = (adjustedFeeInStableCoin *
                keeperFeeReceiverPercent) / 100;
            require(
                IERC20(_stableCoin).transferFrom(
                    msgSender,
                    keeperFeeReceiver,
                    _keeperFeeAmount
                ),
                "Stablecoin transfer failed for gas fee"
            );
            uint _remaining = adjustedFeeInStableCoin -
                (_feeReceiversAmount * 2 + _keeperFeeAmount); // remaining 10%
            require(
                IERC20(_stableCoin).transferFrom(
                    msgSender,
                    devAddress,
                    _remaining
                ),
                "Stablecoin transfer failed for gas fee"
            );

            emit StableCoinGasFeeTransfered(
                msgSender,
                _stableCoin,
                adjustedFeeInStableCoin,
                subscriptionCounter,
                block.timestamp
            );
        }

        // Reset the subscription details
        sub.subscriptionTimeLimit =
            sub.subscriptionTimeLimit +
            _subscriptionTimeLimit;

        emit SubscriptionRenewed(
            msgSender,
            _subscriptionId,
            block.timestamp,
            _subscriptionTimeLimit,
            payInETH,
            _stableCoin
        );
    }

    // Change heir
    function changeHeir(
        uint256 _subscriptionId,
        address _newHeir,
        string memory _newHeirName
    ) external {
        address msgSender = msg.sender;

        require(_newHeir != address(0), "New heir address cannot be zero");

        require(idStatus[_subscriptionId], "Invalid ID"); // Verify the subscription ID is valid
        require( // Verify that the sender is the owner of the subscription
            activeIdsOf[msgSender].contains(_subscriptionId),
            "Only the owner of this subscription can change the heir"
        );
        require(getSubscriptionActiveStatus(_subscriptionId), "Time Elapsed"); // Ensure the change is made within the time limit

        // Access the subscription data
        Subscription storage sub = subscriptionOfUserAgainstId[msgSender][
            _subscriptionId
        ];

        // Change the heir
        sub.heir = _newHeir;
        sub.heirName = _newHeirName;

        // Emit event for the heir change
        emit HeirChanged(msgSender, _subscriptionId, block.timestamp, _newHeir);
    }

    // Add allowed stablecoin
    function addAllowedStablecoin(
        address[] memory _stablecoins
    ) public onlyOwner {
        require(_stablecoins.length != 0, "invalid length");

        for (uint i = 0; i < _stablecoins.length; i++) {
            address token = _stablecoins[i];
            require(
                !isAllowedStablecoin(token),
                "SubscriptionContract: Stablecoin already allowed"
            );
            allowedStablecoins.add(token);
        }
    }

    // Remove allowed stablecoin
    function removeAllowedStablecoin(
        address[] memory _stablecoins
    ) public onlyOwner {
        require(_stablecoins.length != 0, "Invalid length");
        for (uint i = 0; i < _stablecoins.length; i++) {
            address token = _stablecoins[i];
            // check if it is valid stablecoin
            require(
                isAllowedStablecoin(token),
                "SubscriptionContract: Stablecoin not allowed"
            );
            allowedStablecoins.remove(token);
        }
    }

    // Admin function change feeReceiver1 address
    function setFeeReceiver1(address _feeReceiver1) public onlyOwner {
        feeReceiver1 = _feeReceiver1;
    }

    // Admin function change feeReceiver2 address
    function setFeeReceiver2(address _feeReceiver2) public onlyOwner {
        feeReceiver2 = _feeReceiver2;
    }

    // Admin function change keeperFeeReceiver address
    function setKeeperFeeReceiver(address _keeperFeeReceiver) public onlyOwner {
        keeperFeeReceiver = _keeperFeeReceiver;
    }

    // Admin function to change FeeReceiver percentage
    function setFeeReceiverPercent(
        uint256 _feeReceiverPercent
    ) public onlyOwner {
        gasFeeReceiverPercent = _feeReceiverPercent;
    }

    // Admin function to change keeperFeeReceiver Percent
    function setKeeperFeeReceiverPercent(
        uint256 _keeperFeeReceiverPercent
    ) public onlyOwner {
        keeperFeeReceiverPercent = _keeperFeeReceiverPercent;
    }

    // Admin function to change devAddress Percent
    function setDevAddressPercent(uint256 _devAddressPercent) public onlyOwner {
        devAddressPercent = _devAddressPercent;
    }

    // Admin function change devAddress address
    function setDevAddress(address _devAddress) public onlyOwner {
        devAddress = _devAddress;
    }

    // Admin function to change THRESHOLD_TIME_1
    function setTHRESHOLD_TIME_1(uint _THRESHOLD_TIME_1) public onlyOwner {
        THRESHOLD_TIME_1 = _THRESHOLD_TIME_1;
    }

    // Admin function to change feeForThresholdTime1
    function setFeeForThresholdTime1(
        uint _feeForThresholdTime1
    ) public onlyOwner {
        feeForThresholdTime1 = _feeForThresholdTime1;
    }

    // Admin function to change THRESHOLD_TIME_2
    function setTHRESHOLD_TIME_2(uint _THRESHOLD_TIME_2) public onlyOwner {
        THRESHOLD_TIME_2 = _THRESHOLD_TIME_2;
    }

    // Admin function to change feeForThresholdTime2
    function setFeeForThresholdTime2(
        uint _feeForThresholdTime2
    ) public onlyOwner {
        feeForThresholdTime2 = _feeForThresholdTime2;
    }

    // Admin function to change THRESHOLD_TIME_3
    function setTHRESHOLD_TIME_3(uint _THRESHOLD_TIME_3) public onlyOwner {
        THRESHOLD_TIME_3 = _THRESHOLD_TIME_3;
    }

    // Admin function to change feeForThresholdTime3
    function setFeeForThresholdTime3(
        uint _feeForThresholdTime3
    ) public onlyOwner {
        feeForThresholdTime3 = _feeForThresholdTime3;
    }

    // Admin function to change subscriptionFeeCapThresholdDays
    function setSubscriptionFeeCapThresholdDays(
        uint _subscriptionFeeCapThresholdDays
    ) public onlyOwner {
        subscriptionFeeCapThresholdDays = _subscriptionFeeCapThresholdDays;
    }

    // Admin function to change fee per Token deposit
    function setFeeInUSDPerTokenDeposit(
        uint _feePerTokenDeposit
    ) public onlyOwner {
        feeInUSDPerTokenDeposit = _feePerTokenDeposit;
    }

    function performUpkeep(bytes calldata performData) external {
        // Decode the IDs that require upkeep
        uint256[] memory expiredIds = abi.decode(performData, (uint256[]));

        for (uint i = 0; i < expiredIds.length; i++) {
            uint256 _id = expiredIds[i];
            require(idStatus[_id], "Invalid ID"); // Verify the subscription ID is valid
            address _user = idActivatedBy[_id];

            Subscription storage sub = subscriptionOfUserAgainstId[_user][_id];

            // Transfer all assets (ETH and tokens) to the heir
            if (sub.ethBalance > 0) {
                uint256 ethAmount = sub.ethBalance;

                // Update state before the external call
                sub.ethBalance = 0;

                // Transfer ETH to the heir after updating state
                payable(sub.heir).transfer(ethAmount); // Transfer ETH to the heir
            }

            // Transfer all deposited tokens to the heir
            for (uint j = 0; j < sub.depositedTokens.length(); j++) {
                address token = sub.depositedTokens.at(j);
                uint256 tokenBalance = sub.tokenBalance[token];

                if (tokenBalance > 0) {
                    IERC20(token).transfer(sub.heir, tokenBalance); // Transfer tokens to the heir
                    sub.tokenBalance[token] = 0; // Reset token balance after transfer
                }
            }

            // Mark the subscription ID as inactive
            idStatus[_id] = false;

            // Mark the activation status as false
            sub.activationStatus = false;

            // Remove the subscription from the user's active IDs
            activeIdsOfSystem.remove(_id);
            activeIdsOf[_user].remove(_id);
            inactiveIdsOf[_user].add(_id);

            // Emit an event for the subscription deactivation and asset transfer
            emit SubscriptionDeactivated(_id, _user, sub.heir, block.timestamp);
        }
    }

    // ========================
    // Read-Only Functions
    // ========================

    // Check for all IDs that need upkeep (expired subscriptions)
    function checkUpkeep(
        bytes calldata /*checkData*/
    ) external view returns (bool upkeepNeeded, bytes memory performData) {
        uint256[] memory tempExpiredIds = new uint256[](
            activeIdsOfSystem.length()
        ); // Temporary array
        uint256 counter;

        for (uint i = 0; i < activeIdsOfSystem.length(); i++) {
            uint256 _id = activeIdsOfSystem.at(i);
            address _user = idActivatedBy[_id];

            Subscription storage sub = subscriptionOfUserAgainstId[_user][_id];

            // Check if the subscription has passed the subscription period limit
            if (
                (block.timestamp >=
                    sub.activationTime + sub.subscriptionTimeLimit) &&
                idStatus[_id]
            ) {
                tempExpiredIds[counter] = _id;
                counter++;
            }
        }

        if (counter > 0) {
            upkeepNeeded = true;
            // Copy to a smaller array
            uint256[] memory expiredIds = new uint256[](counter);
            for (uint i = 0; i < counter; i++) {
                expiredIds[i] = tempExpiredIds[i];
            }
            performData = abi.encode(expiredIds);
        }
    }

    // function that will take length of tokens and convert fee of all tokens in USD
    function getDepositTokensFeeInUSD(
        uint256 _tokens
    ) public view returns (uint) {
        return (_tokens * feeInUSDPerTokenDeposit * 1e18);
    }

    // function that will take length of tokens and convert fee of all tokens in ETH
    function getDepositTokensFeeInETH(
        uint256 _tokens
    ) public view returns (uint) {
        int ethPriceInUSD = getLatestPrice(); // Price of 1 ETH in USD (with 8 decimals)
        require(ethPriceInUSD > 0, "Invalid price from oracle");

        uint tokensFeeInUSD = getDepositTokensFeeInUSD(_tokens);

        uint ethFee = (tokensFeeInUSD * 1e8) / uint(ethPriceInUSD); // Conversion to ETH amount
        return ethFee;
    }

    // Function to get subscription status through ID
    // It will return false if more then grace period time limit has elapsed otherwise true
    function getSubscriptionActiveStatus(
        uint256 _subscriptionId
    ) public view returns (bool status) {
        address activator = idActivatedBy[_subscriptionId];
        Subscription storage sub = subscriptionOfUserAgainstId[activator][
            _subscriptionId
        ];

        if (block.timestamp <= sub.activationTime + sub.subscriptionTimeLimit) {
            return true;
        } else {
            return false;
        }
    }

    // function to change the subscription seconds into days and then into stable coins according to days
    function getStableCoinFee(
        uint256 _subscriptionLimitInSeconds
    ) public view returns (uint) {
        uint256 subscriptionDays = _subscriptionLimitInSeconds / 86400;

        // Cap the fee at the threshold
        // If the subscription days exceed the threshold, the fee will be capped at the threshold
        // ----------------------//
        // From 1 day to 10 days >> user pays $1 fee
        // From 10 days to 20 days >> user pays $2 fee
        // From 20 days to 30 days user pays $3 fee.
        // After 30 days then the formula for 1$ per day until the 200 days can be applied.
        // ----------------------//
        if (subscriptionDays <= THRESHOLD_TIME_1) {
            subscriptionDays = feeForThresholdTime1;
        } else if (subscriptionDays <= THRESHOLD_TIME_2) {
            subscriptionDays = feeForThresholdTime2;
        } else if (subscriptionDays <= THRESHOLD_TIME_3) {
            subscriptionDays = feeForThresholdTime3;
        } else if (subscriptionDays > subscriptionFeeCapThresholdDays) {
            subscriptionDays = subscriptionFeeCapThresholdDays;
        }

        uint256 feeInStableCoin = subscriptionDays * 1e18;
        return feeInStableCoin;
    }

    // Check if a stablecoin is allowed
    function isAllowedStablecoin(
        address _stablecoin
    ) public view returns (bool) {
        return allowedStablecoins.contains(_stablecoin);
    }

    // Get the total number of allowed stablecoins
    function getNumberOfStablecoins() public view returns (uint) {
        return allowedStablecoins.length();
    }

    // Get the allowed stablecoins
    function getAllowedStablecoins()
        public
        view
        returns (address[] memory allowedS)
    {
        return allowedStablecoins.values();
    }

    // Get the latest price of ETH in USD (used to calculate equivalent ETH for stablecoin fee)
    function getLatestPrice() public view returns (int) {
        (, int price, , , ) = priceFeed.latestRoundData();
        return price;
    }

    // Calculate the equivalent ETH for the subscription fee based on the current price
    // This is done by scaling the stablecoin fee by the current ETH price
    // @param _feeInStableCoin is the fee in stablecoin in wei
    function calculateETHFee(
        uint256 _feeInStableCoin
    ) public view returns (uint) {
        int ethPriceInUSD = getLatestPrice(); // Price of 1 ETH in USD (with 8 decimals)
        require(ethPriceInUSD > 0, "Invalid price from oracle");

        uint ethFee = (_feeInStableCoin * 1e8) / uint(ethPriceInUSD); // Conversion to ETH amount
        return ethFee;
    }

    function convertEthToUSD(
        uint256 ethAmountInWei
    ) public view returns (uint256 usdtAmount) {
        int ethPriceInUsdt = getLatestPrice(); // The price of 1 ETH in USDT, scaled by 10^8
        require(ethPriceInUsdt > 0, "Invalid ETH price");

        // Convert wei to ETH
        uint256 ethAmountInEth = ethAmountInWei / 1e18;

        // Calculate the USDT amount (price feed has 8 decimals)
        uint256 usdtAmountInDecimals = ethAmountInEth * uint256(ethPriceInUsdt);

        // Normalize by 1e8 to adjust for price feed decimals
        return (usdtAmountInDecimals / 1e8) * 1e18;
    }

    // function to get all active ids of the system
    function getActiveIdsOfSystem()
        public
        view
        returns (uint256[] memory activeIds)
    {
        return activeIdsOfSystem.values();
    }

    // Function to get total number of unique users entered in the system
    function totalUsers() public view returns (uint) {
        return users.length();
    }

    // Get user address by index (for listing purposes)
    function getUserByIndex(uint index) public view returns (address) {
        require(index < users.length(), "Index out of bounds");
        return users.at(index);
    }

    // Get all users
    function getAllUsers() public view returns (address[] memory allUsers) {
        return users.values();
    }

    // Check if a user is in the system
    function isUser(address _user) public view returns (bool) {
        return users.contains(_user);
    }

    // Getter for all subscription ids of a user
    function getAllIdsOfUser(
        address user
    ) public view returns (uint256[] memory) {
        uint256 length = allIdsOf[user].length();
        uint256[] memory allIds = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            allIds[i] = allIdsOf[user].at(i);
        }

        return allIds;
    }

    // Getter for active subscription ids of a user
    function getActiveIdsOfUser(
        address user
    ) public view returns (uint256[] memory) {
        uint256 length = activeIdsOf[user].length();
        uint256[] memory activeIds = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            activeIds[i] = activeIdsOf[user].at(i);
        }

        return activeIds;
    }

    // Getter for inactive subscription ids of a user
    function getInActiveIdsOfUser(
        address user
    ) public view returns (uint256[] memory) {
        uint256 length = inactiveIdsOf[user].length();
        uint256[] memory inactiveIds = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            inactiveIds[i] = inactiveIdsOf[user].at(i);
        }

        return inactiveIds;
    }

    // Getter for deposited tokens of a specific subscription
    function getDepositedTokensOfUserAgainstID(
        address user,
        uint256 id
    ) public view returns (address[] memory) {
        Subscription storage subscription = subscriptionOfUserAgainstId[user][
            id
        ];
        uint256 length = subscription.depositedTokens.length();
        address[] memory tokens = new address[](length);

        for (uint256 i = 0; i < length; i++) {
            tokens[i] = subscription.depositedTokens.at(i);
        }

        return tokens;
    }

    // Getter for token balance of a specific subscription
    function getTokenBalanceOfUserAgainstIDForToken(
        address user,
        uint256 id,
        address token
    ) public view returns (uint256) {
        Subscription storage subscription = subscriptionOfUserAgainstId[user][
            id
        ];
        return subscription.tokenBalance[token];
    }

    // Getter for a specific subscription for a user by id

    // which contains tokens address only.

    function getSubscriptionDetailsById_withTokens(
        address user,
        uint256 id
    )
        public
        view
        returns (
            uint256 subId,
            uint256 ethBalance,
            uint256 activationTime,
            uint256 expirationTime,
            bool isActive,
            address heir,
            string memory heirName,
            address[] memory depositedTokens
        )
    {
        Subscription storage subscription = subscriptionOfUserAgainstId[user][
            id
        ];

        address[]
            memory depositedTokensOfUserAgainstId = getDepositedTokensOfUserAgainstID(
                user,
                id
            );

        return (
            subscription.id,
            subscription.ethBalance,
            subscription.activationTime,
            subscription.activationTime + subscription.subscriptionTimeLimit,
            subscription.activationStatus,
            subscription.heir,
            subscription.heirName,
            depositedTokensOfUserAgainstId
        );
    }

    struct TokenBalance {
        address token;
        uint256 balance;
    }

    // Get subscription details of a specific subscription for a user by id
    // which contains all the tokens with their balances also
    function getSubscriptionDetailsById(
        address user,
        uint256 id
    )
        public
        view
        returns (
            uint256 subId,
            uint256 ethBalance,
            uint256 activationTime,
            uint256 expirationTime,
            bool isActive,
            address heir,
            string memory heirName,
            TokenBalance[] memory tokensWithBalances
        )
    {
        Subscription storage subscription = subscriptionOfUserAgainstId[user][
            id
        ];
        address[] memory depositedTokens = getDepositedTokensOfUserAgainstID(
            user,
            id
        );
        tokensWithBalances = new TokenBalance[](depositedTokens.length);

        for (uint256 i = 0; i < depositedTokens.length; i++) {
            uint tokenBalance = getTokenBalanceOfUserAgainstIDForToken(
                user,
                id,
                depositedTokens[i]
            );

            tokensWithBalances[i] = TokenBalance({
                token: depositedTokens[i],
                balance: tokenBalance
            });
        }

        return (
            subscription.id,
            subscription.ethBalance,
            subscription.activationTime,
            subscription.activationTime + subscription.subscriptionTimeLimit,
            subscription.activationStatus,
            subscription.heir,
            subscription.heirName,
            tokensWithBalances
        );
    }
}
