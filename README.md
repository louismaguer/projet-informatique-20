# Vote Confidentiel FHEVM

Application de vote multi-appareils où **chaque bulletin est chiffré avant
d'être envoyé** au contrat, grâce au chiffrement homomorphe (FHE) de Zama.
Le total est calculé on-chain sur les ciphertexts ; le résultat n'est
révélé qu'à la clôture, par l'admin.

```
┌────────────────┐  PK du slip papier  ┌──────────────────┐
│  Votant (web)  │ ──────────────────► │  Relayer mock    │
│  chiffrement   │   (chiffré FHE)     │  + noeud Hardhat │
│  local         │                     │  + contrat       │
└────────────────┘                     │  ConfidentialVoting │
                                       └──────────────────┘
```

## Pré-requis

| Outil         | Version      | Vérif                       |
| ------------- | ------------ | --------------------------- |
| Node.js       | ≥ 20         | `node -v`                   |
| npm           | ≥ 7          | `npm -v`                    |
| Python        | ≥ 3.8        | `python3 --version`         |
| `lsof`        | (macOS/Linux)| utilisé par `start.sh`     |
| `cloudflared` | optionnel    | pour exposer sur internet   |

## Installation

```bash
cd confidential-voting
npm install
```

> **Aucun `pip install` requis** : les serveurs Python n'utilisent que la
> bibliothèque standard. Voir `requirements.txt` à la racine.

## Démarrage de la démo

À la racine du dépôt :

```bash
./confidential-voting/start.sh
```

Le script :

1. démarre un noeud Hardhat local (`localhost:8545`),
2. génère 151 wallets aléatoires (1 admin + 150 votants) et imprime
   les slips papier (`scripts/printIdentities.html`),
3. déploie le contrat `ConfidentialVoting` avec l'admin = slip #0,
4. lance le relayer proxy (`localhost:8081`) et le serveur frontend
   (`localhost:8080`),
5. ouvre un tunnel Cloudflare pour l'accès distant — **uniquement si
   `cloudflared` est installé** (sinon, seule l'IP LAN est exposée).

À la fin, l'URL publique est affichée :

```
📍 Frontend (local):  http://localhost:8080
📍 Frontend (LAN):    http://192.168.x.x:8080
📍 Frontend (WWW):    https://xxxx.trycloudflare.com   (si tunnel actif)
```

## Utilisation (5 minutes)

### Côté organisateur (1 fois)

1. Ouvre `confidential-voting/scripts/printIdentities.html` dans un
   navigateur → clique **Imprimer** → coupe les 151 slips.
2. **Supprime** le fichier après impression :
   ```bash
   rm confidential-voting/scripts/printIdentities.html
   ```
3. Note l'URL affichée par `./start.sh` (le tunnel `trycloudflare.com`
   si activé, sinon l'IP locale).

### Côté votant (un par appareil)

1. Sur le téléphone / laptop / tablette : ouvre l'URL publique.
2. Une modale demande de coller la **clé privée** du slip → **Valider**.
   La PK reste dans le `localStorage` de l'appareil, jamais transmise.
3. Vote. Bouton **🚪 Se déconnecter** en fin de session pour effacer
   la PK du `localStorage`.

### Côté admin (slip #0 uniquement)

Après avoir collé sa PK, l'admin voit un panneau supplémentaire :
**créer une élection** (titre + ≥ 2 options) et **clôturer** une élection
pour révéler les résultats.

## Tester le contrat

```bash
cd confidential-voting
npm run compile
npx hardhat test
```

Tests inclus : `ConfidentialVoting.ts`, `MultiDevice.ts` (10 voters en
parallèle), `verify_confidentiality.ts`, `FHECounter.ts`.

## Arborescence

```
.
├── LICENSE                       # MIT
├── README.md                     # ce fichier (manuel utilisateur)
├── PROJECT.md                    # démarche, choix techniques, axes d'amélioration
├── requirements.txt              # Python : stdlib only
├── explication du sujet/         # articles de fond (FHE, Solidity, etc.)
└── confidential-voting/          # le projet
    ├── contracts/                # Solidity : ConfidentialVoting.sol
    ├── deploy/                   # script de déploiement Hardhat
    ├── frontend/                 # UI HTML/JS + SDK Zama pré-bundlé
    ├── scripts/                  # génération d'identités, slips, démo
    ├── test/                     # tests Hardhat
    ├── server.py                 # backend Python (API + reverse proxy)
    ├── frontend_server.py        # serveur statique no-cache
    ├── relayer_proxy.py          # proxy relayer HTTP→JSON-RPC
    ├── start.sh                  # tout démarre d'un coup
    └── infra/
        └── CLOUDFLARE_QUICKSTART.md  # exposition Internet via tunnel Cloudflare
```

## Documentation détaillée

- [`confidential-voting/README.md`](confidential-voting/README.md) :
  sécurité, surface d'exposition, comportements garantis
- [`confidential-voting/infra/CLOUDFLARE_QUICKSTART.md`](confidential-voting/infra/CLOUDFLARE_QUICKSTART.md) :
  exposition Internet via tunnel Cloudflare (depuis ta machine)

## Licence

MIT — voir [`LICENSE`](LICENSE).