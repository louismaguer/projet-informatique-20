# Vote Confidentiel End-to-End avec FHEVM

## 1. Vue d'ensemble du Projet

**Nom**: Confidential Voting with FHEVM
**Type**: Smart Contract + Frontend DApp
**Fonctionnalité**: Système de vote sur Ethereum où les bulletins restent chiffrés pendant le vote, mais le total est calculé on-chain via FHE (Fully Homomorphic Encryption).
**Utilisateurs**: Entités souhaitant des elections privées sur blockchain

## 2. Architecture

### Composants
- **Contrat Solidity**: Stocke les votes chiffrés (euint), calcule les totaux
- **Frontend**: Chiffre les votes via le SDK FHEVM, envoie les transactions
- **Noeud FHEVM**: Décrypte les résultats finaux

### Flux
1. L'administrateur crée une election avec des options (candidats)
2. Les voteurs enregistrent leur vote chiffré (on-chain)
3. Les votes sont agrégés via `eadd` pour calculer les totaux partiels
4. A la fin, l'administrateur déclenche le déchiffrement
5. Le noeud FHEVM révèle les totaux

## 3. Spécification Fonctionnelle

### Contrat Solidity (`ConfidentialVoting.sol`)

**State Variables**:
- `electionId`: Counter pour les elections
- `elections`: Mapping electionId -> Election struct
- `encryptedVotes`: Mapping (electionId, voterAddress) -> euint32

**Struct Election**:
- `id`: uint256
- `title`: string
- `options`: string[] (noms des candidats)
- `optionCount`: uint256
- `encryptedTallies`: euint32[] (totaux par option)
- `isActive`: bool
- `voterCount`: uint256

**Fonctions**:
- `createElection(string title, string[] options)`: Crée une election
- `castVote(uint256 electionId, euint32 encryptedVote)`: Vote chiffré
- `closeElection(uint256 electionId)`: Clôture et calcule les totaux
- `decryptResults(uint256 electionId)`: Déclenche le déchiffrement (appelable par nœud FHEVM)

### Frontend (`index.html`)
- Interface simple pour créer une election
- Liste des elections actives
- Formulaire de vote avec sélection d'option (chiffrement local)
- Bouton pour fermer et révéler les résultats

### Vie Privée

**PRIVÉ (chiffré)**:
- Le vote individuel de chaque électeur
- L'associaton voter -> vote (pas de lien on-chain)

**PUBLIQUE (non chiffré)**:
- L'existence et le titre de l'election
- Les options/candidats
- Le résultat agrégé final (totaux par option)
- L'heure de cloture

## 4. Critères d'Acceptation

- [ ] Election peut être créée avec plusieurs options
- [ ] Votes chiffrés stockés on-chain
- [ ] Totaux calculés via FHE sans déchiffrer les votes individuels
- [ ] Résultats déchiffrables à la fin
- [ ] Tests unitaires passent
- [ ] Scénario e2e fonctionne

## 5. Stack Technique

- **Solidity**: ^0.8.24
- **FHEVM**: @fhevm/lib (TFHE)
- **Frontend**: Vanilla JS + ethers.js + @fhevm/sdk
- **Tests**: Foundry (forge)
- **Réseau**: Anvil (local) ou réseau de dev FHEVM