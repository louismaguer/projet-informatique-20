#!/bin/bash
# Lance tous les services pour la démo FHEVM locale
set -e

# Empêche MSYS (Git Bash) de traduire les chemins Unix en chemins Windows
# pour les commandes externes (python, npx, node, etc.). No-op sur macOS/Linux.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

# Détection cross-platform des PIDs écoutant sur un port (lsof → netstat → ss).
# Retourne un ou plusieurs PIDs (un par ligne), ou rien si le port est libre.
_port_listeners() {
    local port="$1"
    if command -v lsof > /dev/null 2>&1; then
        lsof -ti :"$port" 2>/dev/null
    elif command -v netstat > /dev/null 2>&1; then
        # netstat -ano (Windows) ou -lntp (Unix). On normalise via awk.
        netstat -ano 2>/dev/null | awk -v port=":$port" \
            '$0 ~ port && /LISTENING/ {print $NF}' | sort -u
    elif command -v ss > /dev/null 2>&1; then
        ss -lntp 2>/dev/null | awk -v port=":$port" \
            '$4 ~ port {print $0}' | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u
    fi
}

# Test "le port $1 est-il occupé ?"
_port_in_use() {
    [ -n "$(_port_listeners "$1")" ]
}

# Attend que le port $1 passe en LISTENING (max $2 secondes, défaut 10).
# Si $3 est fourni, affiche les 10 dernières lignes du log en cas d'échec.
# Renvoie 0 si le port est UP, 1 sinon.
_wait_for_port() {
    local port="$1"
    local timeout="${2:-10}"
    local log="${3:-}"
    local i
    for i in $(seq 1 "$timeout"); do
        if _port_in_use "$port"; then
            return 0
        fi
        sleep 1
    done
    if [ -n "$log" ] && [ -f "$log" ]; then
        echo "   --- tail de $log ---" >&2
        tail -10 "$log" >&2 || true
        echo "   --- fin ---" >&2
    fi
    return 1
}

# Tue un PID de façon portable (kill POSIX sur Unix, taskkill sur Windows).
_kill_pid() {
    local pid="$1"
    if [ -n "$pid" ]; then
        case "$(uname -s 2>/dev/null || echo unknown)" in
            CYGWIN*|MINGW*|MSYS*)
                taskkill //F //PID "$pid" 2>/dev/null || true
                ;;
            *)
                kill "$pid" 2>/dev/null || true
                ;;
        esac
    fi
}

# Python : python3 sur macOS/Linux, souvent "python" seul sur Windows (Git Bash).
PY=$(command -v python3 2>/dev/null || command -v python 2>/dev/null || echo python3)

# Fichier temporaire avec l'adresse admin (généré par generateIdentities.js)
ADMIN_FILE="scripts/.admin_addr"
ADMIN_PK_FILE="scripts/.admin_pk"
IDENTITIES_FILE="scripts/.identities.json"

# Cleanup processes on our ports
cleanup() {
    echo ""
    echo "🛑 Arrêt des services..."
    for pid in $(_port_listeners 8545); do _kill_pid "$pid"; done
    for pid in $(_port_listeners 8080); do _kill_pid "$pid"; done
    for pid in $(_port_listeners 8081); do _kill_pid "$pid"; done
    [ -n "${TUNNEL_PID:-}" ] && _kill_pid "$TUNNEL_PID"
    rm -f "$ADMIN_FILE" "$ADMIN_PK_FILE" "$IDENTITIES_FILE"
}
trap cleanup EXIT

echo "🔐 Vote Confidentiel FHEVM - Démarrage"
echo "=========================================="

# 1. Hardhat node
if ! _port_in_use 8545; then
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
if ! _port_in_use 8081; then
    echo "🔌 Démarrage relayer proxy..."
    "$PY" backend/relayer_proxy.py > /tmp/proxy.log 2>&1 &
    PROXY_PID=$!
fi
if ! _wait_for_port 8081 10 /tmp/proxy.log; then
    echo "❌ Relayer proxy NON démarré sur :8081 (voir /tmp/proxy.log)"
    exit 1
fi
echo "✓ Relayer proxy prêt (port 8081)"

# 5. Frontend server (no-cache pour éviter le caching navigateur)
if ! _port_in_use 8080; then
    echo "🌐 Démarrage frontend server (no-cache, avec reverse proxy intégré)..."
    "$PY" backend/frontend_server.py > /tmp/frontend.log 2>&1 &
    FRONTEND_PID=$!
fi
if ! _wait_for_port 8080 10 /tmp/frontend.log; then
    echo "❌ Frontend NON démarré sur :8080 (voir /tmp/frontend.log)"
    exit 1
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
    echo "  Pour activer le tunnel : brew install cloudflared          # macOS"
    echo "                              sudo apt install cloudflared  # Debian/Ubuntu"
    echo "                              voir https://pkg.cloudflare.com/  # autres"
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
if command -v ip > /dev/null 2>&1; then
    LAN_IP=$(ip -4 addr show 2>/dev/null | awk '/inet / && !/127.0.0.1/ {print $2}' | cut -d/ -f1 | head -1)
else
    LAN_IP=$(ifconfig 2>/dev/null | grep -oE 'inet [0-9.]+' | grep -v '127.0.0.1' | head -1 | awk '{print $2}')
fi
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

# Open browser (macOS / Linux / Git Bash sur Windows)
sleep 1
if command -v open > /dev/null 2>&1; then
    open http://localhost:8080
elif command -v xdg-open > /dev/null 2>&1; then
    xdg-open http://localhost:8080
elif command -v cmd > /dev/null 2>&1; then
    # Git Bash : cmd //c start (le // empêche MSYS de traduire le flag /c).
    # Le "" initial est le titre de fenêtre obligatoire pour `start`.
    cmd //c 'start "" "http://localhost:8080"' 2>/dev/null || true
fi

# Wait for interrupt
wait
