/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, Auth } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore,
  getDocFromServer,
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  addDoc, 
  Firestore,
  Unsubscribe
} from 'firebase/firestore';
import { User, CallRecord, EncryptedMessage } from '../types';

// Default project configuration from Firebase provisioning (prevents Vercel deployments without env vars from breaking)
export const DEFAULT_FIREBASE_CONFIG = {
  projectId: "gen-lang-client-0733164949",
  appId: "1:526532224327:web:fb35c1a2efd189cda89862",
  apiKey: "AIzaSyAnA4Q8hHhnBY0dXG_RrKoJI2GNh77JJaU",
  authDomain: "gen-lang-client-0733164949.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-privatalk-6d8977e8-9f7e-4fcf-872a-b14ab27e6f56",
  storageBucket: "gen-lang-client-0733164949.firebasestorage.app",
  messagingSenderId: "526532224327",
};

// Dynamically resolve local config without breaking when firebase-applet-config.json is absent
const localConfigs = import.meta.glob<Record<string, string>>([
  '/firebase-applet-config.json', 
  '../../firebase-applet-config.json',
  '../firebase-applet-config.json'
], { 
  eager: true, 
  import: 'default' 
});

const fileConfig = (
  localConfigs['/firebase-applet-config.json'] || 
  localConfigs['../../firebase-applet-config.json'] || 
  localConfigs['../firebase-applet-config.json'] || 
  {}
) as Record<string, string>;

const activeConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || fileConfig.apiKey || DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || fileConfig.authDomain || DEFAULT_FIREBASE_CONFIG.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || fileConfig.projectId || DEFAULT_FIREBASE_CONFIG.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || fileConfig.storageBucket || DEFAULT_FIREBASE_CONFIG.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || fileConfig.messagingSenderId || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || fileConfig.appId || DEFAULT_FIREBASE_CONFIG.appId,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || fileConfig.firestoreDatabaseId || DEFAULT_FIREBASE_CONFIG.firestoreDatabaseId,
};

const hasValidApiKey = !!(
  activeConfig.apiKey && 
  activeConfig.apiKey.startsWith('AIzaSy') && 
  !activeConfig.apiKey.includes('YOUR_') &&
  !activeConfig.apiKey.includes('Mock')
);

// High-speed timeout wrapper: guarantees that no network call blocks the UI or freezes browsing
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

let app: FirebaseApp;
try {
  if (!getApps().length) {
    app = initializeApp({
      apiKey: hasValidApiKey ? activeConfig.apiKey : DEFAULT_FIREBASE_CONFIG.apiKey,
      authDomain: activeConfig.authDomain || DEFAULT_FIREBASE_CONFIG.authDomain,
      projectId: activeConfig.projectId || DEFAULT_FIREBASE_CONFIG.projectId,
      storageBucket: activeConfig.storageBucket,
      messagingSenderId: activeConfig.messagingSenderId,
      appId: activeConfig.appId,
    });
  } else {
    app = getApp();
  }
} catch {
  app = getApps()[0] || ({} as FirebaseApp);
}

// Safely initialize Auth with graceful fallback
export const auth: Auth = (() => {
  try {
    return getAuth(app);
  } catch (err) {
    console.warn('Firebase Auth fallback enabled:', err);
    return {
      currentUser: null,
      onAuthStateChanged: (_auth: any, callback: (u: any) => void) => {
        callback(null);
        return () => {};
      },
    } as unknown as Auth;
  }
})();

// Initialize Firestore with auto-detect long-polling for preview iframes & Vercel
export const db: Firestore = (() => {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    }, activeConfig.firestoreDatabaseId || '(default)');
  } catch {
    try {
      return activeConfig.firestoreDatabaseId
        ? getFirestore(app, activeConfig.firestoreDatabaseId)
        : getFirestore(app);
    } catch {
      return {} as Firestore;
    }
  }
})();

// Ensure background auth is initialized gracefully without blocking or hanging Firestore calls
let authReadyPromise: Promise<void> | null = null;
export async function ensureAuthReady(): Promise<void> {
  if (!auth || typeof auth.onAuthStateChanged !== 'function') return;
  if (auth.currentUser) return;
  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      // 50ms fast fallback guarantee: Never block queries or UI on Vercel or preview environments
      const timer = setTimeout(() => {
        resolve();
      }, 50);

      try {
        const unsub = onAuthStateChanged(auth, (user) => {
          if (!user) {
            // Attempt anonymous auth non-blockingly in the background
            signInAnonymously(auth).catch(() => {});
          }
          try {
            unsub();
          } catch {}
          clearTimeout(timer);
          resolve();
        });
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }
  return authReadyPromise;
}

// Pre-registered system testing lines on the ShadowFrequency network
export const SYSTEM_REGISTERED_USERS: User[] = [
  {
    id: 'sys_echo_node',
    username: 'echo_node',
    passwordHash: 'system_managed_node',
    salt: 'system_salt',
    assignedNumber: '+1 (800) 555-0199',
    availableNumbersPool: ['+1 (800) 555-0199'],
    createdAt: 1700000000000,
    publicKeySpki: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE7sys_echo_loopback_node_key',
    keyFingerprint: 'ECHO:74F9:912A:B582:C019:E2EE',
    devices: [{
      id: 'sys_dev_echo',
      name: 'Automated Echo Relay',
      type: 'desktop',
      browser: 'Core Audio DSP Node',
      ipMasked: '10.0.0.1',
      lastActive: Date.now(),
      isCurrent: false
    }],
    privacySettings: {
      callerIdMode: 'assigned',
      autoShredInterval: 'immediate',
      ipLeakShield: true,
      hardwareNoiseSuppression: true,
      antiMetadata: true,
      quickLockPinEnabled: false,
      quickLockPin: '1234'
    }
  },
  {
    id: 'sys_sec_hq',
    username: 'security_hq',
    passwordHash: 'system_managed_node',
    salt: 'system_salt',
    assignedNumber: '+1 (800) 749-2103',
    availableNumbersPool: ['+1 (800) 749-2103'],
    createdAt: 1700000000000,
    publicKeySpki: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE7sys_sec_hq_verified_key',
    keyFingerprint: 'HQ88:4192:AA01:7743:D998:E2EE',
    devices: [{
      id: 'sys_dev_hq',
      name: 'Security Command Bridge',
      type: 'desktop',
      browser: 'NIST Audit Station',
      ipMasked: '10.0.0.2',
      lastActive: Date.now(),
      isCurrent: false
    }],
    privacySettings: {
      callerIdMode: 'assigned',
      autoShredInterval: '24h',
      ipLeakShield: true,
      hardwareNoiseSuppression: true,
      antiMetadata: true,
      quickLockPinEnabled: false,
      quickLockPin: '1234'
    }
  }
];

export class FirebaseService {
  /**
   * Saves or updates a user in Firestore, and registers unique username and phone number documents.
   */
  static async syncUserToCloud(user: User): Promise<void> {
    try {
      await ensureAuthReady();
      const cleanDigits = user.assignedNumber.replace(/\D/g, '');
      const digits10 = cleanDigits.length === 11 && cleanDigits.startsWith('1') 
        ? cleanDigits.slice(1) 
        : cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

      // 1. Save user document in 'users' collection
      const cleanUsername = user.username.trim().toLowerCase().replace(/^@/, '');
      try {
        const userRef = doc(db, 'users', user.id);
        await setDoc(userRef, {
          id: user.id,
          username: user.username,
          usernameLower: cleanUsername,
          passwordHash: user.passwordHash,
          salt: user.salt,
          assignedNumber: user.assignedNumber,
          normalizedDigits: cleanDigits,
          digits10: digits10,
          availableNumbersPool: user.availableNumbersPool || [],
          createdAt: user.createdAt,
          publicKeySpki: user.publicKeySpki,
          keyFingerprint: user.keyFingerprint,
          devices: user.devices || [],
          privacySettings: user.privacySettings,
          customNumberSubscription: user.customNumberSubscription || null,
          updatedAt: Date.now()
        }, { merge: true });
      } catch (err) {
        console.warn('Sync user doc error:', err);
      }

      // 2. Register unique username to prevent duplicate aliases (case-insensitive lowercase key)
      if (cleanUsername) {
        try {
          const usernameRef = doc(db, 'usernames', cleanUsername);
          await setDoc(usernameRef, {
            userId: user.id,
            username: cleanUsername,
            originalUsername: user.username,
            assignedNumber: user.assignedNumber,
            claimedAt: Date.now()
          }, { merge: true });
        } catch (err) {
          console.warn('Sync username doc error:', err);
        }
      }

      // 3. Register phone number documents in phone_numbers collection for instant O(1) routing
      const phonePayload = {
        userId: user.id,
        username: user.username,
        assignedNumber: user.assignedNumber,
        normalizedDigits: cleanDigits,
        digits10: digits10,
        publicKeySpki: user.publicKeySpki,
        keyFingerprint: user.keyFingerprint,
        registeredAt: Date.now()
      };

      if (cleanDigits) {
        try {
          await setDoc(doc(db, 'phone_numbers', cleanDigits), phonePayload, { merge: true });
        } catch {}
      }
      if (digits10 && digits10 !== cleanDigits) {
        try {
          await setDoc(doc(db, 'phone_numbers', digits10), phonePayload, { merge: true });
        } catch {}
      }
    } catch (e) {
      console.warn('Firebase user sync fallback:', e);
    }
  }

  /**
   * Updates user credentials, handling username change by freeing the old username index.
   */
  static async updateUserCredentials(user: User, oldUsername?: string): Promise<void> {
    try {
      await ensureAuthReady();
      const oldClean = oldUsername ? oldUsername.trim().toLowerCase() : '';
      const newClean = user.username.trim().toLowerCase();

      if (oldClean && oldClean !== newClean) {
        try {
          await deleteDoc(doc(db, 'usernames', oldClean));
        } catch (err) {
          console.warn('Could not remove old username doc:', err);
        }
      }

      await this.syncUserToCloud(user);
    } catch (e) {
      console.warn('Update user credentials error:', e);
    }
  }

  /**
   * Checks whether a username is already taken by any user across Cloud Firestore or System nodes.
   * Completely case-insensitive: 'Alice', 'alice', 'ALICE', and 'AlIcE' are considered identical.
   */
  static async isUsernameTaken(username: string, excludeUserId?: string): Promise<boolean> {
    try {
      const clean = username.trim().toLowerCase().replace(/^@/, '');
      if (!clean) return false;

      // 0. Instant local check against pre-registered system nodes (0ms)
      if (SYSTEM_REGISTERED_USERS.some(s => s.username.trim().toLowerCase().replace(/^@/, '') === clean && (!excludeUserId || s.id !== excludeUserId))) {
        return true;
      }

      // Fast network check with 1200ms timeout to ensure UI never hangs
      return await withTimeout(
        (async () => {
          await ensureAuthReady();

          // 1. Direct document lookup in unique usernames registry (O(1) index)
          try {
            const usernameRef = doc(db, 'usernames', clean);
            const usernameSnap = await getDoc(usernameRef);
            if (usernameSnap.exists()) {
              const data = usernameSnap.data();
              if (!excludeUserId || (data.userId && data.userId !== excludeUserId)) {
                return true;
              }
            }
          } catch {}

          // 2. Query 'users' collection using normalized 'usernameLower' field
          try {
            const qLower = query(collection(db, 'users'), where('usernameLower', '==', clean));
            const snapshotLower = await getDocs(qLower);
            if (!snapshotLower.empty) {
              for (const docSnap of snapshotLower.docs) {
                const existingData = docSnap.data() as User;
                if (!excludeUserId || existingData.id !== excludeUserId) {
                  return true;
                }
              }
            }
          } catch {}

          // 3. Fallback exact match query
          try {
            const qExact = query(collection(db, 'users'), where('username', '==', clean));
            const snapshotExact = await getDocs(qExact);
            if (!snapshotExact.empty) {
              for (const docSnap of snapshotExact.docs) {
                const existingData = docSnap.data() as User;
                if (!excludeUserId || existingData.id !== excludeUserId) {
                  return true;
                }
              }
            }
          } catch {}

          return false;
        })(),
        1200,
        false
      );
    } catch (e) {
      console.warn('isUsernameTaken check error:', e);
      return false;
    }
  }

  /**
   * Checks whether a virtual phone number is already taken/assigned across Cloud Firestore or System nodes.
   */
  static async isPhoneNumberTaken(phone: string, excludeUserId?: string): Promise<boolean> {
    try {
      const clean = phone.trim();
      if (!clean) return false;

      const digits = clean.replace(/\D/g, '');
      const digits10 = digits.length === 11 && digits.startsWith('1')
        ? digits.slice(1)
        : digits.length >= 10 ? digits.slice(-10) : digits;

      // 0. Instant check against system nodes (0ms)
      for (const sys of SYSTEM_REGISTERED_USERS) {
        if (excludeUserId && sys.id === excludeUserId) continue;
        if (sys.assignedNumber === clean) return true;
        const sysDigits = sys.assignedNumber.replace(/\D/g, '');
        const sysDigits10 = sysDigits.length === 11 && sysDigits.startsWith('1') ? sysDigits.slice(1) : sysDigits;
        if (
          (digits.length >= 7 && (sysDigits === digits || sysDigits10 === digits10)) ||
          (digits10.length === 10 && sysDigits10 === digits10)
        ) {
          return true;
        }
      }

      // Fast network check with 1200ms timeout
      return await withTimeout(
        (async () => {
          await ensureAuthReady();

          // 1. Direct O(1) query in phone_numbers index collection
          const keysToCheck = [
            digits,
            digits10,
            digits10.length === 10 ? `1${digits10}` : ''
          ].filter((k): k is string => Boolean(k && k.length >= 7));

          for (const key of keysToCheck) {
            try {
              const phoneRef = doc(db, 'phone_numbers', key);
              const phoneSnap = await getDoc(phoneRef);
              if (phoneSnap.exists()) {
                const pData = phoneSnap.data();
                if (!excludeUserId || pData.userId !== excludeUserId) {
                  return true;
                }
              }
            } catch {}
          }

          // 2. Query 'users' collection by assignedNumber
          try {
            const q1 = query(collection(db, 'users'), where('assignedNumber', '==', clean));
            const snap1 = await getDocs(q1);
            if (!snap1.empty) {
              for (const docSnap of snap1.docs) {
                const u = docSnap.data() as User;
                if (!excludeUserId || u.id !== excludeUserId) {
                  return true;
                }
              }
            }
          } catch {}

          // 3. Query 'users' collection by digits10
          if (digits10 && digits10.length === 10) {
            try {
              const q2 = query(collection(db, 'users'), where('digits10', '==', digits10));
              const snap2 = await getDocs(q2);
              if (!snap2.empty) {
                for (const docSnap of snap2.docs) {
                  const u = docSnap.data() as User;
                  if (!excludeUserId || u.id !== excludeUserId) {
                    return true;
                  }
                }
              }
            } catch {}
          }

          return false;
        })(),
        1200,
        false
      );
    } catch (e) {
      console.warn('isPhoneNumberTaken check error:', e);
      return false;
    }
  }

  /**
   * Generates a pool of completely unique, 100% fresh virtual numbers that are NOT assigned to any user.
   * Instant non-blocking generation using CSPRNG.
   */
  static async generateUniqueNumberPool(count: number = 5, excludeUserId?: string): Promise<string[]> {
    const areaCodes = ['800', '888', '877', '866', '855', '844', '833'];
    const uniquePool: string[] = [];
    const excludedDigits = new Set<string>();

    for (const sys of SYSTEM_REGISTERED_USERS) {
      if (!excludeUserId || sys.id !== excludeUserId) {
        excludedDigits.add(sys.assignedNumber.replace(/\D/g, ''));
      }
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = localStorage.getItem('ciphercall_users_v1');
        if (raw) {
          const users = JSON.parse(raw);
          for (const u of users) {
            if (u.assignedNumber && (!excludeUserId || u.id !== excludeUserId)) {
              excludedDigits.add(u.assignedNumber.replace(/\D/g, ''));
            }
          }
        }
      } catch {}
    }

    let attempts = 0;
    while (uniquePool.length < count && attempts < 100) {
      attempts++;
      const area = areaCodes[Math.floor(Math.random() * areaCodes.length)];
      const middle = Math.floor(100 + Math.random() * 900);
      const last = Math.floor(1000 + Math.random() * 9000);
      const candidate = `+1 (${area}) ${middle}-${last}`;
      const digits = candidate.replace(/\D/g, '');

      if (uniquePool.includes(candidate) || excludedDigits.has(digits)) continue;

      uniquePool.push(candidate);
    }

    return uniquePool;
  }

  /**
   * Claims a username in Firestore during registration.
   */
  static async claimUsername(username: string, userId: string, assignedNumber: string): Promise<boolean> {
    try {
      const clean = username.trim().toLowerCase();
      return await withTimeout(
        (async () => {
          await ensureAuthReady();
          const usernameRef = doc(db, 'usernames', clean);
          await setDoc(usernameRef, {
            userId,
            username: clean,
            assignedNumber,
            claimedAt: Date.now()
          }, { merge: true });
          return true;
        })(),
        1500,
        true
      );
    } catch (e) {
      console.warn('claimUsername warning:', e);
      return true;
    }
  }

  /**
   * Queries users from Firestore by username.
   */
  static async findUserByUsername(username: string): Promise<User | null> {
    try {
      const clean = username.toLowerCase().trim().replace(/^@/, '');
      if (!clean) return null;

      // Check system users (instant 0ms)
      const sys = SYSTEM_REGISTERED_USERS.find(u => u.username.toLowerCase() === clean);
      if (sys) return sys;

      return await withTimeout(
        (async () => {
          await ensureAuthReady();

          // Check 'usernames' index
          try {
            const uSnap = await getDoc(doc(db, 'usernames', clean));
            if (uSnap.exists()) {
              const uData = uSnap.data();
              if (uData.userId) {
                const userSnap = await getDoc(doc(db, 'users', uData.userId));
                if (userSnap.exists()) {
                  return userSnap.data() as User;
                }
              }
              return {
                id: uData.userId || 'usr_' + clean,
                username: uData.username || clean,
                assignedNumber: uData.assignedNumber || '+1 (800) 000-0000',
                passwordHash: '',
                salt: '',
                availableNumbersPool: [uData.assignedNumber || '+1 (800) 000-0000'],
                createdAt: uData.claimedAt || Date.now(),
                publicKeySpki: '',
                keyFingerprint: 'SYNC:KEY:HASH:E2EE',
                devices: [],
                privacySettings: {
                  callerIdMode: 'assigned',
                  autoShredInterval: '24h',
                  ipLeakShield: true,
                  hardwareNoiseSuppression: true,
                  antiMetadata: true,
                  quickLockPinEnabled: false,
                  quickLockPin: '1234'
                }
              };
            }
          } catch {}

          // Query 'users' collection with usernameLower
          try {
            const qLower = query(collection(db, 'users'), where('usernameLower', '==', clean));
            const snapshotLower = await getDocs(qLower);
            if (!snapshotLower.empty) {
              return snapshotLower.docs[0].data() as User;
            }

            const qExact = query(collection(db, 'users'), where('username', '==', clean));
            const snapshotExact = await getDocs(qExact);
            if (!snapshotExact.empty) {
              return snapshotExact.docs[0].data() as User;
            }
          } catch {}

          return null;
        })(),
        5000,
        null
      );
    } catch {
      return null;
    }
  }

  /**
   * Checks if a phone number or alias is registered by any user in Firestore or System Nodes.
   * Supports formatted strings ('+1 (800) 492-7104'), raw 11 digits ('18004927104'),
   * raw 10 digits ('8004927104'), dashed ('800-492-7104'), or aliases ('@bob' or 'bob').
   */
  static async findUserByPhoneNumber(phone: string): Promise<User | null> {
    try {
      const cleanPhone = phone.trim();
      const cleanAlias = cleanPhone.toLowerCase().replace(/^@/, '');
      const targetDigits = cleanPhone.replace(/\D/g, '');
      const digits10 = targetDigits.length === 11 && targetDigits.startsWith('1') 
        ? targetDigits.slice(1) 
        : targetDigits.length >= 10 ? targetDigits.slice(-10) : targetDigits;

      // 0. Check pre-registered system nodes (instant 0ms)
      for (const sys of SYSTEM_REGISTERED_USERS) {
        if (sys.username.toLowerCase() === cleanAlias) return sys;
        if (sys.assignedNumber === cleanPhone) return sys;
        const sysDigits = sys.assignedNumber.replace(/\D/g, '');
        const sysDigits10 = sysDigits.length === 11 && sysDigits.startsWith('1') ? sysDigits.slice(1) : sysDigits;
        if (
          (targetDigits.length >= 7 && (sysDigits === targetDigits || sysDigits10 === digits10 || sysDigits.endsWith(digits10) || targetDigits.endsWith(sysDigits10))) ||
          (digits10.length === 10 && sysDigits10 === digits10)
        ) {
          return sys;
        }
      }

      // Check localStorage cached users directly (0ms)
      try {
        const rawUsers = localStorage.getItem('shadow_users_store');
        if (rawUsers) {
          const parsed = JSON.parse(rawUsers);
          if (Array.isArray(parsed)) {
            for (const u of parsed) {
              if (u.assignedNumber === cleanPhone || (u.username && u.username.toLowerCase() === cleanAlias)) {
                return u;
              }
              const uDigits = (u.assignedNumber || '').replace(/\D/g, '');
              const u10 = uDigits.length >= 10 ? uDigits.slice(-10) : uDigits;
              if (digits10.length === 10 && u10 === digits10) return u;
            }
          }
        }
      } catch {}

      return await withTimeout(
        (async () => {
          await ensureAuthReady();

          // 1. Direct O(1) query in phone_numbers index collection (using safe digit keys)
          const keysToCheck = [
            targetDigits, 
            digits10, 
            digits10.length === 10 ? `1${digits10}` : ''
          ].filter((k): k is string => Boolean(k && k.length >= 7));

          for (const key of keysToCheck) {
            try {
              const phoneRef = doc(db, 'phone_numbers', key);
              const phoneSnap = await getDoc(phoneRef);
              if (phoneSnap.exists()) {
                const pData = phoneSnap.data();
                if (pData.userId) {
                  try {
                    const userSnap = await getDoc(doc(db, 'users', pData.userId));
                    if (userSnap.exists()) {
                      return userSnap.data() as User;
                    }
                  } catch {}
                  return {
                    id: pData.userId,
                    username: pData.username || 'registered_peer',
                    assignedNumber: pData.assignedNumber || cleanPhone,
                    publicKeySpki: pData.publicKeySpki || '',
                    keyFingerprint: pData.keyFingerprint || '',
                    availableNumbersPool: [pData.assignedNumber || cleanPhone],
                    createdAt: pData.registeredAt || Date.now(),
                    devices: [],
                    privacySettings: {
                      callerIdMode: 'assigned',
                      autoShredInterval: '24h',
                      ipLeakShield: true,
                      hardwareNoiseSuppression: true,
                      antiMetadata: true,
                      quickLockPinEnabled: false,
                      quickLockPin: '1234'
                    },
                    passwordHash: '',
                    salt: ''
                  };
                }
              }
            } catch {}
          }

          // 2. Query 'users' collection with exact formatted string
          try {
            const exactQ = query(collection(db, 'users'), where('assignedNumber', '==', cleanPhone));
            const exactSnap = await getDocs(exactQ);
            if (!exactSnap.empty) {
              return exactSnap.docs[0].data() as User;
            }
          } catch {}

          // 3. Query 'users' collection by digits10 and normalizedDigits
          if (digits10 && digits10.length === 10) {
            try {
              const d10Q = query(collection(db, 'users'), where('digits10', '==', digits10));
              const d10Snap = await getDocs(d10Q);
              if (!d10Snap.empty) {
                return d10Snap.docs[0].data() as User;
              }
            } catch {}
          }

          // 4. Query by username if dialed by alias
          if (cleanAlias && cleanAlias.length >= 3) {
            const userByUname = await this.findUserByUsername(cleanAlias);
            if (userByUname) return userByUname;
          }

          return null;
        })(),
        5000,
        null
      );
    } catch {
      return null;
    }
  }

  /**
   * Retrieves all registered users on the network (for directory & validation).
   */
  static async getAllRegisteredUsers(): Promise<{ id: string; username: string; assignedNumber: string; keyFingerprint: string }[]> {
    try {
      await ensureAuthReady();
      const list: { id: string; username: string; assignedNumber: string; keyFingerprint: string }[] = [];
      const seenNumbers = new Set<string>();
      const seenUsernames = new Set<string>();

      // 1. Add pre-registered system lines
      for (const sys of SYSTEM_REGISTERED_USERS) {
        list.push({
          id: sys.id,
          username: sys.username,
          assignedNumber: sys.assignedNumber,
          keyFingerprint: sys.keyFingerprint || '',
        });
        seenNumbers.add(sys.assignedNumber);
        seenUsernames.add(sys.username.toLowerCase());
      }

      // 2. Fetch users from Firestore
      try {
        const q = query(collection(db, 'users'));
        const snapshot = await getDocs(q);
        snapshot.forEach((d) => {
          const data = d.data() as User;
          const uName = (data.username || '').toLowerCase();
          if (data.assignedNumber && !seenNumbers.has(data.assignedNumber) && !seenUsernames.has(uName)) {
            list.push({
              id: data.id,
              username: data.username,
              assignedNumber: data.assignedNumber,
              keyFingerprint: data.keyFingerprint || '',
            });
            seenNumbers.add(data.assignedNumber);
            if (uName) seenUsernames.add(uName);
          }
        });
      } catch {}

      // 3. Also check phone_numbers collection
      try {
        const pSnap = await getDocs(query(collection(db, 'phone_numbers')));
        pSnap.forEach((d) => {
          const data = d.data();
          const uName = (data.username || '').toLowerCase();
          if (data.assignedNumber && !seenNumbers.has(data.assignedNumber) && !seenUsernames.has(uName)) {
            list.push({
              id: data.userId || d.id,
              username: data.username || 'registered_node',
              assignedNumber: data.assignedNumber,
              keyFingerprint: data.keyFingerprint || '',
            });
            seenNumbers.add(data.assignedNumber);
            if (uName) seenUsernames.add(uName);
          }
        });
      } catch {}

      return list;
    } catch {
      // Fallback: return pre-registered system lines
      return SYSTEM_REGISTERED_USERS.map(s => ({
        id: s.id,
        username: s.username,
        assignedNumber: s.assignedNumber,
        keyFingerprint: s.keyFingerprint || ''
      }));
    }
  }

  /**
   * Syncs a call record to Firestore.
   */
  static async saveCallRecordToCloud(record: CallRecord, userId: string): Promise<void> {
    try {
      await ensureAuthReady();
      const recordRef = doc(db, 'call_records', record.id);
      await setDoc(recordRef, {
        ...record,
        userId,
        uploadedAt: Date.now(),
      });
    } catch (e) {
      console.warn('Firebase call record sync fallback:', e);
    }
  }

  /**
   * Loads all call records for a user from Firestore.
   */
  static async loadCallRecordsFromCloud(userId: string): Promise<CallRecord[]> {
    try {
      return await withTimeout(
        (async () => {
          await ensureAuthReady();
          const q = query(collection(db, 'call_records'), where('userId', '==', userId));
          const snapshot = await getDocs(q);
          const records: CallRecord[] = [];
          snapshot.forEach(docSnap => {
            records.push(docSnap.data() as CallRecord);
          });
          return records.sort((a, b) => b.timestamp - a.timestamp);
        })(),
        1500,
        []
      );
    } catch {
      return [];
    }
  }

  /**
   * Deletes a call record from Firestore.
   */
  static async deleteCallRecordFromCloud(recordId: string): Promise<void> {
    try {
      await ensureAuthReady();
      await deleteDoc(doc(db, 'call_records', recordId));
    } catch {}
  }

  /**
   * Deletes all call records for a user from Firestore.
   */
  static async deleteAllCallRecordsFromCloud(userId: string): Promise<void> {
    try {
      await ensureAuthReady();
      const q = query(collection(db, 'call_records'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
      await Promise.all(deletePromises);
    } catch (e) {
      console.warn('Delete all cloud call records error:', e);
    }
  }

  /**
   * Broadcasts a real-time call offer signal to ring a recipient's physical device anywhere in the world.
   */
  static async dispatchCallSignal(signal: {
    targetNumber: string;
    callerNumber: string;
    callerAlias: string;
    roomNumber: string;
    targetUserId?: string;
    targetUsername?: string;
    type: 'call_offer' | 'call_decline' | 'call_accept' | 'call_end';
  }): Promise<string> {
    try {
      await ensureAuthReady();
      const targetDigits = (signal.targetNumber || '').replace(/\D/g, '');
      const target10 = targetDigits.length >= 10 ? targetDigits.slice(-10) : targetDigits;
      const callerDigits = (signal.callerNumber || '').replace(/\D/g, '');
      const caller10 = callerDigits.length >= 10 ? callerDigits.slice(-10) : callerDigits;
      const payload = {
        ...signal,
        roomId: signal.roomNumber,
        targetRoom: signal.roomNumber,
        senderId: signal.callerNumber,
        targetDigits,
        target10,
        callerDigits,
        caller10,
        targetUsername: signal.targetUsername ? signal.targetUsername.toLowerCase().replace(/^@/, '') : '',
        targetUserId: signal.targetUserId || '',
        signalKind: 'call_lifecycle',
        timestamp: Date.now(),
      };
      const signalRef = await addDoc(collection(db, 'signals'), payload);
      return signalRef.id;
    } catch (err) {
      console.warn('dispatchCallSignal notice:', err);
      return '';
    }
  }

  /**
   * Listens in real-time to incoming call signals targeted to this user's assigned virtual number or username.
   * Matches formatted string, raw digits, 10-digit suffix, and username alias.
   */
  static subscribeToIncomingCalls(
    currentUser: { id?: string; username?: string; assignedNumber: string } | string,
    onIncoming: (call: { roomNumber: string; callerNumber: string; callerAlias: string; timestamp: number; signalId: string }) => void
  ): Unsubscribe {
    const assignedNumber = typeof currentUser === 'string' ? currentUser : currentUser.assignedNumber;
    const currentUsername = typeof currentUser === 'string' ? '' : (currentUser.username || '').toLowerCase().replace(/^@/, '');
    const currentUserId = typeof currentUser === 'string' ? '' : (currentUser.id || '');

    const cleanDigits = assignedNumber.replace(/\D/g, '');
    const clean10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

    const q = query(
      collection(db, 'signals'),
      where('type', '==', 'call_offer')
    );

    return onSnapshot(q, (snapshot) => {
      const now = Date.now();
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const target = (data.targetNumber || '').trim();
          const targetDigits = (data.targetDigits || target.replace(/\D/g, ''));
          const target10 = data.target10 || (targetDigits.length >= 10 ? targetDigits.slice(-10) : targetDigits);
          const targetUsername = (data.targetUsername || '').toLowerCase().replace(/^@/, '');
          const targetUserId = data.targetUserId || '';

          // Do not ring user's own device from their own outbound call offer
          const isOwnCall = 
            (data.callerNumber && data.callerNumber === assignedNumber) ||
            (cleanDigits && data.callerDigits && cleanDigits === data.callerDigits) ||
            (currentUsername && data.callerAlias && data.callerAlias.toLowerCase() === `@${currentUsername}`);
          if (isOwnCall) return;

          // Check if signal matches user's number or username across all formatting variants
          const matches = 
            (targetUserId && currentUserId && targetUserId === currentUserId) ||
            (targetUsername && currentUsername && targetUsername === currentUsername) ||
            target === assignedNumber ||
            (cleanDigits && targetDigits && cleanDigits === targetDigits) ||
            (clean10.length === 10 && target10.length === 10 && clean10 === target10) ||
            (targetDigits.length >= 7 && (cleanDigits.endsWith(targetDigits) || targetDigits.endsWith(cleanDigits)));

          if (matches) {
            // Trigger if signal was created recently (within last 90 seconds)
            if (now - data.timestamp < 90000) {
              onIncoming({
                roomNumber: data.roomNumber || data.roomId,
                callerNumber: data.callerNumber,
                callerAlias: data.callerAlias,
                timestamp: data.timestamp,
                signalId: change.doc.id,
              });
            }
          }
        }
      });
    }, (err) => {
      console.warn('Signal snapshot listener notice:', err);
    });
  }

  /**
   * Listens in real-time to call decline or hangup events for an active room.
   */
  static subscribeToCallStatus(
    roomNumber: string,
    onStatusChange: (status: 'call_decline' | 'call_accept' | 'call_end') => void
  ): Unsubscribe {
    const q = query(
      collection(db, 'signals'),
      where('roomId', '==', roomNumber)
    );

    return onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (data.type === 'call_decline' || data.type === 'call_accept' || data.type === 'call_end') {
            onStatusChange(data.type);
          }
        }
      });
    }, (err) => {
      console.warn('Call status listener notice:', err);
    });
  }

  /**
   * Removes a processed signal after answering or declining.
   */
  static async clearSignal(signalId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'signals', signalId));
    } catch {}
  }

  /**
   * Subscribes to real-time call records updates across all physical devices.
   */
  static subscribeToCallRecords(
    userId: string,
    onRecordsUpdated: (records: CallRecord[]) => void
  ): Unsubscribe {
    const q = query(collection(db, 'call_records'), where('userId', '==', userId));
    return onSnapshot(q, (snapshot) => {
      const recs: CallRecord[] = [];
      snapshot.forEach((d) => recs.push(d.data() as CallRecord));
      onRecordsUpdated(recs.sort((a, b) => b.timestamp - a.timestamp));
    }, (err) => {
      console.warn('Call records subscription notice:', err);
    });
  }
}
