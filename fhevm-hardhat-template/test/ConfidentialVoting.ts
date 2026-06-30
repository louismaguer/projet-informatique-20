import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { ConfidentialVoting, ConfidentialVoting__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  voter1: HardhatEthersSigner;
  voter2: HardhatEthersSigner;
  voter3: HardhatEthersSigner;
  voter4: HardhatEthersSigner;
  voter5: HardhatEthersSigner;
  voter6: HardhatEthersSigner;
  voter7: HardhatEthersSigner;
  voter8: HardhatEthersSigner;
  voter9: HardhatEthersSigner;
  voter10: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("ConfidentialVoting")) as ConfidentialVoting__factory;
  const contract = (await factory.deploy()) as ConfidentialVoting;
  const contractAddress = await contract.getAddress();

  return { contract, contractAddress };
}

describe("ConfidentialVoting", function () {
  let signers: Signers;
  let contract: ConfidentialVoting;
  let contractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = {
      deployer: ethSigners[0],
      voter1: ethSigners[1],
      voter2: ethSigners[2],
      voter3: ethSigners[3],
      voter4: ethSigners[4],
      voter5: ethSigners[5],
      voter6: ethSigners[6],
      voter7: ethSigners[7],
      voter8: ethSigners[8],
      voter9: ethSigners[9],
      voter10: ethSigners[10],
    };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ contract, contractAddress } = await deployFixture());
  });

  async function encryptVote(electionId: number, option: number, voter: HardhatEthersSigner) {
    return await fhevm
      .createEncryptedInput(contractAddress, voter.address)
      .add32(option)
      .encrypt();
  }

  it("devrait creer une election avec succes", async function () {
    const options = ["Alice", "Bob", "Charlie"];
    const tx = await contract.createElection("Mayor 2026", options);
    await tx.wait();

    const electionCounter = await contract.electionCounter();
    expect(electionCounter).to.eq(1);

    const [title, returnedOptions, isActive, voterCount] = await contract.getElection(1);
    expect(title).to.eq("Mayor 2026");
    expect(returnedOptions.length).to.eq(3);
    expect(returnedOptions[0]).to.eq("Alice");
    expect(returnedOptions[1]).to.eq("Bob");
    expect(returnedOptions[2]).to.eq("Charlie");
    expect(isActive).to.be.true;
    expect(voterCount).to.eq(0);
  });

  it("devrait refuser une election sans titre", async function () {
    const options = ["Alice", "Bob"];
    await expect(contract.createElection("", options)).to.be.revertedWith(
      "CreateElection: title cannot be empty",
    );
  });

  it("devrait refuser une election avec 0 options", async function () {
    const options: string[] = [];
    await expect(contract.createElection("NoOptions", options)).to.be.revertedWith(
      "CreateElection: at least 2 options required",
    );
  });

  it("devrait refuser une election avec 1 seule option", async function () {
    const options = ["Alice"];
    await expect(contract.createElection("Single", options)).to.be.revertedWith(
      "CreateElection: at least 2 options required",
    );
  });

  it("devrait refuser une election contenant une option vide", async function () {
    const options = ["Alice", ""];
    await expect(contract.createElection("EmptyOption", options)).to.be.revertedWith(
      "CreateElection: empty option not allowed",
    );
  });

  it("devrait refuser une election avec plus de 100 options", async function () {
    const options: string[] = [];
    for (let i = 0; i < 101; i++) options.push(`Option${i}`);
    await expect(contract.createElection("TooMany", options)).to.be.revertedWith(
      "CreateElection: max 100 options allowed",
    );
  });

  it("devrait accepter exactement 100 options", async function () {
    const options: string[] = [];
    for (let i = 0; i < 100; i++) options.push(`Option${i}`);
    const tx = await contract.createElection("MaxOptions", options);
    await tx.wait();
    const [, returnedOptions] = await contract.getElection(1);
    expect(returnedOptions.length).to.eq(100);
  });

  it("devrait incrémenter electionCounter a chaque creation", async function () {
    await (await contract.createElection("E1", ["A", "B"])).wait();
    await (await contract.createElection("E2", ["A", "B"])).wait();
    await (await contract.createElection("E3", ["A", "B"])).wait();
    const counter = await contract.electionCounter();
    expect(counter).to.eq(3);
  });

  it("devrait accepter des titres avec caracteres speciaux", async function () {
    const title = "Election 2026 — Délégués 🎉";
    const tx = await contract.createElection(title, ["A", "B"]);
    await tx.wait();
    const [storedTitle] = await contract.getElection(1);
    expect(storedTitle).to.eq(title);
  });

  it("devrait accepter des options dupliquées sans erreur", async function () {
    const options = ["Alice", "Alice", "Bob"];
    const tx = await contract.createElection("Dups", options);
    await tx.wait();
    const [, returnedOptions] = await contract.getElection(1);
    expect(returnedOptions.length).to.eq(3);
    expect(returnedOptions[0]).to.eq("Alice");
    expect(returnedOptions[1]).to.eq("Alice");
    expect(returnedOptions[2]).to.eq("Bob");
  });

  it("devrait accepter un vote chiffré", async function () {
    const options = ["Alice", "Bob"];
    await (await contract.createElection("Poll", options)).wait();

    const encryptedVote = await encryptVote(1, 0, signers.voter1);
    const tx = await contract
      .connect(signers.voter1)
      .castVote(1, encryptedVote.handles[0], encryptedVote.inputProof);
    await tx.wait();

    const hasVoted = await contract.hasVoted(1, signers.voter1.address);
    expect(hasVoted).to.be.true;
  });

  it("devrait refuser un double vote", async function () {
    const options = ["Alice", "Bob"];
    await (await contract.createElection("Poll", options)).wait();

    const encryptedVote1 = await encryptVote(1, 0, signers.voter1);
    await (
      await contract
        .connect(signers.voter1)
        .castVote(1, encryptedVote1.handles[0], encryptedVote1.inputProof)
    ).wait();

    const encryptedVote2 = await encryptVote(1, 1, signers.voter1);
    await expect(
      contract.connect(signers.voter1).castVote(1, encryptedVote2.handles[0], encryptedVote2.inputProof),
    ).to.be.revertedWith("Already voted");
  });

  it("devrait refuser un vote sur election fermee", async function () {
    const options = ["Alice", "Bob"];
    await (await contract.createElection("Poll", options)).wait();
    await (await contract.closeElection(1)).wait();

    const encryptedVote = await encryptVote(1, 0, signers.voter1);
    await expect(
      contract.connect(signers.voter1).castVote(1, encryptedVote.handles[0], encryptedVote.inputProof),
    ).to.be.revertedWith("Election is not active");
  });

  it("devrait fermer l'election correctement", async function () {
    const options = ["Alice", "Bob"];
    await (await contract.createElection("Poll", options)).wait();

    await (await contract.closeElection(1)).wait();

    const [, , isActive] = await contract.getElection(1);
    expect(isActive).to.be.false;
  });

  it("devrait refuser de fermer une election inexistante", async function () {
    await expect(contract.closeElection(999)).to.be.revertedWith("Election does not exist");
  });

  it("devrait cumuler les votes chiffrés correctement", async function () {
    const options = ["Alice", "Bob", "Charlie"];
    await (await contract.createElection("Mayor 2026", options)).wait();

    // 5 votants votent pour Alice (0), 3 pour Bob (1), 2 pour Charlie (2)
    const aliceVoters = [signers.voter1, signers.voter2, signers.voter3, signers.voter4, signers.voter5];
    const bobVoters = [signers.voter6, signers.voter7, signers.voter8];
    const charlieVoters = [signers.voter9, signers.voter10];

    for (const voter of aliceVoters) {
      const enc = await encryptVote(1, 0, voter);
      await (await contract.connect(voter).castVote(1, enc.handles[0], enc.inputProof)).wait();
    }
    for (const voter of bobVoters) {
      const enc = await encryptVote(1, 1, voter);
      await (await contract.connect(voter).castVote(1, enc.handles[0], enc.inputProof)).wait();
    }
    for (const voter of charlieVoters) {
      const enc = await encryptVote(1, 2, voter);
      await (await contract.connect(voter).castVote(1, enc.handles[0], enc.inputProof)).wait();
    }

    const [, , , voterCount] = await contract.getElection(1);
    expect(voterCount).to.eq(10);

    // Ferme l'election pour autoriser le déchiffrement public
    await (await contract.closeElection(1)).wait();

    // Lecture et déchiffrement des résultats
    const tallyAlice = await fhevm.publicDecryptEuint(
      FhevmType.euint32,
      await contract.getEncryptedTally(1, 0),
    );
    expect(tallyAlice).to.eq(5);

    const tallyBob = await fhevm.publicDecryptEuint(
      FhevmType.euint32,
      await contract.getEncryptedTally(1, 1),
    );
    expect(tallyBob).to.eq(3);

    const tallyCharlie = await fhevm.publicDecryptEuint(
      FhevmType.euint32,
      await contract.getEncryptedTally(1, 2),
    );
    expect(tallyCharlie).to.eq(2);
  });

  it("devrait gérer plusieurs elections indépendantes", async function () {
    const options2 = ["A", "B"];
    const options3 = ["X", "Y", "Z"];
    await (await contract.createElection("Election 1", options2)).wait();
    await (await contract.createElection("Election 2", options3)).wait();

    const counter = await contract.electionCounter();
    expect(counter).to.eq(2);

    const enc1 = await encryptVote(1, 0, signers.voter1);
    await (await contract.connect(signers.voter1).castVote(1, enc1.handles[0], enc1.inputProof)).wait();

    const enc2 = await encryptVote(2, 2, signers.voter2);
    await (await contract.connect(signers.voter2).castVote(2, enc2.handles[0], enc2.inputProof)).wait();

    const [, , , count1] = await contract.getElection(1);
    const [, , , count2] = await contract.getElection(2);
    expect(count1).to.eq(1);
    expect(count2).to.eq(1);
  });
});
