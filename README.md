# Vote Confidentiel End-to-End avec FHEVM

> **Objectif** : déployer un contrat de vote sur Ethereum où les bulletins restent chiffrés, mais où le total est
> calculé on-chain.

Application de vote multi-appareils où **chaque bulletin est chiffré avant d'être envoyé** au contrat, grâce au
chiffrement homomorphe (FHE) de Zama. Le total est calculé on-chain sur les ciphertexts ; le résultat n'est révélé qu'à
la clôture, par l'admin.

```
┌────────────────────┐                    ┌────────────────────┐
│   Votant (web)     │   PK du slip       │   Relayer mock     │
│   chiffrement      │   papier           │   + noeud Hardhat  │
│   local            │ ─────────────────► │   + contrat        │
│                    │  (chiffré FHE)     │ ConfidentialVoting │
└────────────────────┘                    └────────────────────┘
```

## Livrables

- **Contrat Solidity avec types chiffrés** : `contracts/ConfidentialVoting.sol` utilise `euint32`, `ebool`,
  `externalEuint32` et les opérations `FHE.fromExternal` / `FHE.eq` / `FHE.select` / `FHE.add` /
  `FHE.makePubliclyDecryptable`.
- **Frontend minimal qui chiffre le vote avec le SDK** : `frontend/index.html` charge le SDK Zama
  (`frontend/bundle/relayer-sdk-js.js`) et chiffre chaque bulletin avec `instance.createEncryptedInput(...)` avant
  d'envoyer la transaction.
- **Déchiffrement final du résultat** : `closeElection()` rend les totaux déchiffrables publiquement
  (`FHE.makePubliclyDecryptable`), puis le frontend appelle `instance.publicDecrypt([...])` pour afficher les résultats
  en clair.
- **Tests unitaires + scénario e2e** :
  - unitaires : `test/ConfidentialVoting.ts`, `test/MultiDevice.ts`, `test/verify_confidentiality.ts` ;
  - e2e : `scripts/e2e_admin.ts` (parcours admin complet : créer une élection, voter, clôturer) + `scripts/demo.js`
    (scénario automatique).
- **Mini note « ce qui est privé, ce qui ne l'est pas »** : voir la section
  [🔒 Ce qui est privé, ce qui ne l'est pas](#-ce-qui-est-prive-ce-qui-ne-lest-pas) plus bas dans ce README.

**Pourquoi c'est bien** : produit visible (le votant clique, un total chiffré apparaît, puis en clair après clôture),
crypto compréhensible (opérations FHE documentées en clair dans le contrat et dans `PROJECT.md`), difficulté maîtrisable
(template Zama + mock relayer local, pas de déploiement mainnet requis).

## Pré-requis

| Outil         | Version       | Vérif                          |
| ------------- | ------------- | ------------------------------ |
| Node.js       | ≥ 20          | `node -v`                      |
| npm           | ≥ 7           | `npm -v`                       |
| Python        | ≥ 3.8         | `python3 --version`            |
| `lsof`        | (macOS/Linux) | utilisé par `scripts/start.sh` |
| `cloudflared` | optionnel     | pour exposer sur internet      |

## Installation

```bash
npm install
```

> **Aucun `pip install` requis** : les serveurs Python (`backend/*.py`) n'utilisent que la bibliothèque standard. Voir
> `requirements.txt` à la racine.

## Démarrage de la démo

À la racine du dépôt :

```bash
./scripts/start.sh
```

Le script :

1. démarre un noeud Hardhat local (`localhost:8545`),
2. génère 151 wallets aléatoires (1 admin + 150 votants) et imprime les slips papier (`scripts/printIdentities.html`),
3. déploie le contrat `ConfidentialVoting` avec l'admin = slip #0,
4. lance le relayer proxy (`localhost:8081`) et le serveur frontend (`localhost:8080`),
5. ouvre un tunnel Cloudflare pour l'accès distant — **uniquement si `cloudflared` est installé** (sinon, seule l'IP LAN
   est exposée).

À la fin, l'URL publique est affichée :

```
📍 Frontend (local):  http://localhost:8080
📍 Frontend (LAN):    http://192.168.x.x:8080
📍 Frontend (WWW):    https://xxxx.trycloudflare.com   (si tunnel actif)
```

## Utilisation (5 minutes)

### Côté organisateur (1 fois)

1. Ouvre `scripts/printIdentities.html` dans un navigateur → clique **Imprimer** → coupe les 151 slips.
2. **Supprime** le fichier après impression :
   ```bash
   rm scripts/printIdentities.html
   ```
3. Note l'URL affichée par `./scripts/start.sh` (le tunnel `trycloudflare.com` si activé, sinon l'IP locale).

### Côté votant (un par appareil)

1. Sur le téléphone / laptop / tablette : ouvre l'URL publique.
2. Une modale demande de coller la **clé privée** du slip → **Valider**. La PK reste dans le `localStorage` de
   l'appareil, jamais transmise.
3. Vote. Bouton **🚪 Se déconnecter** en fin de session pour effacer la PK du `localStorage`.

### Côté admin (slip #0 uniquement)

Après avoir collé sa PK, l'admin voit un panneau supplémentaire : **créer une élection** (titre + ≥ 2 options) et
**clôturer** une élection pour révéler les résultats.

## 🗳 Vote multi-appareils (détails)

Le frontend n'embarque **aucune clé privée**. Chaque votant utilise sa propre identité, reçue sur un slip papier imprimé
par l'admin.

**Surface d'exposition** (par défaut avec `./scripts/start.sh`) :

- Tourne sur **la machine locale** (localhost :8080 / :8081 / :8545)
- Accessible depuis le LAN à `http://<IP-locale>:8080`
- **Exposé à internet** via un tunnel Cloudflare `*.trycloudflare.com` (URL affichée par `./scripts/start.sh`) —
  **uniquement si `cloudflared` est installé** sur la machine. Sinon, seul le LAN est accessible.

Le tunnel est ce qui permet à des votants distants (réseau mobile, autre WiFi) de voter. Sans lui, les votants doivent
être sur le même LAN que la machine.

> ## ⚠️ AVERTISSEMENT CRITIQUE — wallets de démo
>
> Les 151 wallets générés par `generateIdentities.js` (1 admin + 150 votants par défaut, configurable via `COUNT=N`)
> sont de **vrais keypairs cryptographiques** (mêmes algo que MetaMask/Ledger). Ils n'ont de la valeur **que** sur le
> noeud Hardhat local (chainId 31337).
>
> **Ne JAMAIS financer ces adresses sur mainnet, Sepolia ou toute autre chaîne publique.** Si quelqu'un (un dev, une
> erreur de copier-coller) envoie de l'ETH réel à une de ces adresses, la clé privée imprimée sur le slip contrôle ces
> fonds — et quiconque a vu le slip aussi.
>
> Régénérer un nouveau set avant chaque démo pour rendre les anciens inertes.

### Comportements garantis

| Cas                                                              | Résultat                                                                                                               |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 2 votants distincts (PK différentes) votent sur la même élection | `voterCount = 2` ✓                                                                                                     |
| Même wallet tente un 2ᵉ vote                                     | Rejeté (`Already voted`) ✓                                                                                             |
| Wallet sans ETH                                                  | Message d'erreur explicite + bouton pour re-demander une PK                                                            |
| Appareil perdu / volé                                            | Le votant peut cliquer « 🚪 Se déconnecter » → la PK disparaît du localStorage. L'admin peut créditer un nouveau slip. |

## 🔒 Ce qui est privé, ce qui ne l'est pas

> **Mini note** : cette section résume en deux colonnes ce que la crypto FHE protège réellement, et les points où la
> démo fait des compromis de simplicité.

| ✅ Protégé                                                         | ❌ Non protégé (assumé en démo)                                                                                   |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Choix de chaque votant (chiffrement FHE local avant envoi)         | Authentification du votant (n'importe qui avec un slip peut voter)                                                |
| Vote individuel invisible jusqu'à la clôture                       | Risque de regard par-dessus l'épaule quand la PK est collée                                                       |
| La clé privée ne quitte jamais l'appareil                          | `localStorage` non chiffré au repos sur l'appareil                                                                |
| Réseau : HTTPS via tunnel Cloudflare, mais ciphertext FHE = opaque | En local (LAN) le transport est HTTP en clair ; sans tunnel, un sniffer sur le LAN peut observer les requêtes RPC |
| URL tunnel sans auth → quiconque la devine peut voter              | Attaque physique sur l'appareil entre le moment où la PK est collée et celui où le vote est émis                  |

> **Important** : si `cloudflared` est installé sur la machine, `./scripts/start.sh` expose automatiquement le service à
> internet via un tunnel Cloudflare. Toute personne qui obtient l'URL `trycloudflare.com` peut alors atteindre le noeud
> Hardhat local. Pour une démo 100% locale, tuer le tunnel (`pkill -f cloudflared`) et utiliser uniquement l'IP LAN.

## Tester le contrat

```bash
npm run compile
npx hardhat test
```

Tests inclus :

- `ConfidentialVoting.ts` — couverture des flux `createElection` / `castVote` / `closeElection`, y compris les rejets
  (admin ne vote pas, double-vote, options invalides).
- `MultiDevice.ts` — 10 voters en parallèle, sanity check de la génération de wallets par `ethers.Wallet.createRandom`.
- `verify_confidentiality.ts` — vérifie que le `tally` reste chiffré (`euint32`) tant que l'élection n'est pas close, et
  n'est déchiffrable qu'après.

## Arborescence

```
.
├── LICENSE                       # MIT
├── NOTICE                        # attribution Zama (BSD-3-Clause-Clear upstream)
├── README.md                     # ce fichier (manuel + détails sécurité)
├── PROJECT.md                    # démarche, choix techniques, axes d'amélioration
├── requirements.txt              # Python : stdlib only
├── .github/workflows/            # CI héritée (build + test Windows/Unix)
├── contracts/
│   └── ConfidentialVoting.sol    # contrat Solidity FHE (vote chiffré)
├── deploy/deploy.ts              # script de déploiement Hardhat
├── frontend/                     # UI HTML/JS + SDK Zama pré-bundlé
│   ├── index.html
│   ├── mock-fhevm.js
│   └── bundle/                   # SDK Zama (kms_lib_bg.wasm, relayer-sdk-js, …)
├── backend/                      # serveurs Python (stdlib only)
│   ├── server.py                 # backend API + reverse proxy
│   ├── frontend_server.py        # serveur statique no-cache
│   └── relayer_proxy.py          # proxy relayer HTTP → JSON-RPC
├── scripts/                      # outillage Hardhat
│   ├── start.sh                  # orchestration globale (depuis racine : ./scripts/start.sh)
│   ├── closeElection.js
│   ├── createElection.js
│   ├── demo.js
│   ├── e2e_admin.ts
│   ├── generateIdentities.js     # 151 wallets aléatoires + slips papier
│   ├── qrcode.js
│   ├── renderSlips.js            # régénère les slips sans changer les clés
│   ├── cloudflared_tunnel.sh
│   └── regen-slips.sh            # helper bash
├── test/
│   ├── ConfidentialVoting.ts
│   ├── MultiDevice.ts
│   └── verify_confidentiality.ts
├── tasks/accounts.ts             # `npx hardhat accounts` — liste les signers
├── hardhat.config.ts
├── package.json + package-lock.json
└── tsconfig.json / eslint.config.mjs
```

## Documentation complémentaire

- [`PROJECT.md`](PROJECT.md) — démarche, choix techniques, difficultés, organisation, axes d'amélioration.
- [FHEVM Documentation](https://docs.zama.ai/fhevm) — la doc officielle Zama sur le chiffrement homomorphe appliqué à
  l'EVM.

## Licence

MIT — voir [`LICENSE`](LICENSE). Le code amont issu du template Zama reste sous BSD-3-Clause-Clear ; voir
[`NOTICE`](NOTICE) pour les attributions.
