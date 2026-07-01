// mock-fhevm.js - Module browser qui imite le MockRelayerEncryptedInput du hardhat FHEVM plugin
// Implémente l'API du relayer SDK en mode mock (pas de vrais ZK proofs, mais format compatible
// avec @fhevm/mock-utils pour que le contrat accepte les ciphertexts).

const RAW_CT_HASH_DOMAIN_SEPARATOR = "ZK-w_rct";
const HANDLE_HASH_DOMAIN_SEPARATOR = "ZK-w_hdl";
const FHEVM_HANDLE_VERSION = 0;

// FhevmType enum (doit matcher @fhevm/mock-utils)
const FhevmType = {
  ebool: 0,
  euint4: 1,
  euint8: 2,
  euint16: 3,
  euint32: 4,
  euint64: 5,
  euint128: 6,
  eaddress: 7,
  euint256: 8,
};

// FheType byte size pour le packed ciphertext
const FheTypeByteSize = {
  ebool: 1,
  euint4: 1,
  euint8: 1,
  euint16: 2,
  euint32: 4,
  euint64: 8,
  euint128: 16,
  eaddress: 20,
  euint256: 32,
};

// --- helpers ---

function hexToBytes(hex) {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const arr = new Uint8Array(h.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(h.substr(i * 2, 2), 16);
  return arr;
}

function bytesToHex(bytes) {
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

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

function uintToBytesBE(value, byteLen) {
  const hex = BigInt(value)
    .toString(16)
    .padStart(byteLen * 2, "0");
  return hexToBytes(hex);
}

function randomBytes32() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return arr;
}

// URL du noeud Hardhat : passe par le reverse proxy intégré au serveur frontend
// (/api/rpc). Cela permet d'utiliser la même URL depuis le LAN ou depuis un
// tunnel Cloudflare (un seul port exposé : 8080).
// Override possible via ?rpc=http://X.Y.Z.W:8545 dans l'URL.
function getRpcUrl() {
  if (typeof window === "undefined") return "http://localhost:8080/api/rpc";
  const override = new URL(window.location.href).searchParams.get("rpc");
  if (override) return override;
  return new URL("/api/rpc", window.location.origin).href;
}

// --- ciphertext packing : keccak256( concat(fheType || value || rand32) per input ) ---

function computeMockCiphertextWithZKProof(inputs) {
  let packed = new Uint8Array(0);
  for (const input of inputs) {
    const fhevmTypeId = FhevmType[input.fhevmTypeName];
    const fheByteLen = FheTypeByteSize[input.fhevmTypeName];
    const fheType1Byte = new Uint8Array([fhevmTypeId]);
    const valueBytes = uintToBytesBE(BigInt(input.value), fheByteLen);
    const rand32 = input.rand32;
    packed = concatBytes(packed, fheType1Byte, valueBytes, rand32);
  }
  return ethers.getBytes(ethers.keccak256(bytesToHex(packed)));
}

// --- handle computation : keccak256("ZK-w_hdl" || blobHash || idx || acl || chainId32)[0..21) ---
// puis handle = hash21 || idx || chainId[22..30) || fheType || version

function computeHandle(blobHash, aclAddress, chainIdNum, fhevmTypeName, index) {
  const fhevmTypeId = FhevmType[fhevmTypeName];
  const domain = new TextEncoder().encode(HANDLE_HASH_DOMAIN_SEPARATOR);
  const idxByte = new Uint8Array([index]);
  // ethers.isAddress exige une address checksummed. Normalise depuis n'importe quel format.
  let aclNorm = aclAddress;
  try {
    aclNorm = ethers.getAddress(aclAddress);
  } catch {
    /* garder tel quel */
  }
  const aclHex = aclNorm.toLowerCase().replace(/^0x/, "");
  const aclBytes = hexToBytes("0x" + aclHex.slice(-40));
  const chainIdBytes = uintToBytesBE(chainIdNum, 32);
  const preimage = concatBytes(domain, blobHash, idxByte, aclBytes, chainIdBytes);
  const hash32 = ethers.getBytes(ethers.keccak256(bytesToHex(preimage)));
  // handle layout: hash21 (21B) | idx (1B) | chainId8 (8B, big-endian) | fheType (1B) | version (1B)
  const chainId32 = uintToBytesBE(chainIdNum, 32);
  const chainId8 = chainId32.slice(24, 32);
  const handle = new Uint8Array(32);
  handle.set(hash32.slice(0, 21), 0);
  handle[21] = index;
  handle.set(chainId8, 22);
  handle[30] = fhevmTypeId;
  handle[31] = FHEVM_HANDLE_VERSION;
  return bytesToHex(handle);
}

// --- input proof packing : format = numHandles(1B) || numSigners(1B) || handles(32B*N) || sigs(65B*M) || extraData ---

function computeInputProofHex(handles, signatures, extraData) {
  const numHandles = handles.length;
  const numSigners = signatures.length;
  if (numHandles > 255 || numSigners > 255) throw new Error("Too many handles/signers");

  const parts = [];
  parts.push(new Uint8Array([numHandles]));
  parts.push(new Uint8Array([numSigners]));
  for (const h of handles) {
    let hh = typeof h === "string" ? h : bytesToHex(h);
    if (!hh.startsWith("0x")) hh = "0x" + hh;
    const bytes = hexToBytes(hh);
    if (bytes.length !== 32) throw new Error("Invalid handle length: " + bytes.length);
    parts.push(bytes);
  }
  for (const s of signatures) {
    let ss = typeof s === "string" ? s : bytesToHex(s);
    if (!ss.startsWith("0x")) ss = "0x" + ss;
    const bytes = hexToBytes(ss);
    if (bytes.length !== 65) throw new Error("Invalid signature length: " + bytes.length);
    parts.push(bytes);
  }
  // extraData - pad to 32 bytes if it's shorter? Actually it's appended as-is
  let ed = extraData || "0x00";
  if (!ed.startsWith("0x")) ed = "0x" + ed;
  parts.push(hexToBytes(ed));
  return bytesToHex(concatBytes(...parts));
}

// --- MockFhevmInstance ---

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
    const rpcUrl = getRpcUrl();
    const handlesArr = Array.isArray(handles) ? handles : [handles];
    const handlesHex = handlesArr.map((h) => {
      if (typeof h === "string") return h;
      return bytesToHex(h);
    });

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "fhevm_relayer_v1_public_decrypt",
        // Le plugin attend ciphertextHandles (pas "handles") et extraData
        params: [{ ciphertextHandles: handlesHex, extraData: "0x00" }],
        id: Date.now(),
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error("publicDecrypt error: " + (data.error.message || JSON.stringify(data.error)));

    // Le plugin mock renvoie { decrypted_value, signatures }.
    // decrypted_value est `abiCoder.encode(["uint256", "uint256", ...], values)` :
    // les valeurs sont concatenées en uint256 (32 bytes chacune), PAS en uint256[].
    const result = {};
    let values = [];
    const dv = data.result?.decrypted_value;
    if (typeof dv === "string") {
      const hex = dv.replace(/^0x/, "");
      // Chaque valeur fait 64 hex chars (32 bytes)
      const n = Math.floor(hex.length / 64);
      for (let i = 0; i < n; i++) {
        values.push(BigInt("0x" + hex.slice(i * 64, (i + 1) * 64)));
      }
    }
    for (let i = 0; i < handlesHex.length; i++) {
      result[handlesHex[i]] = values[i] !== undefined ? values[i] : 0n;
    }
    return result;
  }
}

class MockRelayerEncryptedInput {
  constructor(instance, contractAddress, userAddress) {
    this.instance = instance;
    this.contractAddress = contractAddress;
    this.userAddress = userAddress;
    this.inputs = []; // { fhevmTypeName, value, rand32 }
  }

  _add(fhevmTypeName, value) {
    if (!(fhevmTypeName in FhevmType)) throw new Error("Unknown fhevmType: " + fhevmTypeName);
    this.inputs.push({ fhevmTypeName, value, rand32: randomBytes32() });
    return this;
  }

  addBool(v) {
    return this._add("ebool", v ? 1 : 0);
  }
  add4(v) {
    return this._add("euint4", v | 0);
  }
  add8(v) {
    return this._add("euint8", v | 0);
  }
  add16(v) {
    return this._add("euint16", v | 0);
  }
  add32(v) {
    return this._add("euint32", v | 0);
  }
  add64(v) {
    return this._add("euint64", BigInt(v).toString());
  }
  add128(v) {
    return this._add("euint128", BigInt(v).toString());
  }
  add256(v) {
    return this._add("euint256", BigInt(v).toString());
  }
  addAddress(v) {
    return this._add("eaddress", v);
  }

  async encrypt() {
    const chainIdNum = this.instance.chainId;
    // Le plugin attend contractChainId en hex string ("0x7a69" pour 31337)
    const contractChainIdHex = "0x" + BigInt(chainIdNum).toString(16);

    const clearTextValuesBigInt = this.inputs.map((i) => BigInt(i.value));
    const clearTextValuesBigIntHex = clearTextValuesBigInt.map((v) => ethers.toBeHex(v));
    // fheTypes et fhevmTypes sont des nombres (enum FhevmType), pas des strings
    const fheTypes = this.inputs.map((i) => FhevmType[i.fhevmTypeName]);
    const fhevmTypes = fheTypes;
    const rand32List = this.inputs.map((i) => bytesToHex(i.rand32));
    const metadatas = this.inputs.map(() => ({
      blockNumber: 0,
      index: 0,
      transactionHash: ethers.ZeroHash,
    }));

    const mockCiphertext = computeMockCiphertextWithZKProof(this.inputs);
    const ciphertextHex = bytesToHex(mockCiphertext);

    // Calcule les handles côté client (même algo que le mock-utils côté serveur)
    const blobDomain = new TextEncoder().encode(RAW_CT_HASH_DOMAIN_SEPARATOR);
    const blobHashBytes = ethers.getBytes(ethers.keccak256(bytesToHex(concatBytes(blobDomain, mockCiphertext))));
    const handles = this.inputs.map((input, idx) =>
      computeHandle(blobHashBytes, this.instance.aclAddress, chainIdNum, input.fhevmTypeName, idx),
    );

    const mockData = {
      clearTextValuesBigIntHex,
      metadatas,
      fheTypes,
      fhevmTypes,
      aclContractAddress: this.instance.aclAddress,
      random32List: rand32List,
    };

    // Le plugin FHEVM exige les addresses en format checksummed (ethers.getAddress)
    const checksummedContract = (() => {
      try {
        return ethers.getAddress(this.contractAddress);
      } catch {
        return this.contractAddress;
      }
    })();
    const checksummedUser = (() => {
      try {
        return ethers.getAddress(this.userAddress);
      } catch {
        return this.userAddress;
      }
    })();
    const checksummedAcl = (() => {
      try {
        return ethers.getAddress(this.instance.aclAddress);
      } catch {
        return this.instance.aclAddress;
      }
    })();

    const payload = {
      contractAddress: checksummedContract,
      userAddress: checksummedUser,
      ciphertextWithInputVerification: ciphertextHex,
      contractChainId: contractChainIdHex,
      extraData: "0x00",
      mockData: { ...mockData, aclContractAddress: checksummedAcl },
    };

    const response = await fetch(getRpcUrl(), {
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

    // Le serveur calcule les handles officiels, on les utilise directement
    const serverHandles = (data.result.handles || []).map((h) => (h.startsWith("0x") ? h : "0x" + h));
    const signatures = (data.result.signatures || []).map((s) => (s.startsWith("0x") ? s : "0x" + s));

    // Si le serveur n'a pas renvoyé de handles, fallback sur le calcul local
    const finalHandles = serverHandles.length > 0 ? serverHandles : handles;

    const inputProof = computeInputProofHex(finalHandles, signatures, "0x00");

    return { handles: finalHandles, inputProof };
  }
}

async function getRelayerMetadata() {
  const response = await fetch(getRpcUrl(), {
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

export async function createInstance(options = {}) {
  const metadata = await getRelayerMetadata();
  return new MockFhevmInstance({
    chainId: Number(metadata.chainId),
    aclAddress: metadata.ACLAddress,
    inputVerifierAddress: metadata.InputVerifierAddress,
    kmsVerifierAddress: metadata.KMSVerifierAddress,
    coprocessorAddress: metadata.CoprocessorAddress,
  });
}

export { MockFhevmInstance };
