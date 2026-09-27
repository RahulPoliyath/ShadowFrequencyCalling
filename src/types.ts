/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CallDirection = 'inbound' | 'outbound';
export type CallStatus = 'completed' | 'missed' | 'rejected' | 'in-progress';

export interface DeviceSession {
  id: string;
  name: string;
  type: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  ipMasked: string;
  lastActive: number;
  isCurrent: boolean;
}

export interface PrivacySettings {
  callerIdMode: 'assigned' | 'stealth';
  autoShredInterval: 'immediate' | '1h' | '24h' | '7d' | 'off';
  ipLeakShield: boolean;
  hardwareNoiseSuppression: boolean;
  antiMetadata: boolean;
  quickLockPinEnabled: boolean;
  quickLockPin: string;
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  assignedNumber: string;
  availableNumbersPool?: string[];
  createdAt: number;
  publicKeySpki: string;
  keyFingerprint: string;
  devices: DeviceSession[];
  privacySettings: PrivacySettings;
  termsAccepted?: boolean;
  termsAcceptedAt?: number;
}

export interface CallRecord {
  id: string;
  remoteNumber: string;
  remoteAlias: string;
  roomNumber: string;
  direction: CallDirection;
  duration: number; // in seconds
  timestamp: number;
  status: CallStatus;
  deviceOrigin: string;
  encryptionDetails: {
    cipher: string;
    keyFingerprint: string;
    sasCode: string;
    sasEmojis: string[];
    isVerified: boolean;
  };
}

export interface EncryptedMessage {
  id: string;
  roomId: string;
  senderNumber: string;
  text: string;
  timestamp: number;
  expiresAt: number;
}

export interface ActiveCallState {
  roomNumber: string;
  remoteNumber: string;
  remoteAlias: string;
  direction: CallDirection;
  status: 'dialing' | 'ringing' | 'connected' | 'ended';
  startedAt: number;
  duration: number;
  isMuted: boolean;
  isSpeaker: boolean;
  sasCode: string;
  sasEmojis: string[];
  keyFingerprint: string;
  isVerified: boolean;
  packetsSent: number;
  packetsReceived: number;
  latencyMs: number;
  bitrateKbps: number;
}

export interface SecurityAuditEvent {
  id: string;
  timestamp: number;
  type: 'AUTH' | 'KEY_ROTATION' | 'E2EE_HANDSHAKE' | 'SHRED' | 'DEVICE_SYNC' | 'SECURITY_ALERT';
  message: string;
  severity: 'info' | 'warning' | 'success';
}
