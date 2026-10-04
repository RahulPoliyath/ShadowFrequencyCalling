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
  soundEffectsEnabled?: boolean;
  opusDtxEnabled?: boolean;
}

export type CustomNumberPlanId = '7days' | '1month' | '6months' | '1year';

export interface CustomNumberPlan {
  id: CustomNumberPlanId;
  name: string;
  durationLabel: string;
  durationDays: number;
  priceRs: number;
  perMonthLabel?: string;
  badge?: string;
  popular?: boolean;
}

export interface CustomNumberSubscription {
  active: boolean;
  customNumber: string;
  planId: CustomNumberPlanId;
  planName: string;
  pricePaidRs: number;
  activatedAt: number;
  expiresAt: number;
  transactionId: string;
  paymentMethod: string;
  autoRenew: boolean;
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
  customNumberSubscription?: CustomNumberSubscription;
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

export type BotPatrolStatus = 'patrolling' | 'scanning' | 'alert' | 'mitigating' | 'hardened';

export interface BotDiagnosticCheck {
  id: string;
  name: string;
  category: 'Network' | 'Keystore' | 'Storage' | 'DOM/XSS' | 'Memory' | 'Protocol';
  status: 'passed' | 'warning' | 'fixed' | 'running';
  lastRun: number;
  details: string;
  recommendation?: string;
}

export interface SecurityBotIncident {
  id: string;
  timestamp: number;
  type: 'DOM_XSS_ATTEMPT' | 'STORAGE_TAMPER' | 'KEY_CORRUPTION' | 'BURST_SIGNAL_FLOOD' | 'INSECURE_SOCKET' | 'MEMORY_HEAP_LEAK' | 'INTEGRITY_CHECK';
  severity: 'low' | 'medium' | 'high' | 'mitigated';
  title: string;
  description: string;
  autoRemediated: boolean;
  remediationAction?: string;
}

export interface SecurityBotState {
  isActive: boolean;
  isPatrolling: boolean;
  autoMitigate: boolean;
  patrolIntervalSeconds: number;
  threatsNeutralizedCount: number;
  lastPatrolTimestamp: number;
  overallHealthScore: number;
  status: BotPatrolStatus;
  checks: BotDiagnosticCheck[];
  incidents: SecurityBotIncident[];
}
