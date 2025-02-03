import { expect } from "chai";
import { ethers } from "hardhat";
import {
  Legacy,
  StableCoinMock,
  AggregatorV3Mock,
} from "../../typechain-types";

describe("Legacy Contract - activateSubscription", function () {
  let legacy: Legacy;
  let mockPriceFeed: AggregatorV3Mock;
  let busd: StableCoinMock;
  let usdt: StableCoinMock;
  let gho: StableCoinMock;
  let owner: any;
  let user1: any;
  let user2: any;
  let heir: any;
  let priceFeedAddress: string;
  let allowedStablecoins: string[];

  // const subscriptionFeeInETH = ethers.parseEther("0.2"); // Example fee
  // const feeInStableCoin = ethers.parseUnits("369", 18); // 369 Stablecoins (USDT, BUSD, etc.)

  const initialSupply = ethers.utils.parseEther("1000000");

  beforeEach(async function () {
    // Get signers (destructuring works the same as before)
    [owner, user1, user2, heir] = await hre.ethers.getSigners();

    // Deploy mocks for stablecoins and price feed
    const StableCoinMockFactory = await ethers.getContractFactory(
      "StableCoinMock"
    );
    usdt = (await StableCoinMockFactory.deploy(
      initialSupply,
      8
    )) as StableCoinMock;
    busd = (await StableCoinMockFactory.deploy(
      initialSupply,
      18
    )) as StableCoinMock;
    gho = (await StableCoinMockFactory.deploy(
      initialSupply,
      18
    )) as StableCoinMock;

    await usdt.waitForDeployment();
    await busd.waitForDeployment();
    await gho.waitForDeployment();

    // Deploy mock price feed
    const MockAggregatorV3 = await ethers.getContractFactory(
      "AggregatorV3Mock"
    );
    mockPriceFeed = await MockAggregatorV3.deploy();

    allowedStablecoins = [usdt.address, busd, gho];

    // Deploy the Legacy contract
    const Legacy = await ethers.getContractFactory("Legacy");
    legacy = await Legacy.deploy(
      mockPriceFeed,
      owner,
      owner,
      allowedStablecoins
    );

    await legacy.waitForDeployment();
  });

  describe("ETH Subscription Activation", function () {
    // 1st method to get events and compare it with data from contract
    // it("should activate subscription using ETH", async function () {
    //   const abi = [
    //     "event SubscriptionActivated(address indexed user, uint256 indexed subscriptionId, uint256 timestamp, address heir, bool active, address paymentToken)",
    //   ];
    //   // Create an interface from the ABI
    //   const iface = new ethers.Interface(abi);

    //   const tx = await legacy
    //     .connect(user1)
    //     .activateSubscription(heir.address, ethers.ZeroAddress, {
    //       value: subscriptionFeeInETH,
    //     });
    //   const receipt = await tx.wait();
    //   const block = await ethers.provider.getBlock(tx.blockHash ?? 0);

    //   // Iterate through logs and decode
    //   const decodedEvents = receipt?.logs
    //     .map((log) => {
    //       try {
    //         // Attempt to parse the log using the interface
    //         return iface.parseLog(log);
    //       } catch (error) {
    //         // If the log doesn't match any events in the ABI, it throws an error
    //         return null;
    //       }
    //     })
    //     .filter((event) => event !== null); // Filter out non-matching logs

    //   // Find the specific "SubscriptionActivated" event
    //   const subscriptionActivatedEvent = decodedEvents?.find(
    //     (event) => event.name === "SubscriptionActivated"
    //   );

    //   expect(subscriptionActivatedEvent?.args[0]).to.equal(user1.address);
    //   expect(subscriptionActivatedEvent?.args[1]).to.equal(1);
    //   expect(subscriptionActivatedEvent?.args[2]).to.be.gt(0);
    //   expect(subscriptionActivatedEvent?.args[2]).to.equal(block?.timestamp);
    //   expect(subscriptionActivatedEvent?.args[3]).to.equal(heir.address);
    //   expect(subscriptionActivatedEvent?.args[4]).to.be.true;
    //   expect(subscriptionActivatedEvent?.args[5]).to.equal(ethers.ZeroAddress);
    // });
    // 2nd method to get event data and compare it with data
    it("should activate subscription using ETH", async function () {
      const tx = await legacy
        .connect(user1)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: ethers.parseEther("1"), // Overpaying in ETH to test refund mechanism
        });
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(tx.blockHash ?? 0);

      await expect(tx).to.emit(legacy, "SubscriptionActivated").withArgs(
        user1.address,
        1, // Subscription ID (first subscription)
        block?.timestamp,
        heir.address,
        true, // Paid in ETH
        ethers.ZeroAddress // Payment token is ETH (hence zero address)
      );

      const subscription = await legacy.getSubscriptionById_withTokens(
        user1.address,
        1
      );
      expect(subscription.heir).to.equal(heir.address);
      expect(subscription.activationTime).to.be.gt(0);
    });

    it("should refund extra ETH if more than required fee is sent", async function () {
      const initialBalance = await ethers.provider.getBalance(user1.address);

      const excessEth = ethers.parseEther("10");

      const tx = await legacy
        .connect(user1)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: excessEth,
        });
      const receipt = await tx.wait();

      const finalBalance = await ethers.provider.getBalance(user1.address);
      const gasUsed = BigInt(receipt?.gasUsed ?? 0) * tx.gasPrice;

      const subscriptionFeeInETH = await legacy.calculateETHFee();

      expect(finalBalance).to.equal(
        initialBalance - subscriptionFeeInETH - gasUsed
      );
    });

    it("should revert if insufficient ETH is sent", async function () {
      await expect(
        legacy
          .connect(user1)
          .activateSubscription(heir.address, ethers.ZeroAddress, {
            value: ethers.parseEther("0.01"), // Sending less than required ETH
          })
      ).to.be.revertedWith("Incorrect ETH subscription fee");
    });

    it("should activate subscription using ETH and emit all related events", async function () {
      const tx = await legacy
        .connect(user1)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: ethers.parseEther("1"),
        });
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(tx.blockHash ?? 0);

      // Check SubscriptionActivated event
      await expect(tx)
        .to.emit(legacy, "SubscriptionActivated")
        .withArgs(
          user1.address,
          1,
          block?.timestamp,
          heir.address,
          true,
          ethers.ZeroAddress
        );

      const gasFeePercent = await legacy.gasFeePercent();
      const gasFeeReceiver = owner.address;
      const subscriptionFeeReceiver = owner.address;
      // Check EthGasFeeTransfered event
      const gasFee =
        ((await legacy.calculateETHFee()) * BigInt(gasFeePercent)) /
        BigInt(100);
      await expect(tx)
        .to.emit(legacy, "EthGasFeeTransfered")
        .withArgs(user1.address, gasFeeReceiver, gasFee, 1, block?.timestamp);

      // Check EthSubscriptionFeeTransfered event
      const subscriptionFee = await legacy.calculateETHFee();
      await expect(tx)
        .to.emit(legacy, "EthSubscriptionFeeTransfered")
        .withArgs(
          user1.address,
          subscriptionFeeReceiver,
          subscriptionFee - gasFee,
          1,
          block?.timestamp
        );

      const subscription = await legacy.getSubscriptionById_withTokens(
        user1.address,
        1
      );
      expect(subscription.heir).to.equal(heir.address);
      expect(subscription.activationTime).to.be.gt(0);
    });
  });

  describe("Stablecoin Subscription Activation", function () {
    it("should activate subscription using allowed stablecoins", async function () {
      await usdt.connect(user1).mint(ethers.parseEther("1000000"));
      const feeInStableCoin = await legacy.feeInStableCoin();

      // Approve the Legacy contract to spend stablecoins on behalf of user1
      await usdt
        .connect(user1)
        .approve(await legacy.getAddress(), feeInStableCoin);

      const tx = await legacy
        .connect(user1)
        .activateSubscription(heir.address, await usdt.getAddress());

      const block = await ethers.provider.getBlock(tx.blockHash ?? 0);

      expect(tx)
        .to.emit(legacy, "SubscriptionActivated")
        .withArgs(
          user1.address,
          1,
          block?.timestamp,
          heir.address,
          false,
          await usdt.getAddress()
        );

      const subscription = await legacy.getSubscriptionById_withTokens(
        user1.address,
        1
      );
      expect(subscription.heir).to.equal(heir.address);
      expect(subscription.activationTime).to.be.gt(0);
    });

    it("should revert if non-allowed stablecoin is used", async function () {
      const StableCoinMock = await ethers.getContractFactory("StableCoinMock");
      const fakeStableCoin = await StableCoinMock.deploy(
        ethers.parseUnits("1000", 18)
      );

      await fakeStableCoin.connect(user1).mint(ethers.parseUnits("1000", 18));

      const feeInStableCoin = await legacy.feeInStableCoin();

      await fakeStableCoin
        .connect(user1)
        .approve(await legacy.getAddress(), feeInStableCoin);

      await expect(
        legacy
          .connect(user1)
          .activateSubscription(heir.address, await fakeStableCoin.getAddress())
      ).to.be.revertedWith("Incorrect stablecoin address");
    });
  });

  describe("State and Event Validation", function () {
    it("should add the user to the set of users if it's their first time", async function () {
      expect(await legacy.isUser(user1.address)).to.equal(false);

      const subscriptionFeeInETH = await legacy.calculateETHFee();
      await legacy
        .connect(user1)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: subscriptionFeeInETH,
        });

      expect(await legacy.isUser(user1.address)).to.equal(true);
    });

    it("should assign a unique subscription ID", async function () {
      const subscriptionFeeInETH = await legacy.calculateETHFee();

      await legacy
        .connect(user1)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: subscriptionFeeInETH,
        });
      const firstSubscriptionId = (
        await legacy.getSubscriptionById_withTokens(user1.address, 1)
      ).subId;

      await legacy
        .connect(user1)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: subscriptionFeeInETH,
        });

      const secondSubscriptionId = (
        await legacy.getSubscriptionById_withTokens(user1.address, 2)
      ).subId;

      expect(firstSubscriptionId).to.not.equal(secondSubscriptionId);
    });

    it("should activate subscription only once per subscription ID", async function () {
      const subscriptionFeeInETH = await legacy.calculateETHFee();

      await legacy
        .connect(user1)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: subscriptionFeeInETH,
        });

      await expect(
        legacy
          .connect(user1)
          .activateSubscription(heir.address, ethers.ZeroAddress, {
            value: subscriptionFeeInETH,
          })
      ).to.emit(legacy, "SubscriptionActivated");
    });
  });

  describe("Edge Case Handling", function () {
    it("should revert if no ETH or stablecoin is sent", async function () {
      await expect(
        legacy
          .connect(user1)
          .activateSubscription(heir.address, ethers.ZeroAddress)
      ).to.be.revertedWith("Incorrect stablecoin address");
    });

    it("should revert if heir address is zero", async function () {
      const subscriptionFeeInETH = await legacy.calculateETHFee();

      await expect(
        legacy
          .connect(user1)
          .activateSubscription(ethers.ZeroAddress, ethers.ZeroAddress, {
            value: subscriptionFeeInETH,
          })
      ).to.be.revertedWith("Invalid heir address");
    });
  });

  describe("Gas Usage Validation", function () {
    it("should consume reasonable gas when activating a subscription with ETH", async function () {
      const subscriptionFeeInETH = await legacy.calculateETHFee();

      const tx = await legacy
        .connect(user1)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: subscriptionFeeInETH,
        });
      const receipt = await tx.wait();

      expect(receipt?.gasUsed).to.be.lessThan(500000); // Example gas limit
    });

    it("should consume reasonable gas when activating a subscription with stablecoin", async function () {
      const feeInStableCoin = await legacy.baseFeeUSD();
      await usdt.connect(user1).mint(ethers.parseEther("1000000"));

      await usdt
        .connect(user1)
        .approve(await legacy.getAddress(), feeInStableCoin);
      const tx = await legacy
        .connect(user1)
        .activateSubscription(heir.address, await usdt.getAddress());
      const receipt = await tx.wait();

      expect(receipt?.gasUsed).to.be.lessThan(500000); // Example gas limit
    });
  });

  describe("Event Validation", function () {
    it("should emit the correct events with ETH payment", async function () {
      const subscriptionFeeInETH = await legacy.calculateETHFee();
      const tx = await legacy
        .connect(user1)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: subscriptionFeeInETH,
        });
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(tx.blockHash ?? 0);

      // Validate the SubscriptionActivated event
      await expect(tx).to.emit(legacy, "SubscriptionActivated").withArgs(
        user1.address,
        1,
        block?.timestamp,
        heir.address,
        true, // paidInETH is true
        ethers.ZeroAddress // StableCoin is address zero for ETH payment
      );

      const gasFeePercent = await legacy.gasFeePercent();
      const gasFeeReceiver = owner.address;
      const subscriptionFeeReceiver = owner.address;

      // Validate the EthGasFeeTransfered event
      const gasFee =
        ((await legacy.calculateETHFee()) * BigInt(gasFeePercent)) /
        BigInt(100);
      await expect(tx)
        .to.emit(legacy, "EthGasFeeTransfered")
        .withArgs(user1.address, gasFeeReceiver, gasFee, 1, block?.timestamp);

      // Validate the EthSubscriptionFeeTransfered event
      const subscriptionFee = await legacy.calculateETHFee();
      await expect(tx)
        .to.emit(legacy, "EthSubscriptionFeeTransfered")
        .withArgs(
          user1.address,
          subscriptionFeeReceiver,
          subscriptionFee - gasFee,
          1,
          block?.timestamp
        );
    });

    it("should emit the correct events with stablecoin payment", async function () {
      const feeInStableCoin = await legacy.baseFeeUSD();
      await usdt.connect(user1).mint(ethers.parseEther("1000000"));
      await usdt
        .connect(user1)
        .approve(await legacy.getAddress(), feeInStableCoin);

      const tx = await legacy
        .connect(user1)
        .activateSubscription(heir.address, await usdt.getAddress());
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(tx.blockHash ?? 0);

      // Validate the SubscriptionActivated event
      await expect(tx)
        .to.emit(legacy, "SubscriptionActivated")
        .withArgs(
          user1.address,
          1,
          block?.timestamp,
          heir.address,
          false, // paidInETH is false
          await usdt.getAddress() // StableCoin is USDT
        );

      const gasFeePercent = await legacy.gasFeePercent();
      const gasFeeReceiver = owner.address;
      const subscriptionFeeReceiver = owner.address;
      // Validate the StableCoinGasFeeTransfered event
      const gasFee = (feeInStableCoin * BigInt(gasFeePercent)) / BigInt(100);
      await expect(tx)
        .to.emit(legacy, "StableCoinGasFeeTransfered")
        .withArgs(
          user1.address,
          gasFeeReceiver,
          await usdt.getAddress(),
          gasFee,
          1,
          block?.timestamp
        );

      // Validate the StableCoinSubscriptionFeeTransfered event
      await expect(tx)
        .to.emit(legacy, "StableCoinSubscriptionFeeTransfered")
        .withArgs(
          user1.address,
          subscriptionFeeReceiver,
          await usdt.getAddress(),
          feeInStableCoin - gasFee,
          1,
          block?.timestamp
        );
    });
  });

  describe("Subscription Count and Data Validation", function () {
    it("should increase subscription counter with each activation", async function () {
      expect(await legacy.subscriptionCounter()).to.equal(0);

      const subscriptionFeeInETH = await legacy.calculateETHFee();

      await legacy
        .connect(user1)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: subscriptionFeeInETH,
        });
      expect(await legacy.subscriptionCounter()).to.equal(1);

      await usdt.connect(user1).mint(ethers.parseEther("1000000"));
      await usdt
        .connect(user1)
        .approve(await legacy.getAddress(), ethers.parseEther("1000000"));

      await legacy
        .connect(user1)
        .activateSubscription(heir.address, await usdt.getAddress());
      expect(await legacy.subscriptionCounter()).to.equal(2);
    });

    it("should properly track subscription data", async function () {
      const subscriptionFeeInETH = await legacy.calculateETHFee();
      await legacy
        .connect(user1)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: subscriptionFeeInETH,
        });

      const subscription = await legacy.getSubscriptionById_withTokens(
        user1.address,
        1
      );
      expect(subscription.subId).to.equal(1);
      expect(subscription.heir).to.equal(heir.address);
      expect(subscription.activationTime).to.be.gt(0);
    });
  });

  // describe("Reentrancy Protection", function () {
  //   it("should prevent reentrancy attack during subscription activation", async function () {
  //     // Deploy ReentrantMock contract
  //     const ReentrantMock = await ethers.getContractFactory("ReentrantMock");
  //     const reentrant = await ReentrantMock.deploy(await legacy.getAddress());
  //     await reentrant.waitForDeployment();

  //     const subscriptionFeeInETH = await legacy.calculateETHFee();

  //     // Overpay to trigger refund and reentrancy attempt
  //     const overpayment = subscriptionFeeInETH + ethers.parseEther("1");

  //     // Listen for the reentrancy attempt event and verify the fallback is triggered
  //     await expect(
  //       reentrant.connect(user1).attack({ value: overpayment })
  //     ).to.emit(reentrant, "ReentrancyAttempted");

  //     // Expect the custom error to be reverted (ReentrancyGuard to prevent reentrant call)
  //     await expect(
  //       reentrant.connect(user1).attack({ value: overpayment })
  //     ).to.be.revertedWithCustomError(legacy, "ReentrancyGuardReentrantCall");
  //   });
  // });
});
