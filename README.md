# Vote Confidentiel E2E avec FHEVM

Système de vote sur Ethereum où les bulletins restent chiffrés mais le total est calculé on-chain.

## Structure

```
confidential-voting-fhevm/
├── contracts/
│   └── ConfidentialVoting.sol   # Smart Contract avec euint chiffrés
├── frontend/
│   └── index.html                # DApp minimale
├── test/
│   ├── ConfidentialVoting.t.sol  # Tests unitaires
│   └── ConfidentialVotingE2E.t.sol # Tests E2E
├── docs/
│   └── PRIVACY.md                # Note sur la vie privée
├── foundry.toml
└── SPEC.md
```

## Prérequis

- Node.js 18+
- Foundry
- MetaMask
- Réseau local FHEVM (ou Anvil standard pour tests)

## Installation

```bash
# Cloner le repo
cd confidential-voting-fhevm

# Installer Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Initialiser les dépendances (si nécessaire)
forge install
```

## Tests

```bash
# Tests unitaires
forge test

# Tests avec couverture
forge coverage

# Tests E2E
forge test --match-path "test/*E2E*"
```

## Déploiement

```bash
# Démarrer Anvil (réseau local)
anvil

# Déployer le contrat (dans un autre terminal)
forge create contracts/ConfidentialVoting.sol:ConfidentialVoting
```

## Utilisation Frontend

1. Ouvrir `frontend/index.html` dans un navigateur
2. Connecter MetaMask au réseau local (localhost:8545)
3. Créer une election avec des options
4. Les voteurs sélectionnent et envoient leur vote chiffré
5. Fermer lelection pour révéler les résultats

## Scénario E2E

```bash
# 1. Démarrer anvil
anvil

# 2. Dans un autre terminal, signer une transaction de création
cast send <CONTRAT> "createElection(string,string[])" \
  "Mayor 2026" '["Alice","Bob","Charlie"]' \
  --private-key <KEY>

# 3. Simuler des votes
for i in {1..5}; do
  cast send <CONTRAT> "castVote(uint256,bytes)" 1 $((i % 3))
done

# 4. Fermer l'election
cast send <CONTRAT> "closeElection(uint256)" 1

# 5. Vérifier les votes
cast call <CONTRAT> "getEncryptedTally(uint256,uint256)" 1 0
```

## Licence

MIT