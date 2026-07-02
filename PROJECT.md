# PROJECT.md — Démarche et valeur ajoutée

Ce document décrit le **pourquoi** du projet, pas le **comment** (qui est
dans `README.md`). Il explique la démarche, les choix techniques, les
difficultés rencontrées et les axes d'amélioration.

## 1. Sujet et contexte

L'objectif est de construire un **système de vote confidentiel** : chaque
votant envoie un bulletin chiffré, le total est calculé on-chain sur les
chiffrements, et le résultat n'est révélé qu'à la clôture par un
administrateur.

Le sujet est adossé à la technologie **FHEVM** de [Zama](https://www.zama.ai/),
qui implémente le chiffrement homomorphe (Fully Homomorphic Encryption)
pour la blockchain EVM : on peut exécuter des additions (et certaines
opérations) sur des `euint32` chiffrés sans jamais les déchiffrer.

Le repo part du template `fhevm-hardhat-template` officiel de Zama
(qu'on a renommé `confidential-voting/` car le nom original était trompeur
— ce n'est plus un template, c'est le projet lui-même).

## 2. Démarche

### 2.1 Exploration du domaine

Première étape : comprendre ce qu'est le FHE et ce que la lib Zama expose.
J'ai utilisé deux canaux :

- les **articles vulgarisés** dans `explication du sujet/` (contrats
  Solidity, tests unitaires, frontend minimal, déchiffrement en bout de
  chaîne) ;
- la **doc officielle** Zama (quick-start, FHEVM Hardhat setup).

L'article *"La situation juste avant le déchiffrement"* a été le déclic :
il m'a fait comprendre qu'on ne peut pas afficher un total chiffré sans
une étape de déchiffrement explicite, et que **cette étape doit être
contrôlée** (ici : l'admin, à la clôture).

### 2.2 Montée en complexité progressive

J'ai d'abord exécuté le contrat `FHECounter.sol` du template pour
valider que ma chaîne d'outils (Hardhat + plugin FHEVM + mock relayer)
fonctionnait. Puis j'ai progressivement :

1. écrit un contrat `ConfidentialVoting.sol` minimal (1 élection, 2 options,
   compteur `euint32`),
2. ajouté la gestion multi-élections + admin,
3. construit un frontend HTML statique qui :
   - lit le contrat via le relayer mock,
   - chiffre le bulletin côté client (clé publique du contrat),
   - envoie la transaction,
4. géré le cas **multi-appareils** : un wallet par votant, distribué sur
   un **slip papier** imprimé.

### 2.3 Itérations courtes

Chaque brique (contrat → tests → frontend → déploiement → tunnel public)
a été intégrée via des commits atomiques, ce qui a permis de revenir en
arrière facilement quand un changement cassait autre chose (ex. la
signature d'`addVote()` a changé plusieurs fois).

## 3. Choix techniques

### 3.1 Pourquoi Python pour le backend ?

Le backend est un simple reverse-proxy + endpoints `/api/*` qui lancent
des scripts Hardhat. Aucune logique métier : juste un *shim* pour
permettre à l'UI d'agir sans avoir à signer chaque appel.

**Choix retenu** : `http.server` de la stdlib Python, pas Flask/FastAPI.
Raisons :
- **zéro dépendance** (`requirements.txt` reste vide) ;
- surface d'attaque minimale (pas de middleware tiers) ;
- démo reproductible sans environnement virtuel Python.

### 3.2 Pourquoi des slips papier pour les wallets ?

Le sujet demande *"comment vérifier qu'un wallet donné n'a pas déjà
voté"*. Une solution naïve serait de demander une signature à la
connexion (auth classique). Mais :

- on veut que le vote reste **anonyme** (un wallet ≠ une personne) ;
- le bulletin chiffré FHE garantit déjà la confidentialité du choix ;
- la slip papier fait **office de passe d'accès** (qui a le slip peut
  voter), tout en gardant une PK **jamais transmise** au serveur.

C'est un compromis entre *sécurité crypto* et *UX de démo*. En
production, on utiliserait une vraie auth (OAuth, JWT, etc.) couplée à
une attestation zéro-knowledge — mais c'est hors scope.

### 3.3 Pourquoi un tunnel Cloudflare plutôt qu'un vrai domaine ?

Pour exposer la démo sans configurer DNS + TLS + reverse-proxy.
`cloudflared` fournit une URL `*.trycloudflare.com` jetable, sans
compte Cloudflare requis. L'inconvénient : l'URL est publique et
devinable — j'ai documenté ce risque dans le README.

### 3.4 Pourquoi `http.server` pour le reverse-proxy ?

Le frontend doit pouvoir appeler `localhost:8545` (Hardhat) et
`localhost:8081` (relayer) depuis le navigateur. Problème : les navigateurs
bloquent les requêtes cross-origin et les ports non standards.

Solution la plus simple : un **seul port (8080)** qui sert les fichiers
statiques *et* relaie `/api/rpc` et `/api/relayer/*` vers les services
internes. Le navigateur ne voit qu'un seul origine → plus de CORS.

J'aurais pu utiliser nginx, mais cela ajoutait une dépendance système et
rendait le démarrage moins *one-click*.

### 3.5 Choix de la licence : MIT

Simple, permissive, compatible avec Zama (BSD-3-Clause-Clear) et avec
toute réutilisation académique ou industrielle.

## 4. Difficultés rencontrées

### 4.1 Safari coupe les slips entre deux pages

Sur Safari, l'impression A4 avec `page-break-inside: avoid` ne suffit pas
quand un slip fait plus de la moitié d'une page. Solution : `@media
print { html, body { height: auto; } }` + recalibrage de la hauteur
des cartes. Détails dans le commit
`16fbfd1 fix(slips): empêcher Safari de couper les slips entre pages`.

### 4.2 Erreur Cloudflare 1033 (tunnel en double)

`cloudflared` refuse de démarrer si une autre instance tourne déjà, et
l'erreur 1033 est silencieuse. Solution : un helper
`scripts/cloudflared_tunnel.sh` qui :
- vérifie `pgrep` avant de lancer,
- tue les zombies,
- force `--protocol http2` (sinon : comportement aléatoire selon la
  version de `cloudflared`).

### 4.3 Régénération des slips vs déploiement

Premier réflexe : régénérer les slips après avoir l'URL du tunnel. Mais
`generateIdentities.js` crée **de nouvelles clés** à chaque appel, ce qui
désynchronise l'admin du contrat. Fix : séparer la génération des clés
(une seule fois) du rendu HTML des slips (`renderSlips.js`, qui prend
`.identities.json` en entrée).

### 4.4 Décodage ABI manuel en Python

Pas envie d'ajouter `web3.py` comme dépendance. J'ai écrit un
mini-décodeur ABI pour `getElection()` (tableaux dynamiques de strings)
en Python pur, dans `server.py:103-154`. C'est verbeux mais 100%
transparent pour la correction.

### 4.5 Le mode "exposition par défaut"

Par défaut, `./start.sh` lance un tunnel Cloudflare — donc expose la
machine à Internet. J'ai hésité à inverser ce défaut (LAN only par
défaut). Décision : laisser le tunnel activé par défaut, mais **avertir
très visiblement** dans le README et à l'écran. Une démo qui ne se
récupère pas sur le téléphone de l'encadrant est une démo ratée.

## 5. Organisation

### 5.1 Branches et commits

- Branche unique `main`, commits atomiques préfixés par
  `feat:` / `fix:` / `chore:` / `docs:` / `refactor:`.
- Pas de PR (projet单人). Chaque commit se lit indépendamment.

### 5.2 Arborescence

- `contracts/` : Solidity
- `deploy/` : script de déploiement Hardhat
- `frontend/` : UI statique (HTML + JS vanilla, SDK Zama pré-bundlé)
- `scripts/` : outillage (génération d'identités, slips, démo)
- `test/` : tests Hardhat (TypeScript)
- `server.py` + `frontend_server.py` + `relayer_proxy.py` : backends Python
- `start.sh` : orchestration
- `infra/vps/` : déploiement VPS (systemd, nginx, cloudflared)

### 5.3 Explication du sujet

Les 5 articles vulgarisés dans `explication du sujet/` sont restés tels
quels. Ils ont servi de **référence mentale** au début, et permettent à
un lecteur non-initié de comprendre le FHE avant de plonger dans le code.

## 6. Ce que j'aurais fait différemment avec plus de temps

### 6.1 Authentification réelle

Aujourd'hui, avoir le slip papier = pouvoir voter. Pour une vraie
élection, il faudrait coupler ça à :
- une **liste blanche** d'électeurs (commitment sur la PK à
  l'enregistrement) ;
- une attestation ZK de l'éligibilité ;
- un audit public des votes (avec nullifier pour éviter les doublons).

### 6.2 Chiffrement du `localStorage`

La PK est en clair dans le `localStorage` du votant. Un voleur d'appareil
peut voter à la place du propriétaire. Mitigations possibles :
- chiffrement par mot de passe de la PK (dérivation Argon2) ;
- stockage dans l'enclave sécurisée (Web Crypto + non-extractable keys).

### 6.3 Tests E2E navigateur

Les tests Hardhat couvrent la logique contrat, et `e2e_admin.ts` couvre
l'admin en CLI. Mais aucun test n'exerce le navigateur réel (Playwright
/ Puppeteer). C'est le point le plus faible de la couverture.

### 6.4 Migration vers FHEVM natif Solidity 0.9+

Le contrat utilise `ZamaEthereumConfig` (l'ancienne génération). Zama a
sorti depuis une nouvelle API avec `FHE.fromExternal()` et un meilleur
support des opérations. Réécrire le contrat dessus améliorerait les
performances et la lisibilité.

### 6.5 Internationalisation

L'UI est en français, les commentaires sont bilingues. Avec du temps, je
sortirais les chaînes dans des fichiers `.json` et je proposerais une
UI bilingue FR/EN.

### 6.6 Déploiement IPFS

Le frontend est un *static site*. Le déployer sur IPFS le rendrait
**non-censurable** — utile dans un contexte où un gouvernement ne veut
pas qu'une élection se tienne. C'est faisable en une demi-journée.

## 7. Pourquoi ce projet est intéressant

Trois propriétés sortent du lot :

1. **Confidentialité cryptographique vraie** : un observateur on-chain ne
   voit que des ciphertexts ; il ne peut ni savoir qui a voté quoi, ni
   même *combien* de votes ont été exprimés (jusqu'à la clôture).
2. **Vérifiabilité publique** : le contrat est ouvert, le résultat est
   calculé sur la chaîne, et toute personne peut rejouer le calcul des
   ciphertexts pour vérifier le total.
3. **Démo one-click** : `./start.sh` + un navigateur + des slips papier =
   une vraie élection de 150 votants en moins de 5 minutes.

C'est la combinaison de ces trois propriétés qui fait du FHE appliqué au
vote un sujet de recherche actif, et qui justifie l'effort de
comprendre cette techno.