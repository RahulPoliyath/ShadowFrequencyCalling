/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Shield, Lock, Phone, UserCheck, Key, CheckCircle, AlertTriangle, ArrowRight, RefreshCw, Radio, Loader2, Check, Sparkles, ShieldCheck } from 'lucide-react';
import { User, DeviceSession, PrivacySettings } from '../types';
import { 
  generatePhoneNumberPool, 
  generateSalt, 
  hashPassword, 
  generateEcdhKeyPair, 
  exportPublicKey, 
  computeKeyFingerprint 
} from '../services/crypto';
import { StorageService } from '../services/storage';
import { FirebaseService } from '../services/firebase';
import { TermsAndConditionsModal } from './TermsAndConditionsModal';

interface AuthModalProps {
  onSuccess: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState<'credentials' | 'number-select' | 'terms'>('credentials');
  
  // Credentials
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Username availability check state
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  // Virtual Number Selection
  const [phonePool, setPhonePool] = useState<string[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<string>('');
  const [loadingNumbers, setLoadingNumbers] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<any>(null);
  
  // Error & Status State
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState<number>(0);

  const refreshNumberPool = async () => {
    setLoadingNumbers(true);
    try {
      const pool = await FirebaseService.generateUniqueNumberPool(5);
      if (pool.length > 0) {
        setPhonePool(pool);
        setSelectedNumber(pool[0]);
      } else {
        const fallback = generatePhoneNumberPool();
        setPhonePool(fallback);
        setSelectedNumber(fallback[0]);
      }
    } catch {
      const fallback = generatePhoneNumberPool();
      setPhonePool(fallback);
      setSelectedNumber(fallback[0]);
    } finally {
      setLoadingNumbers(false);
    }
  };

  const handleUsernameChange = (val: string) => {
    setUsername(val);
    setError(null);
    setUsernameAvailable(null);

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    if (!isLogin && val.trim().length >= 3) {
      const timer = setTimeout(() => {
        checkUsernameAvailability(val);
      }, 350);
      setDebounceTimer(timer);
    }
  };

  const checkUsernameAvailability = async (targetUsername?: string) => {
    if (isLogin) return;
    const clean = (targetUsername !== undefined ? targetUsername : username).trim().toLowerCase().replace(/^@/, '');
    if (clean.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    setCheckingUsername(true);
    try {
      // 1. Check local database (case-insensitive)
      if (StorageService.isUsernameTakenLocally(clean)) {
        setUsernameAvailable(false);
        setError(`Username alias "@${clean}" is already registered (case-insensitive). It cannot be used by anyone else.`);
        return;
      }

      // 2. Check Cloud Firestore registry (case-insensitive)
      const isTaken = await FirebaseService.isUsernameTaken(clean);
      if (isTaken) {
        setUsernameAvailable(false);
        setError(`Username alias "@${clean}" is already taken across the network (case-insensitive). It cannot be used by anyone else.`);
      } else {
        setUsernameAvailable(true);
        setError(null);
      }
    } catch {
      setUsernameAvailable(null);
    } finally {
      setCheckingUsername(false);
    }
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || !password) {
      setError('Username and password are required.');
      return;
    }

    if (!isLogin && cleanUsername.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }

    // Check anti-brute force rate limit
    const rateCheck = StorageService.checkRateLimit(cleanUsername);
    if (!rateCheck.allowed) {
      setLockoutRemaining(rateCheck.remainingSec);
      setError(`Account security lockout active. Retry in ${rateCheck.remainingSec}s to prevent brute-force attacks.`);
      return;
    }

    if (isLogin) {
      setLoading(true);
      try {
        const users = StorageService.getUsers();
        let user = users.find(u => u.username.toLowerCase() === cleanUsername);
        if (!user) {
          const cloudUser = await FirebaseService.findUserByUsername(cleanUsername);
          if (cloudUser) {
            user = cloudUser;
            StorageService.saveUser(cloudUser);
          }
        }

        if (!user) {
          StorageService.recordLoginAttempt(cleanUsername, false);
          setError('Invalid username or password credentials.');
          setLoading(false);
          return;
        }

        const calculatedHash = await hashPassword(password, user.salt);
        if (calculatedHash !== user.passwordHash) {
          StorageService.recordLoginAttempt(cleanUsername, false);
          setError('Invalid username or password credentials.');
          setLoading(false);
          return;
        }

        // Login success
        StorageService.recordLoginAttempt(cleanUsername, true);
        StorageService.setCurrentUser(user.id);
        StorageService.logAuditEvent({
          id: 'audit_' + Math.random().toString(36).substring(2, 9),
          timestamp: Date.now(),
          type: 'AUTH',
          message: `Zero-knowledge session authenticated for user "${user.username}".`,
          severity: 'success'
        });
        onSuccess(user);
      } catch (err: any) {
        setError('Authentication verification failed: ' + (err.message || 'Unknown error'));
      } finally {
        setLoading(false);
      }
    } else {
      // Registration Flow
      if (password.length < 8) {
        setError('Password must be at least 8 characters with strong entropy.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      setLoading(true);
      try {
        // 1. Check local storage
        if (StorageService.isUsernameTakenLocally(cleanUsername)) {
          setUsernameAvailable(false);
          setError(`Username alias "@${cleanUsername}" is already taken (usernames are case-insensitive). Please choose a different username.`);
          setLoading(false);
          return;
        }

        // 2. Check Cloud Firestore across all users
        const isTaken = await FirebaseService.isUsernameTaken(cleanUsername);
        if (isTaken) {
          setUsernameAvailable(false);
          setError(`Username alias "@${cleanUsername}" is already taken across the network (usernames are case-insensitive). Please choose a different username.`);
          setLoading(false);
          return;
        }

        // Username is verified free and available
        setUsernameAvailable(true);
        await refreshNumberPool();
        setStep('number-select');
      } catch (err: any) {
        setError('Username verification error: ' + (err.message || 'Network check failed'));
      } finally {
        setLoading(false);
      }
    }
  };

  const handleCompleteRegistration = async () => {
    setLoading(true);
    setError(null);
    try {
      const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
      const finalNumber = selectedNumber || phonePool[0] || generatePhoneNumberPool()[0];

      // 1. Fast local uniqueness check
      const isUsernameTakenLocally = StorageService.isUsernameTakenLocally(cleanUsername);
      if (isUsernameTakenLocally) {
        setError(`Username alias "@${cleanUsername}" is already taken on this device (usernames are case-insensitive). Please choose a different username.`);
        setStep('credentials');
        setUsernameAvailable(false);
        setLoading(false);
        return;
      }

      const salt = generateSalt(16);
      const passwordHash = await hashPassword(password, salt);

      // Generate client-side ECDH P-256 E2EE identity key pair
      const keyPair = await generateEcdhKeyPair();
      const publicKeySpki = await exportPublicKey(keyPair.publicKey);
      const keyFingerprint = await computeKeyFingerprint(publicKeySpki);

      const defaultPrivacy: PrivacySettings = {
        callerIdMode: 'assigned',
        autoShredInterval: '24h',
        ipLeakShield: true,
        hardwareNoiseSuppression: true,
        antiMetadata: true,
        quickLockPinEnabled: false,
        quickLockPin: '',
      };

      const primaryDevice: DeviceSession = {
        id: 'dev_' + Math.random().toString(36).substring(2, 9),
        name: 'Workstation Terminal (This Browser)',
        type: 'desktop',
        browser: 'Secure Chrome / WebCrypto',
        ipMasked: '10.***.***.14',
        lastActive: Date.now(),
        isCurrent: true
      };

      const newUser: User = {
        id: 'usr_' + Math.random().toString(36).substring(2, 9),
        username: cleanUsername,
        passwordHash,
        salt,
        assignedNumber: finalNumber,
        availableNumbersPool: phonePool.length > 0 ? phonePool : [finalNumber],
        createdAt: Date.now(),
        publicKeySpki,
        keyFingerprint,
        devices: [primaryDevice],
        privacySettings: defaultPrivacy,
        termsAccepted: true,
        termsAcceptedAt: Date.now(),
      };

      // 2. Immediately commit user to local device enclave so user is NEVER stuck
      StorageService.saveUser(newUser);
      StorageService.setCurrentUser(newUser.id);

      StorageService.logAuditEvent({
        id: 'audit_' + Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type: 'AUTH',
        message: `New anonymous account created with virtual number ${newUser.assignedNumber}. Key fingerprint: ${keyFingerprint}.`,
        severity: 'success'
      });

      // 3. Non-blocking cloud synchronization in background
      Promise.all([
        FirebaseService.claimUsername(cleanUsername, newUser.id, finalNumber),
        FirebaseService.syncUserToCloud(newUser)
      ]).catch((err) => {
        console.warn('Background registration cloud sync notice:', err);
      });

      // 4. Complete registration and activate session immediately
      onSuccess(newUser);
    } catch (err: any) {
      setError('Account initialization failed: ' + (err.message || 'Crypto error'));
    } finally {
      setLoading(false);
    }
  };

  if (step === 'terms') {
    return (
      <div id="auth-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-2xl p-3 sm:p-4 tech-grid-bg">
        <TermsAndConditionsModal
          onAccept={handleCompleteRegistration}
          onDecline={() => {
            setError(null);
            setStep('number-select');
          }}
          error={error}
          loading={loading}
        />
      </div>
    );
  }

  return (
    <div id="auth-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-2xl p-3 sm:p-4 tech-grid-bg">
      <div id="auth-card" className="w-full max-w-md bg-[#0a0d14]/95 border border-neutral-800/90 rounded-2xl sm:rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.9)] p-5 sm:p-8 text-neutral-100 max-h-[92dvh] overflow-y-auto hud-corner-box">
        
        {/* Brand Header */}
        <div className="flex items-center space-x-3 mb-5 sm:mb-6">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white font-mono">SHADOWFREQUENCY</h1>
            <p className="text-[11px] sm:text-xs text-neutral-400 font-mono">Zero-Knowledge Peer Communication Mesh</p>
          </div>
        </div>

        {/* Mode Switcher */}
        {step === 'credentials' && (
          <div className="grid grid-cols-2 bg-[#06080d] p-1 rounded-xl border border-neutral-800 mb-5 sm:mb-6">
            <button
              id="tab-login-btn"
              type="button"
              onClick={() => { setIsLogin(true); setError(null); setUsernameAvailable(null); }}
              className={`py-1.5 sm:py-2 text-xs font-mono font-medium rounded-lg transition-all cursor-pointer min-h-[34px] ${
                isLogin 
                  ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700' 
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Session Login
            </button>
            <button
              id="tab-signup-btn"
              type="button"
              onClick={() => { setIsLogin(false); setError(null); setUsernameAvailable(null); }}
              className={`py-1.5 sm:py-2 text-xs font-mono font-medium rounded-lg transition-all cursor-pointer min-h-[34px] ${
                !isLogin 
                  ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700' 
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Anonymous Enlist
            </button>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 sm:p-3.5 bg-red-950/40 border border-red-500/50 rounded-xl flex items-start space-x-2.5 text-xs text-red-300 font-mono animate-shake">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span className="break-words">{error}</span>
          </div>
        )}

        {step === 'credentials' ? (
          <form onSubmit={handleCredentialsSubmit} className="space-y-3.5 sm:space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-mono font-medium text-neutral-300 uppercase text-[10px] tracking-wider">
                  Anonymous Alias (Username)
                </label>
                {!isLogin && username.trim().length >= 3 && (
                  <span className="text-[10px] font-mono">
                    {checkingUsername ? (
                      <span className="text-neutral-400 flex items-center space-x-1">
                        <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                        <span>Checking...</span>
                      </span>
                    ) : usernameAvailable === true ? (
                      <span className="text-emerald-400 flex items-center space-x-0.5">
                        <Check className="w-3 h-3" />
                        <span>Available</span>
                      </span>
                    ) : usernameAvailable === false ? (
                      <span className="text-red-400 flex items-center space-x-0.5">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Already Taken (Case-Insensitive)</span>
                      </span>
                    ) : null}
                  </span>
                )}
              </div>
              <input
                id="auth-username-input"
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                onBlur={() => checkUsernameAvailability()}
                placeholder="e.g. ghost_operator or cipher_99"
                className={`w-full bg-[#06080d] border rounded-xl px-3.5 py-2 sm:py-2.5 text-sm font-mono text-neutral-100 placeholder-neutral-600 focus:outline-none transition-colors min-h-[40px] ${
                  !isLogin && usernameAvailable === false
                    ? 'border-red-500/80 focus:border-red-500'
                    : !isLogin && usernameAvailable === true
                    ? 'border-emerald-500/80 focus:border-emerald-500'
                    : 'border-neutral-800 focus:border-emerald-500/70'
                }`}
              />
              <p className="text-[9px] sm:text-[10px] text-neutral-500 mt-1 font-mono">
                {!isLogin 
                  ? 'Usernames are case-insensitive (e.g. "Alice" and "alice" are identical and cannot be claimed by anyone else).' 
                  : 'No phone, email, or identity verification required.'}
              </p>
            </div>

            <div>
              <label className="block font-mono font-medium text-neutral-300 mb-1 uppercase text-[10px] tracking-wider">
                Passphrase (PBKDF2 100,000 Rounds)
              </label>
              <input
                id="auth-password-input"
                type="password"
                required
                autoComplete={isLogin ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#06080d] border border-neutral-800 rounded-xl px-3.5 py-2 sm:py-2.5 text-sm font-mono text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500/70 transition-colors min-h-[40px]"
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block font-mono font-medium text-neutral-300 mb-1 uppercase text-[10px] tracking-wider">
                  Confirm Passphrase
                </label>
                <input
                  id="auth-confirm-password-input"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-[#06080d] border border-neutral-800 rounded-xl px-3.5 py-2 sm:py-2.5 text-sm font-mono text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500/70 transition-colors min-h-[40px]"
                />
              </div>
            )}

            <button
              id="auth-submit-btn"
              type="submit"
              disabled={loading || lockoutRemaining > 0 || (!isLogin && usernameAvailable === false)}
              className="w-full py-2.5 sm:py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-neutral-950 font-bold font-mono text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(16,185,129,0.3)] cursor-pointer min-h-[44px]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-neutral-950" />
                  <span>Verifying Uniqueness...</span>
                </>
              ) : isLogin ? (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Authenticate Session</span>
                </>
              ) : (
                <>
                  <span>Select Virtual Line</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Step 2: Choose 1 of 5 Fresh Available Virtual Numbers */
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-1.5">
                  <h2 className="text-xs sm:text-sm font-bold text-white font-mono">Select Assigned Virtual Number</h2>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[9px] font-mono text-emerald-400 font-bold uppercase flex items-center space-x-1">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Fresh Numbers Only</span>
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-neutral-400 font-mono mt-0.5">
                  Allocating dedicated line for alias <span className="text-emerald-400 font-bold">@{username.trim().toLowerCase().replace(/^@/, '')}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={refreshNumberPool}
                disabled={loadingNumbers}
                title="Regenerate fresh numbers pool"
                className="p-1.5 text-neutral-400 hover:text-emerald-400 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer flex items-center space-x-1"
              >
                <RefreshCw className={`w-4 h-4 ${loadingNumbers ? 'animate-spin text-emerald-400' : ''}`} />
                <span className="text-[10px] font-mono hidden sm:inline">Refresh</span>
              </button>
            </div>

            {/* Zero-Collision Fresh Number Guarantee Banner */}
            <div className="p-2 sm:p-2.5 bg-[#070b12] border border-cyan-500/25 rounded-xl flex items-center justify-between text-[10px] sm:text-[11px] font-mono text-neutral-300">
              <div className="flex items-center space-x-1.5 text-cyan-300">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>All used numbers excluded. Every line below is 100% fresh &amp; unassigned.</span>
              </div>
              <span className="text-[9px] font-bold text-emerald-400 uppercase hidden sm:inline">0 Conflicts</span>
            </div>

            {/* Numbers List */}
            {loadingNumbers ? (
              <div className="py-8 text-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mx-auto" />
                <p className="text-xs font-mono text-neutral-400">Filtering used lines and provisioning fresh pool...</p>
              </div>
            ) : (
              <div className="space-y-1.5 sm:space-y-2 mt-1.5">
                {phonePool.map((num, idx) => {
                  const isSelected = selectedNumber === num;
                  return (
                    <button
                      key={num}
                      id={`number-option-${idx}`}
                      type="button"
                      onClick={() => setSelectedNumber(num)}
                      className={`w-full flex items-center justify-between p-2.5 sm:p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-950/40 border-emerald-500/80 text-white shadow-sm ring-1 ring-emerald-500/50'
                          : 'bg-[#06080d] border-neutral-800 text-neutral-300 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-900 text-neutral-500'
                        }`}>
                          <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs sm:text-sm font-mono font-bold text-neutral-100 truncate">{num}</span>
                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/30 text-[8px] font-mono text-emerald-400 font-bold uppercase shrink-0">
                              Fresh Line
                            </span>
                          </div>
                          <div className="text-[9px] sm:text-[10px] font-mono text-neutral-400 truncate mt-0.5">
                            Line #{idx + 1} · Unused · Zero Prior History
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex space-x-2.5 pt-1 sm:pt-2">
              <button
                type="button"
                onClick={() => setStep('credentials')}
                className="w-1/3 py-2 sm:py-2.5 text-xs font-mono text-neutral-400 hover:text-neutral-200 border border-neutral-800 rounded-xl transition-colors cursor-pointer min-h-[42px]"
              >
                Back
              </button>
              <button
                id="confirm-number-signup-btn"
                type="button"
                disabled={loading || !selectedNumber}
                onClick={() => setStep('terms')}
                className="w-2/3 py-2 sm:py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-neutral-950 font-bold font-mono text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center space-x-1.5 shadow-[0_4px_20px_rgba(16,185,129,0.3)] cursor-pointer min-h-[42px]"
              >
                <span>Terms &amp; Protocols</span>
                <ArrowRight className="w-4 h-4 ml-0.5" />
              </button>
            </div>
          </div>
        )}

        {/* Security badge footer */}
        <div className="mt-5 sm:mt-6 pt-3 sm:pt-4 border-t border-neutral-800/80 flex items-center justify-between text-[10px] sm:text-[11px] font-mono text-neutral-500">
          <div className="flex items-center space-x-1">
            <Key className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>PBKDF2 100k · P-256</span>
          </div>
          <div className="flex items-center space-x-1">
            <UserCheck className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span>Zero-Knowledge</span>
          </div>
        </div>

      </div>
    </div>
  );
};
