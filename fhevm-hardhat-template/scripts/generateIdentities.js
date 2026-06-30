// scripts/generateIdentities.js
// Génère 20 wallets aléatoires, les crédite de 100 ETH chacun via hardhat_setBalance,
// et écrit scripts/printIdentities.html (slips papier à imprimer et découper).
//
// ⚠ Le fichier HTML produit contient les clés privées en clair.
//    À supprimer après impression, ou à générer hors du dépôt (ex: /tmp/).
//
// Usage:
//   npx hardhat run scripts/generateIdentities.js --network localhost
//
// Personnalisation:
//   COUNT=10 ETH_PER_ACCOUNT=1 npx hardhat run scripts/generateIdentities.js --network localhost

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const COUNT = parseInt(process.env.COUNT || "20", 10);
const ETH_PER_ACCOUNT = process.env.ETH_PER_ACCOUNT || "100";
const OUT_FILE = path.join(__dirname, "printIdentities.html");

function weiFromEth(ethStr) {
  // Multiplication sûre en BigInt pour éviter les flottants
  const [intPart, fracPart = ""] = ethStr.split(".");
  const fracPadded = (fracPart + "0".repeat(18)).slice(0, 18);
  return BigInt(intPart) * BigInt(10) ** BigInt(18) + BigInt(fracPadded || "0");
}

async function main() {
  console.log("🔐 Génération d'identités pour vote multi-appareils");
  console.log("===================================================");
  console.log(`Nombre de comptes : ${COUNT}`);
  console.log(`Solde par compte  : ${ETH_PER_ACCOUNT} ETH`);
  console.log("");

  const provider = ethers.provider;

  // 1. Vérifier que le noeud Hardhat répond
  try {
    const block = await provider.getBlockNumber();
    console.log(`✓ Noeud Hardhat joignable (block ${block})`);
  } catch (e) {
    console.error("❌ Impossible de joindre Hardhat sur localhost:8545");
    console.error("   Lance d'abord: bash start.sh");
    process.exit(1);
  }

  // 2. Générer les wallets
  const identities = [];
  for (let i = 0; i < COUNT; i++) {
    const w = ethers.Wallet.createRandom();
    identities.push({
      idx: i,
      address: w.address,
      pk: w.privateKey,
    });
  }
  console.log(`✓ ${identities.length} wallets générés`);

  // 3. Créditer chaque compte via hardhat_setBalance
  const balanceWei = "0x" + weiFromEth(ETH_PER_ACCOUNT).toString(16);
  console.log(`\n💰 Crédit de ${ETH_PER_ACCOUNT} ETH par compte...`);
  for (const id of identities) {
    try {
      await provider.send("hardhat_setBalance", [id.address, balanceWei]);
      process.stdout.write(".");
    } catch (e) {
      console.error(`\n❌ Échec setBalance pour ${id.address}: ${e.message}`);
      process.exit(1);
    }
  }
  console.log(`\n✓ Tous les comptes crédités`);

  // 4. Vérifier les soldes
  console.log("\n🔍 Vérification des soldes:");
  for (const id of identities.slice(0, 3)) {
    const bal = await provider.getBalance(id.address);
    console.log(`   ${id.address} -> ${ethers.formatEther(bal)} ETH`);
  }
  if (identities.length > 3) console.log(`   ... et ${identities.length - 3} autres`);

  // 5. Générer la page HTML imprimable
  const generatedAt = new Date().toLocaleString();
  const slipsHtml = identities
    .map(
      (id) => `
    <div class="slip">
      <div class="slip-header">
        <span class="slip-num">Votant #${id.idx}</span>
        <span class="slip-warn">⚠ CONFIDENTIEL</span>
      </div>
      <div class="slip-row">
        <span class="slip-label">Adresse :</span>
        <span class="slip-value mono">${id.address}</span>
      </div>
      <div class="slip-row">
        <span class="slip-label">Clé privée :</span>
        <span class="slip-value mono pk">${id.pk}</span>
      </div>
      <div class="slip-footer">DÉMO LOCALE UNIQUEMENT — ne jamais financer sur mainnet/Sepolia</div>
    </div>`,
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Slips d'identités - Vote FHEVM</title>
  <style>
    @page { size: A4; margin: 1cm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, system-ui, sans-serif;
      background: #f5f5f5;
      margin: 0;
      padding: 1cm;
      color: #111;
    }
    .controls {
      position: sticky;
      top: 0;
      background: #fff;
      border: 1px solid #ddd;
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
      border-radius: 6px;
      display: flex;
      gap: 0.5rem;
      align-items: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.05);
    }
    .controls h1 { margin: 0; font-size: 1rem; flex: 1; }
    .controls button {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9rem;
    }
    .controls .print { background: #7c3aed; color: #fff; }
    .controls .danger { background: #dc2626; color: #fff; }
    .meta {
      font-size: 0.8rem;
      color: #666;
      margin-bottom: 1rem;
    }
    .meta code { background: #eee; padding: 0.1rem 0.3rem; border-radius: 3px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5cm;
    }
    .slip {
      background: #fff;
      border: 2px dashed #999;
      border-radius: 4px;
      padding: 0.5rem 0.75rem;
      page-break-inside: avoid;
      position: relative;
    }
    .slip-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #ddd;
      padding-bottom: 0.3rem;
      margin-bottom: 0.4rem;
    }
    .slip-num {
      font-weight: 700;
      font-size: 1rem;
      color: #7c3aed;
    }
    .slip-warn {
      font-size: 0.65rem;
      background: #fef2f2;
      color: #b91c1c;
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      font-weight: 600;
    }
    .slip-row {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      margin: 0.25rem 0;
    }
    .slip-label {
      font-size: 0.65rem;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .slip-value {
      font-size: 0.75rem;
      word-break: break-all;
    }
    .mono { font-family: 'SF Mono', Menlo, Consolas, monospace; }
    .pk { background: #f9fafb; padding: 0.15rem 0.3rem; border-radius: 3px; }
    .slip-footer {
      font-size: 0.6rem;
      color: #999;
      text-align: center;
      margin-top: 0.3rem;
      font-style: italic;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .controls, .meta { display: none; }
      .grid { grid-template-columns: repeat(2, 1fr); gap: 0.3cm; }
      .slip { border-style: dashed; }
    }
  </style>
</head>
<body>
  <div class="controls">
    <h1>🖨 ${identities.length} slips d'identités (à imprimer et découper)</h1>
    <button class="print" onclick="window.print()">Imprimer</button>
  </div>
  <div class="meta">
    Généré le <strong>${generatedAt}</strong> — contient <strong>${identities.length} clés privées en clair</strong>.<br>
    Après impression, supprime ce fichier avec :
    <code>rm "${OUT_FILE}"</code>
  </div>
  <div style="background:#7f1d1d;color:#fee2e2;border:2px solid #b91c1c;padding:0.75rem 1rem;border-radius:6px;margin-bottom:1rem;font-size:0.85rem;">
    <strong>⚠️ DANGER — VRAIS WALLETS CRYPTOGRAPHIQUES</strong><br>
    Ces adresses sont des keypairs Ethereum réels (même algo que MetaMask). Elles n'ont de la valeur QUE sur le noeud Hardhat local (chainId 31337).<br>
    <strong>Ne finance JAMAIS ces adresses sur mainnet, Sepolia ou toute autre chaîne publique</strong>, sinon quiconque détient la PK imprimée sur un slip contrôle ces fonds.
  </div>
  <div class="grid">
${slipsHtml}
  </div>
  <script>
    // Aucun JS dans cette page : la sécurité repose sur la suppression
    // manuelle du fichier après impression (cf. commande rm ci-dessus).
  </script>
</body>
</html>
`;

  fs.writeFileSync(OUT_FILE, html, "utf8");
  console.log(`\n📄 Fichier généré: ${OUT_FILE}`);
  console.log(`   Ouvre-le dans ton navigateur, clique "Imprimer", puis supprime-le.`);
  console.log(`\n⚠  RAPPEL SÉCURITÉ :`);
  console.log(`   - Ce fichier contient les 20 clés privées en clair.`);
  console.log(`   - Ne le commit jamais. Ne l'envoie jamais sur le réseau.`);
  console.log(`   - Après impression : rm ${OUT_FILE}`);
  console.log(`\n🚨 AVERTISSEMENT CRITIQUE — VRAIS WALLETS :`);
  console.log(`   - Ces 20 adresses sont des keypairs Ethereum RÉELS (mêmes algo que MetaMask/Ledger).`);
  console.log(`   - Elles n'ont de la valeur QUE sur le noeud Hardhat local (chainId 31337).`);
  console.log(`   - ⚠️  NE FINANCE JAMAIS ces adresses sur mainnet, Sepolia ou toute chaîne publique.`);
  console.log(`      Sinon la PK du slip = contrôle total des fonds envoyés à cette adresse.`);
  console.log(`   - Régénère un nouveau set avant chaque démo pour rendre les anciens inertes.`);
  console.log(`\n🎉 Terminé ! Distribue un slip par votant.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Erreur:", e);
    process.exit(1);
  });
