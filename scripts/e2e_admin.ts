// scripts/e2e_admin.ts
// Test E2E pour valider l'isolation des rôles admin / votant.
// (Le chiffrement FHE nécessite le mock in-process et n'est pas testé ici — voir test/MultiDevice.ts.)

import { ethers } from "hardhat";
import { ConfidentialVoting__factory } from "../types";
import * as fs from "fs";
import * as path from "path";

async function main() {
  // 1. Lit la PK admin depuis le fichier généré par scripts/start.sh
  const adminPkFile = path.join(__dirname, ".admin_pk");
  if (!fs.existsSync(adminPkFile)) {
    console.error("❌ scripts/.admin_pk introuvable. Lance scripts/start.sh d'abord.");
    process.exit(1);
  }
  const ADMIN_PK = fs.readFileSync(adminPkFile, "utf-8").trim();
  const adminWallet = new ethers.Wallet(ADMIN_PK, ethers.provider);
  const ADMIN_ADDR = adminWallet.address;
  console.log(`🔧 Admin: ${ADMIN_ADDR}`);

  // 2. Lit l'adresse du contrat déployé
  const deployments = path.join(__dirname, "..", "deployments", "localhost", "ConfidentialVoting.json");
  if (!fs.existsSync(deployments)) {
    console.error("❌ deployments/localhost/ConfidentialVoting.json introuvable.");
    process.exit(1);
  }
  const { address: CONTRACT_ADDR } = JSON.parse(fs.readFileSync(deployments, "utf-8"));
  console.log(`📜 Contrat: ${CONTRACT_ADDR}`);

  // 3. Crée un wallet votant arbitraire et le crédite
  const voter = ethers.Wallet.createRandom().connect(ethers.provider);
  await ethers.provider.send("hardhat_setBalance", [voter.address, "0x" + ethers.parseEther("10").toString(16)]);
  console.log(`🗳  Votant: ${voter.address}`);

  // 4. Instances du contrat
  const contract = ConfidentialVoting__factory.connect(CONTRACT_ADDR, ethers.provider);
  const adminContract = contract.connect(adminWallet);
  const voterContract = contract.connect(voter);

  // 5. Vérifie que admin() retourne bien l'admin
  const adminFromChain = await contract.admin();
  console.log(`✓ admin() = ${adminFromChain}`);
  if (adminFromChain.toLowerCase() !== ADMIN_ADDR.toLowerCase()) {
    console.error("❌ Mismatch admin");
    process.exit(1);
  }

  // 6. L'admin crée une élection
  console.log("\n📋 Admin crée l'élection...");
  const createTx = await adminContract.createElection("E2E Test", ["Oui", "Non"]);
  const r1 = await createTx.wait();
  console.log(`✓ Election #1 créée, block ${r1!.blockNumber}`);

  // 7. Vérifier que hasVoted[admin] = true après création
  const hasVotedAdmin = await contract.hasVoted(1, ADMIN_ADDR);
  console.log(`✓ hasVoted[electionId=1][admin] = ${hasVotedAdmin} (attendu: true)`);
  if (!hasVotedAdmin) {
    console.error("❌ Admin devrait être marqué comme ayant voté");
    process.exit(1);
  }

  // 8. L'admin tente de voter (doit échouer avec AdminCannotVote)
  console.log("\n🚫 Admin tente de voter (doit être refusé)...");
  // On encode un vote bidon (euint32 0) : handle 0x0...0, proof 0x
  try {
    await adminContract.castVote(1, ethers.ZeroHash, "0x");
    console.error("❌ Admin a réussi à voter — PROBLÈME");
    process.exit(1);
  } catch (e: any) {
    if (e.message?.includes("AdminCannotVote") || e.shortMessage?.includes("AdminCannotVote")) {
      console.log("✓ AdminCannotVote correctement reverte");
    } else {
      console.error("❌ Erreur inattendue:", e.message);
      process.exit(1);
    }
  }

  // 9. Le votant tente de créer une élection (doit échouer avec OnlyAdmin)
  console.log("\n🚫 Votant tente de créer une élection (doit être refusé)...");
  try {
    await voterContract.createElection("Pirate", ["X", "Y"]);
    console.error("❌ Votant a réussi à créer — PROBLÈME");
    process.exit(1);
  } catch (e: any) {
    if (e.message?.includes("OnlyAdmin") || e.shortMessage?.includes("OnlyAdmin")) {
      console.log("✓ OnlyAdmin correctement reverte");
    } else {
      console.error("❌ Erreur inattendue:", e.message);
      process.exit(1);
    }
  }

  // 10. Le votant tente de fermer (doit échouer)
  console.log("\n🚫 Votant tente de fermer l'élection (doit être refusé)...");
  try {
    await voterContract.closeElection(1);
    console.error("❌ Votant a réussi à fermer — PROBLÈME");
    process.exit(1);
  } catch (e: any) {
    if (e.message?.includes("OnlyAdmin") || e.shortMessage?.includes("OnlyAdmin")) {
      console.log("✓ OnlyAdmin correctement reverte (close)");
    } else {
      console.error("❌ Erreur inattendue:", e.message);
      process.exit(1);
    }
  }

  // 11. L'admin ferme l'élection
  console.log("\n🔓 Admin ferme l'élection...");
  const closeTx = await adminContract.closeElection(1);
  const r3 = await closeTx.wait();
  console.log(`✓ Election fermée, block ${r3!.blockNumber}`);

  // 12. Vérifie le compteur (0 car personne n'a voté avec un vrai ciphertext FHE)
  const [, , isActive, voterCount] = await contract.getElection(1);
  console.log(`\n📊 isActive=${isActive} voterCount=${voterCount} (attendu: false, 0)`);
  if (isActive !== false || voterCount !== 0n) {
    console.error("❌ État incorrect");
    process.exit(1);
  }

  console.log("\n🎉 Test E2E réussi : isolation des rôles OK");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Erreur:", e);
    process.exit(1);
  });
