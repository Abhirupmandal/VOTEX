import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

export const Role = {
  ADMIN: ethers.ZeroHash, // DEFAULT_ADMIN_ROLE == 0x00
  ELECTION_MANAGER: ethers.keccak256(
    ethers.toUtf8Bytes("VOTEX_ELECTION_MANAGER_ROLE"),
  ),
  VOTER_REGISTRAR: ethers.keccak256(
    ethers.toUtf8Bytes("VOTEX_VOTER_REGISTRAR_ROLE"),
  ),
  SECURITY_OFFICER: ethers.keccak256(
    ethers.toUtf8Bytes("VOTEX_SECURITY_OFFICER_ROLE"),
  ),
  AUDITOR: ethers.keccak256(ethers.toUtf8Bytes("VOTEX_AUDITOR_ROLE")),
} as const;

export const ElectionState = {
  DRAFT: 0n,
  REGISTRATION: 1n,
  ACTIVE: 2n,
  PAUSED: 3n,
  ENDED: 4n,
  RESULTS_FINALIZED: 5n,
} as const;

/// @notice Canonical in-memory deployment of the full VOTEX core.
export interface VotexFixture {
  accessManager: any;
  voterRegistry: any;
  factory: any;
  controller: any;
  admin: HardhatEthersSigner;
  manager: HardhatEthersSigner;
  registrar: HardhatEthersSigner;
  officer: HardhatEthersSigner;
  auditor: HardhatEthersSigner;
  voter1: HardhatEthersSigner;
  voter2: HardhatEthersSigner;
  voter3: HardhatEthersSigner;
  outsider: HardhatEthersSigner;
}

/// @notice Deploys the access manager, voter registry, factory and emergency
///         controller in the correct dependency order and assigns every role.
export async function deployCore(): Promise<VotexFixture> {
  const [
    admin,
    manager,
    registrar,
    officer,
    auditor,
    voter1,
    voter2,
    voter3,
    outsider,
  ] = await ethers.getSigners();

  const accessManager = await (
    await ethers.getContractFactory("VotexAccessManager")
  ).deploy(admin.address);
  await accessManager.waitForDeployment();

  const voterRegistry = await (
    await ethers.getContractFactory("VoterRegistry")
  ).deploy(await accessManager.getAddress());
  await voterRegistry.waitForDeployment();

  const factory = await (
    await ethers.getContractFactory("ElectionFactory")
  ).deploy(await accessManager.getAddress(), await voterRegistry.getAddress());
  await factory.waitForDeployment();

  const controller = await (
    await ethers.getContractFactory("EmergencyController")
  ).deploy(await accessManager.getAddress(), await factory.getAddress());
  await controller.waitForDeployment();

  await accessManager.connect(admin).grantRole(Role.ELECTION_MANAGER, manager.address);
  await accessManager.connect(admin).grantRole(Role.VOTER_REGISTRAR, registrar.address);
  await accessManager.connect(admin).grantRole(Role.SECURITY_OFFICER, officer.address);
  await accessManager.connect(admin).grantRole(Role.AUDITOR, auditor.address);

  await factory.connect(admin).setEmergencyController(await controller.getAddress());

  return {
    accessManager,
    voterRegistry,
    factory,
    controller,
    admin,
    manager,
    registrar,
    officer,
    auditor,
    voter1,
    voter2,
    voter3,
    outsider,
  };
}

/// @notice Creates an election with a valid future registration/voting window.
/// @returns the numeric election id and the deployed election instance.
export async function createElection(
  f: VotexFixture,
  overrides: Partial<{
    title: string;
    description: string;
    registrationStart: number;
    registrationEnd: number;
    votingStart: number;
    votingEnd: number;
  }> = {},
): Promise<{ id: bigint; election: any }> {
  const now = await time.latest();
  const votingStart = overrides.votingStart ?? now + 2_000;
  const votingEnd = overrides.votingEnd ?? votingStart + 5_000;
  const registrationStart = overrides.registrationStart ?? now + 100;
  // Registration must close strictly before voting opens, so default it
  // relative to votingStart rather than to `now`.
  const registrationEnd = overrides.registrationEnd ?? votingStart - 100;

  const tx = await f.factory.connect(f.manager).createElection(
    overrides.title ?? "General Election 2026",
    overrides.description ?? "VOTEX hackathon election",
    registrationStart,
    registrationEnd,
    votingStart,
    votingEnd,
  );
  await tx.wait();

  const id = await f.factory.totalElections();
  const address = await f.factory.getElectionAddress(id);
  const election = await ethers.getContractAt("ElectionInstance", address);
  return { id, election };
}

/// @notice Adds a candidate under the manager account.
export async function addCandidate(
  f: VotexFixture,
  election: any,
  name: string,
  description = "",
): Promise<bigint> {
  const tx = await election.connect(f.manager).addCandidate(name, description);
  await tx.wait();
  return await election.candidateCount();
}
