import 'expo-sqlite/localStorage/install';
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

// Session JSON can exceed Keychain's value size limit. Keep only the AES key in
// protected storage and bind each encrypted SQLite value to its Supabase storage key.
const keyName = 'kiln.session.encryption.v1';
const prefix = 'kiln.aes.v1:';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const utf8 = new TextEncoder();
// Order migration, token refresh and sign-out even when the SDK overlaps storage calls.
let pending = Promise.resolve();
function inOrder<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation);
  pending = result.then(() => {}, () => {});
  return result;
}

async function writeKey() {
  const stored = await SecureStore.getItemAsync(keyName, options);
  if (stored) return AESEncryptionKey.import(stored, 'base64');
  const key = await AESEncryptionKey.generate();
  await SecureStore.setItemAsync(keyName, await key.encoded('base64'), options);
  return key;
}

async function setItem(name: string, value: string) {
  const sealed = await aesEncryptAsync(utf8.encode(value), await writeKey(), { additionalData: utf8.encode(name) });
  localStorage.setItem(name, prefix + await sealed.combined('base64'));
}

async function getItem(name: string) {
  const stored = localStorage.getItem(name);
  if (stored === null) return null;
  if (!stored.startsWith(prefix)) {
    // Replace the old plaintext record only after encryption succeeds.
    await setItem(name, stored);
    return stored;
  }
  const encodedKey = await SecureStore.getItemAsync(keyName, options);
  if (!encodedKey) return null;
  const key = await AESEncryptionKey.import(encodedKey, 'base64');
  const plaintext = await aesDecryptAsync(AESSealedData.fromCombined(stored.slice(prefix.length)), key, {
    additionalData: utf8.encode(name),
  });
  return new TextDecoder().decode(plaintext);
}

export const authStorage = {
  getItem: (name: string) => inOrder(() => getItem(name)),
  setItem: (name: string, value: string) => inOrder(() => setItem(name, value)),
  removeItem: (name: string) => inOrder(async () => { localStorage.removeItem(name); }),
};
