#!/bin/bash
# Lance tous les services pour la démo FHEVM locale
set -e

cd "$(dirname "$0")"

echo "🔐 Vote Confidentiel FHEVM - Démarrage"
echo "=========================================="

# Cleanup processes on our ports
cleanup() {
    echo ""
    echo "🛑 Arrêt des services..."
    kill $(lsof -ti :8545) 2>/dev/null || true
    kill $(lsof -ti :8080) 2>/dev/null || true
    kill $(lsof -ti :8081) 2>/dev/null || true
}
trap cleanup EXIT

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

# 2. Deploy contracts
echo "📝 Déploiement du contrat..."
DEPLOY_OUT=$(npx hardhat deploy --network localhost 2>&1)
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUT" | grep "ConfidentialVoting contract:" | grep -oE "0x[a-fA-F0-9]{40}")
echo "✓ Contrat déployé: $CONTRACT_ADDRESS"

# 3. Relayer proxy
if ! lsof -i :8081 > /dev/null 2>&1; then
    echo "🔌 Démarrage relayer proxy..."
    python3 relayer_proxy.py > /tmp/proxy.log 2>&1 &
    PROXY_PID=$!
    sleep 2
fi
echo "✓ Relayer proxy prêt (port 8081)"

# 4. Frontend server (no-cache pour éviter le caching navigateur)
if ! lsof -i :8080 > /dev/null 2>&1; then
    echo "🌐 Démarrage frontend server (no-cache)..."
    python3 frontend_server.py > /tmp/frontend.log 2>&1 &
    FRONTEND_PID=$!
    sleep 2
fi
echo "✓ Frontend prêt (port 8080)"

echo ""
echo "=========================================="
echo "🎉 Services prêts!"
echo ""
echo "📍 Frontend:      http://localhost:8080"
echo "📍 Hardhat RPC:   http://localhost:8545"
echo "📍 Relayer mock:  http://localhost:8081"
echo "📍 Contrat:       $CONTRACT_ADDRESS"
echo ""
echo "👉 Ouvrez http://localhost:8080 dans votre navigateur"
echo "=========================================="

# Open browser (macOS)
sleep 1
open http://localhost:8080 2>/dev/null || true

# Wait for interrupt
wait
