/**
 * End-to-End Encryption utilities using Web Crypto API
 * 
 * Encryption strategy:
 * - Password-protected rooms: Key derived from password using PBKDF2
 * - Public rooms: Key deterministically derived from room ID using PBKDF2
 */

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;
const ITERATIONS = 100000;
const ROOM_ID_ITERATIONS = 10000; // Lower iterations for deterministic key derivation

/**
 * Generate a random encryption key
 */
export async function generateKey(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
  const exported = await crypto.subtle.exportKey("raw", key);
  return bufferToBase64(exported);
}

/**
 * Derive a key from password using PBKDF2
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: ArrayBuffer
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const baseKey = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Derive a deterministic encryption key from room ID for public rooms
 * Same room ID always produces the same key
 */
export async function deriveKeyFromRoomId(roomId: string): Promise<string> {
  const encoder = new TextEncoder();
  const roomIdBuffer = encoder.encode(roomId);
  
  // Use PBKDF2 with room ID as password and room ID-based salt for determinism
  // This ensures same room ID always produces same key
  const saltBuffer = encoder.encode(`droply-room-salt-${roomId}`);
  
  const baseKey = await crypto.subtle.importKey(
    "raw",
    roomIdBuffer,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: ROOM_ID_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    KEY_LENGTH
  );
  
  return bufferToBase64(derivedBits);
}

/**
 * Import a key from base64 string
 */
export async function importKey(keyString: string): Promise<CryptoKey> {
  const keyBuffer = base64ToBuffer(keyString);
  return crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "AES-GCM", length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt data using AES-GCM
 */
export async function encrypt(
  data: string,
  keySource: string | null,
  isPasswordKey: boolean = false,
  roomId?: string
): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  let key: CryptoKey;
  let salt: ArrayBuffer | null = null;

  // For public rooms without keySource: derive from room ID
  if (!keySource && roomId) {
    const roomIdKey = await deriveKeyFromRoomId(roomId);
    keySource = roomIdKey;
  }

  if (!keySource) {
    // No encryption key available - throw error (content must be encrypted)
    throw new Error("Encryption key is required. Content must be encrypted before saving to database.");
  }

  if (isPasswordKey) {
    // Derive key from password
    const saltArray = new Uint8Array(SALT_LENGTH);
    crypto.getRandomValues(saltArray);
    salt = saltArray.buffer;
    key = await deriveKeyFromPassword(keySource, salt);
  } else {
    // Import key directly
    key = await importKey(keySource);
  }

  const ivArray = new Uint8Array(IV_LENGTH);
  crypto.getRandomValues(ivArray);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivArray },
    key,
    dataBuffer
  );

  // Format: [salt?][iv][encrypted]
  const parts = [];
  if (salt) parts.push(bufferToBase64(salt));
  parts.push(bufferToBase64(ivArray.buffer));
  parts.push(bufferToBase64(encryptedBuffer));

  return parts.join(":");
}

/**
 * Decrypt data using AES-GCM
 */
export async function decrypt(
  encryptedData: string,
  keySource: string | null,
  isPasswordKey: boolean = false
): Promise<string> {
  if (!keySource) {
    // No decryption needed
    return encryptedData;
  }

  try {
    const parts = encryptedData.split(":");
    
    let key: CryptoKey;
    let ivBuffer: ArrayBuffer;
    let encrypted: ArrayBuffer;

    if (isPasswordKey && parts.length === 3) {
      // Password-based: salt:iv:encrypted
      const saltBuffer = base64ToBuffer(parts[0]);
      ivBuffer = base64ToBuffer(parts[1]);
      encrypted = base64ToBuffer(parts[2]);
      key = await deriveKeyFromPassword(keySource, saltBuffer);
    } else if (!isPasswordKey && parts.length === 2) {
      // Key-based: iv:encrypted
      ivBuffer = base64ToBuffer(parts[0]);
      encrypted = base64ToBuffer(parts[1]);
      key = await importKey(keySource);
    } else {
      // Invalid format or unencrypted data
      return encryptedData;
    }

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBuffer },
      key,
      encrypted
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.error("Decryption failed:", error);
    // Return original data if decryption fails (might be unencrypted)
    return encryptedData;
  }
}

/**
 * Check if data is encrypted
 * More strict check to avoid false positives (e.g., URLs with colons)
 */
export function isEncrypted(data: string): boolean {
  if (!data || !data.includes(":")) return false;
  
  const parts = data.split(":");
  
  // Encrypted data should have format: [salt?][iv][encrypted] (2 or 3 parts)
  // Password-based: 3 parts (salt:iv:encrypted)
  // Key-based: 2 parts (iv:encrypted)
  if (parts.length !== 2 && parts.length !== 3) return false;
  
  // Each part should be base64-encoded and reasonably long
  // Base64 strings contain A-Z, a-z, 0-9, +, /, and = (padding)
  const base64Pattern = /^[A-Za-z0-9+/=]+$/;
  
  // Check if all parts look like base64 (encrypted data)
  // Minimum length for IV is ~12 bytes = ~16 base64 chars
  // Minimum length for salt is ~16 bytes = ~24 base64 chars
  for (const part of parts) {
    if (part.length < 10) return false; // Too short to be encrypted data
    if (!base64Pattern.test(part)) return false; // Doesn't look like base64
  }
  
  // Additional check: if it's 2 parts, it should be key-based encryption
  // If it's 3 parts, it should be password-based encryption
  // Both should have substantial length (encrypted content is usually longer)
  const totalLength = parts.join("").length;
  if (totalLength < 30) return false; // Too short for encrypted data
  
  return true;
}

/**
 * Verify that content is properly encrypted for password-protected rooms
 * Returns true if content is encrypted, false if it appears to be plaintext
 */
export function verifyEncryption(encryptedData: string, originalData: string): boolean {
  // Must be different from original
  if (encryptedData === originalData) {
    console.error("verifyEncryption: Encrypted data equals original");
    return false;
  }
  
  // Must have encryption format (contains : separator)
  if (!isEncrypted(encryptedData)) {
    console.error("verifyEncryption: Data doesn't have encryption format", { 
      hasColon: encryptedData.includes(":"),
      parts: encryptedData.split(":").length 
    });
    return false;
  }
  
  // For password-based encryption (3 parts: salt:iv:encrypted), minimum size is ~40 chars
  // For key-based encryption (2 parts: iv:encrypted), minimum size is ~25 chars
  const parts = encryptedData.split(":");
  const minEncryptedLength = parts.length === 3 ? 40 : 25; // Password-based needs salt too
  
  // Encrypted data must be longer than original and meet minimum length
  // For very short strings, use a more lenient check
  // Password-based: salt (~24) + IV (~18) + encrypted (variable) + separators = ~45-50+ for normal content
  // But for very short strings, total can be ~40-45 chars
  const lengthCheck = encryptedData.length >= Math.max(
    originalData.length * 1.1, // At least 10% longer (lenient for short strings)
    minEncryptedLength // Minimum absolute length for encrypted data
  );
  
  if (!lengthCheck) {
    console.error("verifyEncryption: Length check failed", {
      originalLength: originalData.length,
      encryptedLength: encryptedData.length,
      requiredMin: Math.max(originalData.length * 1.2, minEncryptedLength),
      partsCount: parts.length
    });
    return false;
  }
  
  return true;
}

/**
 * Hash password using SHA-256 for database storage
 * This prevents admins from seeing the actual password
 * Note: This is separate from PBKDF2 key derivation used for encryption
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return bufferToBase64(hashBuffer);
}

// Utility functions
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
