/**
 * E2EE unlock state for Spark messaging (Zustand). Session-only, mirroring the
 * tokenStore discipline: the unwrapped private key lives in memory and is never
 * persisted, so a reload requires re-entering the passphrase.
 *
 *  - `needs-setup`  no key registered yet → prompt to create a passphrase
 *  - `locked`       key exists but private key not unwrapped this session
 *  - `unlocked`     private key in memory; can encrypt/decrypt
 *
 * Also caches recipient public keys and per-message wrapped content keys to
 * avoid repeated round-trips while scrolling a conversation.
 */
import { create } from 'zustand';
import { ApiError } from '@/lib/http';
import { sparkApi } from '@/api/spark';
import { generateIdentity, unwrapPrivateKey, decryptMessage } from '@/lib/crypto';

/** Logical device id — stable so the same portable key is reused across browsers. */
const DEVICE_ID = 'web';

interface E2eeState {
  status: 'unknown' | 'needs-setup' | 'locked' | 'unlocked';
  privateKey: CryptoKey | null;
  keyFingerprint: string | null;
  myPublicKey: string | null;
  /** userId → public key PEM, or null when the user has no registered key. */
  publicKeyByUser: Record<string, string | null>;
  /** messageId → my wrapped content key, or null when I have no key for it. */
  messageKeyById: Record<string, string | null>;

  /** Resolve initial status by probing for an existing key. */
  init: () => Promise<void>;
  /** First-time: generate identity, wrap with passphrase, register, unlock. */
  setup: (passphrase: string) => Promise<void>;
  /** Returning session: fetch own key material and unwrap with passphrase. */
  unlock: (passphrase: string) => Promise<void>;
  /** Wipe sensitive state (logout). */
  lock: () => void;

  /** Fetch + cache recipient public keys; returns the (subset) map of keyed users. */
  ensurePublicKeys: (userIds: string[]) => Promise<Record<string, string>>;
  /** Decrypt one encrypted message for the current user (null if undecryptable). */
  decrypt: (messageId: string, encryptedContent: string) => Promise<string | null>;
}

export const useE2eeStore = create<E2eeState>((set, get) => ({
  status: 'unknown',
  privateKey: null,
  keyFingerprint: null,
  myPublicKey: null,
  publicKeyByUser: {},
  messageKeyById: {},

  init: async () => {
    try {
      const mine = await sparkApi.getMyKey();
      set({
        status: 'locked',
        keyFingerprint: mine.keyFingerprint,
        myPublicKey: mine.publicKey,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        set({ status: 'needs-setup' });
      } else {
        throw err;
      }
    }
  },

  setup: async (passphrase) => {
    const identity = await generateIdentity(passphrase);
    const registered = await sparkApi.registerKey({
      deviceId: DEVICE_ID,
      publicKey: identity.publicKeyPem,
      encryptedPrivateKey: identity.encryptedPrivateKey,
    });
    set((s) => ({
      status: 'unlocked',
      privateKey: identity.privateKey,
      keyFingerprint: registered.keyFingerprint,
      myPublicKey: registered.publicKey,
      // Seed our own public key into the recipient cache.
      publicKeyByUser: { ...s.publicKeyByUser },
    }));
  },

  unlock: async (passphrase) => {
    const mine = await sparkApi.getMyKey();
    const privateKey = await unwrapPrivateKey(mine.encryptedPrivateKey, passphrase);
    set({
      status: 'unlocked',
      privateKey,
      keyFingerprint: mine.keyFingerprint,
      myPublicKey: mine.publicKey,
    });
  },

  lock: () =>
    set({
      status: 'unknown',
      privateKey: null,
      keyFingerprint: null,
      myPublicKey: null,
      publicKeyByUser: {},
      messageKeyById: {},
    }),

  ensurePublicKeys: async (userIds) => {
    const cache = get().publicKeyByUser;
    const missing = userIds.filter((id) => cache[id] === undefined);

    if (missing.length > 0) {
      const fetched = await sparkApi.batchPublicKeys(missing);
      const merged: Record<string, string | null> = { ...cache };
      for (const id of missing) merged[id] = fetched[id]?.publicKey ?? null;
      set({ publicKeyByUser: merged });
    }

    const result: Record<string, string> = {};
    const latest = get().publicKeyByUser;
    for (const id of userIds) {
      const pem = latest[id];
      if (pem) result[id] = pem;
    }
    return result;
  },

  decrypt: async (messageId, encryptedContent) => {
    const { privateKey } = get();
    if (!privateKey) return null;

    let encryptedKey = get().messageKeyById[messageId];
    if (encryptedKey === undefined) {
      try {
        encryptedKey = await sparkApi.getMessageKey(messageId);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) encryptedKey = null;
        else throw err;
      }
      set((s) => ({ messageKeyById: { ...s.messageKeyById, [messageId]: encryptedKey ?? null } }));
    }
    if (!encryptedKey) return null;

    try {
      return await decryptMessage(encryptedContent, encryptedKey, privateKey);
    } catch {
      return null;
    }
  },
}));
