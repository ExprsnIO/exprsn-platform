/**
 * WebCrypto E2EE primitives for Spark messaging.
 *
 * Scheme (mirrors what the spark backend expects/stores):
 *  - Identity: RSA-OAEP-4096 keypair. Public key is exported as SPKI PEM and
 *    registered with the server (the backend validates it parses as an RSA key
 *    via `crypto.createPublicKey`). The private key is exported PKCS8 and
 *    wrapped with a passphrase before it leaves the browser.
 *  - Private-key wrap: PBKDF2(passphrase, random salt, 100k, SHA-256) → AES-GCM
 *    256. The wrapped blob is OPAQUE to the server (stored as encryptedPrivateKey).
 *  - Per message: a fresh AES-GCM-256 content key encrypts the plaintext
 *    (`encryptedContent`); the content key is RSA-OAEP-wrapped to every
 *    recipient (incl. self) → `recipientKeys: [{ userId, encryptedKey }]`.
 *
 * All binary values cross the wire as base64; structured blobs as JSON strings.
 * Everything handed to `subtle` is a real ArrayBuffer (the DOM lib's generic
 * Uint8Array does not satisfy WebCrypto's BufferSource).
 */

const PBKDF2_ITERATIONS = 100_000;
const RSA_MODULUS_BITS = 4096;

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

// ── binary helpers ───────────────────────────────────────────────────────────

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Fresh, ArrayBuffer-backed random bytes. */
function randomBuf(len: number): ArrayBuffer {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  return bytes.buffer.slice(0) as ArrayBuffer;
}

/** UTF-8 encode to a real ArrayBuffer. */
function utf8(text: string): ArrayBuffer {
  return enc.encode(text).buffer.slice(0) as ArrayBuffer;
}

// ── PEM <-> SPKI ─────────────────────────────────────────────────────────────

function spkiToPem(spki: ArrayBuffer): string {
  const b64 = bufToBase64(spki);
  const lines = b64.match(/.{1,64}/g)?.join('\n') ?? b64;
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----\n`;
}

function pemToSpki(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s+/g, '');
  return base64ToBuf(b64);
}

// ── identity (RSA-OAEP keypair) ──────────────────────────────────────────────

export interface GeneratedIdentity {
  /** Public key as SPKI PEM — register this with the server. */
  publicKeyPem: string;
  /** Passphrase-wrapped PKCS8 private key (JSON blob) — opaque to the server. */
  encryptedPrivateKey: string;
  /** Unwrapped private key, ready for in-memory use this session. */
  privateKey: CryptoKey;
}

/**
 * Generate a fresh RSA-OAEP-4096 identity and wrap its private key with the
 * passphrase. Returns the public PEM + wrapped private blob to register, plus
 * the live private key to hold in memory for this session.
 */
export async function generateIdentity(passphrase: string): Promise<GeneratedIdentity> {
  const pair = await subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: RSA_MODULUS_BITS,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  );

  const spki = await subtle.exportKey('spki', pair.publicKey);
  const pkcs8 = await subtle.exportKey('pkcs8', pair.privateKey);

  return {
    publicKeyPem: spkiToPem(spki),
    encryptedPrivateKey: await wrapPrivateKey(pkcs8, passphrase),
    privateKey: pair.privateKey,
  };
}

// ── private-key wrap / unwrap (passphrase) ───────────────────────────────────

async function deriveWrapKey(passphrase: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const base = await subtle.importKey('raw', utf8(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function wrapPrivateKey(pkcs8: ArrayBuffer, passphrase: string): Promise<string> {
  const salt = randomBuf(16);
  const iv = randomBuf(12);
  const key = await deriveWrapKey(passphrase, salt);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, pkcs8);
  return JSON.stringify({
    v: 1,
    salt: bufToBase64(salt),
    iv: bufToBase64(iv),
    ct: bufToBase64(ct),
  });
}

/**
 * Unwrap a passphrase-wrapped PKCS8 private key into a usable RSA-OAEP key.
 * Throws if the passphrase is wrong (AES-GCM auth failure).
 */
export async function unwrapPrivateKey(blob: string, passphrase: string): Promise<CryptoKey> {
  const { salt, iv, ct } = JSON.parse(blob) as { salt: string; iv: string; ct: string };
  const key = await deriveWrapKey(passphrase, base64ToBuf(salt));
  const pkcs8 = await subtle.decrypt({ name: 'AES-GCM', iv: base64ToBuf(iv) }, key, base64ToBuf(ct));
  return subtle.importKey('pkcs8', pkcs8, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, [
    'decrypt',
  ]);
}

// ── message encrypt / decrypt ────────────────────────────────────────────────

export interface EncryptedPayload {
  /** JSON blob `{ iv, ct }` (base64) — store as Message.encryptedContent. */
  encryptedContent: string;
  /** Per-recipient wrapped content key. */
  recipientKeys: Array<{ userId: string; encryptedKey: string }>;
}

async function importPublicPem(pem: string): Promise<CryptoKey> {
  return subtle.importKey('spki', pemToSpki(pem), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, [
    'encrypt',
  ]);
}

/**
 * Encrypt `plaintext` with a fresh AES content key, then RSA-OAEP-wrap that key
 * to each recipient public key. Pass the sender's OWN public key in the map too
 * so the sender can decrypt their own message later / on another device.
 */
export async function encryptMessage(
  plaintext: string,
  recipientPublicKeysByUserId: Record<string, string>,
): Promise<EncryptedPayload> {
  const contentKey = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);

  const iv = randomBuf(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, contentKey, utf8(plaintext));
  const encryptedContent = JSON.stringify({ iv: bufToBase64(iv), ct: bufToBase64(ct) });

  const rawContentKey = await subtle.exportKey('raw', contentKey);

  const recipientKeys: Array<{ userId: string; encryptedKey: string }> = [];
  for (const [userId, pem] of Object.entries(recipientPublicKeysByUserId)) {
    const pub = await importPublicPem(pem);
    const wrapped = await subtle.encrypt({ name: 'RSA-OAEP' }, pub, rawContentKey);
    recipientKeys.push({ userId, encryptedKey: bufToBase64(wrapped) });
  }

  return { encryptedContent, recipientKeys };
}

/**
 * Decrypt one message: RSA-OAEP-unwrap the content key with our private key,
 * then AES-GCM-decrypt the content blob.
 */
export async function decryptMessage(
  encryptedContent: string,
  encryptedKeyForMe: string,
  privateKey: CryptoKey,
): Promise<string> {
  const rawContentKey = await subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    base64ToBuf(encryptedKeyForMe),
  );
  const contentKey = await subtle.importKey('raw', rawContentKey, 'AES-GCM', false, ['decrypt']);

  const { iv, ct } = JSON.parse(encryptedContent) as { iv: string; ct: string };
  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuf(iv) },
    contentKey,
    base64ToBuf(ct),
  );
  return dec.decode(plaintext);
}
