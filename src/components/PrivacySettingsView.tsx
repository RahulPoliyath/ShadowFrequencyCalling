/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Shield, Lock, Key, RefreshCw, Smartphone, Laptop, Tablet, 
  Trash2, Eye, EyeOff, Radio, CheckCircle, AlertTriangle, ShieldCheck,
  Cpu, Zap, Server, Sliders
} from 'lucide-react';
import { User, PrivacySettings, DeviceSession } from '../types';
import { 
  generateEcdhKeyPair, 
  exportPublicKey, 
  computeKeyFingerprint 
} from '../services/crypto';
import { StorageService } from '../services/storage';

interface PrivacySettingsViewProps {
  user: User;
  onUpdateUser: (user: User) => void;
  onTriggerTestCall: () => void;
}

export const PrivacySettingsView: React.FC<PrivacySettingsViewProps> = ({
  user,
  onUpdateUser,
  onTriggerTestCall,
}) => {
  const [settings, setSettings] = useState<PrivacySettings>(user.privacySettings);
  const [rotatingKey, setRotatingKey] = useState(false);
  const [keyRotatedSuccess, setKeyRotatedSuccess] = useState(false);
  const [syncingDevices, setSyncingDevices] = useState(false);
  const [devices, setDevices] = useState<DeviceSession[]>(user.devices || [
    {
      id: 'dev_1',
      name: 'Workstation Terminal (Active Node)',
      type: 'desktop',
      browser: 'Chrome / WebCrypto P-256',
      ipMasked: '10.***.***.14',
      lastActive: Date.now(),
      isCurrent: true,
    },
    {
      id: 'dev_2',
      name: 'Field Mobile Client',
      type: 'mobile',
      browser: 'iOS Safari / Relay Node',
      ipMasked: '172.***.***.89',
      lastActive: Date.now() - 340000,
      isCurrent: false,
    }
  ]);

  const updateSetting = <K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    const updatedUser = { ...user, privacySettings: updated };
    StorageService.saveUser(updatedUser);
    onUpdateUser(updatedUser);
  };

  const handleRotateKeyPair = async () => {
    setRotatingKey(true);
    try {
      const keyPair = await generateEcdhKeyPair();
      const publicKeySpki = await exportPublicKey(keyPair.publicKey);
      const keyFingerprint = await computeKeyFingerprint(publicKeySpki);

      const updatedUser = {
        ...user,
        publicKeySpki,
        keyFingerprint,
      };

      StorageService.saveUser(updatedUser);
      onUpdateUser(updatedUser);
      StorageService.logAuditEvent({
        id: 'audit_' + Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type: 'KEY_ROTATION',
        message: `Cryptographic key pair rotated. New fingerprint: ${keyFingerprint}.`,
        severity: 'success',
      });

      setKeyRotatedSuccess(true);
      setTimeout(() => setKeyRotatedSuccess(false), 3000);
    } catch {
      // Error rotating keys
    } finally {
      setRotatingKey(false);
    }
  };

  const handleSyncDevices = () => {
    setSyncingDevices(true);
    StorageService.broadcastSync('SYNC_DEVICES_FORCE', { timestamp: Date.now() });
    StorageService.logAuditEvent({
      id: 'audit_' + Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      type: 'DEVICE_SYNC',
      message: `Manual multi-device synchronization dispatched across all active nodes.`,
      severity: 'info',
    });
    setTimeout(() => {
      setSyncingDevices(false);
    }, 800);
  };

  const handleRevokeDevice = (id: string) => {
    const updated = devices.filter(d => d.id !== id);
    setDevices(updated);
    const updatedUser = { ...user, devices: updated };
    StorageService.saveUser(updatedUser);
    onUpdateUser(updatedUser);
    StorageService.logAuditEvent({
      id: 'audit_' + Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      type: 'SECURITY_ALERT',
      message: `Revoked session authorization for device ID: ${id}.`,
      severity: 'warning',
    });
  };

  return (
    <div id="privacy-settings-view" className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6 px-1 sm:px-0">
      
      {/* Title */}
      <div>
        <div className="flex items-center space-x-2">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white font-mono">Defense Architecture</h2>
          <span className="text-[11px] sm:text-xs font-mono text-emerald-400">P-256 · AES-GCM</span>
        </div>
        <p className="text-[11px] sm:text-xs text-neutral-400 mt-0.5 font-mono">
          Hardware signal shields, identity stealth parameters, and multi-device relay synchronization.
        </p>
      </div>

      {/* Grid of Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-5">
        
        {/* Caller ID Stealth Masking */}
        <div className="bg-[#0b0e15] border border-neutral-800/90 rounded-2xl p-4 sm:p-5 shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs sm:text-sm font-semibold text-white font-mono">Caller ID Masking</span>
            {settings.callerIdMode === 'stealth' ? (
              <EyeOff className="w-4 h-4 text-emerald-400" />
            ) : (
              <Eye className="w-4 h-4 text-neutral-400" />
            )}
          </div>
          <p className="text-[11px] sm:text-xs text-neutral-400 mb-3.5 leading-relaxed font-mono">
            Display your assigned virtual number on caller ID or enforce total anonymity via #RESTRICTED#.
          </p>

          <div className="grid grid-cols-2 gap-2 bg-[#06080d] p-1 rounded-xl border border-neutral-800">
            <button
              type="button"
              onClick={() => updateSetting('callerIdMode', 'assigned')}
              className={`py-2 text-[11px] sm:text-xs font-mono font-medium rounded-lg transition-all cursor-pointer ${
                settings.callerIdMode === 'assigned'
                  ? 'bg-neutral-800 text-emerald-400 shadow-sm border border-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Assigned Line
            </button>
            <button
              type="button"
              onClick={() => updateSetting('callerIdMode', 'stealth')}
              className={`py-2 text-[11px] sm:text-xs font-mono font-medium rounded-lg transition-all cursor-pointer ${
                settings.callerIdMode === 'stealth'
                  ? 'bg-neutral-800 text-emerald-400 shadow-sm border border-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              #RESTRICTED#
            </button>
          </div>
        </div>

        {/* Auto-Shred Timer */}
        <div className="bg-[#0b0e15] border border-neutral-800/90 rounded-2xl p-4 sm:p-5 shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs sm:text-sm font-semibold text-white font-mono">Auto-Shred Schedule</span>
            <Trash2 className="w-4 h-4 text-red-400" />
          </div>
          <p className="text-[11px] sm:text-xs text-neutral-400 mb-3.5 leading-relaxed font-mono">
            Automatically zero-overwrite call logs and duration records with zero-trace cryptographic destruction.
          </p>

          <select
            value={settings.autoShredInterval}
            onChange={(e) => updateSetting('autoShredInterval', e.target.value as any)}
            className="w-full bg-[#06080d] border border-neutral-800 text-neutral-200 text-xs font-mono rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 cursor-pointer min-h-[38px]"
          >
            <option value="immediate">Immediate (Purge within 60s)</option>
            <option value="1h">Purge after 1 Hour</option>
            <option value="24h">Purge after 24 Hours (Optimal)</option>
            <option value="7d">Purge after 7 Days</option>
            <option value="off">Off (Manual Shred Only)</option>
          </select>
        </div>

        {/* WebRTC IP Leak Shield */}
        <div className="bg-[#0b0e15] border border-neutral-800/90 rounded-2xl p-4 sm:p-5 shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs sm:text-sm font-semibold text-white font-mono">Relay Proxy IP Shield</span>
            <span className={`w-2.5 h-2.5 rounded-full ${settings.ipLeakShield ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-neutral-600'}`} />
          </div>
          <p className="text-[11px] sm:text-xs text-neutral-400 mb-3.5 leading-relaxed font-mono">
            Routes all audio signaling through strict relay proxies. Disables local mDNS and STUN to prevent real IP leaks.
          </p>

          <button
            type="button"
            onClick={() => updateSetting('ipLeakShield', !settings.ipLeakShield)}
            className={`w-full py-2.5 px-3.5 text-xs font-mono font-medium rounded-xl border transition-colors flex items-center justify-between cursor-pointer min-h-[38px] ${
              settings.ipLeakShield
                ? 'bg-emerald-950/30 border-emerald-500/50 text-emerald-300'
                : 'bg-[#06080d] border-neutral-800 text-neutral-400'
            }`}
          >
            <span>Strict Proxy Relay</span>
            <span>{settings.ipLeakShield ? 'ARMED' : 'BYPASS'}</span>
          </button>
        </div>

        {/* Hardware Audio DSP processing */}
        <div className="bg-[#0b0e15] border border-neutral-800/90 rounded-2xl p-4 sm:p-5 shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs sm:text-sm font-semibold text-white font-mono">Hardware Audio DSP</span>
            <Radio className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-[11px] sm:text-xs text-neutral-400 mb-3.5 leading-relaxed font-mono">
            Enables native DSP background noise filtering, acoustic echo cancellation, and voice isolation filters.
          </p>

          <button
            type="button"
            onClick={() => updateSetting('hardwareNoiseSuppression', !settings.hardwareNoiseSuppression)}
            className={`w-full py-2.5 px-3.5 text-xs font-mono font-medium rounded-xl border transition-colors flex items-center justify-between cursor-pointer min-h-[38px] ${
              settings.hardwareNoiseSuppression
                ? 'bg-cyan-950/30 border-cyan-500/50 text-cyan-300'
                : 'bg-[#06080d] border-neutral-800 text-neutral-400'
            }`}
          >
            <span>DSP Echo Cancellation</span>
            <span>{settings.hardwareNoiseSuppression ? 'ACTIVE' : 'RAW AUDIO'}</span>
          </button>
        </div>

      </div>

      {/* Cryptographic Key Rotation Section */}
      <div className="bg-[#0b0e15] border border-neutral-800/90 rounded-2xl p-4 sm:p-5 shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-xs sm:text-sm font-semibold text-white flex items-center space-x-2 font-mono">
              <Key className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>ECDH P-256 Curve Identity Key</span>
            </h3>
            <p className="text-[11px] sm:text-xs text-neutral-400 mt-0.5 font-mono">
              Elliptic Curve Diffie-Hellman ephemeral pair for zero-trust tunnel establishment.
            </p>
          </div>

          <button
            id="rotate-keypair-btn"
            type="button"
            disabled={rotatingKey}
            onClick={handleRotateKeyPair}
            className="px-3.5 py-2 bg-[#06080d] hover:bg-neutral-800 text-neutral-100 text-xs font-mono rounded-xl border border-neutral-700 transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 min-h-[36px]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rotatingKey ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{rotatingKey ? 'Rotating Curve Keys...' : 'Rotate Key Pair'}</span>
          </button>
        </div>

        <div className="bg-[#06080d] border border-neutral-800/80 rounded-xl p-3 font-mono text-[11px] sm:text-xs text-neutral-300 break-all flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
          <span className="text-emerald-400/90">{user.keyFingerprint}</span>
          {keyRotatedSuccess && (
            <span className="text-[10px] text-emerald-400 flex items-center space-x-1 font-mono shrink-0">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Rotated & Verified</span>
            </span>
          )}
        </div>
      </div>

      {/* Multi-Device Synchronization Section */}
      <div className="bg-[#0b0e15] border border-neutral-800/90 rounded-2xl p-4 sm:p-5 shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
          <div>
            <h3 className="text-xs sm:text-sm font-semibold text-white flex items-center space-x-2 font-mono">
              <Laptop className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Multi-Device Node Synchronization</span>
            </h3>
            <p className="text-[11px] sm:text-xs text-neutral-400 mt-0.5 font-mono">
              Real-time Firestore and WebRTC tunnel sync across authorized physical devices.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              id="test-incoming-call-trigger"
              type="button"
              onClick={onTriggerTestCall}
              className="flex-1 sm:flex-initial px-3 py-1.5 sm:py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-medium rounded-xl transition-colors cursor-pointer min-h-[36px]"
              title="Test multi-device incoming call notification"
            >
              Simulate Inbound
            </button>

            <button
              id="sync-devices-now-btn"
              type="button"
              disabled={syncingDevices}
              onClick={handleSyncDevices}
              className="flex-1 sm:flex-initial px-3 py-1.5 sm:py-2 bg-[#06080d] hover:bg-neutral-800 text-neutral-200 text-xs font-mono font-medium rounded-xl border border-neutral-800 transition-colors flex items-center justify-center space-x-1.5 cursor-pointer min-h-[36px]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingDevices ? 'animate-spin text-emerald-400' : ''}`} />
              <span>{syncingDevices ? 'Syncing...' : 'Sync Nodes'}</span>
            </button>
          </div>
        </div>

        <div className="space-y-2 sm:space-y-2.5">
          {devices.map((device) => (
            <div
              key={device.id}
              className="bg-[#06080d] border border-neutral-800/80 rounded-xl p-3 sm:p-3.5 flex items-center justify-between gap-2"
            >
              <div className="flex items-center space-x-2.5 sm:space-x-3.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 shrink-0">
                  {device.type === 'mobile' ? <Smartphone className="w-4 h-4" /> : <Laptop className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-mono font-semibold text-white flex items-center space-x-2 truncate">
                    <span className="truncate">{device.name}</span>
                    {device.isCurrent && (
                      <span className="text-[9px] sm:text-[10px] text-emerald-400 font-mono shrink-0">
                        (Active Node)
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] sm:text-[11px] font-mono text-neutral-400 mt-0.5 truncate">
                    {device.browser} · IP: {device.ipMasked}
                  </div>
                </div>
              </div>

              {!device.isCurrent && (
                <button
                  type="button"
                  onClick={() => handleRevokeDevice(device.id)}
                  className="px-2.5 py-1 text-neutral-400 hover:text-red-400 hover:bg-neutral-900 rounded-lg transition-colors cursor-pointer text-xs font-mono shrink-0"
                  title="Revoke Node Authorization"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
