import { expect } from "chai";
import { ethers } from "hardhat";
import {
  AggregatorV3Mock,
  Legacy,
  StableCoinMock,
} from "../../typechain-types";

describe("Legacy Contract - WithdrawFunds", function () {
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

    // activate subscription 1
    const ethAmount = await legacy.calculateETHFee();
    subscriptionId = 1;
    await legacy
      .connect(user1)
      .depositFunds([], [], subscriptionId, { value: ethAmount });

    // deposit funds
    await usdt.connect(user1).mint(ethers.parseEther("10000"));
    await usdt
      .connect(user1)
      .approve(await legacy.getAddress(), ethers.parseEther("1000"));
    await legacy.connect(user1).depositFunds(
      [await usdt.getAddress()], // tokens
      [1000], // amounts
      subscriptionId // subscription ID
    );

    // Fund the contract with some ETH
    await legacy.connect(user1).depositFunds([], [], subscriptionId, {
      value: ethers.parseEther("10"),
    });
  });

  describe("General Flow", function () {
    it("should allow user to withdraw ETH", async () => {
      const initialEthBalance = await ethers.provider.getBalance(
        await user1.getAddress()
      );

      const ethBalanceBefore = (
        await legacy.getSubscriptionById_withTokens(user1, subscriptionId)
      ).ethBalance;
      // Withdraw 1 ETH
      await legacy
        .connect(user1)
        .withdrawFunds(ethers.parseEther("1"), [], [], subscriptionId);

      const ethBalanceAfter = (
        await legacy.getSubscriptionById_withTokens(user1, subscriptionId)
      ).ethBalance;

      const finalEthBalance = await ethers.provider.getBalance(
        await user1.getAddress()
      );
      expect(finalEthBalance).to.be.gt(initialEthBalance); // Assert that ETH balance increases
      expect(ethBalanceBefore - ethers.parseEther("1")).to.equal(
        ethBalanceAfter
      );
    });

    it("should allow user to withdraw tokens", async () => {
      const initialTokenBalance = await usdt.balanceOf(
        await user1.getAddress()
      );

      const balanceBefore = await legacy.getTokenBalanceOfUserAgainstIDForToken(
        user1,
        subscriptionId,
        await usdt.getAddress()
      );

      // Withdraw 500 tokens
      await legacy
        .connect(user1)
        .withdrawFunds(0, [await usdt.getAddress()], [500], subscriptionId);

      const balanceAfter = await legacy.getTokenBalanceOfUserAgainstIDForToken(
        user1,
        subscriptionId,
        await usdt.getAddress()
      );
      const finalTokenBalance = await usdt.balanceOf(await user1.getAddress());
      expect(finalTokenBalance).to.equal(initialTokenBalance + BigInt(500)); // Assert token balance increases
      expect(balanceAfter).to.equal(balanceBefore - BigInt(500)); // Assert token balance
    });

    it("should allow user to withdraw ETH and tokens in a single call", async () => {
      const initialEthBalance = await ethers.provider.getBalance(
        await user1.getAddress()
      );
      const initialTokenBalance = await usdt.balanceOf(
        await user1.getAddress()
      );

      const ethBalanceBeforeInContract = (
        await legacy.getSubscriptionById_withTokens(user1, subscriptionId)
      ).ethBalance;
      const tokenBalanceBeforeInContract =
        await legacy.getTokenBalanceOfUserAgainstIDForToken(
          user1,
          subscriptionId,
          await usdt.getAddress()
        );
      // Withdraw 1 ETH and 500 tokens
      await legacy
        .connect(user1)
        .withdrawFunds(
          ethers.parseEther("1"),
          [await usdt.getAddress()],
          [500],
          subscriptionId
        );

      const ethBalanceAfterInContract = (
        await legacy.getSubscriptionById_withTokens(user1, subscriptionId)
      ).ethBalance;
      const tokenBalanceAfterInContract =
        await legacy.getTokenBalanceOfUserAgainstIDForToken(
          user1,
          subscriptionId,
          await usdt.getAddress()
        );
      const finalEthBalance = await ethers.provider.getBalance(
        await user1.getAddress()
      );
      const finalTokenBalance = await usdt.balanceOf(await user1.getAddress());

      expect(finalEthBalance).to.be.gt(initialEthBalance); // ETH balance increases
      expect(finalTokenBalance).to.equal(initialTokenBalance + BigInt(500)); // Token balance increases

      expect(ethBalanceAfterInContract).to.equal(
        ethBalanceBeforeInContract - ethers.parseEther("1")
      );
      expect(tokenBalanceBeforeInContract).to.equal(
        tokenBalanceAfterInContract + BigInt(500)
      );
    });
  });

  describe("Error Handling", function () {
    it("should revert if tokens and amounts arrays length mismatch", async () => {
      await expect(
        legacy
          .connect(user1)
          .withdrawFunds(0, [await usdt.getAddress()], [], subscriptionId)
      ).to.be.revertedWith("Tokens and amounts length mismatch");
    });

    it("should revert if subscription ID is invalid", async () => {
      await expect(
        legacy
          .connect(user1)
          .withdrawFunds(0, [await usdt.getAddress()], [500], 999) // Invalid subscription ID
      ).to.be.revertedWith("Invalid ID");
    });

    it("should revert if user is not the subscription owner", async () => {
      await expect(
        legacy
          .connect(user2)
          .withdrawFunds(0, [await usdt.getAddress()], [500], subscriptionId)
      ).to.be.revertedWith("Not activated by you");
    });

    it("should revert if subscription has elapsed", async () => {
      // Simulate elapsed subscription time
      await ethers.provider.send("evm_increaseTime", [370 * 24 * 60 * 60]); // 370 days
      await ethers.provider.send("evm_mine", []);

      await expect(
        legacy
          .connect(user1)
          .withdrawFunds(0, [await usdt.getAddress()], [500], subscriptionId)
      ).to.be.revertedWith("Time Elapsed");
    });

    it("should revert if attempting to withdraw more ETH than available", async () => {
      await expect(
        legacy
          .connect(user1)
          .withdrawFunds(ethers.parseEther("100"), [], [], subscriptionId) // More than deposited
      ).to.be.revertedWith("Insufficient ETH balance");
    });

    it("should revert if token amount is zero", async () => {
      await expect(
        legacy
          .connect(user1)
          .withdrawFunds(0, [await usdt.getAddress()], [0], subscriptionId) // Zero token amount
      ).to.be.revertedWith("Invalid amount");
    });

    it("should revert if token is not deposited", async () => {
      await expect(
        legacy
          .connect(user1)
          .withdrawFunds(0, [await busd.getAddress()], [500], subscriptionId) // Token2 not deposited
      ).to.be.revertedWith("Token not deposited");
    });

    it("should revert if attempting to withdraw more tokens than available", async () => {
      await expect(
        legacy
          .connect(user1)
          .withdrawFunds(0, [await usdt.getAddress()], [2000], subscriptionId) // More than deposited
      ).to.be.revertedWith("Insufficient token balance");
    });
  });

  describe("Edge Cases", function () {
    it("should allow withdrawal of ETH without tokens", async () => {
      const initialEthBalance = await ethers.provider.getBalance(
        await user1.getAddress()
      );

      // Withdraw only ETH
      await legacy
        .connect(user1)
        .withdrawFunds(ethers.parseEther("1"), [], [], subscriptionId);

      const finalEthBalance = await ethers.provider.getBalance(
        await user1.getAddress()
      );
      expect(finalEthBalance).to.be.gt(initialEthBalance); // Assert ETH balance increases
    });

    it("should allow withdrawal of tokens without ETH", async () => {
      const initialTokenBalance = await usdt.balanceOf(
        await user1.getAddress()
      );

      // Withdraw only tokens
      await legacy
        .connect(user1)
        .withdrawFunds(0, [await usdt.getAddress()], [500], subscriptionId);

      const finalTokenBalance = await usdt.balanceOf(await user1.getAddress());
      expect(finalTokenBalance).to.equal(initialTokenBalance + BigInt(500)); // Assert token balance increases
    });

    it("should allow withdrawal of all ETH and zero tokens", async () => {
      const initialEthBalance = await ethers.provider.getBalance(
        await user1.getAddress()
      );

      // Withdraw all ETH, no tokens
      await legacy
        .connect(user1)
        .withdrawFunds(ethers.parseEther("5"), [], [], subscriptionId);

      const finalEthBalance = await ethers.provider.getBalance(
        await user1.getAddress()
      );
      expect(finalEthBalance).to.be.gt(initialEthBalance); // Assert ETH balance increases
    });

    it("should allow withdrawal of zero ETH and valid tokens", async () => {
      const initialTokenBalance = await usdt.balanceOf(
        await user1.getAddress()
      );

      // Withdraw zero ETH, valid tokens
      await legacy
        .connect(user1)
        .withdrawFunds(0, [await usdt.getAddress()], [500], subscriptionId);

      const finalTokenBalance = await usdt.balanceOf(await user1.getAddress());
      expect(finalTokenBalance).to.equal(initialTokenBalance + BigInt(500)); // Assert token balance increases
    });

    it("should allow withdrawal of tokens when balance equals the withdrawal amount", async () => {
      const initialTokenBalance = await usdt.balanceOf(
        await user1.getAddress()
      );

      // Withdraw the exact token amount
      await legacy
        .connect(user1)
        .withdrawFunds(0, [await usdt.getAddress()], [1000], subscriptionId);

      const finalTokenBalance = await usdt.balanceOf(await user1.getAddress());
      expect(finalTokenBalance).to.equal(initialTokenBalance + BigInt(1000)); // Assert token balance increases
    });

    it("should allow withdrawal of ETH when balance equals the withdrawal amount", async () => {
      const initialEthBalance = await ethers.provider.getBalance(
        await user1.getAddress()
      );

      // Withdraw the exact ETH amount
      await legacy
        .connect(user1)
        .withdrawFunds(ethers.parseEther("5"), [], [], subscriptionId);

      const finalEthBalance = await ethers.provider.getBalance(
        await user1.getAddress()
      );
      expect(finalEthBalance).to.be.gt(initialEthBalance); // Assert ETH balance increases
    });
  });

  describe("Event Emission", function () {
    it("should emit FundsWithdrawninETH when ETH is withdrawn", async () => {
      const tx = await legacy
        .connect(user1)
        .withdrawFunds(ethers.parseEther("1"), [], [], subscriptionId);
      const block = await ethers.provider.getBlock(tx.blockHash ?? 0);

      await expect(tx)
        .to.emit(legacy, "FundsWithdrawninETH")
        .withArgs(
          await user1.getAddress(),
          subscriptionId,
          ethers.parseEther("1"),
          block?.timestamp
        );
    });

    it("should emit FundsWithdrawninToken when tokens are withdrawn", async () => {
      const tx = await legacy
        .connect(user1)
        .withdrawFunds(0, [await usdt.getAddress()], [500], subscriptionId);
      const block = await ethers.provider.getBlock(tx.blockHash ?? 0);

      await expect(tx)
        .to.emit(legacy, "FundsWithdrawninToken")
        .withArgs(
          await user1.getAddress(),
          subscriptionId,
          await usdt.getAddress(),
          500,
          block?.timestamp
        );
    });

    it("should emit FundsWithdrawn_Consolidated after successful withdrawal", async () => {
      const tx = await legacy
        .connect(user1)
        .withdrawFunds(
          ethers.parseEther("1"),
          [await usdt.getAddress()],
          [500],
          subscriptionId
        );
      const block = await ethers.provider.getBlock(tx.blockHash ?? 0);

      await expect(tx)
        .to.emit(legacy, "FundsWithdrawn_Consolidated")
        .withArgs(
          await user1.getAddress(),
          subscriptionId,
          ethers.parseEther("1"),
          [await usdt.getAddress()],
          [500],
          block?.timestamp
        );
    });
  });
});
