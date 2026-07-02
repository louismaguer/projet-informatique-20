# 🚀 Partage rapide avec Cloudflare Tunnel (1h de setup)

> **Ce que fait ce tunnel** : il expose le port 8080 (frontend) de **ta machine** à internet via une URL
> `*.trycloudflare.com` (ou ton domaine custom si tu l'as configuré). Les services Hardhat (8545) et relayer (8081)
> restent sur ta machine — ils ne sont **pas** exposés publiquement ; seul le port 8080 l'est, et il proxie vers les
> autres via le reverse proxy intégré.
>
> ⚠️ Tant que le tunnel tourne, **n'importe qui dans le monde** ayant l'URL peut atteindre ton noeud Hardhat et
> interagir avec le contrat déployé. Ne le laisse pas tourner en dehors d'une démo.

## Pour les testeurs

**URL** : https://vote.tondomaine.xyz (à remplacer par ton hostname)

**Comment voter** :

1. Ouvre l'URL sur ton téléphone ou PC (n'importe quel réseau)
2. Colle la clé privée reçue sur ton slip
3. Choisis l'élection, l'option, clique « Chiffrer et envoyer le vote »
4. C'est fait ! L'admin fermera l'élection quand tout le monde a voté.

**Prérequis** : aucun (pas besoin de MetaMask, pas d'app à installer).

---

## Setup par l'organisateur (toi) — 30-45 min

### 1. Acheter un domaine (5 min, ~1€/an)

Va sur **OVH** (ovh.com) ou **Namecheap** et achète un `.xyz` ou `.online` :

- Exemple : `monvote.xyz` (~1€/an)
- Tu n'as besoin que du domaine, pas d'hébergement

### 2. Créer un compte Cloudflare (2 min)

https://dash.cloudflare.com/sign-up (gratuit, pas de carte requise)

### 3. Ajouter le domaine à Cloudflare (5 min + attente propagation)

1. Sur Cloudflare : **Add a Site** → entre ton domaine
2. Choisis le plan **Free**
3. Cloudflare te donne 2 nameservers (style `chad.ns.cloudflare.com`)
4. Va chez ton registrar (OVH/Namecheap) → change les nameservers de ton domaine
5. Attends 5-30 min la propagation (Cloudflare t'affiche le statut)

### 4. Installer cloudflared sur ton Mac (2 min)

```bash
brew install cloudflared
```

### 5. Tester en local (5 min)

```bash
./start.sh                              # démarre Hardhat + frontend + relayer + tunnel
# Attends "Services prêts" (~30s)
# Affiche "📍 Frontend (WWW): https://xxx.trycloudflare.com"
```

Ouvre cette URL dans ton navigateur → tu dois voir la page du vote.

Note : `./start.sh` utilise un tunnel _quick_ (URL `*.trycloudflare.com` qui change à chaque démarrage). Pour une URL
stable avec ton propre domaine, il faudrait un tunnel _named_ (feature non incluse dans ce projet).

### 6. Partager avec les testeurs (5 min)

```bash
# Régénère les slips avec l'URL courante (sans changer les clés)
./regen-slips.sh

# Ouvre scripts/printIdentities.html dans ton navigateur
# Imprime et distribue les slips
```

Donne à chaque testeur son slip + l'URL.

### 7. Lancement le jour J

```bash
./start.sh    # tout-en-un, laisse tourner
```

⚠️ **Garde ton Mac allumé** pendant toute la durée du test.

---

## En cas de souci

### Le tunnel ne démarre pas

```bash
cloudflared tunnel info fhevm-vote    # vérifie la config
cat ~/.cloudflared/config.yml          # affiche la config
```

### L'URL ne répond pas

```bash
# Le tunnel tourne-t-il ?
ps aux | grep cloudflared

# Le frontend répond-t-il en local ?
curl -I http://localhost:8080
```

### Hardhat a redémarré (élection perdue)

```bash
rm -f scripts/.admin_addr scripts/.admin_pk
npx hardhat run scripts/generateIdentities.js --network localhost
ADMIN_ADDRESS=$(cat scripts/.admin_addr | tr -d '[:space:]')
ADMIN_ADDRESS=$ADMIN_ADDRESS npx hardhat deploy --network localhost

# Redémarre les services :
pkill -f 'hardhat node' 2>/dev/null || true
pkill -f 'frontend_server.py' 2>/dev/null || true
pkill -f 'relayer_proxy.py' 2>/dev/null || true
sleep 2
./start.sh
```

---

## Coût

| Ressource              | Coût    |
| ---------------------- | ------- |
| Domaine `.xyz`         | ~1€/an  |
| Cloudflare (plan Free) | 0 €     |
| Cloudflare Tunnel      | 0 €     |
| **Total**              | **~1€** |

## Limites

- Ton Mac doit rester allumé pendant la durée du test
- Hardhat perd l'état au redémarrage (élections + votes perdus)
- Le mock FHE n'est pas « production-grade » mais convient pour une démo
- Bande passante : suffisante pour 30-50 testeurs simultanés en FHE mock
