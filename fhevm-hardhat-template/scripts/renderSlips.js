// scripts/renderSlips.js
// Régénère le HTML des slips (scripts/printIdentities.html) à partir des identités
// déjà sauvegardées dans scripts/.identities.json, en y intégrant l'URL publique
// (Cloudflare tunnel) fournie via PUBLIC_URL.
// Utilisé par start.sh pour mettre à jour l'URL sur les slips SANS changer les clés
// (sinon le contrat déployé avec l'ancienne admin ne correspondrait plus).

const fs = require("fs");
const path = require("path");

const OUT_FILE = path.join(__dirname, "printIdentities.html");
const IDENTITIES_FILE = path.join(__dirname, ".identities.json");
const PUBLIC_URL = process.env.PUBLIC_URL || "";

function safeUrl(u) {
  return String(u).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

function renderSlips(identities, publicUrl) {
  const generatedAt = new Date().toLocaleString();
  const slipsHtml = identities
    .map((id) => {
      const isAdmin = id.idx === 0;
      const slipClass = isAdmin ? "slip slip-admin" : "slip";
      const headerNum = isAdmin ? `🔧 ADMINISTRATEUR #${id.idx}` : `Votant #${id.idx}`;
      const headerWarn = isAdmin ? "⚠ RÔLE ADMIN" : "⚠ CONFIDENTIEL";
      const footerText = isAdmin
        ? "SERT UNIQUEMENT à créer / fermer les élections. NE PAS UTILISER POUR VOTER."
        : "DÉMO LOCALE UNIQUEMENT — ne jamais financer sur mainnet/Sepolia";
      const adminNote = isAdmin
        ? `<div class="slip-admin-note">
              <strong>Cette clé NE SERT PAS À VOTER.</strong>
              Elle sert uniquement à :
              <ul style="margin: 0.3rem 0 0 1rem; padding: 0;">
                <li>Créer des élections</li>
                <li>Fermer des élections (révéler les résultats)</li>
              </ul>
              Le contrat refuse les votes émis depuis cette adresse.
              Distribuer ce slip <strong>uniquement à l'organisateur</strong>.
            </div>`
        : "";
      return `
    <div class="${slipClass}">
      <div class="slip-header">
        <span class="slip-num">${headerNum}</span>
        <span class="slip-warn">${headerWarn}</span>
      </div>
      ${adminNote}
      <div class="slip-row">
        <span class="slip-label">Adresse :</span>
        <span class="slip-value mono">${id.address}</span>
      </div>
      <div class="slip-row">
        <span class="slip-label">Clé privée :</span>
        <span class="slip-value mono pk">${id.pk}</span>
      </div>
      <div class="slip-urls">
        ${publicUrl ? `<div class="slip-url-row">
          <span class="slip-url-label">🌐 URL publique :</span>
          <span class="slip-url-value mono">${safeUrl(publicUrl)}</span>
        </div>` : `<div class="slip-url-row">
          <span class="slip-url-label">🌐 URL publique :</span>
          <span class="slip-url-value mono"><em>(non fournie — relance avec PUBLIC_URL=https://...)</em></span>
        </div>`}
      </div>
      <div class="slip-footer">${footerText}</div>
    </div>`;
    })
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
    @media print {
      body { background: #fff; padding: 0; }
      .controls, .meta { display: none; }
      .grid { grid-template-columns: repeat(2, 1fr); gap: 0.3cm; }
      .slip { border-style: dashed; }
      .slip-admin { border-style: solid; }
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
  return html;
}

function main() {
  if (!fs.existsSync(IDENTITIES_FILE)) {
    console.error(`❌ ${IDENTITIES_FILE} introuvable. Lance d'abord generateIdentities.js`);
    process.exit(1);
  }
  const identities = JSON.parse(fs.readFileSync(IDENTITIES_FILE, "utf-8"));
  const html = renderSlips(identities, PUBLIC_URL);
  fs.writeFileSync(OUT_FILE, html, "utf8");
  console.log(`✓ Slips régénérés : ${OUT_FILE}`);
  if (PUBLIC_URL) {
    console.log(`  URL publique intégrée : ${PUBLIC_URL}`);
  } else {
    console.log(`  (URL publique non fournie)`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { renderSlips };
