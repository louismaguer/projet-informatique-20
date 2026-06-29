# 🔒 Ce qui est Privé, Ce qui ne l'est pas

## Vue d'ensemble

Ce système de vote utilise le Chiffrement Homomorphe Complet (FHE) pour maintenir la confidentialité des votes individuels tout en permettant le décompte sur la blockchain.

---

## ✅ PRIVE (Chiffré On-Chain)

### 1. Vote Individuel
- **Choix de vote de chaque électeur** reste chiffré sur la blockchain
- Même l'administrateur de l'élection ne peut pas voir comment vote un électeur spécifique
- Le vote est chiffré côté client AVANT d'être envoyé au contrat

### 2. Association Votant → Vote
- **Aucune liaison on-chain** entre l'adresse de l'électeur et son vote
- Les transactions de vote ne contiennent que des données chiffrées (bytes)
- Impossible de relier un vote à un wallet spécifique en analysant la blockchain

### 3. Totaux Intermédiaires
- Les compteurs partiels (tallies) entre les votes restent chiffrés
- On ne peut pas déduire les votes partiels pendant que l'élection est en cours

---

## ❌ PUBLIC (Non-Chiffré)

### 1. Existence de l'Élection
- Le titre et la question de l'élection sont **en clair** sur la blockchain
- Les options/candidats sont visibles publiquement

### 2. Participation
- **Le nombre total de votants** est public
- On peut savoir si une adresse a déjà voted (via `hasVoted`)

### 3. Résultat Final
- Après déchiffrement, les **totaux agrégés** sont révélés
- On sait combien de votes chaque option a reçu

### 4. Métadonnées
- Horodatage des transactions
- Adresse du portefeuille de l'électeur
- Gas consumé par les transactions

---

## Flux de Confidentialité

```
[Votant]                    [Blockchain]                 [Nœud FHEVM]
   │                             │                              │
   ├── encrypt(choix=2) ────────>│                              │
   │                             ├── stocke (euint chiffré) ───>│
   │                             │                              │
   │                             │   total += 1 (sur encrypted) │
   │                             │                              │
   │                    [Élection close]                        │
   │                             │                              │
   │                             │<───── demande decrypt ───────┤
   │                             │                              │
   │                             │───── résultats: [5,3,8] ──>│
```

---

## Limites

1. **Client-side encryption**: Le vote est chiffré dans le navigateur. Si le client est compromis, le vote peut être modifié avant chiffrement.

2. **Réseau**: Les métadonnées réseau (IP, timing) peuvent révéler des informations.

3. **Coercition**: Un observateur peut théoriquement regarder la mempool pour corréler quand un vote est envoyé.

4. **Décryptage forcé**: Via governance ou mécanismes on-chain, les clés de déchiffrement pourraient être compromises.

---

## Recommandations pour la Production

1. **Utiliser Tor/I2P** pour masquer l'IP
2. **Commit-reveal scheme** : Hacher le vote, puis révéler plus tard
3. **Threshold decryption** : Plusieurs nœuds doivent cooperer pour déchiffrer
4. **Auditabilité** : Preuves ZK que le vote est dans un range valide