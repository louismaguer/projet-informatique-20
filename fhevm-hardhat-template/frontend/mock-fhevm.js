// mock-fhevm.js - Module client-side qui simule le SDK relayer pour hardhat mock
// Implémente l'algorithme de génération de handles conforme au hardhat FHEVM plugin

const RAW_CT_HASH_DOMAIN_SEPARATOR = "ZK-w_rct";
const HANDLE_HASH_DOMAIN_SEPARATOR = "ZK-w_hdl";

// Convertit un nombre (uint32) en bytes BE
function uintToBytes32(value) {
  const hex = BigInt(value).toString(16).padStart(64, "0");
  return hexToBytes("0x" + hex);
}

// Convertit hex en bytes (Uint8Array)
function hexToBytes(hex) {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const arr = new Uint8Array(h.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(h.substr(i * 2, 2), 16);
  }
  return arr;
}

// Convertit bytes en hex string
function bytesToHex(bytes) {
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Concatène plusieurs Uint8Array
function concatBytes(...arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

// Keccak256 wrapper (utilise ethers si disponible, sinon retourne un hash déterministe)
async function keccak256(data) {
  if (typeof ethers !== "undefined" && ethers.keccak256) {
    const hex = bytesToHex(data);
    return ethers.getBytes(ethers.keccak256(hex));
  }
  // Fallback: simple hash déterministe (pas un vrai keccak)
  // On n'en a besoin que si ethers n'est pas chargé
  // En cas d'absence d'ethers, on retourne les bytes directement (le mock hardhat refera le hash)
  return data;
}

// Convertit une address en 20 bytes
function addressToBytes20(addr) {
  const clean = addr.startsWith("0x") ? addr.slice(2).toLowerCase() : addr.toLowerCase();
  return hexToBytes("0x" + clean.slice(-40));
}

// Convertit uint en 32 bytes (big-endian)
function uintToBytes32BigInt(value) {
  const hex = BigInt(value).toString(16).padStart(64, "0");
  return hexToBytes("0x" + hex);
}

// Calcule le handle comme dans hardhat mock
async function computeHandle(ciphertext, aclAddress, chainId, index) {
  // 1. blobHash = keccak256("ZK-w_rct" || ciphertext)
  const blobDomain = new TextEncoder().encode(RAW_CT_HASH_DOMAIN_SEPARATOR);
  const blobHashHex = ethers.keccak256(bytesToHex(concatBytes(blobDomain, ciphertext)));
  const blobHash = ethers.getBytes(blobHashHex);

  // 2. handle = keccak256("ZK-w_hdl" || blobHash || indexByte || aclAddress || chainId32)
  const handleDomain = new TextEncoder().encode(HANDLE_HASH_DOMAIN_SEPARATOR);
  const indexByte = new Uint8Array([index]);
  const aclBytes = addressToBytes20(aclAddress);
  const chainIdBytes = uintToBytes32BigInt(chainId);

  const preimage = concatBytes(handleDomain, blobHash, indexByte, aclBytes, chainIdBytes);
  const handleHex = ethers.keccak256(bytesToHex(preimage));
  return ethers.getBytes(handleHex);
}

// MockFhevmInstance - simule l'instance relayer SDK
class MockFhevmInstance {
  constructor(config) {
    this.config = config;
    this.chainId = config.chainId;
    this.aclAddress = config.aclAddress;
    this.inputVerifierAddress = config.inputVerifierAddress;
    this.kmsVerifierAddress = config.kmsVerifierAddress;
    this.coprocessorAddress = config.coprocessorAddress;
  }

  createEncryptedInput(contractAddress, userAddress) {
    return new MockRelayerEncryptedInput(this, contractAddress, userAddress);
  }

  async publicDecrypt(handles, options = {}) {
    // Le déchiffrement public passe par le relayer mock
    const rpcUrl = "http://localhost:8545";
    const handlesArr = Array.isArray(handles) ? handles : [handles];

    // Convertir handles en strings
    const handlesHex = handlesArr.map(h => {
      if (typeof h === "string") return h;
      return bytesToHex(h);
    });

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "fhevm_relayer_v1_public_decrypt",
        params: [{ handles: handlesHex }],
        id: Date.now(),
      }),
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }

    const clearTexts = data.result?.clearTexts || data.result?.cleartexts || [];
    const decryptions = data.result?.decryptions || {};

    // Construire la sortie attendue
    const result = {};
    for (let i = 0; i < handlesHex.length; i++) {
      let value;
      if (clearTexts[i] !== undefined) {
        value = clearTexts[i];
      } else if (decryptions[handlesHex[i]] !== undefined) {
        value = decryptions[handlesHex[i]];
      } else {
        value = 0;
      }
      result[handlesHex[i]] = typeof value === "string" ? BigInt(value) : BigInt(value);
    }
    return result;
  }
}

// Builder pour createEncryptedInput
class MockRelayerEncryptedInput {
  constructor(instance, contractAddress, userAddress) {
    this.instance = instance;
    this.contractAddress = contractAddress;
    this.userAddress = userAddress;
    this.inputs = []; // {type, value}
  }

  addBool(value) {
    this.inputs.push({ type: "ebool", value: value ? 1 : 0 });
    return this;
  }

  add8(value) {
    this.inputs.push({ type: "euint8", value: value | 0 });
    return this;
  }

  add16(value) {
    this.inputs.push({ type: "euint16", value: value | 0 });
    return this;
  }

  add32(value) {
    this.inputs.push({ type: "euint32", value: value | 0 });
    return this;
  }

  add64(value) {
    this.inputs.push({ type: "euint64", value: BigInt(value).toString() });
    return this;
  }

  add128(value) {
    this.inputs.push({ type: "euint128", value: BigInt(value).toString() });
    return this;
  }

  add256(value) {
    this.inputs.push({ type: "euint256", value: BigInt(value).toString() });
    return this;
  }

  addAddress(value) {
    this.inputs.push({ type: "eaddress", value });
    return this;
  }

  async encrypt() {
    const aclAddress = this.instance.aclAddress;
    const chainId = this.instance.chainId;

    // 1. Sérialiser les valeurs en ciphertext
    // Format mock: concaténation de chaque valeur encodée en BE
    const ciphertextParts = [];
    for (let i = 0; i < this.inputs.length; i++) {
      const input = this.inputs[i];
      let bytes;
      switch (input.type) {
        case "ebool":
          bytes = new Uint8Array([input.value & 0xff]);
          break;
        case "euint8":
          bytes = uintToBytes32(input.value).slice(31);
          break;
        case "euint16":
          bytes = uintToBytes32(input.value).slice(30);
          break;
        case "euint32":
          bytes = uintToBytes32(input.value).slice(28);
          break;
        case "euint64":
          bytes = uintToBytes32BigInt(BigInt(input.value)).slice(24);
          break;
        case "euint128":
          bytes = uintToBytes32BigInt(BigInt(input.value)).slice(16);
          break;
        case "euint256":
          bytes = uintToBytes32BigInt(BigInt(input.value));
          break;
        case "eaddress":
          bytes = addressToBytes20(input.value);
          break;
      }
      ciphertextParts.push(bytes);
    }
    const ciphertext = concatBytes(...ciphertextParts);

    // 2. Calculer les handles pour chaque input
    const handles = [];
    for (let i = 0; i < this.inputs.length; i++) {
      const handleBytes = await computeHandle(ciphertext, aclAddress, chainId, i);
      handles.push(bytesToHex(handleBytes));
    }

    // 3. Construire le payload pour l'input-proof
    const mockData = {
      aclContractAddress: aclAddress,
      chainId,
      fhevmTypes: this.inputs.map(i => i.type),
      types: this.inputs.map(i => i.type),
      encryptionBits: this.inputs.map(i => {
        if (i.type === "ebool") return 1;
        if (i.type === "euint8") return 8;
        if (i.type === "euint16") return 16;
        if (i.type === "euint32") return 32;
        if (i.type === "euint64") return 64;
        if (i.type === "euint128") return 128;
        if (i.type === "euint256") return 256;
        if (i.type === "eaddress") return 160;
        return 32;
      }),
      values: this.inputs.map(i => {
        if (typeof i.value === "bigint") {
          return "0x" + i.value.toString(16).padStart(64, "0");
        }
        if (typeof i.value === "string") {
          if (i.value.startsWith("0x")) return i.value;
          return "0x" + BigInt(i.value).toString(16).padStart(64, "0");
        }
        return "0x" + BigInt(i.value).toString(16).padStart(64, "0");
      }),
    };

    // 4. Appeler hardhat pour générer l'input proof
    const payload = {
      contractAddress: this.contractAddress,
      userAddress: this.userAddress,
      ciphertextWithInputVerification: bytesToHex(ciphertext),
      contractChainId: chainId,
      extraData: "0x",
      mockData,
    };

    const response = await fetch("http://localhost:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "fhevm_relayer_v1_input_proof",
        params: [payload],
        id: Date.now(),
      }),
    });

    const data = await response.json();
    if (data.error) {
      throw new Error("Input proof error: " + (data.error.message || JSON.stringify(data.error)));
    }

    return {
      handles,
      inputProof: data.result.inputProof || data.result.proof || bytesToHex(ciphertext),
    };
  }
}

// Fonction pour obtenir la metadata du relayer mock
async function getRelayerMetadata() {
  const response = await fetch("http://localhost:8545", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "fhevm_relayer_metadata",
      params: [],
      id: Date.now(),
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

// Fonction principale pour créer une instance mock
export async function createInstance(options = {}) {
  const metadata = await getRelayerMetadata();
  const instance = new MockFhevmInstance({
    chainId: Number(metadata.chainId),
    aclAddress: metadata.ACLAddress,
    inputVerifierAddress: metadata.InputVerifierAddress,
    kmsVerifierAddress: metadata.KMSVerifierAddress,
    coprocessorAddress: metadata.CoprocessorAddress,
  });
  return instance;
}

// Export pour debug
export { MockFhevmInstance, computeHandle };
