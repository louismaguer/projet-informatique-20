#!/bin/bash
# setup-vps.sh - Installation complète du projet FHEVM Vote sur VPS Ubuntu 22.04/24.04 (arm64/amd64)
#
# Usage (en root) :
#   curl -fsSL https://raw.githubusercontent.com/.../setup-vps.sh | sudo bash
# ou localement :
#   scp setup-vps.sh ubuntu@<IP>:~
#   ssh ubuntu@<IP> "chmod +x setup-vps.sh && ./setup-vps.sh"
#
# Ce script :
#  1. Met à jour le système
#  2. Installe Node 20, Python 3, nginx, ufw
#  3. Crée un utilisateur dédié (fhevm) - optionnel
#  4. Clone et installe le projet
#  5. Crée les services systemd
#  6. Active et démarre les services
#  7. Ouvre les ports firewall

set -e

APP_DIR="/opt/fhevm-vote"
APP_USER="fhevm"
REPO_URL="${REPO_URL:-https://github.com/your-username/projet-informatique-20.git}"

echo "================================================"
echo "🔐 FHEVM Vote — Setup VPS"
echo "================================================"
echo ""

if [ "$(id -u)" -ne 0 ]; then
    echo "❌ Ce script doit être lancé en root (sudo)"
    exit 1
fi

# 1. Mise à jour système
echo "📦 Mise à jour système..."
apt update && apt upgrade -y

# 2. Installation paquets de base
echo "📦 Installation Node.js 20, Python 3, nginx, ufw, sudo..."
apt install -y curl wget git build-essential nginx ufw python3 python3-pip sudo

# Node.js 20 (NodeSource)
if ! command -v node > /dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]; then
    echo "📦 Installation Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

# Cloudflared (optionnel)
if ! command -v cloudflared > /dev/null 2>&1; then
    echo "📦 Installation cloudflared..."
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-main.gpg > /dev/null
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" > /etc/apt/sources.list.d/cloudflared.list
    apt update
    apt install -y cloudflared
fi

# 3. Utilisateur dédié
if ! id "$APP_USER" &>/dev/null; then
    echo "👤 Création utilisateur $APP_USER..."
    adduser --disabled-password --gecos "" "$APP_USER" || true
fi

# 4. Clone + install
if [ ! -d "$APP_DIR" ]; then
    echo "📥 Clonage du projet dans $APP_DIR..."
    git clone "$REPO_URL" "$APP_DIR"
fi
# S'assurer que l'utilisateur fhevm possède tout
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

cd "$APP_DIR/fhevm-hardhat-template"
echo "📦 npm install..."
sudo -u "$APP_USER" npm install --omit=dev

# 5. Compilation
echo "🔨 Compilation des contrats..."
sudo -u "$APP_USER" npx hardhat compile

# 6. Création des services systemd
echo "⚙️  Installation des services systemd..."
for svc in hardhat frontend relayer; do
    cp "$APP_DIR/fhevm-hardhat-template/deploy/vps/fhevm-${svc}.service" "/etc/systemd/system/"
done
systemctl daemon-reload

# 7. Activation
echo "▶️  Activation des services..."
systemctl enable fhevm-hardhat fhevm-frontend fhevm-relayer
systemctl start fhevm-hardhat
sleep 5
systemctl start fhevm-relayer
sleep 1
systemctl start fhevm-frontend

# 8. Firewall
echo "🔥 Configuration firewall..."
ufw allow OpenSSH
ufw allow 80/tcp     # nginx
ufw allow 443/tcp    # nginx + TLS
# Les ports 8545/8080/8081 NE DOIVENT PAS être exposés publiquement — on passe par nginx/cloudflare
# Si tu veux quand même les exposer (mode debug), décommente :
# ufw allow 8545/tcp
# ufw allow 8080/tcp
# ufw allow 8081/tcp
ufw --force enable

# 9. Déploiement du contrat (génère les slips)
echo "📝 Déploiement initial du contrat..."
# Ce sera fait manuellement après la configuration réseau, voir README

echo ""
echo "================================================"
echo "✅ Installation terminée"
echo "================================================"
echo ""
echo "Services actifs :"
systemctl is-active fhevm-hardhat fhevm-frontend fhevm-relayer
echo ""
echo "Ports à exposer publiquement : 80, 443 (via nginx ou cloudflare)"
echo "Hardhat reste sur :8545 (interne uniquement)"
echo ""
echo "Prochaines étapes :"
echo "  1. Configurer nginx OU cloudflared (voir README)"
echo "  2. Déployer le contrat :"
echo "     cd $APP_DIR/fhevm-hardhat-template"
echo "     npx hardhat run scripts/generateIdentities.js --network localhost"
echo "     ADMIN_ADDRESS=\$(cat scripts/.admin_addr) npx hardhat deploy --network localhost"
echo "  3. Récupérer printIdentities.html :"
echo "     scp ubuntu@<IP>:/opt/fhevm-vote/fhevm-hardhat-template/scripts/printIdentities.html ."
echo ""
echo "  Si tu utilises cloudflared, voir deploy/vps/CLOUDFLARE.md"
echo "  Si tu utilises nginx + Let's Encrypt, voir deploy/vps/NGINX.md"
echo ""
