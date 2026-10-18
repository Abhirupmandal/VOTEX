import { expect } from "chai";
import { ethers } from "hardhat";

describe("VotexFoundation", function () {
  it("exposes the project name", async function () {
    const factory = await ethers.getContractFactory("VotexFoundation");
    const foundation = await factory.deploy();
    await foundation.waitForDeployment();

    expect(await foundation.NAME()).to.equal("VOTEX");
  });

  it("reports the foundation version", async function () {
    const factory = await ethers.getContractFactory("VotexFoundation");
    const foundation = await factory.deploy();
    await foundation.waitForDeployment();

    expect(await foundation.version()).to.equal("0.1.0");
  });
});
