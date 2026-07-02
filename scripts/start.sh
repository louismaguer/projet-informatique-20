#!/bin/bash
# Lance tous les services pour la démo FHEVM locale
set -e

# Fichier temporaire avec l'adresse admin (généré par generateIdentities.js)
ADMIN_FILE="scripts/.admin_addr"
ADMIN_PK_FILE="scripts/.admin_pk"
IDENTITIES_FILE="scripts/.identities.json"

# Cleanup processes on our ports
cleanup() {
    echo ""
    echo "🛑 Arrêt des services..."
    kill $(lsof -ti :8545) 2>/dev/null || true
    kill $(lsof -ti :8080) 2>/dev/null || true
    kill $(lsof -ti :8081) 2>/dev/null || true
    [ -n "${TUNNEL_PID:-}" ] && kill "$TUNNEL_PID" 2>/dev/null || true
    rm -f "$ADMIN_FILE" "$ADMIN_PK_FILE" "$IDENTITIES_FILE"
}
trap cleanup EXIT

echo "🔐 Vote Confidentiel FHEVM - Démarrage"
echo "=========================================="

# 1. Hardhat node
if ! lsof -i :8545 > /dev/null 2>&1; then
    echo "📡 Démarrage Hardhat node..."
    npx hardhat node --network hardhat --hostname 0.0.0.0 > /tmp/hardhat.log 2>&1 &
    HARDHAT_PID=$!
    sleep 6
fi

# Verify hardhat
RESULT=$(curl -s -X POST http://localhost:8545 -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' 2>/dev/null | head -c 100)
if [ -z "$RESULT" ]; then
    echo "❌ Hardhat n'a pas démarré"
    exit 1
fi
echo "✓ Hardhat node prêt (block $(echo $RESULT | grep -o '"result":"[^"]*"' | cut -d'"' -f4))"

# 2. Génération des identités (slips papier) AVANT le déploiement
#    Le slip #0 devient admin, son adresse est écrite dans $ADMIN_FILE
echo "🎟  Génération des slips d'identité (slip #0 = admin)..."
rm -f scripts/printIdentities.html
if ! npx hardhat run scripts/generateIdentities.js --network localhost > /tmp/identities.log 2>&1; then
    echo "❌ Échec de la génération des identités (voir /tmp/identities.log)"
    exit 1
fi
if [ ! -f "$ADMIN_FILE" ]; then
    echo "❌ $ADMIN_FILE non créé par generateIdentities.js"
    exit 1
fi
ADMIN_ADDRESS=$(cat "$ADMIN_FILE" | tr -d '[:space:]')
echo "✓ Slips générés: scripts/printIdentities.html (à imprimer)"
echo "🔧 Admin (slip #0) : $ADMIN_ADDRESS"

# 3. Déploiement du contrat avec l'admin
echo "📝 Déploiement du contrat (admin = $ADMIN_ADDRESS)..."
DEPLOY_OUT=$(ADMIN_ADDRESS="$ADMIN_ADDRESS" npx hardhat deploy --network localhost 2>&1)
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUT" | grep "ConfidentialVoting contract:" | grep -oE "0x[a-fA-F0-9]{40}")
echo "✓ Contrat déployé: $CONTRACT_ADDRESS"

# 4. Relayer proxy
if ! lsof -i :8081 > /dev/null 2>&1; then
    echo "🔌 Démarrage relayer proxy..."
    python3 backend/relayer_proxy.py > /tmp/proxy.log 2>&1 &
    PROXY_PID=$!
    sleep 2
fi
echo "✓ Relayer proxy prêt (port 8081)"

# 5. Frontend server (no-cache pour éviter le caching navigateur)
if ! lsof -i :8080 > /dev/null 2>&1; then
    echo "🌐 Démarrage frontend server (no-cache, avec reverse proxy intégré)..."
    python3 backend/frontend_server.py > /tmp/frontend.log 2>&1 &
    FRONTEND_PID=$!
    sleep 2
fi
echo "✓ Frontend prêt (port 8080)"

# 6. Tunnel Cloudflare (optionnel, pour accès Internet)
#    Utilise le helper partagé scripts/cloudflared_tunnel.sh qui force
#    --protocol http2 et empêche les instances concurrentes (sinon : 1033).
PUBLIC_URL=""
if command -v cloudflared > /dev/null 2>&1; then
    echo "🚇 Démarrage du tunnel Cloudflare..."
    # shellcheck source=scripts/cloudflared_tunnel.sh
    source "$(dirname "$0")/cloudflared_tunnel.sh"
    if start_cloudflared_quick_tunnel 8080 /tmp/tunnel.log; then
        echo "✓ Tunnel prêt : $PUBLIC_URL"
    else
        echo "⚠ Tunnel non opérationnel (voir /tmp/tunnel.log) — seul le LAN sera accessible"
        TUNNEL_PID=""
    fi
else
    echo "ℹ cloudflared non installé — pas de tunnel Internet (LAN uniquement)"
    echo "  Pour activer le tunnel : brew install cloudflared"
fi

# 7. Régénère les slips avec l'URL publique (sans changer les clés !)
#    On utilise renderSlips.js qui lit .identities.json (déjà persisté par
#    generateIdentities.js à l'étape 2) et regénère uniquement le HTML.
#    IMPORTANT : ne PAS relancer generateIdentities.js ici, sinon de nouvelles
#    clés seraient générées et l'admin du contrat déployé ne correspondrait plus.
if [ -n "$PUBLIC_URL" ] && [ -f "$IDENTITIES_FILE" ]; then
    echo "🎟  Mise à jour des slips avec l'URL publique..."
    if PUBLIC_URL="$PUBLIC_URL" node scripts/renderSlips.js > /tmp/identities2.log 2>&1; then
        echo "✓ Slips mis à jour avec URL publique"
    else
        echo "⚠ Échec de la mise à jour des slips (voir /tmp/identities2.log) — slips initiaux toujours valides"
    fi
fi

echo ""
echo "=========================================="
echo "🎉 Services prêts!"
echo ""
echo "📍 Frontend (local):  http://localhost:8080"
LAN_IP=$(ifconfig 2>/dev/null | grep -oE 'inet [0-9.]+' | grep -v '127.0.0.1' | head -1 | awk '{print $2}')
if [ -n "$LAN_IP" ]; then
    echo "📍 Frontend (LAN):    http://$LAN_IP:8080"
fi
if [ -n "$PUBLIC_URL" ]; then
    echo "📍 Frontend (WWW):    $PUBLIC_URL"
    echo ""
    echo "⚠️  Tunnel actif : le service est exposé à internet."
    echo "   Toute personne ayant l'URL peut atteindre le noeud Hardhat."
    echo "   Pour une démo 100% locale : pkill -f cloudflared"
fi
echo "📍 Hardhat RPC:       http://localhost:8545"
echo "📍 Relayer mock:      http://localhost:8081"
echo "📍 Contrat:           $CONTRACT_ADDRESS"
echo "🔧 Admin:             $ADMIN_ADDRESS (slip #0)"
echo "🎟  Slips:             scripts/printIdentities.html (à imprimer)"
echo ""
echo "👉 Ouvrez http://localhost:8080 dans votre navigateur"
echo "👉 Imprimez les slips depuis scripts/printIdentities.html puis supprimez le fichier"
echo "=========================================="

# Open browser (macOS)
sleep 1
open http://localhost:8080 2>/dev/null || true

# Wait for interrupt
wait
