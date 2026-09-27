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

// Dynamically resolve local config without breaking when firebase-applet-config.json is gitignored
const localConfigs = import.meta.glob<Record<string, string>>('../../firebase-applet-config.json', { 
  eager: true, 
  import: 'default' 
});
const fileConfig = (localConfigs['../../firebase-applet-config.json'] as Record<string, string>) || {};

const activeConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || fileConfig.apiKey || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || fileConfig.authDomain || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || fileConfig.projectId || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || fileConfig.storageBucket || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || fileConfig.messagingSenderId || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || fileConfig.appId || '',
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || fileConfig.firestoreDatabaseId || '',
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp({
    apiKey: activeConfig.apiKey,
    authDomain: activeConfig.authDomain,
    projectId: activeConfig.projectId,
    storageBucket: activeConfig.storageBucket,
    messagingSenderId: activeConfig.messagingSenderId,
    appId: activeConfig.appId,
  });
} else {
  app = getApp();
}

export const auth: Auth = getAuth(app);

// Initialize Firestore with auto-detect long-polling to prevent [code=unavailable] in preview iframes
export const db: Firestore = (() => {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    }, activeConfig.firestoreDatabaseId || '(default)');
  } catch {
    return activeConfig.firestoreDatabaseId
      ? getFirestore(app, activeConfig.firestoreDatabaseId)
      : getFirestore(app);
  }
})();

// Skill mandated validation: test connection on startup
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore operating in offline resilience mode.');
    }
  }
}
testConnection();

// Ensure background auth is initialized gracefully without blocking or hanging Firestore calls
let authReadyPromise: Promise<void> | null = null;
export async function ensureAuthReady(): Promise<void> {
  if (auth.currentUser) return;
  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      // 300ms maximum safety timeout: Firestore rules (allow read, write: if true;) 
      // never require auth, so we never hang the app if auth state takes time or is restricted.
      const timer = setTimeout(() => {
        resolve();
      }, 300);

      try {
        const unsub = onAuthStateChanged(auth, async (user) => {
          clearTimeout(timer);
          if (!user) {
            try {
              await signInAnonymously(auth);
            } catch {
              // Ignore anonymous auth failure: rules allow public access
            }
          }
          unsub();
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
      try {
        const userRef = doc(db, 'users', user.id);
        await setDoc(userRef, {
          id: user.id,
          username: user.username,
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
          updatedAt: Date.now()
        }, { merge: true });
      } catch (err) {
        console.warn('Sync user doc error:', err);
      }

      // 2. Register unique username to prevent duplicate aliases
      const cleanUsername = user.username.trim().toLowerCase();
      if (cleanUsername) {
        try {
          const usernameRef = doc(db, 'usernames', cleanUsername);
          await setDoc(usernameRef, {
            userId: user.id,
            username: cleanUsername,
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
   * Checks whether a username is already taken by any user across Cloud Firestore.
   */
  static async isUsernameTaken(username: string): Promise<boolean> {
    try {
      await ensureAuthReady();
      const clean = username.trim().toLowerCase();
      if (!clean) return false;

      // 1. Direct document lookup in unique usernames registry
      try {
        const usernameRef = doc(db, 'usernames', clean);
        const usernameSnap = await getDoc(usernameRef);
        if (usernameSnap.exists()) {
          return true;
        }
      } catch {}

      // 2. Query 'users' collection to catch any records
      try {
        const q = query(collection(db, 'users'), where('username', '==', clean));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const existingData = snapshot.docs[0].data() as User;
          setDoc(doc(db, 'usernames', clean), {
            userId: existingData.id,
            username: clean,
            assignedNumber: existingData.assignedNumber || '',
            claimedAt: Date.now()
          }).catch(() => {});
          return true;
        }
      } catch {}

      return false;
    } catch (e) {
      console.warn('isUsernameTaken check error:', e);
      return false;
    }
  }

  /**
   * Claims a username in Firestore during registration.
   */
  static async claimUsername(username: string, userId: string, assignedNumber: string): Promise<boolean> {
    try {
      await ensureAuthReady();
      const clean = username.trim().toLowerCase();
      const usernameRef = doc(db, 'usernames', clean);
      await setDoc(usernameRef, {
        userId,
        username: clean,
        assignedNumber,
        claimedAt: Date.now()
      });
      return true;
    } catch (e) {
      console.warn('claimUsername error:', e);
      return false;
    }
  }

  /**
   * Queries users from Firestore by username.
   */
  static async findUserByUsername(username: string): Promise<User | null> {
    try {
      await ensureAuthReady();
      const clean = username.toLowerCase().trim().replace(/^@/, '');

      // Check system users
      const sys = SYSTEM_REGISTERED_USERS.find(u => u.username.toLowerCase() === clean);
      if (sys) return sys;

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

      // Query 'users' collection
      try {
        const q = query(collection(db, 'users'), where('username', '==', clean));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          return snapshot.docs[0].data() as User;
        }
      } catch {}

      return null;
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
      await ensureAuthReady();
      const cleanPhone = phone.trim();
      const cleanAlias = cleanPhone.toLowerCase().replace(/^@/, '');
      const targetDigits = cleanPhone.replace(/\D/g, '');
      const digits10 = targetDigits.length === 11 && targetDigits.startsWith('1') 
        ? targetDigits.slice(1) 
        : targetDigits.length >= 10 ? targetDigits.slice(-10) : targetDigits;

      // 0. Check pre-registered system nodes
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

        try {
          const d11Q = query(collection(db, 'users'), where('normalizedDigits', '==', `1${digits10}`));
          const d11Snap = await getDocs(d11Q);
          if (!d11Snap.empty) {
            return d11Snap.docs[0].data() as User;
          }
        } catch {}
      }

      if (targetDigits && targetDigits.length >= 7) {
        try {
          const digitsQ = query(collection(db, 'users'), where('normalizedDigits', '==', targetDigits));
          const digitsSnap = await getDocs(digitsQ);
          if (!digitsSnap.empty) {
            return digitsSnap.docs[0].data() as User;
          }
        } catch {}
      }

      // 4. Query by username if dialed by alias (e.g. '@bob' or 'bob')
      if (cleanAlias && cleanAlias.length >= 3) {
        const userByUname = await this.findUserByUsername(cleanAlias);
        if (userByUname) return userByUname;
      }

      // 5. Fallback scan all users to compare normalized digits or partial match
      try {
        const allQ = query(collection(db, 'users'));
        const allSnap = await getDocs(allQ);
        for (const d of allSnap.docs) {
          const u = d.data() as User;
          if (u.username && u.username.toLowerCase() === cleanAlias) {
            return u;
          }
          if (u.assignedNumber) {
            const userDigits = u.assignedNumber.replace(/\D/g, '');
            const userDigits10 = userDigits.length === 11 && userDigits.startsWith('1') ? userDigits.slice(1) : userDigits.slice(-10);
            if (
              userDigits === targetDigits ||
              userDigits10 === digits10 ||
              (digits10.length === 10 && userDigits10 === digits10) ||
              (digits10.length >= 7 && (userDigits.endsWith(digits10) || digits10.endsWith(userDigits10)))
            ) {
              return u;
            }
          }
        }
      } catch {}

      return null;
    } catch (e) {
      console.warn('findUserByPhoneNumber error:', e);
      // Even on Firestore exception, return system user if it matches
      const cleanAlias = phone.trim().toLowerCase().replace(/^@/, '');
      const targetDigits = phone.replace(/\D/g, '');
      const digits10 = targetDigits.length === 11 && targetDigits.startsWith('1') ? targetDigits.slice(1) : targetDigits.slice(-10);
      for (const sys of SYSTEM_REGISTERED_USERS) {
        if (sys.username.toLowerCase() === cleanAlias) return sys;
        const sysDigits = sys.assignedNumber.replace(/\D/g, '');
        const sysDigits10 = sysDigits.length === 11 && sysDigits.startsWith('1') ? sysDigits.slice(1) : sysDigits;
        if (
          sysDigits === targetDigits || 
          sysDigits10 === digits10 || 
          (digits10.length >= 7 && sysDigits.endsWith(digits10))
        ) {
          return sys;
        }
      }
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
      await ensureAuthReady();
      const q = query(collection(db, 'call_records'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      const records: CallRecord[] = [];
      snapshot.forEach(docSnap => {
        records.push(docSnap.data() as CallRecord);
      });
      return records.sort((a, b) => b.timestamp - a.timestamp);
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
   * Broadcasts a real-time call offer signal to ring a recipient's physical device anywhere in the world.
   */
  static async dispatchCallSignal(signal: {
    targetNumber: string;
    callerNumber: string;
    callerAlias: string;
    roomNumber: string;
    type: 'call_offer' | 'call_decline' | 'call_accept';
  }): Promise<string> {
    try {
      await ensureAuthReady();
      const signalRef = await addDoc(collection(db, 'signals'), {
        ...signal,
        timestamp: Date.now(),
      });
      return signalRef.id;
    } catch {
      return '';
    }
  }

  /**
   * Listens in real-time to incoming call signals targeted to this user's assigned virtual number.
   * Matches both formatted string and raw digits.
   */
  static subscribeToIncomingCalls(
    assignedNumber: string,
    onIncoming: (call: { roomNumber: string; callerNumber: string; callerAlias: string; timestamp: number; signalId: string }) => void
  ): Unsubscribe {
    const cleanDigits = assignedNumber.replace(/\D/g, '');
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
          const targetDigits = target.replace(/\D/g, '');

          // Check if signal matches user's number
          const matches = target === assignedNumber ||
            (targetDigits.length >= 7 && (cleanDigits === targetDigits || cleanDigits.endsWith(targetDigits) || targetDigits.endsWith(cleanDigits)));

          if (matches) {
            // Only trigger if signal was created recently (within last 60 seconds)
            if (now - data.timestamp < 60000) {
              onIncoming({
                roomNumber: data.roomNumber,
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
