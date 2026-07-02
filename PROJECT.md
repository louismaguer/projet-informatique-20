# PROJECT.md — Démarche et valeur ajoutée

Ce document décrit le **pourquoi** du projet, pas le **comment** (qui est dans `README.md`). Il explique la démarche,
les choix techniques, les difficultés rencontrées et les axes d'amélioration.

## 1. Sujet et contexte

L'objectif est de construire un **système de vote confidentiel** : le votant envoie un bulletin chiffré, le total est
calculé sur la blockchain sans jamais déchiffrer les bulletins individuels, et le résultat n'est révélé qu'à la clôture
par un administrateur. La techno utilisée est le **chiffrement homomorphe** fourni par [Zama](https://www.zama.ai/) — un
type de chiffrement qui permet d'additionner des nombres **sans les déchiffrer**.

Le repo part du template `fhevm-hardhat-template` officiel, largement remanié et désormais à la racine du dépôt.

## 2. Démarche

### 2.1 Exploration du domaine

Première étape : comprendre ce qu'est le chiffrement homomorphe et ce que la bibliothèque Zama expose. La **doc
officielle** Zama (quick-start, setup Hardhat) a suffi. Le déclic a été de comprendre qu'un total chiffré exige
forcément une étape de déchiffrement explicite, et que **cette étape doit être contrôlée** (ici : l'admin, à la
clôture).

### 2.2 Montée en complexité progressive

D'abord exécution du contrat template `FHECounter.sol` pour valider la chaîne d'outils (Hardhat + plugin Zama + relayer
de test local). Progression : `ConfidentialVoting.sol` minimal (1 élection, 2 options, compteur chiffré) →
multi-élections + admin → frontend statique (lecture via relayer, chiffrement côté client, envoi de transaction) →
gestion multi-appareils (un wallet par votant, **slip papier** imprimé).

### 2.3 Itérations courtes

Chaque brique intégrée via des commits atomiques (préfixes `feat:` / `fix:` / `chore:` / `docs:` / `refactor:`) — retour
en arrière facile quand un changement cassait autre chose (ex. signature d'`addVote()` modifiée plusieurs fois).

## 3. Choix techniques

### 3.1 Pourquoi Python stdlib pour le backend + le reverse-proxy ?

Le backend joue deux rôles : (1) serveur intermédiaire qui contourne les restrictions du navigateur (CORS — le
navigateur refuse par défaut qu'une page web appelle un autre serveur que le sien), (2) points d'accès `/api/*` qui
délèguent au backend blockchain local. Aucune logique métier — juste un _adaptateur_ pour permettre à l'interface d'agir
sans avoir à signer manuellement chaque appel.

**Choix retenu** : `http.server` de la stdlib Python sur un **port unique (8080)**, pas Flask/FastAPI ni nginx. Raisons
:

- **zéro dépendance** (`requirements.txt` reste vide) ;
- surface d'attaque minimale (pas de code externe à auditer) ;
- démo reproductible sans environnement virtuel Python, démarrage _one-click_.

Le navigateur applique une règle de sécurité appelée CORS : par défaut, il refuse qu'une page web appelle un serveur
différent de celui qui l'a servie. En faisant passer **toutes** les requêtes par ce même port (8080), on contourne cette
restriction : le navigateur croit que tout vient du même endroit, alors qu'en coulisses le serveur redirige vers la
blockchain ou le relayer.

### 3.2 Pourquoi des slips papier pour les wallets ?

Le sujet demande _"comment vérifier qu'un wallet donné n'a pas déjà voté"_. Une authentification classique (le votant
signe avec sa clé pour se connecter) ne convient pas : on veut que le vote reste **anonyme** (un wallet n'est pas lié à
une personne), le bulletin chiffré garantit déjà la confidentialité du choix, et la slip papier fait office de **passe
d'accès** (qui la détient peut voter) tout en gardant une clé publique **jamais transmise** au serveur.

C'est un compromis _sécurité cryptographique_ ↔ _ergonomie de démo_. En production, on utiliserait une vraie
authentification (OAuth, JWT — standards du web) couplée à une attestation **à divulgation nulle de connaissance** (ZK :
le votant prouve son identité sans rien révéler dessus) — mais c'est hors scope ici.

### 3.3 Pourquoi un tunnel Cloudflare plutôt qu'un vrai domaine ?

Exposer la démo sans avoir à configurer un nom de domaine (DNS), un certificat HTTPS (TLS) ni un serveur intermédiaire :
`cloudflared` fournit une URL `*.trycloudflare.com` jetable, sans compte Cloudflare requis. Inconvénient : l'URL est
publique et devinable (documenté dans README).

### 3.4 Choix de la licence : MIT

Simple, permissive, compatible avec Zama (BSD-3-Clause-Clear) et avec toute réutilisation académique ou industrielle.

## 4. Difficultés rencontrées

### 4.1 Certains navigateurs coupent les slips entre deux pages

Sur Safari (et plus marginalement sur d'autres navigateurs WebKit), `page-break-inside: avoid` ne suffit pas quand un
slip dépasse la moitié d'une page A4. Fix : `@media print { html, body { height: auto; } }` + recalibrage des hauteurs
de cartes.

### 4.2 Erreur Cloudflare 1033 (tunnel en double)

L'erreur 1033 (tunnel déjà en cours) est silencieuse. Fix : helper `cloudflared_tunnel.sh` qui vérifie `pgrep`, tue les
zombies et force `--protocol http2`.

### 4.3 Régénération des slips vs déploiement

`generateIdentities.js` crée de nouvelles clés à chaque appel — régénérer les slips après l'URL du tunnel
désynchronisait l'admin du contrat. Fix : séparer génération de clés (`generateIdentities.js`, une seule fois) du rendu
HTML (`renderSlips.js`, lit `.identities.json`).

### 4.4 Décodage ABI manuel en Python

Le backend doit afficher les détails d'une élection (nom, options) reçus du contrat. Ces données arrivent au format
binaire ABI d'Ethereum (le format standard pour échanger des données avec un smart contract). Pour éviter d'ajouter
`web3.py` (lib externe lourde) comme dépendance, on a écrit un petit décodeur à la main pour `getElection()` (tableaux
de chaînes), dans `server.py:103-154` — verbeux mais 100 % transparent, chaque octet est lu explicitement.

### 4.5 Le mode "exposition par défaut"

`./start.sh` lance par défaut un tunnel Cloudflare (exposition Internet). On a choisi de garder le tunnel activé par
défaut et d'afficher un avertissement bien visible dans le README et à l'écran — sans ça, le superviseur ne pourrait pas
ouvrir la démo sur son téléphone.

## 5. Organisation

Tout vit à la racine du dépôt, par sous-dossiers thématiques :

- `contracts/` : Solidity (`ConfidentialVoting.sol`)
- `deploy/` : déploiement Hardhat (`deploy.ts`)
- `frontend/` : UI statique (HTML + JS vanilla, SDK Zama pré-bundlé)
- `backend/` : serveurs Python stdlib
- `scripts/` : outillage Hardhat + helpers bash
- `test/`, `tasks/`, `docs/` : tests TS, tâches Hardhat, doc complémentaire
- `start.sh` : orchestration globale

## 6. Ce que nous aurions fait différemment avec plus de temps

- **Auth réelle + clé publique protégée** : remplacer le slip par une **liste blanche** d'électeurs (engagement
  cryptographique sur la clé à l'enregistrement) + attestation ZK d'éligibilité (prouver qu'on a le droit de voter sans
  révéler qui on est) + audit public avec un **code à usage unique** (nullifier) pour empêcher les doublons. Côté
  client, chiffrer la clé stockée dans le navigateur (Argon2, algorithme moderne de dérivation de mot de passe, ou Web
  Crypto avec des clés qu'on ne peut pas extraire).
- **Tests _end-to-end_ dans un vrai navigateur** : ajouter Playwright/Puppeteer (outils qui pilotent Chrome/ Firefox
  automatiquement) — `e2e_admin.ts` ne couvre que l'admin en ligne de commande, c'est le point faible de la couverture
  actuelle.
- **Migration vers la nouvelle API Zama** : le contrat utilise l'ancienne configuration (`ZamaEthereumConfig`). Réécrire
  sur la nouvelle API (`FHE.fromExternal()`) améliorerait les performances et la lisibilité.
- **Internationalisation** : sortir les textes de l'interface dans des fichiers `.json` et proposer une version bilingue
  FR/EN.
- **Déploiement sur IPFS** : le frontend est un site statique ; le déployer sur IPFS (réseau de stockage distribué,
  pair-à-pair) le rendrait **non-censurable** — faisable en une demi-journée.

## 7. Pourquoi ce projet est intéressant

Trois propriétés :

1. **Confidentialité cryptographique vraie** : sur la blockchain, on ne voit que des données chiffrées — impossible de
   savoir qui a voté quoi, ni même _combien_ de votes ont été exprimés (jusqu'à la clôture).
2. **Vérifiabilité publique** : le contrat est ouvert, le résultat est calculé sur la chaîne, et n'importe qui peut
   rejouer le calcul pour vérifier le total.
3. **Démo _one-click_** : `./start.sh` + navigateur + slips papier = une vraie élection de 150 votants en moins de 5
   minutes.

C'est cette combinaison qui fait du chiffrement homomorphe appliqué au vote un sujet de recherche actif.
