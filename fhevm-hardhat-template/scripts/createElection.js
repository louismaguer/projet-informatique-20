// Crée une election
const { ethers } = require("hardhat");

async function main() {
  const args = process.argv.slice(2);
  const title = args[0] || "Demo Election";
  const options = args[1] ? args[1].split(",") : ["Option A", "Option B"];
  const contractAddress = process.env.CONTRACT_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

  const voting = await ethers.getContractAt("ConfidentialVoting", contractAddress);
  const tx = await voting.createElection(title, options);
  await tx.wait();

  const counter = await voting.electionCounter();
  console.log(`✓ Election créée: id=${counter}, title="${title}", options=${options.join(",")}`);
}

main().catch(console.error);
