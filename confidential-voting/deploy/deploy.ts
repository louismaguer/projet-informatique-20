import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedFHECounter = await deploy("FHECounter", {
    from: deployer,
    log: true,
  });

  console.log(`FHECounter contract: `, deployedFHECounter.address);

  // L'admin doit être passé au constructeur.
  // Priorité :
  //  1. Variable d'environnement ADMIN_ADDRESS (utilisée par start.sh)
  //  2. Sinon, fallback sur le déployeur (utile pour les tests Hardhat locaux)
  const adminAddress = process.env.ADMIN_ADDRESS || deployer;
  if (!process.env.ADMIN_ADDRESS) {
    console.warn(
      `⚠ ADMIN_ADDRESS non défini : fallback sur le déployeur (${deployer}). Définissez ADMIN_ADDRESS pour un admin distinct.`,
    );
  }

  const deployedConfidentialVoting = await deploy("ConfidentialVoting", {
    from: deployer,
    args: [adminAddress],
    log: true,
  });

  console.log(`ConfidentialVoting contract: `, deployedConfidentialVoting.address);
  console.log(`  admin: ${adminAddress}`);
};
export default func;
func.id = "deploy_all";
func.tags = ["FHECounter", "ConfidentialVoting"];
