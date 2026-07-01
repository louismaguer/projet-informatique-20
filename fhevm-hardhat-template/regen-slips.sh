#!/bin/bash
# regen-slips.sh - Régénère les slips avec l'URL publique courante du tunnel Cloudflare.
# Utile quand le tunnel a redémarré et que l'URL a changé.
#
# Usage :
#   ./regen-slips.sh                          # détecte l'URL depuis /tmp/tunnel.log
#   PUBLIC_URL=https://xxx.trycloudflare.com ./regen-slips.sh   # URL explicite

set -e

cd "$(dirname "$0")"

IDENTITIES_FILE="scripts/.identities.json"

if [ ! -f "$IDENTITIES_FILE" ]; then
    echo "❌ $IDENTITIES_FILE introuvable. Lance d'abord start.sh pour générer les identités."
    exit 1
fi

# Détecte l'URL depuis /tmp/tunnel.log si pas fournie
if [ -z "$PUBLIC_URL" ]; then
    if [ ! -f /tmp/tunnel.log ]; then
        echo "❌ Pas d'URL fournie et /tmp/tunnel.log introuvable."
        echo "   Usage: PUBLIC_URL=https://xxx.trycloudflare.com ./regen-slips.sh"
        exit 1
    fi
    PUBLIC_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/tunnel.log | head -1 || true)
    if [ -z "$PUBLIC_URL" ]; then
        echo "❌ Pas d'URL trycloudflare dans /tmp/tunnel.log. Le tunnel est bien lancé ?"
        exit 1
    fi
fi

echo "🎟  Régénération des slips avec l'URL publique..."
echo "   URL : $PUBLIC_URL"
if PUBLIC_URL="$PUBLIC_URL" node scripts/renderSlips.js; then
    echo ""
    echo "✅ Slips mis à jour : scripts/printIdentities.html"
    echo "   Réimprime et redistribue aux testeurs."
fi