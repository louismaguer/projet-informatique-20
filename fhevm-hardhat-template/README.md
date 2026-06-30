# FHEVM Hardhat Template

A Hardhat-based template for developing Fully Homomorphic Encryption (FHE) enabled Solidity smart contracts using the
FHEVM protocol by Zama.

## Quick Start

For detailed instructions see:
[FHEVM Hardhat Quick Start Tutorial](https://docs.zama.ai/protocol/solidity-guides/getting-started/quick-start-tutorial)

### Prerequisites

- **Node.js**: Version 20 or higher
- **npm or yarn/pnpm**: Package manager

### Installation

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set up environment variables**

   ```bash
   npx hardhat vars set MNEMONIC

   # Set your Infura API key for network access
   npx hardhat vars set INFURA_API_KEY

   # Optional: Set Etherscan API key for contract verification
   npx hardhat vars set ETHERSCAN_API_KEY
   ```

3. **Compile and test**

   ```bash
   npm run compile
   npm run test
   ```

4. **Deploy to local network**

   ```bash
   # Start a local FHEVM-ready node
   npx hardhat node
   # Deploy to local network
   npx hardhat deploy --network localhost
   ```

5. **Deploy to Sepolia Testnet**

   ```bash
   # Deploy to Sepolia
   npx hardhat deploy --network sepolia
   # Verify contract on Etherscan
   npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
   ```

6. **Test on Sepolia Testnet**

   ```bash
   # Once deployed, you can run a simple test on Sepolia.
   npx hardhat test --network sepolia
   ```

## 🗳 Vote multi-appareils (LAN non fiable)

Le frontend n'embarque **aucune clé privée**. Chaque votant utilise sa propre identité, reçue sur un slip papier imprimé
par l'admin. Convient pour une démo en atelier sur un LAN non chiffré.

> ## ⚠️ AVERTISSEMENT CRITIQUE — wallets de démo
>
> Les 20 wallets générés par `generateIdentities.js` sont de **vrais keypairs cryptographiques** (mêmes algo que
> MetaMask/Ledger). Ils n'ont de la valeur **que** sur le noeud Hardhat local (chainId 31337).
>
> **Ne finance JAMAIS ces adresses sur mainnet, Sepolia ou toute autre chaîne publique.** Si quelqu'un (toi, un dev, une
> erreur de copier-coller) envoie de l'ETH réel à une de ces adresses, la clé privée imprimée sur le slip contrôle ces
> fonds — et quiconque a vu le slip aussi.
>
> Régénérer un nouveau set avant chaque démo pour rendre les anciens inertes.

### Côté admin (1 fois avant la démo)

```bash
# Génère 20 wallets aléatoires, les crédite de 100 ETH chacun,
# et produit scripts/printIdentities.html (slips à imprimer)
npx hardhat run scripts/generateIdentities.js --network localhost
```

1. Ouvre `scripts/printIdentities.html` dans un navigateur → clique **Imprimer** → coupe les 20 slips.
2. **Supprime le fichier** après impression (`rm scripts/printIdentities.html`).
3. Note l'IP LAN de la machine Hardhat (`ifconfig | grep inet`).

### Côté votant (un par appareil)

1. Sur l'appareil (téléphone, laptop, tablette), ouvre `http://<IP-serveur>:8080`.
2. Une modale demande de coller la clé privée du slip → bouton **Valider**.
3. La PK reste dans le `localStorage` de l'appareil uniquement (jamais envoyée au serveur).
4. Vote normalement. Bouton **🧹 Effacer mes données** pour nettoyer à la fin.

### Comportements garantis

| Cas                                                              | Résultat                                                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 2 votants distincts (PK différentes) votent sur la même élection | `voterCount = 2` ✓                                                                                                       |
| Même wallet tente un 2ᵉ vote                                     | Rejeté (`Already voted`) ✓                                                                                               |
| Wallet sans ETH                                                  | Message d'erreur explicite + bouton pour re-demander une PK                                                              |
| Appareil perdu / volé                                            | Le votant peut cliquer « Effacer mes données » → la PK disparaît du localStorage. L'admin peut créditer un nouveau slip. |

### Tests

```bash
npx hardhat test test/MultiDevice.ts
```

Couvre : 2 wallets arbitraires, double-vote, 10 voters en parallèle, sanity check des wallets générés.

### Sécurité — ce qui est et n'est pas protégé

| ✅ Protégé                                                     | ❌ Non protégé (assumé en démo)                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Choix de chaque votant (chiffrement FHE local avant envoi)     | Authentification du votant (n'importe qui avec un slip peut voter)                      |
| Vote individuel invisible jusqu'à la clôture                   | Risque de regard par-dessus l'épaule quand la PK est collée                             |
| Ta clé ne quitte jamais ton appareil                           | `localStorage` non chiffré au repos sur ton appareil                                    |
| Réseau : transport HTTP en clair, mais ciphertext FHE = opaque | Attaque physique sur l'appareil entre le moment où tu colles la PK et celui où tu votes |

## 📁 Project Structure

```
fhevm-hardhat-template/
├── contracts/           # Smart contract source files
│   └── FHECounter.sol   # Example FHE counter contract
├── deploy/              # Deployment scripts
├── tasks/               # Hardhat custom tasks
├── test/                # Test files
├── hardhat.config.ts    # Hardhat configuration
└── package.json         # Dependencies and scripts
```

## 📜 Available Scripts

| Script             | Description              |
| ------------------ | ------------------------ |
| `npm run compile`  | Compile all contracts    |
| `npm run test`     | Run all tests            |
| `npm run coverage` | Generate coverage report |
| `npm run lint`     | Run linting checks       |
| `npm run clean`    | Clean build artifacts    |

## 📚 Documentation

- [FHEVM Documentation](https://docs.zama.ai/fhevm)
- [FHEVM Hardhat Setup Guide](https://docs.zama.ai/protocol/solidity-guides/getting-started/setup)
- [FHEVM Testing Guide](https://docs.zama.ai/protocol/solidity-guides/development-guide/hardhat/write_test)
- [FHEVM Hardhat Plugin](https://docs.zama.ai/protocol/solidity-guides/development-guide/hardhat)

## 📄 License

This project is licensed under the BSD-3-Clause-Clear License. See the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/zama-ai/fhevm/issues)
- **Documentation**: [FHEVM Docs](https://docs.zama.ai)
- **Community**: [Zama Discord](https://discord.gg/zama)

---

**Built with ❤️ by the Zama team**
