// scripts/generateIdentities.js
// Génère COUNT wallets aléatoires, les crédite de ETH_PER_ACCOUNT ETH chacun via
// hardhat_setBalance, et écrit scripts/printIdentities.html (slips papier à
// imprimer et découper).
//
// ⚠ Le fichier HTML produit contient les clés privées en clair.
//    À supprimer après impression, ou à générer hors du dépôt (ex: /tmp/).
//
// Slip #0 = ADMINISTRATEUR : adresse écrite dans scripts/.admin_addr pour
// injection dans le constructeur du contrat. Le contrat refuse tout vote depuis
// cette adresse.
//
// Usage:
//   npx hardhat run scripts/generateIdentities.js --network localhost
//
// Personnalisation:
//   COUNT=10 ETH_PER_ACCOUNT=1 npx hardhat run scripts/generateIdentities.js --network localhost
//   PUBLIC_URL=https://xxx.trycloudflare.com npx hardhat run scripts/generateIdentities.js --network localhost

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { buildQrSvg } = require("./qrcode");

const COUNT = parseInt(process.env.COUNT || "151", 10); // slip #0 = admin, slips #1..#N-1 = votants (150 votants par défaut)
const ETH_PER_ACCOUNT = process.env.ETH_PER_ACCOUNT || "100";
const OUT_FILE = path.join(__dirname, "printIdentities.html");
const ADMIN_FILE = path.join(__dirname, ".admin_addr");
const ADMIN_PK_FILE = path.join(__dirname, ".admin_pk");
const IDENTITIES_FILE = path.join(__dirname, ".identities.json");
const PUBLIC_URL = process.env.PUBLIC_URL || "";

// QR code : voir scripts/qrcode.js (helper partagé, async).

function safeUrl(u) {
  return String(u).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

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
  } catch {
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
  const slipsHtml = (
    await Promise.all(
      identities.map(async (id) => {
        const isAdmin = id.idx === 0;
        const headerWarn = isAdmin ? "⚠ RÔLE ADMIN" : "⚠ CONFIDENTIEL";
        const footerText = isAdmin
          ? "SERT UNIQUEMENT à créer / fermer les élections. NE PAS UTILISER POUR VOTER."
          : "DÉMO LOCALE UNIQUEMENT — ne jamais financer sur mainnet/Sepolia";

        // QR codes : URL publique + PK brute (paper wallet)
        const qrUrl = PUBLIC_URL ? await buildQrSvg(PUBLIC_URL, { size: 90, ecLevel: "M" }) : "";
        const qrPk = await buildQrSvg(id.pk, { size: 110, ecLevel: "M" });
        const urlLabel = PUBLIC_URL ? `🌐 ${safeUrl(PUBLIC_URL)}` : `<em>(URL publique non fournie)</em>`;

        if (isAdmin) {
          // === SLIP ADMIN : layout "double" (2 cellules = pleine largeur × plus grand) ===
          // Comme un slip votant, mais étalé sur toute la largeur de la page A4,
          // avec une note détaillée et des QR codes plus gros.
          const qrBlock = `
          <div class="slip-qr">
            <div class="slip-qr-cell">
              <div class="slip-qr-img">${qrUrl}</div>
              <div class="slip-qr-label">Scan → ouvrir la démo</div>
              <div class="slip-qr-sublabel">${urlLabel}</div>
            </div>
            <div class="slip-qr-cell slip-qr-secret">
              <div class="slip-qr-img">${qrPk}</div>
              <div class="slip-qr-label">🔑 Clé privée admin</div>
              <div class="slip-qr-sublabel">Scan pour importer (à garder secrète)</div>
            </div>
          </div>`;
          return `
    <div class="slip slip-admin slip-admin-double">
      <div class="slip-header">
        <span class="slip-num">🔧 ADMINISTRATEUR #0</span>
        <span class="slip-warn">⚠ RÔLE ADMIN</span>
      </div>
      <div class="slip-admin-note">
        <strong>Cette clé NE SERT PAS À VOTER.</strong>
        Elle sert uniquement à :
        <ul style="margin: 0.3rem 0 0 1rem; padding: 0;">
          <li>Créer des élections</li>
          <li>Fermer des élections (révéler les résultats)</li>
        </ul>
        Le contrat refuse les votes émis depuis cette adresse.
        Distribuer ce slip <strong>uniquement à l'organisateur</strong>.
      </div>
      <div class="slip-row">
        <span class="slip-label">Adresse :</span>
        <span class="slip-value mono">${id.address}</span>
      </div>
      <div class="slip-row">
        <span class="slip-label">Clé privée :</span>
        <span class="slip-value mono pk">${id.pk}</span>
      </div>
      ${qrBlock}
      <div class="slip-footer">${footerText}</div>
    </div>`;
        }

        // === SLIP VOTANT : layout détaillé actuel ===
        const qrBlock = `
        <div class="slip-qr">
          <div class="slip-qr-cell">
            <div class="slip-qr-img">${qrUrl}</div>
            <div class="slip-qr-label">Scan → ouvrir la démo</div>
            <div class="slip-qr-sublabel">${urlLabel}</div>
          </div>
          <div class="slip-qr-cell slip-qr-secret">
            <div class="slip-qr-img">${qrPk}</div>
            <div class="slip-qr-label">🔑 Clé privée</div>
            <div class="slip-qr-sublabel">Scan pour importer (à garder secrète)</div>
          </div>
        </div>`;

        return `
    <div class="slip">
      <div class="slip-header">
        <span class="slip-num">Votant #${id.idx}</span>
        <span class="slip-warn">${headerWarn}</span>
      </div>
      <div class="slip-row">
        <span class="slip-label">Adresse :</span>
        <span class="slip-value mono">${id.address}</span>
      </div>
      <div class="slip-row">
        <span class="slip-label">Clé privée :</span>
        <span class="slip-value mono pk">${id.pk}</span>
      </div>
      ${qrBlock}
      <div class="slip-footer">${footerText}</div>
    </div>`;
      }),
    )
  ).join("\n");

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
      break-inside: avoid;
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
    .slip-admin {
      background: #fffbeb;
      border-color: #f59e0b;
      border-style: solid;
    }
    .slip-admin .slip-num {
      color: #b45309;
    }
    .slip-admin-note {
      background: #fef3c7;
      border-left: 3px solid #f59e0b;
      padding: 0.4rem 0.5rem;
      margin: 0.3rem 0;
      font-size: 0.7rem;
      color: #78350f;
      border-radius: 3px;
    }
    .slip-admin-note strong {
      color: #b45309;
    }
    /* Slip admin "double" : occupe les 2 cellules de la grille (pleine largeur)
       et a un contenu plus aéré, mais reste compact pour tenir sur 1 page A4. */
    .slip-admin-double {
      grid-column: 1 / -1;
      padding: 0.5rem 0.7rem;
      background: #fffbeb;
      border: 2px solid #f59e0b;
      border-style: solid;
      border-radius: 4px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .slip-admin-double .slip-num {
      font-size: 1rem;
      color: #b45309;
    }
    .slip-admin-double .slip-warn {
      font-size: 0.7rem;
      padding: 0.15rem 0.4rem;
    }
    .slip-admin-double .slip-admin-note {
      background: #fef3c7;
      border-left: 3px solid #f59e0b;
      padding: 0.4rem 0.6rem;
      margin: 0.3rem 0;
      font-size: 0.78rem;
      color: #78350f;
      border-radius: 3px;
      line-height: 1.35;
    }
    .slip-admin-double .slip-admin-note strong {
      color: #b45309;
      font-size: 0.85rem;
    }
    .slip-admin-double .slip-admin-note ul {
      margin: 0.2rem 0 0 1rem !important;
    }
    .slip-admin-double .slip-row {
      margin: 0.25rem 0;
    }
    .slip-admin-double .slip-label {
      font-size: 0.7rem;
    }
    .slip-admin-double .slip-value {
      font-size: 0.78rem;
    }
    .slip-admin-double .slip-qr {
      gap: 1rem;
      padding-top: 0.3rem;
      margin-top: 0.4rem;
    }
    .slip-admin-double .slip-qr-cell svg {
      width: 100px;
      height: 100px;
    }
    .slip-admin-double .slip-qr-secret svg { width: 120px; height: 120px; }
    .slip-admin-double .slip-qr-label {
      font-size: 0.7rem;
    }
    .slip-admin-double .slip-qr-sublabel {
      font-size: 0.65rem;
      max-width: 160px;
    }
    .slip-admin-double .slip-footer {
      font-size: 0.65rem;
      margin-top: 0.3rem;
    }
    .slip-urls {
      margin-top: 0.4rem;
      padding-top: 0.3rem;
      border-top: 1px dotted #ccc;
    }
    .slip-url-row {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      margin: 0.2rem 0;
    }
    .slip-url-label {
      font-size: 0.6rem;
      color: #666;
      font-weight: 600;
    }
    .slip-url-value {
      font-size: 0.7rem;
      word-break: break-all;
      color: #1e40af;
    }
    .slip-qr {
      display: flex;
      gap: 0.5rem;
      justify-content: space-around;
      align-items: flex-start;
      margin: 0.4rem 0 0.2rem;
      padding-top: 0.3rem;
      border-top: 1px dotted #ccc;
    }
    .slip-qr-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.15rem;
      max-width: 50%;
    }
    .slip-qr-cell svg {
      display: block;
      width: 90px;
      height: 90px;
    }
    .slip-qr-secret {
      padding: 0.2rem 0.3rem;
      border: 1px solid #b91c1c;
      border-radius: 3px;
      background: #fef2f2;
    }
    .slip-qr-secret svg { width: 110px; height: 110px; }
    .slip-qr-img { line-height: 0; }
    .slip-qr-label {
      font-size: 0.6rem;
      font-weight: 700;
      color: #444;
      text-align: center;
    }
    .slip-qr-secret .slip-qr-label { color: #b91c1c; }
    .slip-qr-sublabel {
      font-size: 0.55rem;
      color: #888;
      word-break: break-all;
      text-align: center;
      max-width: 110px;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .controls, .meta { display: none; }
      .grid { grid-template-columns: repeat(2, 1fr); gap: 0.3cm; }
      .slip { border-style: dashed; page-break-inside: avoid; break-inside: avoid; }
      .slip-admin { border-style: solid; }
      .slip-admin-double { page-break-after: always; page-break-inside: avoid; break-inside: avoid; }
      /* Évite qu'une coupure tombe au milieu d'un QR code */
      .slip-qr-cell { page-break-inside: avoid; break-inside: avoid; }
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
  // Écrit l'adresse admin dans un fichier temporaire pour start.sh
  fs.writeFileSync(ADMIN_FILE, identities[0].address + "\n", "utf8");
  // Écrit la PK admin dans un fichier temporaire (utilisé par les scripts E2E)
  fs.writeFileSync(ADMIN_PK_FILE, identities[0].pk + "\n", "utf8");
  // Persiste toutes les identités (PKs en clair, fichier temporaire supprimé par start.sh)
  // Permet à renderSlips.js de régénérer le HTML avec une URL différente
  // SANS toucher aux clés (donc le contrat déployé reste valide)
  fs.writeFileSync(IDENTITIES_FILE, JSON.stringify(identities), "utf8");

  console.log(`\n📄 Fichier généré: ${OUT_FILE}`);
  console.log(`   Ouvre-le dans ton navigateur, clique "Imprimer", puis supprime-le.`);
  console.log(`\n🔧 Slip #0 (ADMINISTRATEUR) : ${identities[0].address}`);
  console.log(`   Cette clé NE SERT PAS À VOTER. Elle sert à créer/fermer les élections.`);
  console.log(`   Distribuer uniquement à l'organisateur.`);
  console.log(`   Adresse écrite dans ${ADMIN_FILE} pour injection au déploiement.`);
  console.log(`   PK admin (scripts E2E) : ${ADMIN_PK_FILE}`);
  if (PUBLIC_URL) {
    console.log(`\n🌐 URL publique (tunnel) : ${PUBLIC_URL}`);
  } else {
    console.log(`\n   (aucune PUBLIC_URL fournie — ajoute PUBLIC_URL=https://... si tu utilises un tunnel)`);
  }
  console.log(`\n⚠  RAPPEL SÉCURITÉ :`);
  console.log(`   - Ce fichier contient les ${COUNT} clés privées en clair.`);
  console.log(`   - Ne le commit jamais. Ne l'envoie jamais sur le réseau.`);
  console.log(`   - Après impression : rm ${OUT_FILE}`);
  console.log(`\n🚨 AVERTISSEMENT CRITIQUE — VRAIS WALLETS :`);
  console.log(`   - Ces ${COUNT} adresses sont des keypairs Ethereum RÉELS (mêmes algo que MetaMask/Ledger).`);
  console.log(`   - Elles n'ont de la valeur QUE sur le noeud Hardhat local (chainId 31337).`);
  console.log(`   - ⚠️  NE FINANCE JAMAIS ces adresses sur mainnet, Sepolia ou toute chaîne publique.`);
  console.log(`      Sinon la PK du slip = contrôle total des fonds envoyés à cette adresse.`);
  console.log(`   - Régénère un nouveau set avant chaque démo pour rendre les anciens inertes.`);
  console.log(`\n🎉 Terminé ! Distribue un slip par votant, le slip #0 à l'organisateur.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Erreur:", e);
    process.exit(1);
  });
