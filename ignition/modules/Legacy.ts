import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers, network } from "hardhat";
import { ChainlinkAddresses, contractAddresses } from "../../helper/contracts";

const LegacyModule = buildModule("LegacyModule", (m) => {
  // const initialSupply = m.getParameter(
  //   "initialSupply",
  //   ethers.utils.parseEther("1000000")
  // );

  // Retrieve deployer account address
  const deployer = m.getAccount(0);

  // Deploy the stable tokens first
  // const busd = m.contract("BUSD", []);
  // const gho = m.contract("GHO", []);
  // const usdt = m.contract("USDT", [6]);

  const networkName = network.name;

  // Define allowed stablecoins (addresses of the deployed contracts)
  // const allowedStableCoins = [busd, gho, usdt];
  const allowedStableCoins = m.getParameter("allowedStableCoins", [
    "0x80366C8502326eDE6B4DCB46fcE7Cc88378Eda07",
    "0xc6c3131A37398e1FE41047Adb5fAC4DB35d9862F",
    "0xa288F22F28100459C2202Ef6d3ddA6233f5A8621",
    "0x182272CF384b4BF46efFfdE61c75101664CdEE8A",
  ]);

  // Define Chainlink price feed address (use the correct one for the network)
  const priceFeedAddress = m.getParameter(
    "priceFeedAddress",
    (contractAddresses[networkName].chainlink as ChainlinkAddresses)
      .priceFeedETHUSD
  );

  // Deploy the Legacy contract with the addresses of the tokens and deployer address as the subscription and gas fee receiver
  const legacy = m.contract("urLegacy", [
    priceFeedAddress,
    allowedStableCoins, // _allowedStableCoins
  ]);

  return { legacy };
});

export default LegacyModule;
