/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const EMOJI_SECURITY_SET = [
  '🛡️', '🔑', '⚡', '🔒', '🦊', '🦅', '💎', '🌙', 
  '⚓', '🎯', '🚀', '🌟', '🌊', '🍀', '🧭', '🛸'
];

/**
 * Generates a pool of 5 unique, fresh anonymous virtual numbers that do not match existing users.
 */
export function generatePhoneNumberPool(excludedNumbers: string[] = []): string[] {
  const areaCodes = ['800', '888', '877', '866', '855', '844', '833'];
  const pool: string[] = [];
  const excludedDigits = new Set(excludedNumbers.map(n => n.replace(/\D/g, '')));

  // Read local storage to avoid duplicates
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem('ciphercall_users_v1');
      if (raw) {
        const users = JSON.parse(raw);
        for (const u of users) {
          if (u.assignedNumber) {
            excludedDigits.add(u.assignedNumber.replace(/\D/g, ''));
          }
        }
      }
    } catch {}
  }

  let attempts = 0;
  while (pool.length < 5 && attempts < 200) {
    attempts++;
    const area = areaCodes[Math.floor(Math.random() * areaCodes.length)];
    const middle = Math.floor(100 + Math.random() * 900);
    const last = Math.floor(1000 + Math.random() * 9000);
    const candidate = `+1 (${area}) ${middle}-${last}`;
    const digits = candidate.replace(/\D/g, '');

    if (pool.includes(candidate) || excludedDigits.has(digits)) {
      continue;
    }

    pool.push(candidate);
  }

  return pool;
}

/**
 * Generates a cryptographically random salt string in hex.
 */
export function generateSalt(length = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Hashes a password using PBKDF2 with SHA-256 and salt.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedKey = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  return Array.from(new Uint8Array(derivedKey), b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates an ECDH P-256 KeyPair for ephemeral End-to-End Encryption.
 */
export async function generateEcdhKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Exports a public key to Base64 SPKI format.
 */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', key);
  const binary = String.fromCharCode(...new Uint8Array(exported));
  return btoa(binary);
}

/**
 * Computes a SHA-256 fingerprint from a public key string.
 */
export async function computeKeyFingerprint(publicKeyBase64: string): Promise<string> {
  const enc = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(publicKeyBase64));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map(b => b.toString(16).toUpperCase().padStart(2, '0'));
  
  // Format as readable chunks: E.g., A8F1 - 4C90 - 33E2 - 7B12
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 8).join(''),
    hex.slice(8, 12).join(''),
    hex.slice(12, 16).join('')
  ].join(' - ');
}

/**
 * Derives Short Authentication String (SAS) code and 4 emoji tokens from two peer fingerprints.
 */
export function deriveSasTokens(localFingerprint: string, peerFingerprint: string): { code: string; emojis: string[] } {
  const combined = [localFingerprint, peerFingerprint].sort().join(':');
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  const posHash = Math.abs(hash);

  // Generate 6 digit visual code
  const code = (posHash % 900000 + 100000).toString();

  // Generate 4 distinct emoji tokens
  const emojis = [
    EMOJI_SECURITY_SET[posHash % EMOJI_SECURITY_SET.length],
    EMOJI_SECURITY_SET[(posHash >> 4) % EMOJI_SECURITY_SET.length],
    EMOJI_SECURITY_SET[(posHash >> 8) % EMOJI_SECURITY_SET.length],
    EMOJI_SECURITY_SET[(posHash >> 12) % EMOJI_SECURITY_SET.length]
  ];

  return { code, emojis };
}

/**
 * Encrypts a text message or payload using AES-GCM (256-bit).
 */
export async function encryptPayloadWithKey(aesKey: CryptoKey, plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    enc.encode(plaintext)
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: Array.from(iv, b => b.toString(16).padStart(2, '0')).join('')
  };
}

/**
 * Decrypts an AES-GCM payload.
 */
export async function decryptPayloadWithKey(aesKey: CryptoKey, ciphertext: string, ivHex: string): Promise<string> {
  const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const binary = atob(ciphertext);
  const data = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    data[i] = binary.charCodeAt(i);
  }

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    data
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Generates an ephemeral session AES-256-GCM key for simulated audio packets & whispers.
 */
export async function generateSessionAesKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Strips private RFC1918 LAN addresses and internal host topologies from WebRTC
 * ICE candidates to prevent peer reconnaissance and private network mapping.
 */
export function sanitizeIceCandidate(candidateStr: string): string | null {
  if (!candidateStr) return null;
  // Check for private subnet patterns or local mDNS identifiers
  const isPrivate = /(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.0\.0\.1|\.local|fe80:)/i.test(candidateStr);
  if (/typ host/i.test(candidateStr) && isPrivate) {
    return null; // Block internal LAN IP leakage
  }
  return candidateStr;
}

/**
 * Securely overwrites a memory buffer with zeroes to prevent memory-dump forensic scraping.
 */
export function secureScrubMemory(buffer: Uint8Array): void {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = (Math.random() * 256) | 0;
  }
  buffer.fill(0);
}

/**
 * Computes a SHA-256 integrity digest for payload authentication.
 */
export async function hashPayloadSha256(data: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

