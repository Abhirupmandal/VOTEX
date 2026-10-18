// Register the Hardhat chai matchers on this module's chai instance
// (reverted / revertedWithCustomError / emit). Relying solely on the plugin
// side-effect in hardhat.config.ts is not robust when Hardhat globs multiple
// spec files, so the assertion library is wired explicitly here.
import "@nomicfoundation/hardhat-chai-matchers";
import { expect } from "chai";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import {
  Role,
  ElectionState,
  deployCore,
  createElection,
  addCandidate,
} from "./helpers/fixtures";

describe("VOTEX Smart Contract Security Suite", function () {
  // ---------------------------------------------------------------
  // A. ACCESS CONTROL
  // ---------------------------------------------------------------
  describe("A. Access Control", function () {
    it("grants DEFAULT_ADMIN_ROLE to the deploying admin", async function () {
      const { accessManager, admin } = await loadFixture(deployCore);
      expect(await accessManager.hasRole(Role.ADMIN, admin.address)).to.equal(true);
    });

    it("admin can grant a role", async function () {
      const { accessManager, admin, outsider } = await loadFixture(deployCore);
      await accessManager.connect(admin).grantRole(Role.AUDITOR, outsider.address);
      expect(await accessManager.hasRole(Role.AUDITOR, outsider.address)).to.equal(true);
    });

    it("admin can revoke a role", async function () {
      const { accessManager, admin, auditor } = await loadFixture(deployCore);
      await accessManager.connect(admin).revokeRole(Role.AUDITOR, auditor.address);
      expect(await accessManager.hasRole(Role.AUDITOR, auditor.address)).to.equal(false);
    });

    it("non-admin cannot grant roles", async function () {
      const { accessManager, outsider } = await loadFixture(deployCore);
      await expect(
        accessManager.connect(outsider).grantRole(Role.AUDITOR, outsider.address),
      ).to.be.reverted;
    });

    it("unauthorized user cannot create an election", async function () {
      const { factory, outsider } = await loadFixture(deployCore);
      const now = await time.latest();
      await expect(
        factory
          .connect(outsider)
          .createElection("X", "", now + 100, now + 1000, now + 2000, now + 5000),
      ).to.be.revertedWithCustomError(factory, "Unauthorized");
    });

    it("unauthorized user cannot register a voter", async function () {
      const { voterRegistry, outsider, voter1 } = await loadFixture(deployCore);
      await expect(
        voterRegistry.connect(outsider).registerVoter(voter1.address, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(voterRegistry, "Unauthorized");
    });

    it("unauthorized user cannot add a candidate", async function () {
      const f = await loadFixture(deployCore);
      const { election } = await createElection(f);
      await expect(
        election.connect(f.outsider).addCandidate("Mallory", ""),
      ).to.be.revertedWithCustomError(election, "Unauthorized");
    });

    it("unauthorized user cannot pause an election", async function () {
      const f = await loadFixture(deployCore);
      const { election } = await createElection(f);
      await election.connect(f.manager).openRegistration();
      await election.connect(f.manager).startElection();
      await expect(
        election.connect(f.outsider).pauseElection(),
      ).to.be.revertedWithCustomError(election, "Unauthorized");
    });

    it("admin does NOT implicitly hold operational roles", async function () {
      const { accessManager, admin } = await loadFixture(deployCore);
      expect(await accessManager.hasRole(Role.ELECTION_MANAGER, admin.address)).to.equal(false);
      expect(await accessManager.hasRole(Role.SECURITY_OFFICER, admin.address)).to.equal(false);
    });

    it("auditor role grants no state-changing authority", async function () {
      const f = await loadFixture(deployCore);
      const { election } = await createElection(f);
      await expect(
        election.connect(f.auditor).addCandidate("Ghost", ""),
      ).to.be.revertedWithCustomError(election, "Unauthorized");
    });
  });

  // ---------------------------------------------------------------
  // B. ELECTION CREATION
  // ---------------------------------------------------------------
  describe("B. Election Creation", function () {
    it("manager can create a valid election", async function () {
      const f = await loadFixture(deployCore);
      const { id, election } = await createElection(f);
      expect(id).to.equal(1n);
      expect((await election.getElection()).state).to.equal(ElectionState.DRAFT);
    });

    it("emits ElectionCreated with indexed id and creator", async function () {
      const f = await loadFixture(deployCore);
      const now = await time.latest();
      await expect(
        f.factory
          .connect(f.manager)
          .createElection("T", "D", now + 100, now + 1000, now + 2000, now + 5000),
      )
        .to.emit(f.factory, "ElectionCreated")
        .withArgs(1n, f.manager.address, "T");
    });

    it("rejects an empty title", async function () {
      const f = await loadFixture(deployCore);
      const now = await time.latest();
      await expect(
        f.factory
          .connect(f.manager)
          .createElection("", "D", now + 100, now + 1000, now + 2000, now + 5000),
      ).to.be.revertedWithCustomError(f.factory, "EmptyTitle");
    });

    it("rejects an inverted registration window", async function () {
      const f = await loadFixture(deployCore);
      const now = await time.latest();
      await expect(
        f.factory
          .connect(f.manager)
          .createElection("T", "D", now + 1000, now + 100, now + 2000, now + 5000),
      ).to.be.revertedWithCustomError(f.factory, "InvalidTimeRange");
    });

    it("rejects a registration window that starts in the past", async function () {
      const f = await loadFixture(deployCore);
      const now = await time.latest();
      await expect(
        f.factory
          .connect(f.manager)
          .createElection("T", "D", now - 10, now + 1000, now + 2000, now + 5000),
      ).to.be.revertedWithCustomError(f.factory, "InvalidTimeRange");
    });

    it("rejects an inverted voting window", async function () {
      const f = await loadFixture(deployCore);
      const now = await time.latest();
      await expect(
        f.factory
          .connect(f.manager)
          .createElection("T", "D", now + 100, now + 1000, now + 5000, now + 2000),
      ).to.be.revertedWithCustomError(f.factory, "InvalidTimeRange");
    });

    it("rejects voting that starts before registration closes", async function () {
      const f = await loadFixture(deployCore);
      const now = await time.latest();
      await expect(
        f.factory
          .connect(f.manager)
          .createElection("T", "D", now + 100, now + 3000, now + 2000, now + 5000),
      ).to.be.revertedWithCustomError(f.factory, "InvalidTimeRange");
    });

    it("assigns unique, sequential election ids", async function () {
      const f = await loadFixture(deployCore);
      await createElection(f);
      const { id: second } = await createElection(f);
      expect(second).to.equal(2n);
      expect(await f.factory.totalElections()).to.equal(2n);
    });

    it("rejects creation when no emergency controller is wired", async function () {
      const f = await loadFixture(deployCore);
      // Deploy a factory that never had a controller wired. This is the only
      // reachable "unwired" state, because setEmergencyController itself
      // rejects the zero address.
      const bareFactory = await (
        await ethers.getContractFactory("ElectionFactory")
      ).deploy(
        await f.accessManager.getAddress(),
        await f.voterRegistry.getAddress(),
      );
      await bareFactory.waitForDeployment();
      const now = await time.latest();
      await expect(
        bareFactory
          .connect(f.manager)
          .createElection("T", "D", now + 100, now + 1000, now + 2000, now + 5000),
      ).to.be.revertedWithCustomError(bareFactory, "ZeroAddress");
    });
  });

  // ---------------------------------------------------------------
  // C. VOTER REGISTRY
  // ---------------------------------------------------------------
  describe("C. Voter Registry", function () {
    it("registrar can register a voter", async function () {
      const { voterRegistry, registrar, voter1 } = await loadFixture(deployCore);
      await voterRegistry.connect(registrar).registerVoter(voter1.address, ethers.ZeroHash);
      expect(await voterRegistry.isRegistered(voter1.address)).to.equal(true);
      expect(await voterRegistry.isActive(voter1.address)).to.equal(true);
    });

    it("emits VoterRegistered", async function () {
      const { voterRegistry, registrar, voter1 } = await loadFixture(deployCore);
      await expect(
        voterRegistry.connect(registrar).registerVoter(voter1.address, ethers.ZeroHash),
      ).to.emit(voterRegistry, "VoterRegistered");
    });

    it("stores the credential commitment and increments the count", async function () {
      const { voterRegistry, registrar, voter1 } = await loadFixture(deployCore);
      const commitment = ethers.keccak256(ethers.toUtf8Bytes("credential-1"));
      await voterRegistry.connect(registrar).registerVoter(voter1.address, commitment);
      expect((await voterRegistry.getVoter(voter1.address)).credentialCommitment).to.equal(
        commitment,
      );
      expect(await voterRegistry.totalRegistered()).to.equal(1n);
    });

    it("rejects duplicate registration", async function () {
      const { voterRegistry, registrar, voter1 } = await loadFixture(deployCore);
      await voterRegistry.connect(registrar).registerVoter(voter1.address, ethers.ZeroHash);
      await expect(
        voterRegistry.connect(registrar).registerVoter(voter1.address, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(voterRegistry, "VoterAlreadyRegistered");
    });

    it("rejects registering the zero address", async function () {
      const { voterRegistry, registrar } = await loadFixture(deployCore);
      await expect(
        voterRegistry.connect(registrar).registerVoter(ethers.ZeroAddress, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(voterRegistry, "ZeroAddress");
    });

    it("deactivates a voter", async function () {
      const { voterRegistry, registrar, voter1 } = await loadFixture(deployCore);
      await voterRegistry.connect(registrar).registerVoter(voter1.address, ethers.ZeroHash);
      await expect(voterRegistry.connect(registrar).deactivateVoter(voter1.address))
        .to.emit(voterRegistry, "VoterDeactivated");
      expect(await voterRegistry.isActive(voter1.address)).to.equal(false);
      expect(await voterRegistry.isRegistered(voter1.address)).to.equal(true);
    });

    it("rejects deactivating an unknown voter", async function () {
      const { voterRegistry, registrar, voter1 } = await loadFixture(deployCore);
      await expect(
        voterRegistry.connect(registrar).deactivateVoter(voter1.address),
      ).to.be.revertedWithCustomError(voterRegistry, "VoterNotRegistered");
    });

    it("reactivates a deactivated voter", async function () {
      const { voterRegistry, registrar, voter1 } = await loadFixture(deployCore);
      await voterRegistry.connect(registrar).registerVoter(voter1.address, ethers.ZeroHash);
      await voterRegistry.connect(registrar).deactivateVoter(voter1.address);
      await expect(voterRegistry.connect(registrar).reactivateVoter(voter1.address))
        .to.emit(voterRegistry, "VoterReactivated");
      expect(await voterRegistry.isActive(voter1.address)).to.equal(true);
    });

    it("rejects reactivating an already-active voter", async function () {
      const { voterRegistry, registrar, voter1 } = await loadFixture(deployCore);
      await voterRegistry.connect(registrar).registerVoter(voter1.address, ethers.ZeroHash);
      await expect(
        voterRegistry.connect(registrar).reactivateVoter(voter1.address),
      ).to.be.revertedWithCustomError(voterRegistry, "VoterAlreadyActive");
    });

    it("prevents self-registration by an outsider", async function () {
      const { voterRegistry, outsider } = await loadFixture(deployCore);
      await expect(
        voterRegistry.connect(outsider).registerVoter(outsider.address, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(voterRegistry, "Unauthorized");
    });
  });

  // ---------------------------------------------------------------
  // D. CANDIDATES
  // ---------------------------------------------------------------
  describe("D. Candidate Management", function () {
    it("manager can add a candidate", async function () {
      const f = await loadFixture(deployCore);
      const { election } = await createElection(f);
      await expect(election.connect(f.manager).addCandidate("Alice", "p1"))
        .to.emit(election, "CandidateAdded")
        .withArgs(1n, 1n, "Alice");
      expect((await election.getCandidate(1n)).name).to.equal("Alice");
    });

    it("adds multiple candidates with sequential ids", async function () {
      const f = await loadFixture(deployCore);
      const { election } = await createElection(f);
      await addCandidate(f, election, "Alice");
      await addCandidate(f, election, "Bob");
      await addCandidate(f, election, "Carol");
      expect(await election.candidateCount()).to.equal(3n);
      expect((await election.getCandidates()).length).to.equal(3);
    });

    it("rejects an empty candidate name", async function () {
      const f = await loadFixture(deployCore);
      const { election } = await createElection(f);
      await expect(
        election.connect(f.manager).addCandidate("", ""),
      ).to.be.revertedWithCustomError(election, "EmptyCandidateName");
    });

    it("deactivates a candidate while preserving its record", async function () {
      const f = await loadFixture(deployCore);
      const { election } = await createElection(f);
      await addCandidate(f, election, "Alice");
      await expect(election.connect(f.manager).deactivateCandidate(1n))
        .to.emit(election, "CandidateDeactivated")
        .withArgs(1n, 1n);
      expect((await election.getCandidate(1n)).active).to.equal(false);
      expect(await election.candidateCount()).to.equal(1n);
    });

    it("rejects deactivating an unknown candidate", async function () {
      const f = await loadFixture(deployCore);
      const { election } = await createElection(f);
      await expect(
        election.connect(f.manager).deactivateCandidate(99n),
      ).to.be.revertedWithCustomError(election, "CandidateNotFound");
    });

    it("rejects candidate addition after voting starts", async function () {
      const f = await loadFixture(deployCore);
      const { election } = await createElection(f);
      await election.connect(f.manager).openRegistration();
      await election.connect(f.manager).startElection();
      await expect(
        election.connect(f.manager).addCandidate("Late", ""),
      ).to.be.revertedWithCustomError(election, "InvalidElectionState");
    });

    it("rejects candidate modification by an outsider", async function () {
      const f = await loadFixture(deployCore);
      const { election } = await createElection(f);
      await addCandidate(f, election, "Alice");
      await expect(
        election.connect(f.outsider).deactivateCandidate(1n),
      ).to.be.revertedWithCustomError(election, "Unauthorized");
    });
  });

  // ---------------------------------------------------------------
  // E. STATE MACHINE
  // ---------------------------------------------------------------
  describe("E. Election State Machine", function () {
    async function draft() {
      const f = await loadFixture(deployCore);
      const { election } = await createElection(f);
      return { f, election };
    }

    it("transitions DRAFT -> REGISTRATION", async function () {
      const { f, election } = await draft();
      await expect(election.connect(f.manager).openRegistration())
        .to.emit(election, "ElectionStateChanged")
        .withArgs(1n, ElectionState.DRAFT, ElectionState.REGISTRATION);
      expect(await election.state()).to.equal(ElectionState.REGISTRATION);
    });

    it("transitions REGISTRATION -> ACTIVE", async function () {
      const { f, election } = await draft();
      await election.connect(f.manager).openRegistration();
      await election.connect(f.manager).startElection();
      expect(await election.state()).to.equal(ElectionState.ACTIVE);
    });

    it("transitions ACTIVE -> PAUSED by security officer", async function () {
      const { f, election } = await draft();
      await election.connect(f.manager).openRegistration();
      await election.connect(f.manager).startElection();
      await election.connect(f.officer).pauseElection();
      expect(await election.state()).to.equal(ElectionState.PAUSED);
    });

    it("transitions PAUSED -> ACTIVE by security officer", async function () {
      const { f, election } = await draft();
      await election.connect(f.manager).openRegistration();
      await election.connect(f.manager).startElection();
      await election.connect(f.officer).pauseElection();
      await election.connect(f.officer).resumeElection();
      expect(await election.state()).to.equal(ElectionState.ACTIVE);
    });

    it("transitions ACTIVE -> ENDED and records endedAt", async function () {
      const { f, election } = await draft();
      await election.connect(f.manager).openRegistration();
      await election.connect(f.manager).startElection();
      await election.connect(f.manager).endElection();
      expect(await election.state()).to.equal(ElectionState.ENDED);
      expect((await election.getElection()).endedAt).to.be.greaterThan(0n);
    });

    it("transitions ENDED -> RESULTS_FINALIZED", async function () {
      const { f, election } = await draft();
      await election.connect(f.manager).openRegistration();
      await election.connect(f.manager).startElection();
      await election.connect(f.manager).endElection();
      await election.connect(f.manager).finalizeResults();
      expect(await election.state()).to.equal(ElectionState.RESULTS_FINALIZED);
    });

    it("rejects DRAFT -> ACTIVE (skipping REGISTRATION)", async function () {
      const { f, election } = await draft();
      await expect(
        election.connect(f.manager).startElection(),
      ).to.be.revertedWithCustomError(election, "InvalidStateTransition");
    });

    it("rejects DRAFT -> ENDED", async function () {
      const { f, election } = await draft();
      await expect(
        election.connect(f.manager).endElection(),
      ).to.be.revertedWithCustomError(election, "InvalidStateTransition");
    });

    it("rejects ENDED -> ACTIVE", async function () {
      const { f, election } = await draft();
      await election.connect(f.manager).openRegistration();
      await election.connect(f.manager).startElection();
      await election.connect(f.manager).endElection();
      await expect(
        election.connect(f.manager).startElection(),
      ).to.be.revertedWithCustomError(election, "InvalidStateTransition");
    });

    it("finalized election cannot change state (terminal)", async function () {
      const { f, election } = await draft();
      await election.connect(f.manager).openRegistration();
      await election.connect(f.manager).startElection();
      await election.connect(f.manager).endElection();
      await election.connect(f.manager).finalizeResults();
      await expect(
        election.connect(f.manager).endElection(),
      ).to.be.revertedWithCustomError(election, "InvalidStateTransition");
      await expect(
        election.connect(f.manager).openRegistration(),
      ).to.be.revertedWithCustomError(election, "InvalidStateTransition");
    });

    it("rejects an unauthorized state transition", async function () {
      const { f, election } = await draft();
      await expect(
        election.connect(f.outsider).openRegistration(),
      ).to.be.revertedWithCustomError(election, "Unauthorized");
    });
  });

  // ---------------------------------------------------------------
  // F. VOTING
  // ---------------------------------------------------------------
  describe("F. Voting", function () {
    /// @dev Creates an election that is ACTIVE and inside its voting window.
    async function activeElection() {
      const f = await loadFixture(deployCore);
      const now = await time.latest();
      const { id, election } = await createElection(f, {
        registrationStart: now + 50,
        registrationEnd: now + 200,
        votingStart: now + 300,
        votingEnd: now + 100_000,
      });
      await addCandidate(f, election, "Alice");
      await addCandidate(f, election, "Bob");
      await election.connect(f.manager).openRegistration();
      await election.connect(f.manager).startElection();
      await time.increaseTo(now + 400);
      return { f, election, id };
    }

    it("allows a registered, active voter to vote", async function () {
      const { f, election } = await activeElection();
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await expect(election.connect(f.voter1).castVote(1n, 1n))
        .to.emit(election, "VoteCast")
        .withArgs(1n, 1n, f.voter1.address);
    });

    it("increments the candidate vote total", async function () {
      const { f, election } = await activeElection();
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await election.connect(f.voter1).castVote(1n, 1n);
      expect(await election.getCandidateVoteCount(1n)).to.equal(1n);
      expect(await election.getCandidateVoteCount(2n)).to.equal(0n);
    });

    it("increments the election total vote count", async function () {
      const { f, election } = await activeElection();
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter2.address, ethers.ZeroHash);
      await election.connect(f.voter1).castVote(1n, 1n);
      await election.connect(f.voter2).castVote(1n, 2n);
      expect(await election.getTotalVotes()).to.equal(2n);
    });

    it("records that the voter has voted", async function () {
      const { f, election } = await activeElection();
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await election.connect(f.voter1).castVote(1n, 1n);
      expect(await election.hasVoted(f.voter1.address)).to.equal(true);
    });

    it("rejects an unregistered voter", async function () {
      const { f, election } = await activeElection();
      await expect(
        election.connect(f.voter1).castVote(1n, 1n),
      ).to.be.revertedWithCustomError(election, "VoterNotRegistered");
    });

    it("rejects an inactive voter", async function () {
      const { f, election } = await activeElection();
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await f.voterRegistry.connect(f.registrar).deactivateVoter(f.voter1.address);
      await expect(
        election.connect(f.voter1).castVote(1n, 1n),
      ).to.be.revertedWithCustomError(election, "VoterInactive");
    });

    it("rejects an invalid candidate id (zero)", async function () {
      const { f, election } = await activeElection();
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await expect(
        election.connect(f.voter1).castVote(1n, 0n),
      ).to.be.revertedWithCustomError(election, "CandidateNotFound");
    });

    it("rejects a non-existent candidate id", async function () {
      const { f, election } = await activeElection();
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await expect(
        election.connect(f.voter1).castVote(1n, 99n),
      ).to.be.revertedWithCustomError(election, "CandidateNotFound");
    });

    it("rejects an inactive candidate", async function () {
      const { f, election } = await activeElection();
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await election.connect(f.manager).deactivateCandidate(2n);
      await expect(
        election.connect(f.voter1).castVote(1n, 2n),
      ).to.be.revertedWithCustomError(election, "CandidateInactive");
    });

    it("rejects a vote for the wrong election id", async function () {
      const { f, election } = await activeElection();
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await expect(
        election.connect(f.voter1).castVote(999n, 1n),
      ).to.be.revertedWithCustomError(election, "InvalidElectionState");
    });

    it("rejects voting before the election is active", async function () {
      const f = await loadFixture(deployCore);
      const now = await time.latest();
      const { election } = await createElection(f, {
        votingStart: now + 300,
        votingEnd: now + 100_000,
      });
      await addCandidate(f, election, "Alice");
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await expect(
        election.connect(f.voter1).castVote(1n, 1n),
      ).to.be.revertedWithCustomError(election, "ElectionNotActive");
    });

    it("rejects voting after the election has ended", async function () {
      const { f, election } = await activeElection();
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await election.connect(f.manager).endElection();
      await expect(
        election.connect(f.voter1).castVote(1n, 1n),
      ).to.be.revertedWithCustomError(election, "ElectionNotActive");
    });

    it("rejects voting after the voting window closes", async function () {
      const f = await loadFixture(deployCore);
      const now = await time.latest();
      const { election } = await createElection(f, {
        registrationStart: now + 50,
        registrationEnd: now + 200,
        votingStart: now + 300,
        votingEnd: now + 400,
      });
      await addCandidate(f, election, "Alice");
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await election.connect(f.manager).openRegistration();
      await election.connect(f.manager).startElection();
      await time.increaseTo(now + 500);
      await expect(
        election.connect(f.voter1).castVote(1n, 1n),
      ).to.be.revertedWithCustomError(election, "VotingEnded");
    });

    it("rejects voting before the voting window opens (active but early)", async function () {
      const f = await loadFixture(deployCore);
      const now = await time.latest();
      const { election } = await createElection(f, {
        registrationStart: now + 50,
        registrationEnd: now + 200,
        votingStart: now + 10_000,
        votingEnd: now + 100_000,
      });
      await addCandidate(f, election, "Alice");
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await election.connect(f.manager).openRegistration();
      await election.connect(f.manager).startElection();
      await expect(
        election.connect(f.voter1).castVote(1n, 1n),
      ).to.be.revertedWithCustomError(election, "VotingNotStarted");
    });
  });

  // ---------------------------------------------------------------
  // G. DUPLICATE VOTE PROTECTION
  // ---------------------------------------------------------------
  describe("G. Duplicate Vote Protection", function () {
    async function activeElection() {
      const f = await loadFixture(deployCore);
      const now = await time.latest();
      const { election } = await createElection(f, {
        votingStart: now + 300,
        votingEnd: now + 100_000,
      });
      await addCandidate(f, election, "Alice");
      await addCandidate(f, election, "Bob");
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await election.connect(f.manager).openRegistration();
      await election.connect(f.manager).startElection();
      await time.increaseTo(now + 400);
      return { f, election };
    }

    it("allows the first vote and rejects the second with AlreadyVoted", async function () {
      const { f, election } = await activeElection();
      await election.connect(f.voter1).castVote(1n, 1n);
      await expect(
        election.connect(f.voter1).castVote(1n, 2n),
      ).to.be.revertedWithCustomError(election, "AlreadyVoted");
    });

    it("does not double-count a rejected duplicate vote", async function () {
      const { f, election } = await activeElection();
      await election.connect(f.voter1).castVote(1n, 1n);
      await expect(election.connect(f.voter1).castVote(1n, 1n)).to.be.reverted;
      expect(await election.getTotalVotes()).to.equal(1n);
      expect(await election.getCandidateVoteCount(1n)).to.equal(1n);
    });

    it("scopes one-vote-per-wallet per election (separate elections)", async function () {
      const { f, election } = await activeElection();
      const now = await time.latest();
      // Registration must close strictly before voting opens, so give the
      // second election its own valid registration window.
      const secondStart = now + 10_000;
      const { election: second } = await createElection(f, {
        registrationStart: now + 1_000,
        registrationEnd: secondStart - 100,
        votingStart: secondStart,
        votingEnd: secondStart + 100_000,
      });
      await addCandidate(f, second, "X");
      await second.connect(f.manager).openRegistration();
      await second.connect(f.manager).startElection();
      await time.increaseTo(secondStart + 10);

      // vote1 registers voter1 and votes in election #1
      await election.connect(f.voter1).castVote(1n, 1n);
      // voter1 may also vote once in election #2
      await second.connect(f.voter1).castVote(2n, 1n);
      expect(await election.hasVoted(f.voter1.address)).to.equal(true);
      expect(await second.hasVoted(f.voter1.address)).to.equal(true);
    });
  });

  // ---------------------------------------------------------------
  // H. EMERGENCY CONTROLS
  // ---------------------------------------------------------------
  describe("H. Emergency Controls", function () {
    async function activeElection() {
      const f = await loadFixture(deployCore);
      const now = await time.latest();
      const { id, election } = await createElection(f, {
        votingStart: now + 300,
        votingEnd: now + 100_000,
      });
      await addCandidate(f, election, "Alice");
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await election.connect(f.manager).openRegistration();
      await election.connect(f.manager).startElection();
      await time.increaseTo(now + 400);
      return { f, election, id };
    }

    it("security officer can pause via the controller", async function () {
      const { f, id, election } = await activeElection();
      // The emitted timestamp is the mined block's timestamp, so match every
      // argument exactly except that field, which anyValue accepts.
      await expect(f.controller.connect(f.officer).pauseElection(id))
        .to.emit(f.controller, "EmergencyAction")
        .withArgs(id, f.officer.address, "PAUSE", anyValue);
      expect(await election.state()).to.equal(ElectionState.PAUSED);
    });

    it("unauthorized user cannot pause via the controller", async function () {
      const { f, id } = await activeElection();
      await expect(
        f.controller.connect(f.outsider).pauseElection(id),
      ).to.be.revertedWithCustomError(f.controller, "Unauthorized");
    });

    it("voting is blocked while paused", async function () {
      const { f, id, election } = await activeElection();
      await f.controller.connect(f.officer).pauseElection(id);
      await expect(
        election.connect(f.voter1).castVote(id, 1n),
      ).to.be.revertedWithCustomError(election, "ElectionNotActive");
    });

    it("resume restores the ACTIVE state", async function () {
      const { f, id, election } = await activeElection();
      await f.controller.connect(f.officer).pauseElection(id);
      await expect(f.controller.connect(f.officer).resumeElection(id))
        .to.emit(f.controller, "EmergencyAction")
        .withArgs(id, f.officer.address, "RESUME", anyValue);
      expect(await election.state()).to.equal(ElectionState.ACTIVE);
    });

    it("voting works again after resume", async function () {
      const { f, id, election } = await activeElection();
      await f.controller.connect(f.officer).pauseElection(id);
      await f.controller.connect(f.officer).resumeElection(id);
      await expect(election.connect(f.voter1).castVote(id, 1n)).to.not.be.reverted;
    });

    it("pause preserves existing votes and tallies", async function () {
      const { f, id, election } = await activeElection();
      await election.connect(f.voter1).castVote(id, 1n);
      await f.controller.connect(f.officer).pauseElection(id);
      expect(await election.getTotalVotes()).to.equal(1n);
      expect(await election.getCandidateVoteCount(1n)).to.equal(1n);
      expect(await election.state()).to.equal(ElectionState.PAUSED);
    });

    it("cannot pause an election that is not active", async function () {
      const f = await loadFixture(deployCore);
      const { id, election } = await createElection(f);
      // The instance rejects the invalid DRAFT->PAUSED transition; its custom
      // error bubbles up through the controller, so assert against it there.
      await expect(
        f.controller.connect(f.officer).pauseElection(id),
      ).to.be.revertedWithCustomError(election, "InvalidStateTransition");
    });

    it("rejects emergency calls from a non-controller address", async function () {
      const { f, election } = await activeElection();
      await expect(
        election.connect(f.officer).emergencyPause(),
      ).to.be.revertedWithCustomError(election, "Unauthorized");
    });
  });

  // ---------------------------------------------------------------
  // I. RESULTS
  // ---------------------------------------------------------------
  describe("I. Results", function () {
    async function talliedElection() {
      const f = await loadFixture(deployCore);
      const now = await time.latest();
      const { election } = await createElection(f, {
        votingStart: now + 300,
        votingEnd: now + 100_000,
      });
      await addCandidate(f, election, "Alice"); // id 1
      await addCandidate(f, election, "Bob"); // id 2
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter2.address, ethers.ZeroHash);
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter3.address, ethers.ZeroHash);
      await election.connect(f.manager).openRegistration();
      await election.connect(f.manager).startElection();
      await time.increaseTo(now + 400);
      // Alice: 2 votes, Bob: 1 vote
      await election.connect(f.voter1).castVote(1n, 1n);
      await election.connect(f.voter2).castVote(1n, 1n);
      await election.connect(f.voter3).castVote(1n, 2n);
      return { f, election };
    }

    it("returns the correct winner", async function () {
      const { election } = await talliedElection();
      const [winnerId, tie, maxVotes] = await election.getWinner();
      expect(winnerId).to.equal(1n);
      expect(tie).to.equal(false);
      expect(maxVotes).to.equal(2n);
    });

    it("returns the correct total vote count", async function () {
      const { election } = await talliedElection();
      expect(await election.getTotalVotes()).to.equal(3n);
    });

    it("returns full election results as parallel arrays", async function () {
      const { election } = await talliedElection();
      const [ids, names, votes] = await election.getElectionResults();
      expect(ids).to.deep.equal([1n, 2n]);
      expect(names).to.deep.equal(["Alice", "Bob"]);
      expect(votes).to.deep.equal([2n, 1n]);
    });

    it("rejects getWinner when there are no candidates", async function () {
      const f = await loadFixture(deployCore);
      const { election } = await createElection(f);
      await expect(election.getWinner()).to.be.revertedWithCustomError(
        election,
        "NoCandidates",
      );
    });

    it("reports a deterministic tie instead of an arbitrary winner", async function () {
      const f = await loadFixture(deployCore);
      const now = await time.latest();
      const { election } = await createElection(f, {
        votingStart: now + 300,
        votingEnd: now + 100_000,
      });
      await addCandidate(f, election, "Alice");
      await addCandidate(f, election, "Bob");
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter2.address, ethers.ZeroHash);
      await election.connect(f.manager).openRegistration();
      await election.connect(f.manager).startElection();
      await time.increaseTo(now + 400);
      await election.connect(f.voter1).castVote(1n, 1n);
      await election.connect(f.voter2).castVote(1n, 2n);

      const [winnerId, tie, maxVotes] = await election.getWinner();
      expect(tie).to.equal(true);
      expect(winnerId).to.equal(0n);
      expect(maxVotes).to.equal(1n);
    });

    it("keeps results readable after finalization", async function () {
      const { f, election } = await talliedElection();
      await election.connect(f.manager).endElection();
      await election.connect(f.manager).finalizeResults();
      const [winnerId] = await election.getWinner();
      expect(winnerId).to.equal(1n);
      expect(await election.getTotalVotes()).to.equal(3n);
      expect(await election.state()).to.equal(ElectionState.RESULTS_FINALIZED);
    });
  });

  // ---------------------------------------------------------------
  // J. ADVERSARIAL / ATTACK SIMULATION
  // ---------------------------------------------------------------
  describe("J. Adversarial Attack Simulation", function () {
    async function activeElection() {
      const f = await loadFixture(deployCore);
      const now = await time.latest();
      const { id, election } = await createElection(f, {
        votingStart: now + 300,
        votingEnd: now + 100_000,
      });
      await addCandidate(f, election, "Alice");
      await f.voterRegistry.connect(f.registrar).registerVoter(f.voter1.address, ethers.ZeroHash);
      await election.connect(f.manager).openRegistration();
      await election.connect(f.manager).startElection();
      await time.increaseTo(now + 400);
      return { f, election, id };
    }

    it("blocks a malicious voter attempting to vote twice", async function () {
      const { f, election, id } = await activeElection();
      await election.connect(f.voter1).castVote(id, 1n);
      await expect(
        election.connect(f.voter1).castVote(id, 1n),
      ).to.be.revertedWithCustomError(election, "AlreadyVoted");
    });

    it("blocks an unregistered wallet from voting", async function () {
      const { f, election, id } = await activeElection();
      await expect(
        election.connect(f.outsider).castVote(id, 1n),
      ).to.be.revertedWithCustomError(election, "VoterNotRegistered");
    });

    it("blocks an unauthorized wallet from calling privileged functions", async function () {
      const { f, election, id } = await activeElection();
      await expect(
        election.connect(f.outsider).endElection(),
      ).to.be.revertedWithCustomError(election, "Unauthorized");
      await expect(
        f.controller.connect(f.outsider).pauseElection(id),
      ).to.be.revertedWithCustomError(f.controller, "Unauthorized");
      await expect(
        election.connect(f.outsider).deactivateCandidate(1n),
      ).to.be.revertedWithCustomError(election, "Unauthorized");
    });

    it("blocks voting for an invalid candidate id", async function () {
      const { f, election, id } = await activeElection();
      await expect(
        election.connect(f.voter1).castVote(id, 12345n),
      ).to.be.revertedWithCustomError(election, "CandidateNotFound");
    });

    it("blocks an invalid election id", async function () {
      const { f, election } = await activeElection();
      await expect(
        election.connect(f.voter1).castVote(4242n, 1n),
      ).to.be.revertedWithCustomError(election, "InvalidElectionState");
    });

    it("blocks voting while paused", async function () {
      const { f, election, id } = await activeElection();
      await f.controller.connect(f.officer).pauseElection(id);
      await expect(
        election.connect(f.voter1).castVote(id, 1n),
      ).to.be.revertedWithCustomError(election, "ElectionNotActive");
    });

    it("blocks voting after finalization", async function () {
      const { f, election, id } = await activeElection();
      await election.connect(f.manager).endElection();
      await election.connect(f.manager).finalizeResults();
      await expect(
        election.connect(f.voter1).castVote(id, 1n),
      ).to.be.revertedWithCustomError(election, "ElectionNotActive");
    });

    it("blocks an unauthorized emergency pause", async function () {
      const { f, id } = await activeElection();
      await expect(
        f.controller.connect(f.outsider).pauseElection(id),
      ).to.be.revertedWithCustomError(f.controller, "Unauthorized");
    });

    it("blocks an unauthorized election state transition", async function () {
      const { f, election } = await activeElection();
      await expect(
        election.connect(f.outsider).endElection(),
      ).to.be.revertedWithCustomError(election, "Unauthorized");
    });

    it("blocks an unauthorized voter registration attempt", async function () {
      const { f } = await activeElection();
      await expect(
        f.voterRegistry.connect(f.outsider).registerVoter(f.outsider.address, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(f.voterRegistry, "Unauthorized");
    });
  });
});
