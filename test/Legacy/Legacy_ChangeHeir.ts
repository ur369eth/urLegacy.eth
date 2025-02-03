import { expect } from "chai";
import { ethers } from "hardhat";
import {
  AggregatorV3Mock,
  Legacy,
  ReentrantMock,
  StableCoinMock,
} from "../../typechain-types"; // Ensure you import the correct types

describe("Legacy Contract - Change Heir", function () {
  let legacy: Legacy;
  let mockPriceFeed: AggregatorV3Mock;
  let usdt: StableCoinMock;
  let busd: StableCoinMock;
  let owner: any;
  let user1: any;
  let user2: any;
  let heir: any;

  let priceFeedAddress: string;
  let allowedStablecoins: string[];
  const initialSupply = ethers.parseEther("1000000");
  const subscriptionId = 1;

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

    // Activate a subscription before testing renewals
    await legacy
      .connect(user1)
      .activateSubscription(await heir.getAddress(), await usdt.getAddress(), {
        value: ethers.parseEther("1"),
      });
  });

  it("should allow the owner to change the heir", async function () {
    const newHeirAddress = user2.address;

    // Change the heir
    const tx = await legacy
      .connect(user1)
      .changeHeir(subscriptionId, newHeirAddress);
    const block = await ethers.provider.getBlock(tx.blockHash ?? 0);

    await expect(tx)
      .to.emit(legacy, "HeirChanged")
      .withArgs(
        user1.address,
        subscriptionId,
        block?.timestamp,
        newHeirAddress
      );

    // Verify the heir was updated
    const subscription = await legacy.getSubscriptionById_withTokens(
      user1.address,
      subscriptionId
    );
    expect(subscription.heir).to.equal(newHeirAddress);
  });

  it("should revert if the new heir address is zero", async function () {
    const invalidHeir = ethers.ZeroAddress;

    await expect(
      legacy.connect(user1).changeHeir(subscriptionId, invalidHeir)
    ).to.be.revertedWith("New heir address cannot be zero");
  });

  it("should revert if the subscription ID is invalid", async function () {
    const invalidSubscriptionId = 9999; // Assuming this ID doesn't exist
    await expect(
      legacy.connect(user1).changeHeir(invalidSubscriptionId, user2.address)
    ).to.be.revertedWith("Invalid ID");
  });

  it("should revert if a non-owner tries to change the heir", async function () {
    const newHeirAddress = user2.address;

    await expect(
      legacy.connect(owner).changeHeir(subscriptionId, newHeirAddress)
    ).to.be.revertedWith(
      "Only the owner of this subscription can change the heir"
    );
  });

  it("should revert if the subscription has expired", async function () {
    // Simulate passage of time beyond the subscription's valid period
    await ethers.provider.send("evm_increaseTime", [370 * 24 * 60 * 60]); // 370 days
    await ethers.provider.send("evm_mine", []);

    const newHeirAddress = user2.address;

    await expect(
      legacy.connect(user1).changeHeir(subscriptionId, newHeirAddress)
    ).to.be.revertedWith("Time Elapsed");
  });

  it("should update the heir and emit the HeirChanged event", async function () {
    const newHeirAddress = user2.address;

    // Change the heir
    const tx = await legacy
      .connect(user1)
      .changeHeir(subscriptionId, newHeirAddress);
    const block = await ethers.provider.getBlock(tx.blockHash ?? 0);
    await expect(tx)
      .to.emit(legacy, "HeirChanged")
      .withArgs(
        user1.address,
        subscriptionId,
        block?.timestamp,
        newHeirAddress
      );

    // Verify the heir was updated
    const subscription = await legacy.getSubscriptionById_withTokens(
      user1.address,
      subscriptionId
    );
    expect(subscription.heir).to.equal(newHeirAddress);
  });

  it("should not allow changing the heir for a non-existent subscription", async function () {
    const invalidSubscriptionId = 999;

    await expect(
      legacy.connect(user1).changeHeir(invalidSubscriptionId, user2.address)
    ).to.be.revertedWith("Invalid ID");
  });
});
