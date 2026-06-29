// Ferme une election
const { ethers } = require("hardhat");

async function main() {
  const electionId = process.argv[2];
  if (!electionId) {
    console.log("Usage: node closeElection.js <electionId>");
    process.exit(1);
  }
  const contractAddress = process.env.CONTRACT_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

  const voting = await ethers.getContractAt("ConfidentialVoting", contractAddress);
  const tx = await voting.closeElection(electionId);
  await tx.wait();
  console.log(`✓ Election ${electionId} fermée`);
}

main().catch(console.error);
