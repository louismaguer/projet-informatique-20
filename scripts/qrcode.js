// scripts/qrcode.js
// Helper partagé pour générer des QR codes en SVG inline (pas de fichier externe,
// pas de réseau, rendu côté Node pendant la génération HTML des slips).
//
// Usage :
//   const { buildQrSvg } = require("./qrcode");
//   buildQrSvg("https://...", { size: 90 });  // retourne une chaîne "<svg>...</svg>"
//
// L'API wrappe `qrcode` (npm) en mode string output, en fixant les paramètres
// pour des QR codes lisibles à l'impression (couleur, correction M, marge).

const QRCode = require("qrcode");

// Génère un QR code en SVG inline (async — qrcode retourne une Promise).
//   text : contenu à encoder (URL, PK, adresse...)
//   opts : { size: px (carré), dark, light, margin, ecLevel }
// Retourne une chaîne "<svg ...>...</svg>" prête à inliner dans le HTML, ou
// un commentaire HTML si text est vide / en cas d'erreur.
async function buildQrSvg(text, opts = {}) {
  if (!text) {
    return "<!-- qrcode: empty payload -->";
  }
  const size = opts.size || 90;
  const dark = opts.dark || "#111";
  const light = opts.light || "#ffffff";
  const margin = opts.margin != null ? opts.margin : 1;
  const ecLevel = opts.ecLevel || "M"; // L=7%, M=15%, Q=25%, H=30%
  try {
    return await QRCode.toString(text, {
      type: "svg",
      errorCorrectionLevel: ecLevel,
      margin,
      width: size,
      color: { dark, light },
    });
  } catch (e) {
    return `<!-- qrcode error: ${String(e).replace(/-->/g, "--&gt;")} -->`;
  }
}

module.exports = { buildQrSvg };
