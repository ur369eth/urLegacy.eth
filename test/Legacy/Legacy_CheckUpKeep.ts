import { expect } from "chai";
import { ethers } from "hardhat";
import {
  AggregatorV3Mock,
  Legacy,
  StableCoinMock,
} from "../../typechain-types";

describe("Legacy Contract - CheckUpKeep", function () {
  let legacy: Legacy;
  let mockPriceFeed: AggregatorV3Mock;
  let usdt: StableCoinMock;
  let busd: StableCoinMock;
  let owner: any;
  let user1: any;
  let user2: any;
  let heir: any;

  // Assume the subscription period and grace period are set
  let subscriptionPeriodTimeLimit: number;
  let gracePeriodTimeLimit: number;
  let priceFeedAddress: string;
  let allowedStablecoins: string[];
  let activeIdsOfSystem: bigint[];
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

    // // Activate a subscription for user1
    // await legacy
    //   .connect(user1)
    //   .activateSubscription(heir.address, ethers.ZeroAddress, {
    //     value: ethers.parseEther("1"),
    //   });

    // Assume the subscription period and grace period are set
    subscriptionPeriodTimeLimit = 369 * 24 * 60 * 60; // 1 year in seconds
    gracePeriodTimeLimit = 36 * 24 * 60 * 60 + 9 * 60 * 60; // 36 days and 9 hours in seconds

    activeIdsOfSystem = await legacy.getActiveIdsOfSystem();

    // await legacy.connect(user1).depositFunds([], [], activeIdsOfSystem[0], {
    //   value: ethers.parseEther("1"),
    // });
  });

  describe("General Flow", function () {
    it("should return upkeepNeeded = true for expired subscriptions", async () => {
      // Activate a subscription for user1
      await legacy
        .connect(user1)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: ethers.parseEther("1"),
        });
      // Activate a subscription for user2
      await legacy
        .connect(user2)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: ethers.parseEther("1"),
        });
      activeIdsOfSystem = await legacy.getActiveIdsOfSystem();
      await legacy.connect(user1).depositFunds([], [], activeIdsOfSystem[0], {
        value: ethers.parseEther("1"),
      });
      await legacy.connect(user2).depositFunds([], [], activeIdsOfSystem[1], {
        value: ethers.parseEther("1"),
      });
      // Simulate the passage of time beyond the subscription and grace period
      const timeToExpire =
        subscriptionPeriodTimeLimit + gracePeriodTimeLimit + 1;
      await ethers.provider.send("evm_increaseTime", [timeToExpire]);
      await ethers.provider.send("evm_mine", []);

      const [upkeepNeeded, performData] = await legacy.checkUpkeep(
        ethers.encodeBytes32String("some String")
      );

      expect(upkeepNeeded).to.equal(true);

      // Decode performData to check that expired subscription IDs are returned
      const expiredIds = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint256[]"],
        performData
      )[0]; // [0] because it is returning nested array Result(1) [ Result(2) [ 1n, 2n ] ] and we just need only Result(2) [ 1n, 2n ]
      expect(expiredIds.length).to.equal(2); // Both subscriptions should be expired
      expect(expiredIds[0]).to.equal(activeIdsOfSystem[0]);
      expect(expiredIds[1]).to.equal(activeIdsOfSystem[1]);
    });

    it("should return upkeepNeeded = false for active subscriptions", async () => {
      // Activate a subscription for user1
      await legacy
        .connect(user1)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: ethers.parseEther("1"),
        });
      // Activate a subscription for user2
      await legacy
        .connect(user2)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: ethers.parseEther("1"),
        });
      activeIdsOfSystem = await legacy.getActiveIdsOfSystem();
      await legacy.connect(user1).depositFunds([], [], activeIdsOfSystem[0], {
        value: ethers.parseEther("1"),
      });
      await legacy.connect(user2).depositFunds([], [], activeIdsOfSystem[1], {
        value: ethers.parseEther("1"),
      });
      // Simulate the passage of time within the subscription period
      const timeToExpire =
        subscriptionPeriodTimeLimit + gracePeriodTimeLimit - 10;
      await ethers.provider.send("evm_increaseTime", [timeToExpire]);
      await ethers.provider.send("evm_mine", []);

      const [upkeepNeeded, performData] = await legacy.checkUpkeep(
        ethers.encodeBytes32String("some String")
      );

      expect(upkeepNeeded).to.equal(false);
      expect(performData).to.equal("0x"); // No expired subscriptions, so performData should be empty
    });
  });

  describe("Edge Cases", function () {
    it("should return upkeepNeeded = true if only one subscription is expired", async () => {
      // Activate a subscription for user1
      await legacy
        .connect(user1)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: ethers.parseEther("1"),
        });
      activeIdsOfSystem = await legacy.getActiveIdsOfSystem();
      await legacy.connect(user1).depositFunds([], [], activeIdsOfSystem[0], {
        value: ethers.parseEther("1"),
      });
      // Simulate the first subscription expiry
      const timeToExpireFirst =
        subscriptionPeriodTimeLimit + gracePeriodTimeLimit + 1;
      await ethers.provider.send("evm_increaseTime", [timeToExpireFirst]);
      await ethers.provider.send("evm_mine", []);

      const [upkeepNeeded, performData] = await legacy.checkUpkeep(
        ethers.encodeBytes32String("some String")
      );

      expect(upkeepNeeded).to.equal(true);

      // Decode performData to check that only the first subscription ID is returned
      const expiredIds = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint256[]"],
        performData
      )[0];
      expect(expiredIds.length).to.equal(1); // Only one subscription should be expired
      expect(expiredIds[0]).to.equal(activeIdsOfSystem[0]);
    });

    it("should handle when no active subscriptions are in the system", async () => {
      // Simulate no active subscriptions in the system
      const [upkeepNeeded, performData] = await legacy.checkUpkeep(
        ethers.encodeBytes32String("some String")
      );

      expect(upkeepNeeded).to.equal(false);
      expect(performData).to.equal("0x"); // No active subscriptions, performData should be empty
    });

    it("should handle if no subscriptions are expired", async () => {
      // Activate a subscription for user1
      await legacy
        .connect(user1)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: ethers.parseEther("1"),
        });
      // Activate a subscription for user2
      await legacy
        .connect(user2)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: ethers.parseEther("1"),
        });
      activeIdsOfSystem = await legacy.getActiveIdsOfSystem();
      await legacy.connect(user1).depositFunds([], [], activeIdsOfSystem[0], {
        value: ethers.parseEther("1"),
      });
      await legacy.connect(user2).depositFunds([], [], activeIdsOfSystem[1], {
        value: ethers.parseEther("1"),
      });

      // Assume the subscriptions are still within their active period
      const timeToExpire =
        subscriptionPeriodTimeLimit + gracePeriodTimeLimit - 10;
      await ethers.provider.send("evm_increaseTime", [timeToExpire]);
      await ethers.provider.send("evm_mine", []);

      const [upkeepNeeded, performData] = await legacy.checkUpkeep(
        ethers.encodeBytes32String("some String")
      );

      expect(upkeepNeeded).to.equal(false);
      expect(performData).to.equal("0x"); // No expired subscriptions, performData should be empty
    });

    it("should handle if all subscriptions are expired", async () => {
      // Activate a subscription for user1
      await legacy
        .connect(user1)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: ethers.parseEther("1"),
        });
      // Activate a subscription for user2
      await legacy
        .connect(user2)
        .activateSubscription(heir.address, ethers.ZeroAddress, {
          value: ethers.parseEther("1"),
        });
      activeIdsOfSystem = await legacy.getActiveIdsOfSystem();
      await legacy.connect(user1).depositFunds([], [], activeIdsOfSystem[0], {
        value: ethers.parseEther("1"),
      });
      await legacy.connect(user2).depositFunds([], [], activeIdsOfSystem[1], {
        value: ethers.parseEther("1"),
      });

      // Simulate time passing so that all subscriptions are expired
      const timeToExpireAll =
        subscriptionPeriodTimeLimit + gracePeriodTimeLimit + 1;
      await ethers.provider.send("evm_increaseTime", [timeToExpireAll]);
      await ethers.provider.send("evm_mine", []);

      const [upkeepNeeded, performData] = await legacy.checkUpkeep(
        ethers.encodeBytes32String("some String")
      );

      expect(upkeepNeeded).to.equal(true);

      // Decode performData to check that all subscription IDs are returned
      const expiredIds = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint256[]"],
        performData
      )[0];
      expect(expiredIds.length).to.equal(2); // Both subscriptions should be expired
    });
  });

  describe("Events and State Integrity", function () {
    it("should not alter any state during checkUpkeep", async () => {
      // Ensure that calling checkUpkeep does not modify any state
      const [upkeepNeededBefore, performDataBefore] = await legacy.checkUpkeep(
        ethers.encodeBytes32String("some String")
      );

      // Call checkUpkeep again and verify that the state remains the same
      const [upkeepNeededAfter, performDataAfter] = await legacy.checkUpkeep(
        ethers.encodeBytes32String("some String")
      );

      expect(upkeepNeededBefore).to.equal(upkeepNeededAfter);
      expect(performDataBefore).to.equal(performDataAfter);
    });

    it("should work correctly when no subscriptions are expired and performData is empty", async () => {
      const [upkeepNeeded, performData] = await legacy.checkUpkeep(
        ethers.encodeBytes32String("some String")
      );

      expect(upkeepNeeded).to.equal(false);
      expect(performData).to.equal("0x"); // No expired subscriptions, performData should be empty
    });
  });
});
