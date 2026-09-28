/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Sliders, Lock, Shield, Trash2, Key, RefreshCw, UserCheck, 
  Smartphone, Laptop, Eye, EyeOff, Radio, CheckCircle, AlertTriangle, 
  ShieldCheck, Cpu, Zap, Server, Volume2, VolumeX, Check, Copy, 
  Sparkles, Bot, PhoneCall, Clock, Hash, AlertCircle, ArrowRight,
  ShieldAlert, Activity, Terminal
} from 'lucide-react';
import { User, PrivacySettings, DeviceSession } from '../types';
import { 
  generateEcdhKeyPair, 
  exportPublicKey, 
  computeKeyFingerprint,
  generatePhoneNumberPool,
  generateSalt,
  hashPassword
} from '../services/crypto';
import { StorageService } from '../services/storage';
import { FirebaseService } from '../services/firebase';
import { soundEngine } from '../services/audio';

interface SettingsViewProps {
  user: User;
  onUpdateUser: (user: User) => void;
  onLockTerminal: () => void;
  onShredAllRecords: () => void;
  callRecordsCount: number;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  onUpdateUser,
  onLockTerminal,
  onShredAllRecords,
  callRecordsCount,
}) => {
  const [activeSection, setActiveSection] = useState<'all' | 'terminal_lock' | 'auto_shred' | 'account' | 'privacy' | 'keys'>('all');

  // --- Terminal Armed Lock State ---
  const [pinEnabled, setPinEnabled] = useState(user.privacySettings.quickLockPinEnabled ?? true);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinMessage, setPinMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showPinInput, setShowPinInput] = useState(false);

  // --- Auto-Shred Schedule State ---
  const [shredInterval, setShredInterval] = useState<PrivacySettings['autoShredInterval']>(user.privacySettings.autoShredInterval || '24h');
  const [shredConfirming, setShredConfirming] = useState(false);
  const [shredSuccess, setShredSuccess] = useState(false);

  // --- Account & Callsign State ---
  const [newUsername, setNewUsername] = useState(user.username);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameMessage, setUsernameMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [savingUsername, setSavingUsername] = useState(false);

  // --- Change Password State ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  // --- Virtual Number Pool State ---
  const [numberPool, setNumberPool] = useState<string[]>(
    user.availableNumbersPool && user.availableNumbersPool.length > 0
      ? user.availableNumbersPool
      : [user.assignedNumber]
  );
  const [generatingPool, setGeneratingPool] = useState(false);
  const [numberSwitchedSuccess, setNumberSwitchedSuccess] = useState<string | null>(null);

  // --- Network, Audio & Privacy State ---
  const [callerIdMode, setCallerIdMode] = useState(user.privacySettings.callerIdMode || 'assigned');
  const [ipLeakShield, setIpLeakShield] = useState(user.privacySettings.ipLeakShield ?? true);
  const [antiMetadata, setAntiMetadata] = useState(user.privacySettings.antiMetadata ?? true);
  const [noiseSuppression, setNoiseSuppression] = useState(user.privacySettings.hardwareNoiseSuppression ?? true);
  const [soundEffects, setSoundEffects] = useState(user.privacySettings.soundEffectsEnabled ?? true);
  const [opusDtx, setOpusDtx] = useState(user.privacySettings.opusDtxEnabled ?? true);

  // --- Cryptographic Identity State ---
  const [rotatingKey, setRotatingKey] = useState(false);
  const [keyRotatedSuccess, setKeyRotatedSuccess] = useState(false);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);

  // Sync soundEngine when soundEffects toggle changes
  useEffect(() => {
    soundEngine.setMuted(!soundEffects);
  }, [soundEffects]);

  // Generic settings updater
  const updateSettingField = <K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) => {
    const updatedSettings: PrivacySettings = {
      ...user.privacySettings,
      [key]: value,
    };
    const updatedUser: User = {
      ...user,
      privacySettings: updatedSettings,
    };
    StorageService.saveUser(updatedUser);
    FirebaseService.syncUserToCloud(updatedUser).catch(() => {});
    onUpdateUser(updatedUser);
  };

  // --- 1. Terminal Armed Lock Handlers ---
  const handleTogglePinEnabled = () => {
    const nextVal = !pinEnabled;
    setPinEnabled(nextVal);
    updateSettingField('quickLockPinEnabled', nextVal);
    setPinMessage({
      text: nextVal ? 'Terminal Armed Lock activated.' : 'Terminal Armed Lock disarmed.',
      type: 'success',
    });
    setTimeout(() => setPinMessage(null), 3500);
  };

  const handleSavePin = () => {
    setPinMessage(null);
    const cleaned = newPinInput.trim();
    if (!/^\d{4,8}$/.test(cleaned)) {
      setPinMessage({ text: 'PIN must be between 4 and 8 numeric digits (0-9).', type: 'error' });
      return;
    }
    if (cleaned !== confirmPinInput.trim()) {
      setPinMessage({ text: 'New PIN and Confirmation PIN do not match.', type: 'error' });
      return;
    }

    const existingPin = user.privacySettings.quickLockPin || '1234';
    if (user.privacySettings.quickLockPin && currentPinInput.trim() !== existingPin) {
      setPinMessage({ text: 'Current PIN is incorrect.', type: 'error' });
      return;
    }

    const updatedSettings: PrivacySettings = {
      ...user.privacySettings,
      quickLockPin: cleaned,
      quickLockPinEnabled: true,
    };
    const updatedUser: User = {
      ...user,
      privacySettings: updatedSettings,
    };
    setPinEnabled(true);
    StorageService.saveUser(updatedUser);
    FirebaseService.syncUserToCloud(updatedUser).catch(() => {});
    onUpdateUser(updatedUser);

    setPinMessage({ text: `Terminal PIN successfully set to ${cleaned.length} digits.`, type: 'success' });
    setNewPinInput('');
    setConfirmPinInput('');
    setCurrentPinInput('');
    setShowPinInput(false);
    try {
      soundEngine.playChime('verified');
    } catch {}
    setTimeout(() => setPinMessage(null), 4000);
  };

  const handleResetPinDefault = () => {
    const updatedSettings: PrivacySettings = {
      ...user.privacySettings,
      quickLockPin: '1234',
      quickLockPinEnabled: true,
    };
    const updatedUser: User = {
      ...user,
      privacySettings: updatedSettings,
    };
    setPinEnabled(true);
    StorageService.saveUser(updatedUser);
    FirebaseService.syncUserToCloud(updatedUser).catch(() => {});
    onUpdateUser(updatedUser);
    setPinMessage({ text: 'Terminal PIN reset to factory default (1234).', type: 'success' });
    setTimeout(() => setPinMessage(null), 3500);
  };

  // --- 2. Auto-Shred Handlers ---
  const handleSelectShredInterval = (interval: PrivacySettings['autoShredInterval']) => {
    setShredInterval(interval);
    updateSettingField('autoShredInterval', interval);
    try {
      soundEngine.playChime('secure');
    } catch {}
  };

  const handleEmergencyShred = () => {
    onShredAllRecords();
    setShredConfirming(false);
    setShredSuccess(true);
    try {
      soundEngine.playChime('disconnected');
    } catch {}
    setTimeout(() => setShredSuccess(false), 4000);
  };

  // --- 3. Username Change Handlers ---
  const handleCheckUsernameAvailability = async (name: string) => {
    const clean = name.trim().toLowerCase();
    if (!clean || clean === user.username.toLowerCase()) {
      setUsernameAvailable(null);
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(clean)) {
      setUsernameAvailable(false);
      return;
    }

    setCheckingUsername(true);
    try {
      const takenLocally = StorageService.isUsernameTakenLocally(clean, user.id);
      if (takenLocally) {
        setUsernameAvailable(false);
        setCheckingUsername(false);
        return;
      }
      const takenCloud = await FirebaseService.isUsernameTaken(clean, user.id);
      setUsernameAvailable(!takenCloud);
    } catch {
      setUsernameAvailable(true);
    } finally {
      setCheckingUsername(false);
    }
  };

  const handleSaveUsername = async () => {
    setUsernameMessage(null);
    const clean = newUsername.trim().replace(/^@/, '');
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(clean)) {
      setUsernameMessage({ text: 'Callsign must be 3-24 alphanumeric characters or underscores.', type: 'error' });
      return;
    }
    if (clean.toLowerCase() === user.username.toLowerCase()) {
      setUsernameMessage({ text: 'New callsign is identical to your current callsign.', type: 'error' });
      return;
    }

    setSavingUsername(true);
    try {
      const takenLocally = StorageService.isUsernameTakenLocally(clean, user.id);
      const takenCloud = await FirebaseService.isUsernameTaken(clean, user.id);
      if (takenLocally || takenCloud) {
        setUsernameMessage({ text: `Callsign "@${clean}" is already taken and cannot be assigned to another user.`, type: 'error' });
        setSavingUsername(false);
        return;
      }

      const oldUsername = user.username;
      const updatedUser: User = {
        ...user,
        username: clean,
      };

      StorageService.saveUser(updatedUser);
      await FirebaseService.updateUserCredentials(updatedUser, oldUsername);
      onUpdateUser(updatedUser);

      setUsernameMessage({ text: `Callsign changed to @${clean}. Network directory updated.`, type: 'success' });
      try {
        soundEngine.playChime('verified');
      } catch {}
    } catch (e) {
      setUsernameMessage({ text: 'Error updating callsign. Please retry.', type: 'error' });
    } finally {
      setSavingUsername(false);
    }
  };

  // --- 4. Password Change Handlers ---
  const calculatePasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: 'Empty', color: 'bg-neutral-800' };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 10) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    switch (score) {
      case 1:
        return { score: 25, label: 'Weak', color: 'bg-red-500' };
      case 2:
        return { score: 50, label: 'Fair', color: 'bg-amber-500' };
      case 3:
        return { score: 75, label: 'Strong', color: 'bg-emerald-400' };
      case 4:
        return { score: 100, label: 'Military-Grade PBKDF2', color: 'bg-cyan-400' };
      default:
        return { score: 10, label: 'Too Short', color: 'bg-red-500' };
    }
  };

  const handleSavePassword = async () => {
    setPasswordMessage(null);
    if (!currentPassword) {
      setPasswordMessage({ text: 'Please enter your current password.', type: 'error' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMessage({ text: 'New password must be at least 6 characters long.', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ text: 'New password and confirmation do not match.', type: 'error' });
      return;
    }

    setSavingPassword(true);
    try {
      const currentHashed = await hashPassword(currentPassword, user.salt);
      if (currentHashed !== user.passwordHash) {
        setPasswordMessage({ text: 'Current password is incorrect. Verification failed.', type: 'error' });
        setSavingPassword(false);
        return;
      }

      const newSalt = generateSalt(16);
      const newHashed = await hashPassword(newPassword, newSalt);

      const updatedUser: User = {
        ...user,
        passwordHash: newHashed,
        salt: newSalt,
      };

      StorageService.saveUser(updatedUser);
      await FirebaseService.updateUserCredentials(updatedUser);
      onUpdateUser(updatedUser);

      setPasswordMessage({ text: 'Password re-keyed with PBKDF2 (100,000 rounds SHA-256).', type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      try {
        soundEngine.playChime('verified');
      } catch {}
      setTimeout(() => setPasswordMessage(null), 5000);
    } catch (e) {
      setPasswordMessage({ text: 'Cryptographic hashing failed. Please try again.', type: 'error' });
    } finally {
      setSavingPassword(false);
    }
  };

  const [numberErrorMessage, setNumberErrorMessage] = useState<string | null>(null);

  // --- 5. Virtual Number Switching ---
  const handleSelectNumber = async (chosenNumber: string) => {
    if (chosenNumber === user.assignedNumber) return;
    setNumberErrorMessage(null);

    // Verify number is not taken by any other user locally or in Firestore
    const takenLocally = StorageService.isPhoneNumberTakenLocally(chosenNumber, user.id);
    const takenCloud = await FirebaseService.isPhoneNumberTaken(chosenNumber, user.id);
    if (takenLocally || takenCloud) {
      setNumberSwitchedSuccess(null);
      setNumberErrorMessage(`Virtual line "${chosenNumber}" is already assigned to another subscriber. It cannot be assigned to another user.`);
      try {
        soundEngine.playChime('disconnected');
      } catch {}
      setTimeout(() => setNumberErrorMessage(null), 5000);
      return;
    }

    const updatedUser: User = {
      ...user,
      assignedNumber: chosenNumber,
      availableNumbersPool: numberPool,
    };
    StorageService.saveUser(updatedUser);
    await FirebaseService.syncUserToCloud(updatedUser);
    onUpdateUser(updatedUser);

    setNumberSwitchedSuccess(chosenNumber);
    try {
      soundEngine.playChime('connected');
    } catch {}
    setTimeout(() => setNumberSwitchedSuccess(null), 3000);
  };

  const handleGenerateNewPool = async () => {
    setGeneratingPool(true);
    setNumberErrorMessage(null);
    try {
      const fresh = await FirebaseService.generateUniqueNumberPool(5, user.id);
      if (fresh.length > 0) {
        if (!fresh.includes(user.assignedNumber)) {
          fresh[0] = user.assignedNumber;
        }
        setNumberPool(fresh);
        const updatedUser: User = {
          ...user,
          availableNumbersPool: fresh,
        };
        StorageService.saveUser(updatedUser);
        await FirebaseService.syncUserToCloud(updatedUser);
        onUpdateUser(updatedUser);
        try {
          soundEngine.playChime('secure');
        } catch {}
      }
    } catch (e) {
      console.warn('Generate pool error:', e);
    } finally {
      setGeneratingPool(false);
    }
  };

  // --- 6. Cryptographic Key Rotation ---
  const handleRotateKeyPair = async () => {
    setRotatingKey(true);
    try {
      const keyPair = await generateEcdhKeyPair();
      const publicKeySpki = await exportPublicKey(keyPair.publicKey);
      const keyFingerprint = await computeKeyFingerprint(publicKeySpki);

      const updatedUser: User = {
        ...user,
        publicKeySpki,
        keyFingerprint,
      };

      StorageService.saveUser(updatedUser);
      await FirebaseService.syncUserToCloud(updatedUser);
      onUpdateUser(updatedUser);

      StorageService.logAuditEvent({
        id: 'audit_' + Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type: 'KEY_ROTATION',
        message: `Cryptographic key pair rotated. New fingerprint: ${keyFingerprint}.`,
        severity: 'success',
      });

      setKeyRotatedSuccess(true);
      try {
        soundEngine.playChime('verified');
      } catch {}
      setTimeout(() => setKeyRotatedSuccess(false), 3500);
    } catch {
      // Rotation failed
    } finally {
      setRotatingKey(false);
    }
  };

  const handleCopyFingerprint = () => {
    navigator.clipboard.writeText(user.keyFingerprint).catch(() => {});
    setCopiedFingerprint(true);
    setTimeout(() => setCopiedFingerprint(false), 2000);
  };

  const activePin = user.privacySettings.quickLockPin || '1234';
  const passStrength = calculatePasswordStrength(newPassword);

  return (
    // Mobile footprint reduced by 10% via scale-[0.90] with origin-top, tight paddings and compact fonts
    <div 
      id="settings-view" 
      className="w-[110%] -ml-[5%] sm:w-full sm:ml-0 scale-[0.90] sm:scale-100 origin-top max-w-5xl mx-auto space-y-3 sm:space-y-5 animate-fade-in pb-16 transition-transform"
    >
      
      {/* Tactical Master Header Bar */}
      <div className="bg-[#080c14]/95 border border-cyan-500/25 rounded-xl sm:rounded-2xl p-3 sm:p-5 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.6)] relative overflow-hidden hud-corner-box">
        <div className="absolute top-0 right-0 w-80 h-32 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 relative z-10">
          <div className="flex items-center space-x-2.5 sm:space-x-3.5">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
              <Terminal className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h1 className="text-sm sm:text-lg font-bold font-mono text-white tracking-wide uppercase">
                  Terminal Specification &amp; Settings
                </h1>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[8px] sm:text-[9px] font-mono text-emerald-400 font-bold uppercase flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Enclave Active</span>
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-neutral-400 font-mono mt-0.5 leading-tight">
                Root subscriber parameters, hardware audio filters, armed locks, and retention schedules.
              </p>
            </div>
          </div>

          {/* Quick Telemetry & Lock Button */}
          <div className="flex items-center space-x-2 shrink-0">
            <div className="hidden sm:flex items-center space-x-1 px-2.5 py-1 bg-[#05070a] border border-neutral-800 rounded-lg text-[10px] font-mono text-neutral-400">
              <span className="text-neutral-500">ID:</span>
              <span className="text-cyan-400 font-bold">@{user.username}</span>
            </div>

            <button
              type="button"
              onClick={onLockTerminal}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 hover:text-white rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-mono font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-[0_0_12px_rgba(245,158,11,0.15)] active:scale-95"
              title="Immediately lock the terminal screen"
            >
              <Lock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>Arm Lock Now</span>
            </button>
          </div>
        </div>

        {/* Section Segmented Navigation Tabs */}
        <div className="flex items-center gap-1 sm:gap-1.5 mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-neutral-800/80 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'All Controls', icon: Sliders },
            { id: 'terminal_lock', label: 'Armed Lock', icon: Lock },
            { id: 'auto_shred', label: 'Auto-Shred', icon: Clock },
            { id: 'account', label: 'Callsign & Auth', icon: UserCheck },
            { id: 'privacy', label: 'Network & Audio', icon: Shield },
            { id: 'keys', label: 'Root Enclave', icon: Key },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id as any)}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-mono font-medium rounded-lg sm:rounded-xl flex items-center space-x-1 sm:space-x-1.5 transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-neutral-800 text-white border border-cyan-500/50 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
                }`}
              >
                <Icon className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${isActive ? 'text-cyan-400' : 'text-neutral-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* --- SECTION 1: TERMINAL ARMED LOCK --- */}
      {(activeSection === 'all' || activeSection === 'terminal_lock') && (
        <div id="section-terminal-lock" className="bg-[#080c14]/90 border border-neutral-800/80 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-3.5 shadow-md">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-neutral-800/80">
            <div className="flex items-center space-x-2.5 sm:space-x-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Lock className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-xs sm:text-sm font-bold font-mono text-white uppercase tracking-wider">
                    Terminal Armed Lock
                  </h2>
                  <span className={`px-1.5 py-0.2 rounded text-[8px] sm:text-[9px] font-mono font-bold uppercase ${
                    pinEnabled ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-neutral-800 text-neutral-400'
                  }`}>
                    {pinEnabled ? 'ARMED' : 'DISARMED'}
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs text-neutral-400 font-mono mt-0.5">
                  Restricts console dialing and audio access behind a 4-8 digit hardware PIN.
                </p>
              </div>
            </div>

            {/* Enable/Disable Toggle */}
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleTogglePinEnabled}
                className={`w-10 sm:w-11 h-5 sm:h-6 rounded-full transition-colors relative cursor-pointer ${
                  pinEnabled ? 'bg-emerald-500' : 'bg-neutral-700'
                }`}
                title={pinEnabled ? 'Disarm Terminal Lock' : 'Arm Terminal Lock'}
              >
                <div className={`w-4 sm:w-5 h-4 sm:h-5 rounded-full bg-white transition-transform transform ${
                  pinEnabled ? 'translate-x-5 sm:translate-x-5.5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          </div>

          {pinMessage && (
            <div className={`p-2.5 rounded-lg border text-[10px] sm:text-xs font-mono flex items-center space-x-2 ${
              pinMessage.type === 'success' 
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' 
                : 'bg-red-950/40 border-red-500/50 text-red-300'
            }`}>
              {pinMessage.type === 'success' ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
              <span>{pinMessage.text}</span>
            </div>
          )}

          {/* Status Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-[#05070a] border border-neutral-800/90 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
              <span className="text-[9px] sm:text-[10px] text-neutral-500 font-mono uppercase block">Active Passcode</span>
              <div className="flex items-center space-x-1.5 mt-1">
                <span className="text-xs sm:text-sm font-mono font-bold text-white tracking-widest">
                  {'•'.repeat(Math.min(activePin.length, 8))}
                </span>
                <span className="text-[9px] text-neutral-500 font-mono">
                  ({activePin.length} digits)
                </span>
              </div>
            </div>

            <div className="bg-[#05070a] border border-neutral-800/90 rounded-lg sm:rounded-xl p-2.5 sm:p-3 flex items-center justify-between">
              <div>
                <span className="text-[9px] sm:text-[10px] text-neutral-500 font-mono uppercase block">Live Simulation</span>
                <button
                  type="button"
                  onClick={onLockTerminal}
                  className="mt-0.5 text-[10px] sm:text-xs font-mono text-amber-400 hover:text-amber-300 flex items-center space-x-1 cursor-pointer font-bold"
                >
                  <Lock className="w-3 h-3" />
                  <span>Lock Console Now</span>
                </button>
              </div>
            </div>

            <div className="bg-[#05070a] border border-neutral-800/90 rounded-lg sm:rounded-xl p-2.5 sm:p-3 flex items-center justify-between">
              <div>
                <span className="text-[9px] sm:text-[10px] text-neutral-500 font-mono uppercase block">Factory Defaults</span>
                <button
                  type="button"
                  onClick={handleResetPinDefault}
                  className="mt-0.5 text-[10px] sm:text-xs font-mono text-neutral-400 hover:text-white flex items-center space-x-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Reset to 1234</span>
                </button>
              </div>
            </div>
          </div>

          {/* Edit / Change PIN Form */}
          <div className="bg-[#06080e] border border-neutral-800/80 rounded-lg sm:rounded-xl p-3 sm:p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] sm:text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                <Key className="w-3 h-3 text-cyan-400" />
                <span>Configure Passcode Credentials</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowPinInput(!showPinInput)}
                className="text-[10px] sm:text-xs font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer flex items-center space-x-1"
              >
                <span>{showPinInput ? 'Close' : 'Set New PIN'}</span>
              </button>
            </div>

            {showPinInput && (
              <div className="space-y-2.5 pt-1.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5">
                  <div>
                    <label className="text-[9px] font-mono text-neutral-400 block mb-1">Current PIN</label>
                    <input
                      type="password"
                      maxLength={8}
                      value={currentPinInput}
                      onChange={(e) => setCurrentPinInput(e.target.value.replace(/\D/g, ''))}
                      placeholder={activePin === '1234' ? 'Default: 1234' : 'Current PIN'}
                      className="w-full bg-[#090d15] border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white tracking-widest focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-mono text-neutral-400 block mb-1">New PIN (4-8 digits)</label>
                    <input
                      type="password"
                      maxLength={8}
                      value={newPinInput}
                      onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 5839"
                      className="w-full bg-[#090d15] border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white tracking-widest focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-mono text-neutral-400 block mb-1">Confirm New PIN</label>
                    <input
                      type="password"
                      maxLength={8}
                      value={confirmPinInput}
                      onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="Repeat new PIN"
                      className="w-full bg-[#090d15] border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white tracking-widest focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleSavePin}
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[10px] sm:text-xs font-mono font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                    <span>Save PIN Code</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- SECTION 2: AUTO-SHRED SCHEDULE --- */}
      {(activeSection === 'all' || activeSection === 'auto_shred') && (
        <div id="section-auto-shred" className="bg-[#080c14]/90 border border-neutral-800/80 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-3.5 shadow-md">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-neutral-800/80">
            <div className="flex items-center space-x-2.5 sm:space-x-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <Clock className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </div>
              <div>
                <h2 className="text-xs sm:text-sm font-bold font-mono text-white uppercase tracking-wider">
                  Auto-Shred Schedule &amp; Amnesic Memory
                </h2>
                <p className="text-[10px] sm:text-xs text-neutral-400 font-mono mt-0.5">
                  Automated NIST SP 800-88 cryptographic sanitization of timestamps and call logs.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1.5 text-[10px] sm:text-xs font-mono text-neutral-400">
              <span className="hidden sm:inline">Active Ledger:</span>
              <span className="px-2 py-0.5 rounded bg-neutral-800 text-white font-bold">{callRecordsCount} calls</span>
            </div>
          </div>

          {shredSuccess && (
            <div className="p-2.5 bg-red-950/40 border border-red-500/50 rounded-lg text-[10px] sm:text-xs font-mono text-red-300 flex items-center space-x-2">
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              <span>All transient records zero-overwritten across local storage and Cloud Firestore.</span>
            </div>
          )}

          {/* Schedule Selection Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-2.5">
            {[
              {
                id: 'immediate',
                title: 'Immediate',
                sub: 'Zero-Trace',
                desc: 'Purged the instant call hangs up. No disk writes.',
                tag: 'Highest Sec',
              },
              {
                id: '1h',
                title: '1 Hour',
                sub: 'Callback Buffer',
                desc: 'Retained 60 minutes for rapid return dials.',
                tag: 'High Sec',
              },
              {
                id: '24h',
                title: '24 Hours',
                sub: 'Amnesic Daily',
                desc: 'Daily zero-knowledge rotation schedule.',
                tag: 'Default',
              },
              {
                id: '7d',
                title: '7 Days',
                sub: 'Operational',
                desc: 'Retained 1 week before sanitization cycle.',
                tag: 'Extended',
              },
              {
                id: 'off',
                title: 'Manual Only',
                sub: 'No Auto-Shred',
                desc: 'Records persist until manual shred command.',
                tag: 'Manual',
              },
            ].map((option) => {
              const isSelected = shredInterval === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleSelectShredInterval(option.id as any)}
                  className={`p-2.5 sm:p-3 rounded-lg sm:rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-neutral-800/90 border-emerald-500/80 shadow-[0_0_12px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/40'
                      : 'bg-[#05070a] border-neutral-800 hover:border-neutral-700 text-neutral-400'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[11px] sm:text-xs font-mono font-bold ${isSelected ? 'text-white' : 'text-neutral-300'}`}>
                        {option.title}
                      </span>
                      {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                    </div>
                    <span className="text-[9px] font-mono text-cyan-400 block mb-1">{option.sub}</span>
                    <p className="text-[9px] sm:text-[10px] text-neutral-400 leading-tight font-mono line-clamp-2">
                      {option.desc}
                    </p>
                  </div>
                  <span className={`mt-2 text-[8px] sm:text-[9px] font-mono font-bold uppercase ${isSelected ? 'text-emerald-400' : 'text-neutral-500'}`}>
                    {option.tag}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Emergency Manual Shred Zone */}
          <div className="bg-red-950/20 border border-red-900/40 rounded-lg sm:rounded-xl p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h3 className="text-[10px] sm:text-xs font-mono font-bold text-red-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>Emergency Zero-Overwrite Purge</span>
              </h3>
              <p className="text-[9px] sm:text-[10px] text-neutral-400 font-mono mt-0.5">
                Overwrites RAM buffers, local storage, and Firestore records with zeros (0x00).
              </p>
            </div>

            <div>
              {shredConfirming ? (
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={handleEmergencyShred}
                    className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[10px] sm:text-xs font-mono font-bold transition-colors cursor-pointer"
                  >
                    Confirm Shred ({callRecordsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setShredConfirming(false)}
                    className="px-2 py-1 bg-neutral-800 text-neutral-300 rounded-lg text-[10px] sm:text-xs font-mono transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShredConfirming(true)}
                  className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-800/60 rounded-lg text-[10px] sm:text-xs font-mono font-bold flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Shred Call Ledger</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- SECTION 3: ACCOUNT, CALLSIGN & PASSWORD --- */}
      {(activeSection === 'all' || activeSection === 'account') && (
        <div id="section-account" className="bg-[#080c14]/90 border border-neutral-800/80 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-4 shadow-md">
          <div className="flex items-center space-x-2.5 sm:space-x-3 pb-3 border-b border-neutral-800/80">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <UserCheck className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold font-mono text-white uppercase tracking-wider">
                Callsign &amp; Authentication Credentials
              </h2>
              <p className="text-[10px] sm:text-xs text-neutral-400 font-mono mt-0.5">
                Update your network subscriber alias, anonymous lines, and PBKDF2 credentials.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            
            {/* Edit Username / Callsign Card */}
            <div className="bg-[#05070a] border border-neutral-800/90 rounded-lg sm:rounded-xl p-3 sm:p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] sm:text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                  <Hash className="w-3 h-3 text-cyan-400" />
                  <span>Subscriber Callsign</span>
                </h3>
                <span className="text-[9px] font-mono text-neutral-400">Current: @{user.username}</span>
              </div>

              {usernameMessage && (
                <div className={`p-2 rounded-lg border text-[9px] sm:text-[10px] font-mono flex items-center space-x-1.5 ${
                  usernameMessage.type === 'success' 
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' 
                    : 'bg-red-950/40 border-red-500/50 text-red-300'
                }`}>
                  {usernameMessage.type === 'success' ? <CheckCircle className="w-3 h-3 shrink-0" /> : <AlertTriangle className="w-3 h-3 shrink-0" />}
                  <span>{usernameMessage.text}</span>
                </div>
              )}

              <div>
                <label className="text-[9px] font-mono text-neutral-400 block mb-1">New Alias Handle (3-24 chars)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-neutral-500 font-mono text-xs">
                    @
                  </div>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                      setNewUsername(val);
                      handleCheckUsernameAvailability(val);
                    }}
                    placeholder="new_alias"
                    className="w-full bg-[#080c14] border border-neutral-700 rounded-lg pl-6 pr-8 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  />
                  <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
                    {checkingUsername && <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />}
                    {!checkingUsername && usernameAvailable === true && <Check className="w-3 h-3 text-emerald-400" />}
                    {!checkingUsername && usernameAvailable === false && <AlertCircle className="w-3 h-3 text-red-400" />}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[9px] font-mono text-neutral-400">
                  {usernameAvailable === true && <span className="text-emerald-400">Callsign is available</span>}
                  {usernameAvailable === false && <span className="text-red-400">Taken or invalid</span>}
                </span>

                <button
                  type="button"
                  onClick={handleSaveUsername}
                  disabled={savingUsername || newUsername.trim().toLowerCase() === user.username.toLowerCase()}
                  className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-[10px] sm:text-xs font-mono font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                >
                  {savingUsername ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  <span>Save Alias</span>
                </button>
              </div>
            </div>

            {/* Change Password Card */}
            <div className="bg-[#05070a] border border-neutral-800/90 rounded-lg sm:rounded-xl p-3 sm:p-3.5 space-y-2.5">
              <h3 className="text-[10px] sm:text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                <Lock className="w-3 h-3 text-emerald-400" />
                <span>Change Enclave Password</span>
              </h3>

              {passwordMessage && (
                <div className={`p-2 rounded-lg border text-[9px] sm:text-[10px] font-mono flex items-center space-x-1.5 ${
                  passwordMessage.type === 'success' 
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' 
                    : 'bg-red-950/40 border-red-500/50 text-red-300'
                }`}>
                  {passwordMessage.type === 'success' ? <CheckCircle className="w-3 h-3 shrink-0" /> : <AlertTriangle className="w-3 h-3 shrink-0" />}
                  <span>{passwordMessage.text}</span>
                </div>
              )}

              <div>
                <label className="text-[9px] font-mono text-neutral-400 block mb-1">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full bg-[#080c14] border border-neutral-700 rounded-lg px-2.5 py-1.5 pr-8 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-neutral-500 hover:text-white cursor-pointer"
                  >
                    {showCurrentPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-mono text-neutral-400 block mb-1">New (6+ chars)</label>
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    className="w-full bg-[#080c14] border border-neutral-700 rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-mono text-neutral-400 block mb-1">Confirm</label>
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat"
                    className="w-full bg-[#080c14] border border-neutral-700 rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Entropy Bar */}
              {newPassword && (
                <div className="space-y-1">
                  <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${passStrength.color}`} 
                      style={{ width: `${passStrength.score}%` }} 
                    />
                  </div>
                  <div className="flex justify-between text-[8px] font-mono text-neutral-400">
                    <span>Entropy: {passStrength.label}</span>
                    <span>100k PBKDF2</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-0.5">
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="text-[9px] font-mono text-neutral-400 hover:text-white cursor-pointer flex items-center space-x-1"
                >
                  {showNewPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{showNewPass ? 'Hide' : 'Reveal'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSavePassword}
                  disabled={savingPassword || !currentPassword || !newPassword}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-[10px] sm:text-xs font-mono font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                >
                  {savingPassword ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  <span>Update</span>
                </button>
              </div>
            </div>

          </div>

          {/* Anonymous Virtual Line Switcher */}
          <div className="bg-[#05070a] border border-neutral-800/90 rounded-lg sm:rounded-xl p-3 sm:p-3.5 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <div>
                <h3 className="text-[10px] sm:text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                  <PhoneCall className="w-3 h-3 text-cyan-400" />
                  <span>Assigned Anonymous Line Switcher</span>
                </h3>
                <p className="text-[9px] sm:text-[10px] text-neutral-400 font-mono mt-0.5">
                  Pick your active caller identity from your personal encrypted line pool.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGenerateNewPool}
                disabled={generatingPool}
                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg text-[10px] font-mono flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
              >
                <RefreshCw className={`w-3 h-3 ${generatingPool ? 'animate-spin text-cyan-400' : ''}`} />
                <span>Regenerate 5 Lines</span>
              </button>
            </div>

            {numberSwitchedSuccess && (
              <div className="p-1.5 bg-emerald-950/40 border border-emerald-500/50 rounded text-[9px] sm:text-[10px] font-mono text-emerald-300">
                Active line updated to {numberSwitchedSuccess}.
              </div>
            )}

            {numberErrorMessage && (
              <div className="p-2 bg-red-950/40 border border-red-500/50 rounded text-[9px] sm:text-[10px] font-mono text-red-300 flex items-center space-x-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{numberErrorMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2 pt-0.5">
              {numberPool.map((phone) => {
                const isActive = phone === user.assignedNumber;
                return (
                  <button
                    key={phone}
                    type="button"
                    onClick={() => handleSelectNumber(phone)}
                    className={`p-2 rounded-lg border text-left font-mono text-[10px] sm:text-xs transition-all cursor-pointer flex flex-col justify-between ${
                      isActive
                        ? 'bg-emerald-950/30 border-emerald-500/70 text-emerald-300 shadow-sm'
                        : 'bg-[#080c14] border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <span className="font-bold truncate">{phone}</span>
                    <span className={`text-[8px] sm:text-[9px] mt-1 font-bold uppercase ${isActive ? 'text-emerald-400' : 'text-neutral-500'}`}>
                      {isActive ? 'ACTIVE' : 'SWITCH'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* --- SECTION 4: PRIVACY, NETWORK & AUDIO DSP --- */}
      {(activeSection === 'all' || activeSection === 'privacy') && (
        <div id="section-privacy" className="bg-[#080c14]/90 border border-neutral-800/80 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-3.5 shadow-md">
          <div className="flex items-center space-x-2.5 sm:space-x-3 pb-3 border-b border-neutral-800/80">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Shield className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold font-mono text-white uppercase tracking-wider">
                Network Guard &amp; Audio DSP Architecture
              </h2>
              <p className="text-[10px] sm:text-xs text-neutral-400 font-mono mt-0.5">
                RFC 1918 leak suppression, Web Audio filters, and telecom signaling controls.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
            {/* Caller ID Mode */}
            <div className="bg-[#05070a] border border-neutral-800/90 rounded-lg sm:rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] sm:text-xs font-mono font-bold text-white block">Caller ID Presentation</span>
                <span className="text-[9px] sm:text-[10px] font-mono text-neutral-400 block mt-0.5">
                  {callerIdMode === 'assigned' ? 'Broadcasting anonymous virtual line' : 'Stealth: Line completely withheld'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = callerIdMode === 'assigned' ? 'stealth' : 'assigned';
                  setCallerIdMode(next);
                  updateSettingField('callerIdMode', next);
                }}
                className={`px-2.5 py-1 rounded-lg text-[9px] sm:text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                  callerIdMode === 'stealth'
                    ? 'bg-purple-950/40 border-purple-500/60 text-purple-300'
                    : 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300'
                }`}
              >
                {callerIdMode === 'stealth' ? 'STEALTH' : 'ASSIGNED'}
              </button>
            </div>

            {/* IP Leak Shield */}
            <div className="bg-[#05070a] border border-neutral-800/90 rounded-lg sm:rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] sm:text-xs font-mono font-bold text-white block">IP Leak Shield (RFC 1918)</span>
                <span className="text-[9px] sm:text-[10px] font-mono text-neutral-400 block mt-0.5">
                  Suppresses private IP addresses in ICE candidates
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !ipLeakShield;
                  setIpLeakShield(next);
                  updateSettingField('ipLeakShield', next);
                }}
                className={`w-9 sm:w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                  ipLeakShield ? 'bg-emerald-500' : 'bg-neutral-700'
                }`}
              >
                <div className={`w-3.5 sm:w-4 h-3.5 sm:h-4 rounded-full bg-white transition-transform transform ${
                  ipLeakShield ? 'translate-x-4.5 sm:translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {/* Hardware Noise Suppression */}
            <div className="bg-[#05070a] border border-neutral-800/90 rounded-lg sm:rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] sm:text-xs font-mono font-bold text-white block">Acoustic Noise Filter</span>
                <span className="text-[9px] sm:text-[10px] font-mono text-neutral-400 block mt-0.5">
                  Web Audio 85Hz highpass &amp; voice articulation
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !noiseSuppression;
                  setNoiseSuppression(next);
                  updateSettingField('hardwareNoiseSuppression', next);
                }}
                className={`w-9 sm:w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                  noiseSuppression ? 'bg-emerald-500' : 'bg-neutral-700'
                }`}
              >
                <div className={`w-3.5 sm:w-4 h-3.5 sm:h-4 rounded-full bg-white transition-transform transform ${
                  noiseSuppression ? 'translate-x-4.5 sm:translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {/* Sound Effects & Chimes Toggle */}
            <div className="bg-[#05070a] border border-neutral-800/90 rounded-lg sm:rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] sm:text-xs font-mono font-bold text-white block flex items-center space-x-1.5">
                  {soundEffects ? <Volume2 className="w-3 h-3 text-cyan-400" /> : <VolumeX className="w-3 h-3 text-neutral-500" />}
                  <span>Audio Chimes &amp; DTMF Tones</span>
                </span>
                <span className="text-[9px] sm:text-[10px] font-mono text-neutral-400 block mt-0.5">
                  Tone feedback for dialing, ringback &amp; crypto verify
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !soundEffects;
                  setSoundEffects(next);
                  updateSettingField('soundEffectsEnabled', next);
                }}
                className={`w-9 sm:w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                  soundEffects ? 'bg-cyan-500' : 'bg-neutral-700'
                }`}
              >
                <div className={`w-3.5 sm:w-4 h-3.5 sm:h-4 rounded-full bg-white transition-transform transform ${
                  soundEffects ? 'translate-x-4.5 sm:translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {/* Anti-Metadata Scrubbing */}
            <div className="bg-[#05070a] border border-neutral-800/90 rounded-lg sm:rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] sm:text-xs font-mono font-bold text-white block">Anti-Metadata Scrubbing</span>
                <span className="text-[9px] sm:text-[10px] font-mono text-neutral-400 block mt-0.5">
                  Strips canvas fingerprinting &amp; browser User-Agent
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !antiMetadata;
                  setAntiMetadata(next);
                  updateSettingField('antiMetadata', next);
                }}
                className={`w-9 sm:w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                  antiMetadata ? 'bg-emerald-500' : 'bg-neutral-700'
                }`}
              >
                <div className={`w-3.5 sm:w-4 h-3.5 sm:h-4 rounded-full bg-white transition-transform transform ${
                  antiMetadata ? 'translate-x-4.5 sm:translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {/* Opus DTX Voice Gating */}
            <div className="bg-[#05070a] border border-neutral-800/90 rounded-lg sm:rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] sm:text-xs font-mono font-bold text-white block">Opus DTX (Silence Silence)</span>
                <span className="text-[9px] sm:text-[10px] font-mono text-neutral-400 block mt-0.5">
                  Stops packet transmit during silence to cut background hiss
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !opusDtx;
                  setOpusDtx(next);
                  updateSettingField('opusDtxEnabled', next);
                }}
                className={`w-9 sm:w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                  opusDtx ? 'bg-emerald-500' : 'bg-neutral-700'
                }`}
              >
                <div className={`w-3.5 sm:w-4 h-3.5 sm:h-4 rounded-full bg-white transition-transform transform ${
                  opusDtx ? 'translate-x-4.5 sm:translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

          </div>
        </div>
      )}

      {/* --- SECTION 5: CRYPTOGRAPHIC ENCLAVE & IDENTITY KEYS --- */}
      {(activeSection === 'all' || activeSection === 'keys') && (
        <div id="section-keys" className="bg-[#080c14]/90 border border-neutral-800/80 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 space-y-3.5 shadow-md">
          <div className="flex items-center space-x-2.5 sm:space-x-3 pb-3 border-b border-neutral-800/80">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
              <Key className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold font-mono text-white uppercase tracking-wider">
                Cryptographic Identity &amp; Root Enclave
              </h2>
              <p className="text-[10px] sm:text-xs text-neutral-400 font-mono mt-0.5">
                NIST SP 800-56A Rev 3 ECDH P-256 root cryptographic identity.
              </p>
            </div>
          </div>

          {keyRotatedSuccess && (
            <div className="p-2.5 bg-purple-950/40 border border-purple-500/50 rounded-lg text-[10px] sm:text-xs font-mono text-purple-300 flex items-center space-x-2">
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Identity keys rotated. Fresh ECDH P-256 pair created and synced.</span>
            </div>
          )}

          {/* Key Fingerprint Display */}
          <div className="bg-[#05070a] border border-neutral-800/90 rounded-lg sm:rounded-xl p-3 sm:p-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-widest block">
                  Public Key Fingerprint (SHA-256)
                </span>
                <span className="text-[10px] sm:text-xs font-mono font-bold text-cyan-400 select-all tracking-wider break-all mt-1 block">
                  {user.keyFingerprint}
                </span>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyFingerprint}
                  className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg text-[10px] font-mono flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  {copiedFingerprint ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedFingerprint ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRotateKeyPair}
                  disabled={rotatingKey}
                  className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[10px] font-mono font-bold flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${rotatingKey ? 'animate-spin' : ''}`} />
                  <span>Rotate Keys</span>
                </button>
              </div>
            </div>
          </div>

          {/* Connected Device Nodes */}
          <div>
            <h3 className="text-[10px] sm:text-xs font-mono font-bold text-white uppercase tracking-wider mb-2 flex items-center space-x-1.5">
              <Cpu className="w-3 h-3 text-neutral-400" />
              <span>Active Hardware Enclave Nodes</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
              {(user.devices || [
                {
                  id: 'dev_1',
                  name: 'Workstation Terminal (Active Node)',
                  type: 'desktop',
                  browser: 'Chrome / WebCrypto P-256',
                  ipMasked: '10.***.***.14',
                  lastActive: Date.now(),
                  isCurrent: true,
                }
              ]).map((dev) => (
                <div key={dev.id} className="bg-[#05070a] border border-neutral-800/90 rounded-lg sm:rounded-xl p-2.5 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {dev.type === 'desktop' ? <Laptop className="w-3.5 h-3.5 text-cyan-400" /> : <Smartphone className="w-3.5 h-3.5 text-emerald-400" />}
                    <div>
                      <span className="text-[11px] sm:text-xs font-mono font-bold text-white block">{dev.name}</span>
                      <span className="text-[9px] font-mono text-neutral-400 block">{dev.browser} · {dev.ipMasked}</span>
                    </div>
                  </div>
                  {dev.isCurrent && (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/30 text-[8px] font-mono text-emerald-400 font-bold">
                      CURRENT
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
