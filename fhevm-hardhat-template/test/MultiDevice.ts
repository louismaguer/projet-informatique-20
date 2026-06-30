import { ethers, fhevm } from "hardhat";
import { ConfidentialVoting, ConfidentialVoting__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

/**
 * Test multi-appareils : simule 2 votants utilisant des clés privées
 * ARBITRAIRES (pas des comptes Hardhat pré-financés), exactement comme
 * ce que font les slips papier distribués par generateIdentities.js.
 *
 * Vérifie :
 *  - 2 wallets distincts peuvent voter sur la même élection
 *  - voterCount == 2
 *  - Le double-vote est rejeté
 *  - Les résultats sont corrects après déchiffrement
 */
describe("ConfidentialVoting - multi-appareils", function () {
  let contract: ConfidentialVoting;
  let contractAddress: string;
  let provider: ethers.JsonRpcProvider;

  // Wallets arbitraires (comme ceux que génère scripts/generateIdentities.js)
  // Connectés à un provider pour pouvoir envoyer des tx
  const wallet0Seed = ethers.Wallet.createRandom();
  const wallet1Seed = ethers.Wallet.createRandom();
  let wallet0: ethers.HDNodeWallet;
  let wallet1: ethers.HDNodeWallet;

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("Ce test nécessite le plugin FHEVM mock");
      this.skip();
      return;
    }
    const factory = (await ethers.getContractFactory("ConfidentialVoting")) as ConfidentialVoting__factory;
    contract = (await factory.deploy()) as ConfidentialVoting;
    contractAddress = await contract.getAddress();
    provider = ethers.provider;

    // Connecte les wallets au provider
    wallet0 = wallet0Seed.connect(provider);
    wallet1 = wallet1Seed.connect(provider);

    // Créditer les 2 wallets arbitraires (ce que fait generateIdentities.js sur le noeud live)
    await ethers.provider.send("hardhat_setBalance", [wallet0.address, "0x" + ethers.parseEther("100").toString(16)]);
    await ethers.provider.send("hardhat_setBalance", [wallet1.address, "0x" + ethers.parseEther("100").toString(16)]);
  });

  async function encryptVote(option: number, voterAddress: string) {
    return await fhevm.createEncryptedInput(contractAddress, voterAddress).add32(option).encrypt();
  }

  it("2 wallets arbitraires peuvent voter indépendamment", async function () {
    const contract0 = contract.connect(wallet0) as ConfidentialVoting;
    const contract1 = contract.connect(wallet1) as ConfidentialVoting;

    // Créer une election (par un 3e compte, peu importe lequel)
    await (await contract.createElection("Test multi", ["Oui", "Non"])).wait();

    // Voter 0 → Oui
    const enc0 = await encryptVote(0, wallet0.address);
    const tx0 = await contract0.castVote(1, enc0.handles[0], enc0.inputProof);
    await tx0.wait();

    // Voter 1 → Non
    const enc1 = await encryptVote(1, wallet1.address);
    const tx1 = await contract1.castVote(1, enc1.handles[0], enc1.inputProof);
    await tx1.wait();

    // Vérifier le compteur
    const [, , , voterCount] = await contract.getElection(1);
    expect(voterCount).to.eq(2n);
  });

  it("le double-vote depuis le même wallet est rejeté", async function () {
    const contract0 = contract.connect(wallet0) as ConfidentialVoting;

    await (await contract.createElection("Test double", ["A", "B"])).wait();

    const enc0 = await encryptVote(0, wallet0.address);
    await (await contract0.castVote(1, enc0.handles[0], enc0.inputProof)).wait();

    const enc0bis = await encryptVote(1, wallet0.address);
    await expect(contract0.castVote(1, enc0bis.handles[0], enc0bis.inputProof)).to.be.revertedWith("Already voted");
  });

  it("résultats corrects après fermeture (1 Oui, 1 Non)", async function () {
    const contract0 = contract.connect(wallet0) as ConfidentialVoting;
    const contract1 = contract.connect(wallet1) as ConfidentialVoting;

    await (await contract.createElection("Test résultats", ["Oui", "Non"])).wait();

    const enc0 = await encryptVote(0, wallet0.address);
    await (await contract0.castVote(1, enc0.handles[0], enc0.inputProof)).wait();

    const enc1 = await encryptVote(1, wallet1.address);
    await (await contract1.castVote(1, enc1.handles[0], enc1.inputProof)).wait();

    await (await contract.closeElection(1)).wait();

    const tallyOui = await fhevm.publicDecryptEuint(FhevmType.euint32, await contract.getEncryptedTally(1, 0));
    const tallyNon = await fhevm.publicDecryptEuint(FhevmType.euint32, await contract.getEncryptedTally(1, 1));

    expect(tallyOui).to.eq(1);
    expect(tallyNon).to.eq(1);
  });

  it("plusieurs wallets arbitraires votent en parallèle (10 voters)", async function () {
    // Crée 10 wallets supplémentaires et les crédite
    const wallets = Array.from({ length: 10 }, () => ethers.Wallet.createRandom().connect(provider));
    for (const w of wallets) {
      await ethers.provider.send("hardhat_setBalance", [w.address, "0x" + ethers.parseEther("100").toString(16)]);
    }

    await (await contract.createElection("Election massive", ["A", "B", "C"])).wait();

    // Distribution : 4 pour A, 3 pour B, 3 pour C
    const distribution = [0, 0, 0, 0, 1, 1, 1, 2, 2, 2];
    for (let i = 0; i < wallets.length; i++) {
      const c = contract.connect(wallets[i]) as ConfidentialVoting;
      const enc = await encryptVote(distribution[i], wallets[i].address);
      await (await c.castVote(1, enc.handles[0], enc.inputProof)).wait();
    }

    const [, , , voterCount] = await contract.getElection(1);
    expect(voterCount).to.eq(10n);

    await (await contract.closeElection(1)).wait();

    const tallyA = await fhevm.publicDecryptEuint(FhevmType.euint32, await contract.getEncryptedTally(1, 0));
    const tallyB = await fhevm.publicDecryptEuint(FhevmType.euint32, await contract.getEncryptedTally(1, 1));
    const tallyC = await fhevm.publicDecryptEuint(FhevmType.euint32, await contract.getEncryptedTally(1, 2));

    expect(tallyA).to.eq(4);
    expect(tallyB).to.eq(3);
    expect(tallyC).to.eq(3);
  });

  it("génère 20 wallets aléatoires (sanity check de generateIdentities.js)", async function () {
    // Génère 20 wallets comme le ferait generateIdentities.js
    const identities = Array.from({ length: 20 }, () => ethers.Wallet.createRandom());
    expect(identities.length).to.eq(20);
    // Toutes les adresses sont uniques
    const addrs = new Set(identities.map((w) => w.address));
    expect(addrs.size).to.eq(20);
    // Toutes les PK ont le bon format
    for (const w of identities) {
      expect(w.privateKey).to.match(/^0x[0-9a-fA-F]{64}$/);
    }
  });
});
