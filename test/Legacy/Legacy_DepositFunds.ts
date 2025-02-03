import { expect } from "chai";
import { ethers } from "hardhat";
import {
  AggregatorV3Mock,
  Legacy,
  StableCoinMock,
} from "../../typechain-types";

describe("Legacy Contract - depositFunds", function () {
  let legacy: Legacy;
  let mockPriceFeed: AggregatorV3Mock;
  let usdt: StableCoinMock;
  let busd: StableCoinMock;
  let owner: any;
  let user1: any;
  let user2: any;
  let heir: any;
  let subscriptionId: number;

  let priceFeedAddress: string;
  let allowedStablecoins: string[];
  const initialSupply = ethers.parseEther("1000000");

  beforeEach(async function () {
    // Deploy the contract and necessary mocks before each test case
    [owner, user1, user2, heir] = await ethers.getSigners();

    // Deploy mocks for stablecoins and price feed
    const StableCoinMockFactory = await ethers.getContractFactory(
      "StableCoinMock"
    );
    usdt = (await StableCoinMockFactory.deploy(
      initialSupply
    )) as StableCoinMock;
    busd = (await StableCoinMockFactory.deploy(
      initialSupply
    )) as StableCoinMock;

    await usdt.waitForDeployment();
    await busd.waitForDeployment();

    // Deploy mock price feed
    const MockAggregatorV3 = await ethers.getContractFactory(
      "AggregatorV3Mock"
    );
    mockPriceFeed = await MockAggregatorV3.deploy();

    priceFeedAddress = await mockPriceFeed.getAddress();

    allowedStablecoins = [await usdt.getAddress(), await busd.getAddress()];

    // Deploy the Legacy contract
    const Legacy = await ethers.getContractFactory("Legacy");
    legacy = await Legacy.deploy(allowedStablecoins, priceFeedAddress);
    await legacy.waitForDeployment();

    // Activate a subscription for user1
    await legacy
      .connect(user1)
      .activateSubscription(user2.address, ethers.ZeroAddress, {
        value: ethers.parseEther("1"),
      });
    subscriptionId = 1;

    // Mint some tokens to user1 for testing
    await usdt.connect(user1).mint(ethers.parseEther("1000"));
    await busd.connect(user1).mint(ethers.parseEther("1000"));

    // Approve the tokens to be spent by the contract
    await usdt
      .connect(user1)
      .approve(await legacy.getAddress(), ethers.parseEther("1000"));
    await busd
      .connect(user1)
      .approve(await legacy.getAddress(), ethers.parseEther("1000"));
  });

  describe("Basic Functionality", function () {
    it("should deposit ETH into the subscription", async function () {
      const ethAmount = ethers.parseEther("2");

      // Deposit ETH into the subscription
      const tx = await legacy
        .connect(user1)
        .depositFunds([], [], subscriptionId, { value: ethAmount });
      const block = await ethers.provider.getBlock(tx.blockHash ?? 0);

      await expect(tx)
        .to.emit(legacy, "FundsDepositedinETH")
        .withArgs(user1.address, subscriptionId, ethAmount, block?.timestamp);

      // Check the ETH balance
      const subscription = await legacy.getSubscriptionById_withTokens(
        user1.address,
        subscriptionId
      );
      expect(subscription.ethBalance).to.equal(ethAmount);
    });

    it("should deposit tokens into the subscription", async function () {
      const tokenAmounts = [ethers.parseEther("10"), ethers.parseEther("20")];

      // Deposit token1 and token2 into the subscription
      const tx = await legacy
        .connect(user1)
        .depositFunds(
          [await usdt.getAddress(), await busd.getAddress()],
          tokenAmounts,
          subscriptionId
        );
      const block = await ethers.provider.getBlock(tx.blockHash ?? 0);

      await expect(tx)
        .to.emit(legacy, "FundsDepositedinToken")
        .withArgs(
          user1.address,
          subscriptionId,
          await usdt.getAddress(),
          tokenAmounts[0],
          block?.timestamp
        )
        .and.to.emit(legacy, "FundsDepositedinToken")
        .withArgs(
          user1.address,
          subscriptionId,
          await busd.getAddress(),
          tokenAmounts[1],
          block?.timestamp
        );

      // Check the token balances
      const subscription = await legacy.getSubscriptionById_withTokens(
        user1.address,
        subscriptionId
      );
      expect(
        await legacy.getTokenBalanceOfUserAgainstIDForToken(
          user1.address,
          subscriptionId,
          await usdt.getAddress()
        )
      ).to.equal(tokenAmounts[0]);
      expect(
        await legacy.getTokenBalanceOfUserAgainstIDForToken(
          user1.address,
          subscriptionId,
          await busd.getAddress()
        )
      ).to.equal(tokenAmounts[1]);
    });

    it("should deposit both ETH and tokens into the subscription", async function () {
      const ethAmount = ethers.parseEther("1");
      const tokenAmounts = [ethers.parseEther("15")];

      // Deposit ETH and token1 into the subscription
      const tx = await legacy
        .connect(user1)
        .depositFunds([await usdt.getAddress()], tokenAmounts, subscriptionId, {
          value: ethAmount,
        });
      const block = await ethers.provider.getBlock(tx.blockHash ?? 0);

      await expect(tx)
        .to.emit(legacy, "FundsDepositedinETH")
        .withArgs(user1.address, subscriptionId, ethAmount, block?.timestamp)
        .and.to.emit(legacy, "FundsDepositedinToken")
        .withArgs(
          user1.address,
          subscriptionId,
          await usdt.getAddress(),
          tokenAmounts[0],
          block?.timestamp
        );

      // Check both ETH and token balance
      const subscription = await legacy.getSubscriptionById_withTokens(
        user1.address,
        subscriptionId
      );
      expect(subscription.ethBalance).to.equal(ethAmount);
      expect(
        await legacy.getTokenBalanceOfUserAgainstIDForToken(
          user1.address,
          subscriptionId,
          await usdt.getAddress()
        )
      ).to.equal(tokenAmounts[0]);
    });
  });

  describe("Error Handling", function () {
    it("should revert if tokens and amounts arrays have different lengths", async function () {
      const tokenAmounts = [ethers.parseEther("10")];

      await expect(
        legacy
          .connect(user1)
          .depositFunds(
            [await usdt.getAddress(), await busd.getAddress()],
            tokenAmounts,
            subscriptionId
          )
      ).to.be.revertedWith("Tokens and amounts length mismatch");
    });

    it("should revert if the subscription ID is invalid", async function () {
      const invalidSubscriptionId = 999;
      const ethAmount = ethers.parseEther("1");

      await expect(
        legacy
          .connect(user1)
          .depositFunds([], [], invalidSubscriptionId, { value: ethAmount })
      ).to.be.revertedWith("Invalid ID");
    });

    it("should revert if the caller is not the owner of the subscription", async function () {
      const ethAmount = ethers.parseEther("1");

      await expect(
        legacy
          .connect(user2)
          .depositFunds([], [], subscriptionId, { value: ethAmount })
      ).to.be.revertedWith("Not activated by you");
    });

    it("should revert if the subscription has expired", async function () {
      // Simulate time passage to expire the subscription
      await ethers.provider.send("evm_increaseTime", [370 * 24 * 60 * 60]); // 370 days
      await ethers.provider.send("evm_mine", []);

      const ethAmount = ethers.parseEther("1");

      await expect(
        legacy
          .connect(user1)
          .depositFunds([], [], subscriptionId, { value: ethAmount })
      ).to.be.revertedWith("Time Elapsed");
    });

    it("should revert if token amount is zero", async function () {
      const tokenAmounts = [0];

      await expect(
        legacy
          .connect(user1)
          .depositFunds([await usdt.getAddress()], tokenAmounts, subscriptionId)
      ).to.be.revertedWith("Invalid amount");
    });

    it("should revert if no ETH or tokens are deposited", async function () {
      await expect(
        legacy.connect(user1).depositFunds([], [], subscriptionId)
      ).to.be.revertedWith("No funds provided");
    });
  });

  describe("Edge Cases", function () {
    it("should emit a consolidated event for ETH and token deposits", async function () {
      const ethAmount = ethers.parseEther("1");
      const tokenAmounts = [ethers.parseEther("10")];

      const tx = await legacy
        .connect(user1)
        .depositFunds([await usdt.getAddress()], tokenAmounts, subscriptionId, {
          value: ethAmount,
        });
      const block = await ethers.provider.getBlock(tx.blockHash ?? 0);

      await expect(tx)
        .to.emit(legacy, "FundsDeposited_Consolidated")
        .withArgs(
          user1.address,
          subscriptionId,
          ethAmount,
          [await usdt.getAddress()],
          tokenAmounts,
          block?.timestamp
        );
    });

    it("should handle multiple deposits of ETH and tokens correctly", async function () {
      const ethAmount1 = ethers.parseEther("1");
      const ethAmount2 = ethers.parseEther("0.5");
      const tokenAmounts = [ethers.parseEther("10"), ethers.parseEther("20")];

      // First deposit of ETH
      await legacy
        .connect(user1)
        .depositFunds([], [], subscriptionId, { value: ethAmount1 });

      // Second deposit of ETH and tokens
      await legacy
        .connect(user1)
        .depositFunds(
          [await usdt.getAddress(), await busd.getAddress()],
          tokenAmounts,
          subscriptionId,
          { value: ethAmount2 }
        );

      // Check the final ETH balance
      const subscription = await legacy.getSubscriptionById_withTokens(
        user1.address,
        subscriptionId
      );
      expect(subscription.ethBalance).to.equal(ethAmount1 + ethAmount2);

      // Check the token balances
      expect(
        await legacy.getTokenBalanceOfUserAgainstIDForToken(
          user1,
          subscriptionId,
          await usdt.getAddress()
        )
      ).to.equal(tokenAmounts[0]);
      expect(
        await legacy.getTokenBalanceOfUserAgainstIDForToken(
          user1,
          subscriptionId,
          await busd.getAddress()
        )
      ).to.equal(tokenAmounts[1]);
    });

    it("should allow depositing into multiple subscriptions for the same user", async function () {
      // Activate another subscription for user1
      await legacy
        .connect(user1)
        .activateSubscription(user2.address, ethers.ZeroAddress, {
          value: ethers.parseEther("1"),
        });
      const secondSubscriptionId = 2;

      const ethAmount1 = ethers.parseEther("1");
      const ethAmount2 = ethers.parseEther("0.5");

      // Deposit into first subscription
      await legacy
        .connect(user1)
        .depositFunds([], [], subscriptionId, { value: ethAmount1 });

      // Deposit into second subscription
      await legacy
        .connect(user1)
        .depositFunds([], [], secondSubscriptionId, { value: ethAmount2 });

      // Check the ETH balances for both subscriptions
      const subscription1 = await legacy.getSubscriptionById_withTokens(
        user1.address,
        subscriptionId
      );
      const subscription2 = await legacy.getSubscriptionById_withTokens(
        user1.address,
        secondSubscriptionId
      );

      expect(subscription1.ethBalance).to.equal(ethAmount1);
      expect(subscription2.ethBalance).to.equal(ethAmount2);
    });

    it("should handle large deposits without overflow", async function () {
      const largeAmount = ethers.parseEther("1000"); // 1 million ETH equivalent
      const largeTokenAmount = ethers.parseEther("1000"); // 1 million tokens equivalent

      // Deposit large amounts of ETH and tokens
      await legacy
        .connect(user1)
        .depositFunds(
          [await usdt.getAddress()],
          [largeTokenAmount],
          subscriptionId,
          {
            value: largeAmount,
          }
        );

      // Check the ETH balance
      const subscription = await legacy.getSubscriptionById_withTokens(
        user1.address,
        subscriptionId
      );
      expect(subscription.ethBalance).to.equal(largeAmount);

      // Check the token balance
      expect(
        await legacy.getTokenBalanceOfUserAgainstIDForToken(
          user1,
          subscriptionId,
          await usdt.getAddress()
        )
      ).to.equal(largeTokenAmount);
    });

    it("should correctly handle subscriptions with multiple users", async function () {
      // Activate a subscription for user2
      await legacy
        .connect(user2)
        .activateSubscription(user1.address, ethers.ZeroAddress, {
          value: ethers.parseEther("1"),
        });
      const secondSubscriptionId = 2;

      const ethAmount = ethers.parseEther("2");

      // Deposit into both user1 and user2 subscriptions
      await legacy
        .connect(user1)
        .depositFunds([], [], subscriptionId, { value: ethAmount });
      await legacy
        .connect(user2)
        .depositFunds([], [], secondSubscriptionId, { value: ethAmount });

      // Check the ETH balance for both subscriptions
      const subscription1 = await legacy.getSubscriptionById_withTokens(
        user1.address,
        subscriptionId
      );
      const subscription2 = await legacy.getSubscriptionById_withTokens(
        user2.address,
        secondSubscriptionId
      );

      expect(subscription1.ethBalance).to.equal(ethAmount);
      expect(subscription2.ethBalance).to.equal(ethAmount);
    });
  });
});
