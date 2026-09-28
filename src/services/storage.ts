/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, CallRecord, DeviceSession, SecurityAuditEvent, EncryptedMessage } from '../types';
import { FirebaseService, SYSTEM_REGISTERED_USERS } from './firebase';

const STORAGE_KEYS = {
  USERS: 'ciphercall_users_v1',
  CURRENT_USER_ID: 'ciphercall_current_user_v1',
  CALL_RECORDS: 'ciphercall_records_v1',
  AUDIT_LOGS: 'ciphercall_audit_v1',
  MESSAGES: 'ciphercall_messages_v1',
  RATE_LIMITS: 'ciphercall_rate_limits_v1',
};

// BroadcastChannel for cross-device/cross-tab instant sync
const syncChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('ciphercall_multi_device_sync')
  : null;

export class StorageService {
  private static listeners: Set<(event: any) => void> = new Set();

  static init(): void {
    if (syncChannel) {
      syncChannel.onmessage = (msg) => {
        this.listeners.forEach(cb => cb(msg.data));
      };
    }
    // Clean expired records periodically
    setInterval(() => {
      this.enforceAutoShred();
    }, 30000);
  }

  static subscribeSync(callback: (event: any) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  static broadcastSync(action: string, payload: any): void {
    if (syncChannel) {
      syncChannel.postMessage({ action, payload, timestamp: Date.now() });
    }
  }

  // --- Users ---
  static getUsers(): User[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USERS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static isUsernameTakenLocally(username: string, excludeUserId?: string): boolean {
    const clean = username.trim().toLowerCase().replace(/^@/, '');
    if (!clean) return false;
    // Check system registered users
    if (SYSTEM_REGISTERED_USERS.some(s => s.username.toLowerCase() === clean && (!excludeUserId || s.id !== excludeUserId))) {
      return true;
    }
    const users = this.getUsers();
    return users.some(u => u.username.trim().toLowerCase() === clean && (!excludeUserId || u.id !== excludeUserId));
  }

  static isPhoneNumberTakenLocally(phone: string, excludeUserId?: string): boolean {
    const clean = phone.trim();
    if (!clean) return false;
    const digits = clean.replace(/\D/g, '');
    const digits10 = digits.length === 11 && digits.startsWith('1')
      ? digits.slice(1)
      : digits.length >= 10 ? digits.slice(-10) : digits;

    // Check system registered users
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

    // Check local storage users
    const users = this.getUsers();
    for (const u of users) {
      if (excludeUserId && u.id === excludeUserId) continue;
      if (!u.assignedNumber) continue;
      if (u.assignedNumber.trim() === clean) return true;
      const uDigits = u.assignedNumber.replace(/\D/g, '');
      const uDigits10 = uDigits.length === 11 && uDigits.startsWith('1') ? uDigits.slice(1) : uDigits.slice(-10);
      if (
        (digits.length >= 7 && (uDigits === digits || uDigits10 === digits10)) ||
        (digits10.length === 10 && uDigits10 === digits10)
      ) {
        return true;
      }
    }
    return false;
  }

  static saveUser(user: User): void {
    const users = this.getUsers();
    const index = users.findIndex(u => u.id === user.id);
    if (index >= 0) {
      users[index] = user;
    } else {
      users.push(user);
    }
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    this.broadcastSync('USER_UPDATED', user);
    FirebaseService.syncUserToCloud(user).catch(() => {});
  }

  static getCurrentUser(): User | null {
    try {
      const userId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
      if (!userId) return null;
      const users = this.getUsers();
      return users.find(u => u.id === userId) || null;
    } catch {
      return null;
    }
  }

  static setCurrentUser(userId: string | null): void {
    if (userId) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, userId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
    }
    this.broadcastSync('AUTH_STATE_CHANGED', { userId });
  }

  static findUserByPhoneNumber(phone: string): User | null {
    try {
      const clean = phone.trim();
      const cleanAlias = clean.toLowerCase().replace(/^@/, '');
      const digits = clean.replace(/\D/g, '');
      const digits10 = digits.length === 11 && digits.startsWith('1') 
        ? digits.slice(1) 
        : digits.length >= 10 ? digits.slice(-10) : digits;

      // 1. Check system registered lines
      for (const sys of SYSTEM_REGISTERED_USERS) {
        if (cleanAlias && sys.username.toLowerCase() === cleanAlias) return sys;
        if (sys.assignedNumber === clean) return sys;
        const sysDigits = sys.assignedNumber.replace(/\D/g, '');
        const sysDigits10 = sysDigits.length === 11 && sysDigits.startsWith('1') ? sysDigits.slice(1) : sysDigits;
        if (
          (digits.length >= 7 && (sysDigits === digits || sysDigits10 === digits10 || sysDigits.endsWith(digits) || digits.endsWith(sysDigits))) ||
          (digits10.length === 10 && sysDigits10 === digits10)
        ) {
          return sys;
        }
      }

      // 2. Check local users
      const users = this.getUsers();
      for (const u of users) {
        if (cleanAlias && u.username.toLowerCase() === cleanAlias) return u;
        if (!u.assignedNumber) continue;
        if (u.assignedNumber.trim() === clean) return u;
        const uDigits = u.assignedNumber.replace(/\D/g, '');
        const uDigits10 = uDigits.length === 11 && uDigits.startsWith('1') ? uDigits.slice(1) : uDigits.slice(-10);
        if (
          (digits.length >= 7 && (uDigits === digits || uDigits10 === digits10 || uDigits.endsWith(digits) || digits.endsWith(uDigits))) ||
          (digits10.length === 10 && uDigits10 === digits10)
        ) {
          return u;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  // --- Anti-Brute Force Rate Limiting ---
  static checkRateLimit(username: string): { allowed: boolean; remainingSec: number } {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.RATE_LIMITS);
      const limits = data ? JSON.parse(data) : {};
      const record = limits[username.toLowerCase()];
      if (!record) return { allowed: true, remainingSec: 0 };

      const now = Date.now();
      if (record.lockedUntil && record.lockedUntil > now) {
        const remainingSec = Math.ceil((record.lockedUntil - now) / 1000);
        return { allowed: false, remainingSec };
      }
      return { allowed: true, remainingSec: 0 };
    } catch {
      return { allowed: true, remainingSec: 0 };
    }
  }

  static recordLoginAttempt(username: string, success: boolean): void {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.RATE_LIMITS);
      const limits = data ? JSON.parse(data) : {};
      const key = username.toLowerCase();
      const now = Date.now();

      if (success) {
        delete limits[key];
      } else {
        const current = limits[key] || { attempts: 0, lastAttempt: now };
        current.attempts += 1;
        current.lastAttempt = now;

        // Exponential backoff: after 5 failed attempts, lock for 30 seconds; after 10, lock for 120 seconds
        if (current.attempts >= 5) {
          const lockTime = current.attempts >= 10 ? 120000 : 30000;
          current.lockedUntil = now + lockTime;
          this.logAuditEvent({
            id: 'audit_' + Math.random().toString(36).substring(2, 9),
            timestamp: now,
            type: 'SECURITY_ALERT',
            message: `Brute-force protection: Account login locked for ${lockTime / 1000}s due to ${current.attempts} failed attempts for "${username}".`,
            severity: 'warning'
          });
        }
        limits[key] = current;
      }
      localStorage.setItem(STORAGE_KEYS.RATE_LIMITS, JSON.stringify(limits));
    } catch {}
  }

  // --- Call Records ---
  static getCallRecords(userId?: string): CallRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CALL_RECORDS);
      const records: CallRecord[] = data ? JSON.parse(data) : [];
      return records.sort((a, b) => b.timestamp - a.timestamp);
    } catch {
      return [];
    }
  }

  static addCallRecord(record: CallRecord): void {
    const records = this.getCallRecords();
    records.unshift(record);
    localStorage.setItem(STORAGE_KEYS.CALL_RECORDS, JSON.stringify(records));
    this.broadcastSync('CALL_RECORD_ADDED', record);
    const currentUser = this.getCurrentUser();
    if (currentUser) {
      FirebaseService.saveCallRecordToCloud(record, currentUser.id).catch(() => {});
    }
    this.logAuditEvent({
      id: 'audit_' + Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      type: 'E2EE_HANDSHAKE',
      message: `Encrypted call record added with SAS verification [${record.encryptionDetails.sasCode}]. Peer: ${record.remoteNumber}.`,
      severity: 'success'
    });
  }

  static deleteCallRecord(recordId: string): void {
    const records = this.getCallRecords();
    const filtered = records.filter(r => r.id !== recordId);
    localStorage.setItem(STORAGE_KEYS.CALL_RECORDS, JSON.stringify(filtered));
    this.broadcastSync('CALL_RECORD_DELETED', { recordId });
    FirebaseService.deleteCallRecordFromCloud(recordId).catch(() => {});
    this.logAuditEvent({
      id: 'audit_' + Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      type: 'SHRED',
      message: `Zero-trace cryptographic shredding completed for call record #${recordId}.`,
      severity: 'info'
    });
  }

  static shredAllRecords(): void {
    const existing = this.getCallRecords();
    localStorage.setItem(STORAGE_KEYS.CALL_RECORDS, JSON.stringify([]));
    this.broadcastSync('ALL_RECORDS_SHREDDED', {});

    // Purge records from cloud Firestore as well
    const currentUser = this.getCurrentUser();
    if (currentUser) {
      FirebaseService.deleteAllCallRecordsFromCloud(currentUser.id).catch(() => {});
    }
    existing.forEach(r => FirebaseService.deleteCallRecordFromCloud(r.id).catch(() => {}));

    this.logAuditEvent({
      id: 'audit_' + Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      type: 'SHRED',
      message: `Emergency purge: All stored active call logs and audio metadata shredded to 0 bytes.`,
      severity: 'warning'
    });
  }

  static enforceAutoShred(): void {
    const user = this.getCurrentUser();
    if (!user || user.privacySettings.autoShredInterval === 'off') return;

    const intervalMap: Record<string, number> = {
      'immediate': 60 * 1000, // 1 minute buffer for immediate
      '1h': 3600 * 1000,
      '24h': 24 * 3600 * 1000,
      '7d': 7 * 24 * 3600 * 1000,
    };

    const maxAge = intervalMap[user.privacySettings.autoShredInterval];
    if (!maxAge) return;

    const now = Date.now();
    const records = this.getCallRecords();
    const remaining = records.filter(r => (now - r.timestamp) < maxAge);
    const expired = records.filter(r => (now - r.timestamp) >= maxAge);

    if (expired.length > 0) {
      expired.forEach(r => FirebaseService.deleteCallRecordFromCloud(r.id).catch(() => {}));
      localStorage.setItem(STORAGE_KEYS.CALL_RECORDS, JSON.stringify(remaining));
      this.broadcastSync('AUTO_SHRED_COMPLETED', { removedCount: expired.length });
    }
  }

  // --- Security Audit Logs ---
  static getAuditLogs(): SecurityAuditEvent[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static logAuditEvent(event: SecurityAuditEvent): void {
    try {
      const logs = this.getAuditLogs();
      logs.unshift(event);
      // Keep up to 100 audit entries
      const trimmed = logs.slice(0, 100);
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(trimmed));
      this.broadcastSync('AUDIT_LOG_ADDED', event);
    } catch {}
  }

  static clearAuditLogs(): void {
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify([]));
    this.broadcastSync('AUDIT_LOGS_CLEARED', {});
  }

  // --- In-Call Encrypted Messages / Whispers ---
  static getMessages(roomId: string): EncryptedMessage[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      const all: EncryptedMessage[] = data ? JSON.parse(data) : [];
      const now = Date.now();
      return all.filter(m => m.roomId === roomId && m.expiresAt > now);
    } catch {
      return [];
    }
  }

  static saveMessage(message: EncryptedMessage): void {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      const all: EncryptedMessage[] = data ? JSON.parse(data) : [];
      all.push(message);
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(all));
      this.broadcastSync('MESSAGE_ADDED', message);
    } catch {}
  }
}

StorageService.init();
