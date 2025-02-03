import { ethers } from "hardhat";
import { expect } from "chai";
import { Legacy, AggregatorV3Mock, StableCoinMock } from "../typechain-types"; // Adjust this based on your actual contract names

describe("Legacy Contract", function () {
  let legacy: Legacy;
  let mockPriceFeed: AggregatorV3Mock;
  let usdt: StableCoinMock;
  let busd: StableCoinMock;
  let gho: StableCoinMock;
  let usdc: StableCoinMock;
  let owner: any;
  let addr1: any;

  const initialSupply = ethers.parseEther("1000000");

  // Parameters to pass to the constructor
  let allowedStablecoins: string[];
  let priceFeedAddress: string;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();

    // Deploy mock stablecoins (USDT, BUSD, etc.)
    const StableCoinMockFactory = await ethers.getContractFactory(
      "StableCoinMock"
    );
    usdt = (await StableCoinMockFactory.deploy(
      initialSupply
    )) as StableCoinMock;
    busd = (await StableCoinMockFactory.deploy(
      initialSupply
    )) as StableCoinMock;
    gho = (await StableCoinMockFactory.deploy(initialSupply)) as StableCoinMock;
    usdc = (await StableCoinMockFactory.deploy(
      initialSupply
    )) as StableCoinMock;

    await usdt.waitForDeployment();
    await busd.waitForDeployment();
    await gho.waitForDeployment();
    await usdc.waitForDeployment();

    allowedStablecoins = [
      await usdt.getAddress(),
      await busd.getAddress(),
      await gho.getAddress(),
      await usdc.getAddress(),
    ]; // Add more if needed

    // Deploy mock price feed
    const MockAggregatorV3 = await ethers.getContractFactory(
      "AggregatorV3Mock"
    );
    mockPriceFeed = await MockAggregatorV3.deploy();

    priceFeedAddress = await mockPriceFeed.getAddress();

    // Deploy the Legacy contract
    const LegacyFactory = await ethers.getContractFactory("Legacy");
    legacy = (await LegacyFactory.deploy(
      allowedStablecoins,
      priceFeedAddress
    )) as Legacy;
    await legacy.waitForDeployment();
  });

  // Deployment and initialization
  describe("Deployment", function () {
    // Test: Ensure the owner is set correctly
    it("should set the correct owner", async function () {
      expect(await legacy.owner()).to.equal(owner.address);
    });

    // Test: Ensure the allowed stablecoins are initialized properly
    it("should add allowed stablecoins correctly", async function () {
      expect(
        await legacy.isAllowedStablecoin(await busd.getAddress())
      ).to.equal(true);
      expect(
        await legacy.isAllowedStablecoin(await busd.getAddress())
      ).to.equal(true);
      expect(await legacy.isAllowedStablecoin(await gho.getAddress())).to.equal(
        true
      );
    });

    // Test: Ensure the any new stablecoin is not allowed and then add it and again check
    it("should check new stableCoin is not allowed and after adding it is allowed", async function () {
      const StableCoinMockFactory = await ethers.getContractFactory(
        "StableCoinMock"
      );
      let stableCoin = (await StableCoinMockFactory.deploy(
        initialSupply
      )) as StableCoinMock;
      await stableCoin.waitForDeployment();
      expect(
        await legacy.isAllowedStablecoin(await stableCoin.getAddress())
      ).to.equal(false);

      await legacy.addAllowedStablecoin(await stableCoin.getAddress());

      expect(
        await legacy.isAllowedStablecoin(await stableCoin.getAddress())
      ).to.equal(true); // It should now be allowed
    });

    // Test: Ensure the number of allowedStable coins is correct
    it("should return the correct number of allowed stablecoins", async function () {
      expect(await legacy.getNumberOfStablecoins()).to.equal(
        allowedStablecoins.length
      );
    });

    // Test: Ensure the price feed is set correctly
    it("should set the price feed address correctly", async function () {
      expect(await legacy.priceFeed()).to.equal(priceFeedAddress);
    });
  });
});
