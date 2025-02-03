import { expect } from "chai";
import { ethers } from "hardhat";
import {
  Legacy,
  StableCoinMock,
  AggregatorV3Mock,
} from "../../typechain-types";

describe("Legacy Smart Contract - Renew Subscription", function () {
  let legacy: Legacy;
  let mockPriceFeed: AggregatorV3Mock;
  let usdt: StableCoinMock;
  let busd: StableCoinMock;
  let owner: any;
  let user: any;
  let heir: any;

  let priceFeedAddress: string;
  let allowedStablecoins: string[];
  const initialSupply = ethers.parseEther("1000000");

  beforeEach(async function () {
    // Deploy the contract and necessary mocks before each test case
    [owner, user, heir] = await ethers.getSigners();

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

    // Activate a subscription before testing renewals
    await legacy
      .connect(user)
      .activateSubscription(await heir.getAddress(), await usdt.getAddress(), {
        value: ethers.parseEther("1"),
      });
  });

  it("should renew the subscription using ETH", async function () {
    const subscriptionId = 1; // Assuming the first subscription is created in beforeEach

    const ethFee = await legacy.calculateETHFee();

    // Renew the subscription with ETH
    const tx = await legacy
      .connect(user)
      .renewSubscription(ethers.ZeroAddress, subscriptionId, {
        value: ethFee,
      });
    const block = await ethers.provider.getBlock(tx.blockHash ?? 0);

    await expect(tx)
      .to.emit(legacy, "SubscriptionRenewed")
      .withArgs(
        await user.getAddress(),
        subscriptionId,
        block?.timestamp, // time is dynamic
        true,
        ethers.ZeroAddress
      );
  });

  it("should renew the subscription using USDT", async function () {
    const subscriptionId = 1;
    const baseFeeUSD = await legacy.baseFeeUSD();

    // Mint and approve USDT to user
    await usdt.connect(user).mint(ethers.parseEther("10000"));
    await usdt.connect(user).approve(await legacy.getAddress(), baseFeeUSD);

    // Renew the subscription with USDT
    const tx = await legacy
      .connect(user)
      .renewSubscription(await usdt.getAddress(), subscriptionId);
    const block = await ethers.provider.getBlock(tx.blockHash ?? 0);

    await expect(tx)
      .to.emit(legacy, "SubscriptionRenewed")
      .withArgs(
        await user.getAddress(),
        subscriptionId,
        block?.timestamp, // time is dynamic
        false,
        await usdt.getAddress()
      );

    const subscription = await legacy.getSubscriptionById_withTokens(
      await user.getAddress(),
      subscriptionId
    );
    expect(subscription.activationTime).to.be.closeTo(block?.timestamp, 2);
  });

  it("should fail to renew the subscription with incorrect stablecoin", async function () {
    const subscriptionId = 1;

    const FakeCoin = await ethers.getContractFactory("StableCoinMock");
    const fakeCoin = await FakeCoin.deploy(initialSupply);

    await expect(
      legacy
        .connect(user)
        .renewSubscription(await fakeCoin.getAddress(), subscriptionId)
    ).to.be.revertedWith("Incorrect stablecoin address");
  });

  it("should fail to renew the subscription if ETH fee is incorrect", async function () {
    const subscriptionId = 1;
    const ethFee = await legacy.calculateETHFee();

    await expect(
      legacy
        .connect(user)
        .renewSubscription(ethers.ZeroAddress, subscriptionId, {
          value: ethFee - BigInt(1),
        })
    ).to.be.revertedWith("Incorrect ETH subscription fee");
  });

  it("should refund excess ETH on renewal", async function () {
    const subscriptionId = 1;
    const ethFee = await legacy.calculateETHFee();

    const userBalanceBefore = await ethers.provider.getBalance(
      await user.getAddress()
    );

    // Renew subscription with excess ETH
    const tx = await legacy
      .connect(user)
      .renewSubscription(ethers.ZeroAddress, subscriptionId, {
        value: ethFee + ethers.parseEther("1"),
      });
    // Calculate gas cost
    const receipt = await tx.wait();

    const gasUsed = receipt?.gasUsed! * tx.gasPrice;
    const userBalanceAfter = await ethers.provider.getBalance(
      await user.getAddress()
    );

    expect(userBalanceAfter).to.equal(userBalanceBefore - ethFee - gasUsed);
  });

  it("should fail to renew an inactive subscription", async function () {
    const subscriptionId = 99; // Non-existent subscription ID
    expect(await legacy.idStatus(subscriptionId)).to.equal(false);
    await expect(
      legacy
        .connect(user)
        .renewSubscription(ethers.ZeroAddress, subscriptionId, {
          value: await legacy.calculateETHFee(),
        })
    ).to.be.revertedWith("Invalid ID");
  });

  it("should fail to renew a subscription if the time has elapsed", async function () {
    const subscriptionId = 1;

    // Advance time beyond the subscription period
    await ethers.provider.send("evm_increaseTime", [370 * 24 * 60 * 60]); // increase by 370 days
    await ethers.provider.send("evm_mine", []);

    await expect(
      legacy
        .connect(user)
        .renewSubscription(await usdt.getAddress(), subscriptionId)
    ).to.be.revertedWith("Time Elapsed");
  });

  it("should update the activation time upon renewal", async function () {
    const subscriptionId = 1;
    const baseFeeUSD = await legacy.baseFeeUSD();

    // Mint and approve USDT to user
    await usdt.connect(user).mint(ethers.parseEther("10000"));
    await usdt.connect(user).approve(await legacy.getAddress(), baseFeeUSD);

    const oldSubscription = await legacy.getSubscriptionById_withTokens(
      await user.getAddress(),
      subscriptionId
    );
    const oldActivationTime = oldSubscription.activationTime;

    // // Renew the subscription
    await legacy
      .connect(user)
      .renewSubscription(await usdt.getAddress(), subscriptionId);

    const newSubscription = await legacy.getSubscriptionById_withTokens(
      await user.getAddress(),
      subscriptionId
    );
    expect(newSubscription.activationTime).to.be.greaterThan(oldActivationTime);
  });
});
