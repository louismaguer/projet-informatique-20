import type { FunctionFragment, HDNodeWallet, Provider, Signer } from "ethers";
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
  let provider: Provider;
  let admin: Signer;

  // Wallets arbitraires (comme ceux que génère scripts/generateIdentities.js)
  // Connectés à un provider pour pouvoir envoyer des tx
  const wallet0Seed = ethers.Wallet.createRandom();
  const wallet1Seed = ethers.Wallet.createRandom();
  let wallet0: HDNodeWallet;
  let wallet1: HDNodeWallet;

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("Ce test nécessite le plugin FHEVM mock");
      this.skip();
      return;
    }
    [admin] = await ethers.getSigners();
    const factory = (await ethers.getContractFactory("ConfidentialVoting")) as ConfidentialVoting__factory;
    contract = (await factory.deploy(await admin.getAddress())) as ConfidentialVoting;
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

  it("génère N wallets aléatoires valides (sanity check ethers.Wallet)", async function () {
    // Reproduit le pattern de generateIdentities.js (N wallets au hasard) avec un
    // petit N pour la vitesse du test. Le vrai défaut est 151 (= 1 admin + 150 votants).
    const N = 20;
    const identities = Array.from({ length: N }, () => ethers.Wallet.createRandom());
    expect(identities.length).to.eq(N);
    // Toutes les adresses sont uniques
    const addrs = new Set(identities.map((w) => w.address));
    expect(addrs.size).to.eq(N);
    // Toutes les PK ont le bon format
    for (const w of identities) {
      expect(w.privateKey).to.match(/^0x[0-9a-fA-F]{64}$/);
    }
  });

  it("admin() retourne l'adresse du déployeur", async function () {
    const adminAddr = await contract.admin();
    expect(adminAddr).to.eq(await admin.getAddress());
  });

  it("admin est immutable (pas de setter dans l'ABI)", async function () {
    // L'interface du contrat ne doit exposer aucune fonction de transfert admin
    const fragmentNames = contract.interface.fragments
      .filter((f): f is FunctionFragment => f.type === "function")
      .map((f) => f.name);
    expect(fragmentNames).to.not.include("transferAdmin");
    expect(fragmentNames).to.not.include("setAdmin");
    expect(fragmentNames).to.not.include("renounceAdmin");
  });

  it("un non-admin ne peut PAS créer d'élection", async function () {
    const contractAsVoter = contract.connect(wallet0) as ConfidentialVoting;
    await expect(contractAsVoter.createElection("Pirate", ["A", "B"])).to.be.revertedWithCustomError(
      contract,
      "OnlyAdmin",
    );
  });

  it("un non-admin ne peut PAS fermer d'élection", async function () {
    await (await contract.createElection("Légitime", ["A", "B"])).wait();
    const contractAsVoter = contract.connect(wallet0) as ConfidentialVoting;
    await expect(contractAsVoter.closeElection(1)).to.be.revertedWithCustomError(contract, "OnlyAdmin");
  });

  it("l'admin NE PEUT PAS voter (AdminCannotVote)", async function () {
    await (await contract.createElection("Test admin vote", ["A", "B"])).wait();
    const enc = await encryptVote(0, await admin.getAddress());
    await expect(contract.castVote(1, enc.handles[0], enc.inputProof)).to.be.revertedWithCustomError(
      contract,
      "AdminCannotVote",
    );
  });

  it("hasVoted[admin] est true après création d'élection (impossible de tricher)", async function () {
    await (await contract.createElection("Test lock admin", ["A", "B"])).wait();
    // Même si on appelait castVote, hasVoted[admin] est déjà true
    const hasVotedAdmin = await contract.hasVoted(1, await admin.getAddress());
    expect(hasVotedAdmin).to.eq(true);
  });

  it("voterCount ne s'incrémente PAS quand l'admin 'vote' (revert)", async function () {
    await (await contract.createElection("Test counter", ["A", "B"])).wait();
    const enc = await encryptVote(0, await admin.getAddress());
    try {
      await contract.castVote(1, enc.handles[0], enc.inputProof);
    } catch {}
    const [, , , voterCount] = await contract.getElection(1);
    expect(voterCount).to.eq(0n);
  });

  it("constructeur refuse address(0)", async function () {
    const factory = (await ethers.getContractFactory("ConfidentialVoting")) as ConfidentialVoting__factory;
    await expect(factory.deploy(ethers.ZeroAddress)).to.be.revertedWith("Invalid admin address");
  });
});
