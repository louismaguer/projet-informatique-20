# 🚀 Déploiement FHEVM Vote sur VPS (Ubuntu)

## Pour les testeurs

**URL** : https://vote.tondomaine.xyz (à remplacer)

**Comment voter** :
1. Ouvre l'URL sur ton téléphone ou PC
2. Colle la clé privée qui t'a été remise (slip papier)
3. Choisis l'élection et l'option
4. Clique « Chiffrer et envoyer le vote »
5. C'est fait ! Le total sera révélé quand l'admin ferme l'élection.

**Tu peux voter plusieurs fois ?** Non, une seule fois par élection par PK.

**L'admin peut voter ?** Non, l'admin (slip #0) ne peut que créer/fermer les élections.

**Tu n'as pas de slip ?** Demande à l'organisateur.

---

## Pour l'organisateur (toi)

### 1. Génération des identités (une seule fois)
```bash
cd /opt/fhevm-vote/confidential-voting
npx hardhat run scripts/generateIdentities.js --network localhost
ADMIN_ADDRESS=$(cat scripts/.admin_addr | tr -d '[:space:]')
ADMIN_ADDRESS=$ADMIN_ADDRESS npx hardhat deploy --network localhost
```

### 2. Récupération des slips pour impression
```bash
# Depuis ton Mac
scp ubuntu@<IP>:/opt/fhevm-vote/confidential-voting/scripts/printIdentities.html .
# Ouvre dans le navigateur, imprime, distribue
```

### 3. Redéployer après un redémarrage du VPS
⚠️ **Important** : Hardhat est en mémoire. Si le VPS redémarre, l'état est perdu.

```bash
# Vérifier si Hardhat répond
curl -s http://localhost:8545 -X POST -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Si pas de réponse, Hardhat a perdu l'état. Redéploie :
cd /opt/fhevm-vote/confidential-voting
rm -f scripts/printIdentities.html scripts/.admin_addr scripts/.admin_pk
npx hardhat run scripts/generateIdentities.js --network localhost
ADMIN_ADDRESS=$(cat scripts/.admin_addr | tr -d '[:space:]')
ADMIN_ADDRESS=$ADMIN_ADDRESS npx hardhat deploy --network localhost
```

### 4. Monitoring
```bash
# Logs en temps réel
sudo journalctl -u fhevm-hardhat -u fhevm-relayer -u fhevm-frontend -f

# État des services
sudo systemctl status fhevm-hardhat fhevm-relayer fhevm-frontend

# Santé du frontend (via l'API)
curl -s https://vote.tondomaine.xyz/api/contract | python3 -m json.tool
```

### 5. Mise à jour du code
```bash
cd /opt/fhevm-vote
git pull
cd confidential-voting
npm install
npx hardhat compile
sudo systemctl restart fhevm-hardhat fhevm-relayer fhevm-frontend
```

---

## Pour le débug

### Un testeur n'arrive pas à voter
1. Vérifier que les services tournent : `systemctl status ...`
2. Vérifier que l'URL répond : `curl -I https://vote.tondomaine.xyz`
3. Vérifier le contrat : `curl -s https://vote.tondomaine.xyz/api/contract`
4. Si "address" est null, Hardhat a redémarré → redéployer

### Le testeur a un message "vote échoué"
- Sa PK a peut-être déjà voté sur cette élection
- L'élection a peut-être été fermée entre-temps
- L'admin a peut-être accidentellement réinitialisé

### L'admin ne voit pas le panneau admin
- Vérifier qu'il a bien collé la PK du slip #0 (et pas un autre)
- Rafraîchir la page (F5) — la détection se fait au boot
