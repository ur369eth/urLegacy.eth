import { expect } from "chai";
import { ethers } from "hardhat";
import {
  AggregatorV3Mock,
  Legacy,
  StableCoinMock,
} from "../../typechain-types";

describe("Legacy Contract - PerformUpKeep", function () {
  let legacy: Legacy;
  let mockPriceFeed: AggregatorV3Mock;
  let usdt: StableCoinMock;
  let busd: StableCoinMock;
  let owner: any;
  let user1: any;
  let user2: any;
  let user3: any;
  let heir: any;

  // Assume the subscription period and grace period are set
  let priceFeedAddress: string;
  let allowedStablecoins: string[];
  const initialSupply = ethers.parseEther("1000000");

  beforeEach(async function () {
    // Deploy the contract and necessary mocks before each test case
    [owner, user1, user2, user3, heir] = await ethers.getSigners();

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

    // mint some tokens
    await usdt.mint(ethers.parseEther("1000000"));
    await busd.mint(ethers.parseEther("1000000"));
  });

  describe("Basic Functionality", function () {
    it("should transfer ETH and tokens to the heir and deactivate the subscription", async function () {
      // Set up a subscription with both ETH and tokens
      const subscriptionId = 1;
      const ethAmount = ethers.parseEther("1");
      const tokenAmount = ethers.parseEther("100");

      await legacy.activateSubscription(heir.address, ethers.ZeroAddress, {
        value: ethAmount,
      });
      await usdt.approve(await legacy.getAddress(), tokenAmount);

      // deposit eth and tokens
      await legacy.depositFunds(
        [await usdt.getAddress()],
        [tokenAmount],
        subscriptionId,
        { value: ethers.parseEther("10") }
      );

      // Check initial balances
      const initialHeirEthBalance = await ethers.provider.getBalance(
        heir.address
      );
      const initialHeirTokenBalance = await usdt.balanceOf(heir.address);

      // Perform upkeep
      const performData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256[]"],
        [[subscriptionId]]
      );
      await legacy.performUpkeep(performData);

      //   Check updated balances
      const finalHeirEthBalance = await ethers.provider.getBalance(
        heir.address
      );
      const finalHeirTokenBalance = await usdt.balanceOf(heir.address);

      //   expect(finalHeirEthBalance - initialHeirEthBalance).to.equal(ethAmount);
      expect(finalHeirTokenBalance - initialHeirTokenBalance).to.equal(
        tokenAmount
      );

      //   // Check that subscription is deactivated
      expect(await legacy.idStatus(subscriptionId)).to.be.false;

      // Check that the ETH and token balances are reset
      const subscription = await legacy.getSubscriptionById_withTokens(
        user1.address,
        subscriptionId
      );
      expect(subscription.ethBalance).to.equal(0);
      expect(
        await legacy.getTokenBalanceOfUserAgainstIDForToken(
          owner,
          subscriptionId,
          await usdt.getAddress()
        )
      ).to.equal(0);

      //   // Check that the subscription is removed from active IDs
      expect((await legacy.getActiveIdsOfSystem()).length).to.equal(0);
    });
  });

  describe("Edge Cases", function () {
    it("should handle subscriptions with zero ETH balance", async function () {
      const subscriptionId = 1;
      const tokenAmount = ethers.parseUnits("100", 18);

      await usdt.approve(await legacy.getAddress(), await legacy.baseFeeUSD());

      await legacy.activateSubscription(heir.address, await usdt.getAddress());

      await usdt.approve(await legacy.getAddress(), tokenAmount);
      await legacy.depositFunds(
        [await usdt.getAddress()],
        [tokenAmount],
        subscriptionId
      );

      // Perform upkeep
      const performData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256[]"],
        [[subscriptionId]]
      );
      await legacy.performUpkeep(performData);

      // Check that ETH balance remains zero
      const subscription = await legacy.getSubscriptionById_withTokens(
        owner,
        subscriptionId
      );
      expect(subscription.ethBalance).to.equal(0);
    });

    it("should handle subscriptions with zero token balance", async function () {
      const subscriptionId = 1;
      const ethAmount = ethers.parseEther("1");

      await legacy.activateSubscription(heir.address, ethers.ZeroAddress, {
        value: ethAmount,
      });

      // Perform upkeep
      const performData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256[]"],
        [[subscriptionId]]
      );
      await legacy.performUpkeep(performData);

      // Check that token balance remains zero
      expect(
        await legacy.getTokenBalanceOfUserAgainstIDForToken(
          owner,
          subscriptionId,
          await usdt.getAddress()
        )
      ).to.equal(0);
    });
  });

  describe("Reverts and Error Handling", function () {
    it("should revert if the subscription ID is not valid", async function () {
      const invalidId = 999;

      // Prepare the performData with invalid subscription ID
      const performData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256[]"],
        [[invalidId]]
      );

      // Expect the transaction to revert
      await expect(legacy.performUpkeep(performData)).to.be.revertedWith(
        "Invalid ID"
      );
    });
  });

  describe("State Changes", function () {
    it("should reset ETH and token balances to zero after transfers", async function () {
      const subscriptionId = 1;
      const ethAmount = ethers.parseEther("2");
      const tokenAmount = ethers.parseUnits("50", 18);

      await legacy.activateSubscription(heir.address, ethers.ZeroAddress, {
        value: ethAmount,
      });

      await usdt.approve(await legacy.getAddress(), tokenAmount);
      await legacy.depositFunds(
        [await usdt.getAddress()],
        [tokenAmount],
        subscriptionId,
        { value: ethers.parseEther("10") }
      );

      let subscription = await legacy.getSubscriptionById_withTokens(
        owner.address,
        subscriptionId
      );
      expect(subscription.ethBalance).to.equal(ethers.parseEther("10"));
      expect(
        await legacy.getTokenBalanceOfUserAgainstIDForToken(
          owner,
          subscriptionId,
          await usdt.getAddress()
        )
      ).to.equal(tokenAmount);

      // Perform upkeep
      const performData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256[]"],
        [[subscriptionId]]
      );
      await legacy.performUpkeep(performData);

      // Check that balances are reset
      subscription = await legacy.getSubscriptionById_withTokens(
        user1.address,
        subscriptionId
      );
      expect(subscription.ethBalance).to.equal(0);
      expect(
        await legacy.getTokenBalanceOfUserAgainstIDForToken(
          owner,
          subscriptionId,
          await usdt.getAddress()
        )
      ).to.equal(0);
    });
  });

  describe("Event Emmission", function () {
    it("should emit SubscriptionDeactivated after upkeep", async function () {
      const subscriptionId = 1;
      const ethAmount = ethers.parseEther("3");

      await legacy.activateSubscription(heir.address, ethers.ZeroAddress, {
        value: ethAmount,
      });

      const performData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256[]"],
        [[subscriptionId]]
      );

      const tx = await legacy.performUpkeep(performData);
      const block = await ethers.provider.getBlock(tx.blockHash ?? 0);
      await expect(tx)
        .to.emit(legacy, "SubscriptionDeactivated")
        .withArgs(
          subscriptionId,
          owner.address,
          heir.address,
          block?.timestamp
        ); // Verify the arguments
    });
  });
});
