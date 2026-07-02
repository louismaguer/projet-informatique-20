// Demo script: crée une election, vote pour chaque candidat, ferme et révèle les résultats
// Utilise les comptes Hardhat et le mock FHE de hardhat-plugin

const { ethers, fhevm } = require("hardhat");
const fs = require("fs");

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

  if (!fhevm.isMock) {
    console.log("⚠ Ce script doit être exécuté via 'npx hardhat run'");
    process.exit(1);
  }

  console.log("🔐 Demo Confidential Voting - Mock FHEVM");
  console.log("==========================================");

  const signers = await ethers.getSigners();
  console.log(`Compte deployer: ${signers[0].address}`);

  const voting = await ethers.getContractAt("ConfidentialVoting", contractAddress);

  // Crée une nouvelle election
  console.log("\n📝 Création d'une nouvelle election...");
  const title = `Demo ${new Date().toLocaleTimeString()}`;
  const options = ["Alice", "Bob", "Charlie"];
  const tx = await voting.createElection(title, options);
  await tx.wait();

  // Trouve l'ID de l'election depuis les events
  const electionCounter = await voting.electionCounter();
  const electionId = Number(electionCounter);
  console.log(`✓ Election #${electionId} créée: "${title}"`);

  // Vote pour chaque candidat avec des votants différents
  // Distribue les votes: 5 Alice, 3 Bob, 2 Charlie
  const votes = [];
  for (let i = 0; i < 5; i++) votes.push({ option: 0, voterIdx: i + 1 });
  for (let i = 0; i < 3; i++) votes.push({ option: 1, voterIdx: i + 6 });
  for (let i = 0; i < 2; i++) votes.push({ option: 2, voterIdx: i + 9 });

  console.log(`\n🗳  Casting ${votes.length} votes chiffrés...`);

  for (const vote of votes) {
    const voter = signers[vote.voterIdx];
    const input = fhevm.createEncryptedInput(contractAddress, voter.address).add32(vote.option);
    const encrypted = await input.encrypt();

    const voteTx = await voting.connect(voter).castVote(electionId, encrypted.handles[0], encrypted.inputProof);
    await voteTx.wait();
    process.stdout.write(".");
  }
  console.log(`\n✓ ${votes.length} votes envoyés`);

  // Ferme l'election
  console.log(`\n🔒 Fermeture de l'election #${electionId}...`);
  await (await voting.closeElection(electionId)).wait();
  console.log("✓ Election fermée");

  // Lit et déchiffre les résultats
  console.log(`\n📊 Résultats:`);
  const results = [];
  for (let i = 0; i < options.length; i++) {
    const tallyHandle = await voting.getEncryptedTally(electionId, i);
    const clearTally = await fhevm.publicDecryptEuint(fhevm.FhevmType.euint32, tallyHandle);
    results.push({ option: options[i], votes: Number(clearTally) });
    console.log(`  ${options[i]}: ${clearTally} votes`);
  }

  const [, , , voterCount] = await voting.getElection(electionId);
  console.log(`  Total votants: ${voterCount}`);

  // Sauvegarde les résultats dans un fichier pour le frontend
  const outputFile = `/tmp/demo_results_${electionId}.json`;
  fs.writeFileSync(
    outputFile,
    JSON.stringify(
      {
        electionId,
        title,
        options,
        results,
        voterCount: Number(voterCount),
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(`\n💾 Résultats sauvés dans: ${outputFile}`);
  console.log("\n🎉 Demo terminée! Rechargez le frontend pour voir les résultats.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Erreur:", e);
    process.exit(1);
  });
