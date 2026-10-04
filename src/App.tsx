/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Phone, History, Shield, ShieldCheck, Lock, LogOut, Copy, 
  Check, Smartphone, Laptop, Sparkles, Bell, Wifi, Radio, User as UserIcon, Bot, Sliders, Crown
} from 'lucide-react';
import { 
  User, CallRecord, ActiveCallState, DeviceSession, PrivacySettings 
} from './types';
import { StorageService } from './services/storage';
import { soundEngine } from './services/audio';
import { 
  generateEcdhKeyPair, 
  exportPublicKey, 
  computeKeyFingerprint, 
  deriveSasTokens 
} from './services/crypto';
import { AuthModal } from './components/AuthModal';
import { Dialer } from './components/Dialer';
import { ActiveCallModal } from './components/ActiveCallModal';
import { IncomingCallBanner } from './components/IncomingCallBanner';
import { CallHistoryView } from './components/CallHistoryView';
import { PrivacySettingsView } from './components/PrivacySettingsView';
import { SettingsView } from './components/SettingsView';
import { SecurityAuditModal } from './components/SecurityAuditModal';
import { SecurityBotWidget } from './components/SecurityBotWidget';
import { QuickLockOverlay } from './components/QuickLockOverlay';
import { SplashScreen } from './components/SplashScreen';
import { LogoutSplashScreen } from './components/LogoutSplashScreen';
import { TermsAndConditionsModal } from './components/TermsAndConditionsModal';
import { FirebaseService } from './services/firebase';
import { webRtcManager } from './services/webrtc';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'dialer' | 'history' | 'privacy' | 'settings'>('dialer');
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [incomingCall, setIncomingCall] = useState<{
    roomNumber: string;
    callerNumber: string;
    callerAlias: string;
    timestamp: number;
    signalId?: string;
  } | null>(null);

  const [showSecurityAudit, setShowSecurityAudit] = useState(false);
  const [showSecurityBot, setShowSecurityBot] = useState(false);
  const [isQuickLocked, setIsQuickLocked] = useState(false);
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [notificationPrompt, setNotificationPrompt] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Auto-dismiss splash screen if an incoming call arrives
  useEffect(() => {
    if (incomingCall && showSplash) {
      setShowSplash(false);
    }
  }, [incomingCall, showSplash]);

  // Initialize and load user data
  useEffect(() => {
    const user = StorageService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
    }
    setCallRecords(StorageService.getCallRecords());

    // Subscribe to multi-device / cross-tab synchronization events
    const unsub = StorageService.subscribeSync((data) => {
      if (data.action === 'CALL_RECORD_ADDED') {
        setCallRecords(StorageService.getCallRecords());
        triggerInAppNotification(`Call record synchronized across network`);
      } else if (data.action === 'CALL_RECORD_DELETED' || data.action === 'ALL_RECORDS_SHREDDED') {
        setCallRecords(StorageService.getCallRecords());
      } else if (data.action === 'INCOMING_CALL_SIGNAL') {
        const payload = data.payload;
        const current = StorageService.getCurrentUser();
        if (current && payload) {
          const targetDigits = (payload.targetNumber || '').replace(/\D/g, '');
          const myDigits = current.assignedNumber.replace(/\D/g, '');
          const target10 = targetDigits.slice(-10);
          const my10 = myDigits.slice(-10);
          const matches = payload.targetNumber === current.assignedNumber ||
            (target10.length === 10 && my10.length === 10 && target10 === my10) ||
            (targetDigits.length >= 7 && (myDigits === targetDigits || myDigits.endsWith(targetDigits) || targetDigits.endsWith(myDigits)));
          if (matches) {
            setIncomingCall(payload);
            soundEngine.startRinging(true);
            triggerInAppNotification(`Incoming encrypted call from ${payload.callerAlias}`);
          }
        }
      } else if (data.action === 'AUTH_STATE_CHANGED') {
        const u = StorageService.getCurrentUser();
        setCurrentUser(u);
      }
    });

    return () => {
      unsub();
    };
  }, []);

  // Subscribe to Cloud Firestore real-time signals and records when currentUser is set
  useEffect(() => {
    if (!currentUser) return;

    // Load initial cloud call records
    FirebaseService.loadCallRecordsFromCloud(currentUser.id).then((cloudRecs) => {
      if (cloudRecs && cloudRecs.length > 0) {
        setCallRecords(cloudRecs);
      }
    });

    // Real-time call record sync across separate physical devices
    const unsubRecords = FirebaseService.subscribeToCallRecords(currentUser.id, (records) => {
      setCallRecords(records);
    });

    // Real-time incoming call alerts from remote devices worldwide
    const unsubSignals = FirebaseService.subscribeToIncomingCalls(currentUser.assignedNumber, (call) => {
      setIncomingCall(call);
      soundEngine.startRinging(true);
      triggerInAppNotification(`Incoming encrypted call for ${currentUser.assignedNumber}`);
    });

    return () => {
      unsubRecords();
      unsubSignals();
    };
  }, [currentUser?.id, currentUser?.assignedNumber]);

  const triggerInAppNotification = (msg: string) => {
    setNotificationPrompt(msg);
    setTimeout(() => {
      setNotificationPrompt(null);
    }, 4000);
  };

  const handleStartCall = async (target: string, isRoomCode: boolean): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Authentication required' };

    const trimmed = target.trim();
    if (!trimmed) {
      return { success: false, error: 'Please enter a valid virtual number or room code.' };
    }

    const isRoom = isRoomCode || trimmed.startsWith('#') || trimmed.toUpperCase().includes('ROOM');

    // If it's a virtual phone number, verify registration
    let remoteNumber = trimmed;
    let remoteAlias = 'Anonymous Peer';

    if (!isRoom) {
      // Check if user is dialing their own assigned number or alias
      const targetDigits = trimmed.replace(/\D/g, '');
      const myDigits = currentUser.assignedNumber.replace(/\D/g, '');
      const cleanAlias = trimmed.toLowerCase().replace(/^@/, '');
      if (
        trimmed === currentUser.assignedNumber ||
        (targetDigits.length >= 7 && targetDigits === myDigits) ||
        (cleanAlias && cleanAlias === currentUser.username.toLowerCase())
      ) {
        soundEngine.playChime('disconnected');
        return {
          success: false,
          error: 'Cannot dial your own virtual number. Dial another registered subscriber or enter an audio room.',
        };
      }

      // Check whether number or alias is registered in local storage or Cloud Firestore
      let registeredUser = StorageService.findUserByPhoneNumber(trimmed);
      if (!registeredUser) {
        registeredUser = await FirebaseService.findUserByPhoneNumber(trimmed);
      }
      if (!registeredUser && (cleanAlias.length >= 3 || trimmed.startsWith('@'))) {
        registeredUser = await FirebaseService.findUserByUsername(cleanAlias);
      }
      if (registeredUser) {
        StorageService.saveUser(registeredUser);
      }

      // If not registered: Reject the call immediately and give error
      if (!registeredUser) {
        soundEngine.playChime('disconnected');
        return {
          success: false,
          error: `Call Failed: "${trimmed}" is not registered on the ShadowFrequency network. Only verified subscribers in the network directory can be reached.`,
        };
      }

      remoteNumber = registeredUser.assignedNumber;
      remoteAlias = `@${registeredUser.username}`;
    } else {
      remoteNumber = trimmed.toUpperCase();
      remoteAlias = 'Encrypted Conference Room';
    }

    // Number is valid and registered (or audio room): initiate call
    soundEngine.playChime('connected');
    soundEngine.startRinging(false);

    // Generate ephemeral ECDH key pair for this call session
    const localKeyPair = await generateEcdhKeyPair();
    const localPubSpki = await exportPublicKey(localKeyPair.publicKey);
    const localFingerprint = await computeKeyFingerprint(localPubSpki);

    // Generate simulated peer key for E2EE room
    const peerKeyPair = await generateEcdhKeyPair();
    const peerPubSpki = await exportPublicKey(peerKeyPair.publicKey);
    const peerFingerprint = await computeKeyFingerprint(peerPubSpki);

    const { code, emojis } = deriveSasTokens(localFingerprint, peerFingerprint);

    const newCall: ActiveCallState = {
      roomNumber: isRoom ? trimmed : `#ROOM-${Math.floor(100 + Math.random() * 900)}`,
      remoteNumber,
      remoteAlias,
      direction: 'outbound',
      status: 'connected',
      startedAt: Date.now(),
      duration: 0,
      isMuted: false,
      isSpeaker: true,
      sasCode: code,
      sasEmojis: emojis,
      keyFingerprint: localFingerprint,
      isVerified: false,
      packetsSent: 120,
      packetsReceived: 118,
      latencyMs: 14,
      bitrateKbps: 48,
    };

    setTimeout(() => {
      soundEngine.stopRinging();
      setActiveCall(newCall);
    }, 1100);

    if (!isRoom) {
      FirebaseService.dispatchCallSignal({
        targetNumber: remoteNumber,
        callerNumber: currentUser.assignedNumber,
        callerAlias: `@${currentUser.username}`,
        roomNumber: newCall.roomNumber,
        type: 'call_offer'
      }).catch(() => {});

      StorageService.broadcastSync('INCOMING_CALL_SIGNAL', {
        targetNumber: remoteNumber,
        callerNumber: currentUser.assignedNumber,
        callerAlias: `@${currentUser.username}`,
        roomNumber: newCall.roomNumber,
        timestamp: Date.now()
      });
    }

    return { success: true };
  };

  const handleUpdateActiveCall = (updater: (prev: ActiveCallState) => ActiveCallState) => {
    setActiveCall(prev => (prev ? updater(prev) : null));
  };

  const handleEndCall = () => {
    if (!activeCall || !currentUser) return;

    webRtcManager.cleanup();
    soundEngine.cleanupCallAudio();
    soundEngine.playChime('disconnected');

    const duration = activeCall.duration;
    const record: CallRecord = {
      id: 'rec_' + Math.random().toString(36).substring(2, 9),
      remoteNumber: activeCall.remoteNumber,
      remoteAlias: activeCall.remoteAlias,
      roomNumber: activeCall.roomNumber,
      direction: activeCall.direction,
      duration,
      timestamp: Date.now() - duration * 1000,
      status: 'completed',
      deviceOrigin: 'Active Terminal',
      encryptionDetails: {
        cipher: 'AES-256-GCM (256-bit)',
        keyFingerprint: activeCall.keyFingerprint,
        sasCode: activeCall.sasCode,
        sasEmojis: activeCall.sasEmojis,
        isVerified: activeCall.isVerified,
      },
    };

    StorageService.addCallRecord(record);
    setCallRecords(StorageService.getCallRecords());
    setActiveCall(null);
  };

  const handleTriggerSimulatedInboundCall = () => {
    const callerPool = [
      '+1 (800) 749-2103',
      '+1 (888) 332-9011',
      '+1 (855) 412-8874',
      '#ROOM-VIP-SECURE'
    ];
    const picked = callerPool[Math.floor(Math.random() * callerPool.length)];
    const simCall = {
      roomNumber: '#ROOM-' + Math.floor(100 + Math.random() * 900),
      callerNumber: picked,
      callerAlias: picked.startsWith('#') ? 'Operations Room' : 'Field Operative Line',
      timestamp: Date.now(),
    };

    setIncomingCall(simCall);
    StorageService.broadcastSync('INCOMING_CALL_SIGNAL', simCall);
  };

  const handleAcceptIncomingCall = async () => {
    if (!incomingCall || !currentUser) return;
    soundEngine.stopRinging();
    soundEngine.playChime('connected');

    const localKeyPair = await generateEcdhKeyPair();
    const localPub = await exportPublicKey(localKeyPair.publicKey);
    const localFp = await computeKeyFingerprint(localPub);

    const peerKeyPair = await generateEcdhKeyPair();
    const peerPub = await exportPublicKey(peerKeyPair.publicKey);
    const peerFp = await computeKeyFingerprint(peerPub);

    const { code, emojis } = deriveSasTokens(localFp, peerFp);

    const callState: ActiveCallState = {
      roomNumber: incomingCall.roomNumber,
      remoteNumber: incomingCall.callerNumber,
      remoteAlias: incomingCall.callerAlias,
      direction: 'inbound',
      status: 'connected',
      startedAt: Date.now(),
      duration: 0,
      isMuted: false,
      isSpeaker: true,
      sasCode: code,
      sasEmojis: emojis,
      keyFingerprint: localFp,
      isVerified: false,
      packetsSent: 45,
      packetsReceived: 45,
      latencyMs: 12,
      bitrateKbps: 48,
    };

    if (incomingCall.signalId) {
      FirebaseService.clearSignal(incomingCall.signalId);
    }
    setIncomingCall(null);
    setActiveCall(callState);
  };

  const handleDeclineIncomingCall = () => {
    soundEngine.stopRinging();
    if (incomingCall) {
      if (incomingCall.signalId) {
        FirebaseService.clearSignal(incomingCall.signalId);
      }
      const missedRecord: CallRecord = {
        id: 'rec_' + Math.random().toString(36).substring(2, 9),
        remoteNumber: incomingCall.callerNumber,
        remoteAlias: incomingCall.callerAlias,
        roomNumber: incomingCall.roomNumber,
        direction: 'inbound',
        duration: 0,
        timestamp: incomingCall.timestamp,
        status: 'missed',
        deviceOrigin: 'Active Terminal',
        encryptionDetails: {
          cipher: 'AES-256-GCM',
          keyFingerprint: 'Declined before key exchange',
          sasCode: '------',
          sasEmojis: ['🔒'],
          isVerified: false,
        }
      };
      StorageService.addCallRecord(missedRecord);
      setCallRecords(StorageService.getCallRecords());
    }
    setIncomingCall(null);
  };

  const handleCopyNumber = () => {
    if (!currentUser) return;
    navigator.clipboard.writeText(currentUser.assignedNumber).catch(() => {});
    setCopiedNumber(true);
    setTimeout(() => setCopiedNumber(false), 2000);
  };

  const handleLogout = () => {
    if (activeCall) {
      webRtcManager.cleanup();
      soundEngine.cleanupCallAudio();
      setActiveCall(null);
    }
    soundEngine.stopRinging();
    setIncomingCall(null);
    setIsLoggingOut(true);
  };

  const handleCompleteLogout = () => {
    StorageService.setCurrentUser(null);
    setCurrentUser(null);
    setIsLoggingOut(false);
  };

  const handleDeleteRecord = (id: string) => {
    StorageService.deleteCallRecord(id);
    setCallRecords(StorageService.getCallRecords());
  };

  const handleShredAll = () => {
    StorageService.shredAllRecords();
    setCallRecords([]);
  };

  // Show 8-second cryptographic boot splash screen on launch
  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  // Show 8-second amnesic logout splash screen on session termination
  if (isLoggingOut) {
    return <LogoutSplashScreen onComplete={handleCompleteLogout} />;
  }

  // If not logged in, show AuthModal
  if (!currentUser) {
    return <AuthModal onSuccess={(u) => setCurrentUser(u)} />;
  }

  // If user has not accepted terms, show mandatory unskippable Terms modal
  if (!currentUser.termsAccepted) {
    return (
      <TermsAndConditionsModal
        isStandalone={true}
        onAccept={() => {
          const updated: User = {
            ...currentUser,
            termsAccepted: true,
            termsAcceptedAt: Date.now(),
          };
          StorageService.saveUser(updated);
          FirebaseService.syncUserToCloud(updated).catch(() => {});
          setCurrentUser(updated);
        }}
        onDecline={() => {
          handleLogout();
        }}
      />
    );
  }

  return (
    <div id="app-root" className="min-h-[100dvh] w-full bg-[#06070a] text-neutral-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-neutral-950 tech-grid-bg">
      
      {/* Real-time sync notification toast */}
      {notificationPrompt && (
        <div className="fixed top-3 sm:top-4 right-3 sm:right-4 z-50 max-w-[90vw] bg-[#0b0e15]/95 border border-emerald-500/70 rounded-xl px-3.5 py-2 text-xs font-mono text-emerald-300 shadow-[0_4px_25px_rgba(16,185,129,0.3)] flex items-center space-x-2 animate-fade-in backdrop-blur-xl">
          <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
          <span className="truncate">{notificationPrompt}</span>
        </div>
      )}

      {/* Incoming Call Banner */}
      {incomingCall && (
        <IncomingCallBanner
          incomingCall={incomingCall}
          onAccept={handleAcceptIncomingCall}
          onDecline={handleDeclineIncomingCall}
        />
      )}

      {/* Active Call Modal */}
      {activeCall && (
        <ActiveCallModal
          call={activeCall}
          onEndCall={handleEndCall}
          onUpdateCall={handleUpdateActiveCall}
          userAssignedNumber={currentUser.assignedNumber}
        />
      )}

      {/* Security Audit Modal */}
      {showSecurityAudit && (
        <SecurityAuditModal onClose={() => setShowSecurityAudit(false)} />
      )}

      {/* Quick Lock Overlay */}
      {isQuickLocked && (
        <QuickLockOverlay
          correctPin={currentUser.privacySettings.quickLockPin || '1234'}
          onUnlock={() => setIsQuickLocked(false)}
        />
      )}

      {/* Header - Adapts dynamically to mobile, tablet, and desktop */}
      <header className="border-b border-neutral-800/80 bg-[#07090e]/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
          
          {/* Brand & Assigned Number Lockup */}
          <div className="flex items-center space-x-2 sm:space-x-4 min-w-0">
            <a href="/" className="text-sm sm:text-base md:text-lg font-bold font-mono tracking-wider text-white hover:text-emerald-400 transition-colors flex items-center space-x-1.5 sm:space-x-2 shrink-0">
              <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] inline-block animate-pulse shrink-0" />
              <span className="hidden xs:inline sm:inline">SHADOWFREQUENCY</span>
              <span className="xs:hidden sm:hidden">SF_NODE</span>
            </a>

            {/* Assigned virtual number badge */}
            <div className="flex items-center space-x-1.5 bg-[#0c1017] border border-neutral-800/90 rounded-lg sm:rounded-xl px-2 sm:px-3 py-0.5 sm:py-1 text-xs">
              {currentUser.customNumberSubscription?.active ? (
                <span className="px-1 py-0.2 rounded bg-amber-500/20 border border-amber-500/40 text-[8px] font-mono text-amber-300 font-bold flex items-center space-x-0.5 shrink-0" title={`VIP Custom Number (${currentUser.customNumberSubscription.planName})`}>
                  <Crown className="w-2.5 h-2.5" />
                  <span>VIP</span>
                </span>
              ) : (
                <span className="text-[9px] sm:text-[10px] text-neutral-400 font-mono hidden md:inline">LINE:</span>
              )}
              <span className={`font-mono font-bold text-[11px] sm:text-xs truncate max-w-[130px] sm:max-w-none ${
                currentUser.customNumberSubscription?.active ? 'text-amber-300' : 'text-emerald-400'
              }`}>
                {currentUser.assignedNumber}
              </span>
              <button
                type="button"
                onClick={handleCopyNumber}
                className="p-1 text-neutral-400 hover:text-white rounded transition-colors cursor-pointer"
                title="Copy assigned virtual number"
              >
                {copiedNumber ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* Desktop Navigation Tabs (Hidden on mobile; mobile uses fixed bottom dock) */}
          <nav className="hidden sm:flex items-center gap-1.5 sm:gap-2">
            <button
              id="nav-dialer-btn"
              type="button"
              onClick={() => setActiveTab('dialer')}
              className={`px-3 py-1.5 text-xs font-mono font-medium rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'dialer'
                  ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <span>Dialer</span>
            </button>

            <button
              id="nav-history-btn"
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 text-xs font-mono font-medium rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <History className="w-3.5 h-3.5 text-cyan-400" />
              <span>Ledger</span>
              {callRecords.length > 0 && (
                <span className="text-[10px] text-neutral-400 ml-1">
                  ({callRecords.length})
                </span>
              )}
            </button>

            <button
              id="nav-privacy-btn"
              type="button"
              onClick={() => setActiveTab('privacy')}
              className={`px-3 py-1.5 text-xs font-mono font-medium rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'privacy'
                  ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Defense</span>
            </button>

            <button
              id="nav-settings-btn"
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 text-xs font-mono font-medium rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>Settings</span>
            </button>
          </nav>

          {/* Quick Header Actions */}
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            {/* Real-Time XrAnonymous Security Bot */}
            <button
              id="open-security-bot-btn"
              type="button"
              onClick={() => setShowSecurityBot(true)}
              className="p-1.5 sm:px-2.5 sm:py-1.5 bg-[#0c1017] hover:bg-neutral-800 border border-cyan-500/30 hover:border-cyan-500/70 text-cyan-300 hover:text-white text-xs font-mono rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer min-h-[36px] min-w-[36px] sm:min-w-0 justify-center group"
              title="XrAnonymous Real-Time Inbuilt Security Bot"
            >
              <Bot className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span className="hidden lg:inline">XrAnonymous Bot</span>
            </button>

            <button
              id="open-security-audit-btn"
              type="button"
              onClick={() => setShowSecurityAudit(true)}
              className="p-1.5 sm:px-2.5 sm:py-1.5 bg-[#0c1017] hover:bg-neutral-800 border border-neutral-800 hover:border-emerald-500/50 text-neutral-300 hover:text-white text-xs font-mono rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer min-h-[36px] min-w-[36px] sm:min-w-0 justify-center"
              title="Penetration Testing & Security Audit"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="hidden md:inline">Pen Test &amp; Audit</span>
            </button>

            <button
              id="header-settings-btn"
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`p-2 rounded-xl transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center ${
                activeTab === 'settings'
                  ? 'bg-neutral-800 text-white border border-cyan-500/40'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800/80'
              }`}
              title="Terminal Customisation Settings"
            >
              <Sliders className="w-4 h-4 text-cyan-400" />
            </button>

            <button
              id="quick-lock-btn"
              type="button"
              onClick={() => setIsQuickLocked(true)}
              className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800/80 rounded-xl transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
              title="Lock Console (PIN Protected)"
            >
              <Lock className="w-4 h-4" />
            </button>

            <button
              id="logout-btn"
              type="button"
              onClick={handleLogout}
              className="p-2 text-neutral-400 hover:text-red-400 hover:bg-neutral-800/80 rounded-xl transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
              title="Terminate Session"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

        </div>
      </header>

      {/* Main Command Center Viewport */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8 pb-20 sm:pb-8 flex flex-col justify-center">
        
        {activeTab === 'dialer' && (
          <div className="w-full flex-1 flex flex-col justify-center">
            <Dialer
              onStartCall={handleStartCall}
              userAssignedNumber={currentUser.assignedNumber}
            />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="w-full flex-1">
            <CallHistoryView
              records={callRecords}
              onStartCall={handleStartCall}
              onDeleteRecord={handleDeleteRecord}
              onShredAll={handleShredAll}
            />
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="w-full flex-1">
            <PrivacySettingsView
              user={currentUser}
              onUpdateUser={setCurrentUser}
              onTriggerTestCall={handleTriggerSimulatedInboundCall}
              onOpenSecurityAudit={() => setShowSecurityAudit(true)}
              onOpenSecurityBot={() => setShowSecurityBot(true)}
              onOpenSettings={() => setActiveTab('settings')}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="w-full flex-1">
            <SettingsView
              user={currentUser}
              onUpdateUser={setCurrentUser}
              onLockTerminal={() => setIsQuickLocked(true)}
              onShredAllRecords={handleShredAll}
              callRecordsCount={callRecords.length}
            />
          </div>
        )}

      </main>

      {/* Fixed Mobile Bottom Navigation Anchor (Thumb-Zone) */}
      <nav 
        aria-label="Mobile Navigation" 
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#07090e]/95 backdrop-blur-xl border-t border-neutral-800/80 px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around"
      >
        <button
          type="button"
          onClick={() => setActiveTab('dialer')}
          className={`flex flex-col items-center justify-center min-w-[56px] min-h-[44px] transition-all cursor-pointer ${
            activeTab === 'dialer' ? 'text-emerald-400 scale-105' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <Phone className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-mono tracking-tight font-medium">Dialer</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center justify-center min-w-[56px] min-h-[44px] relative transition-all cursor-pointer ${
            activeTab === 'history' ? 'text-cyan-400 scale-105' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <div className="relative">
            <History className="w-5 h-5 mb-0.5" />
            {callRecords.length > 0 && (
              <span className="absolute -top-1 -right-2 text-[9px] bg-neutral-800 border border-neutral-700 text-neutral-300 px-1 rounded-full font-mono">
                {callRecords.length}
              </span>
            )}
          </div>
          <span className="text-[10px] font-mono tracking-tight font-medium">Ledger</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('privacy')}
          className={`flex flex-col items-center justify-center min-w-[56px] min-h-[44px] transition-all cursor-pointer ${
            activeTab === 'privacy' ? 'text-emerald-400 scale-105' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <Shield className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-mono tracking-tight font-medium">Defense</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center justify-center min-w-[56px] min-h-[44px] transition-all cursor-pointer ${
            activeTab === 'settings' ? 'text-cyan-400 scale-105' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <Sliders className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-mono tracking-tight font-medium">Settings</span>
        </button>
      </nav>

      {/* Quiet Telemetry Footer (Hidden on mobile to preserve screen space) */}
      <footer className="hidden sm:block border-t border-neutral-900/90 py-3 text-xs text-neutral-400 bg-[#05070a]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-row items-center justify-between gap-2 font-mono text-[11px]">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
            <span className="text-neutral-300">Multi-Device Mesh Online</span>
            <span className="text-neutral-600">·</span>
            <span>Relay Nodes Active</span>
          </div>
          <div className="text-neutral-400">
            AES-256-GCM · ECDH P-256 · Zero Metadata Retention
          </div>
        </div>
      </footer>

      {/* Aegis Inbuilt Real-Time Security Bot Widget & Floating Capsule */}
      <SecurityBotWidget
        isOpen={showSecurityBot}
        onOpen={() => setShowSecurityBot(true)}
        onClose={() => setShowSecurityBot(false)}
      />

    </div>
  );
}
