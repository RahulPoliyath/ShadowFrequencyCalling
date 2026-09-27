/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Phone, Delete, Hash, ShieldCheck, Mic, MicOff, 
  Users, AlertTriangle, BookOpen, Loader2, Radio, Check, 
  CornerDownLeft, ShieldAlert, Cpu
} from 'lucide-react';
import { soundEngine } from '../services/audio';
import { FirebaseService } from '../services/firebase';
import { StorageService } from '../services/storage';

interface DialerProps {
  onStartCall: (target: string, isRoomCode: boolean) => Promise<{ success: boolean; error?: string }>;
  userAssignedNumber: string;
}

const KEYPAD_KEYS = [
  { digit: '1', sub: 'SYS' },
  { digit: '2', sub: 'ABC' },
  { digit: '3', sub: 'DEF' },
  { digit: '4', sub: 'GHI' },
  { digit: '5', sub: 'JKL' },
  { digit: '6', sub: 'MNO' },
  { digit: '7', sub: 'PQRS' },
  { digit: '8', sub: 'TUV' },
  { digit: '9', sub: 'WXYZ' },
  { digit: '*', sub: 'E2EE' },
  { digit: '0', sub: '+' },
  { digit: '#', sub: 'ROOM' },
];

export const Dialer: React.FC<DialerProps> = ({ onStartCall, userAssignedNumber }) => {
  const [targetNumber, setTargetNumber] = useState('');
  const [dialMode, setDialMode] = useState<'phone' | 'room'>('phone');
  const [micReady, setMicReady] = useState(true);
  const [callError, setCallError] = useState<string | null>(null);
  const [isDialing, setIsDialing] = useState(false);
  
  // Registered users directory
  const [registeredDirectory, setRegisteredDirectory] = useState<{ id: string; username: string; assignedNumber: string }[]>([]);
  const [showDirectory, setShowDirectory] = useState(false);
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  useEffect(() => {
    loadDirectory();
  }, []);

  const loadDirectory = async () => {
    setLoadingDirectory(true);
    try {
      const cloudUsers = await FirebaseService.getAllRegisteredUsers();
      const localUsers = StorageService.getUsers().map(u => ({
        id: u.id,
        username: u.username,
        assignedNumber: u.assignedNumber
      }));

      const mergedMap = new Map<string, { id: string; username: string; assignedNumber: string }>();
      [...cloudUsers, ...localUsers].forEach(u => {
        if (u.assignedNumber) {
          mergedMap.set(u.assignedNumber, u);
        }
      });

      setRegisteredDirectory(Array.from(mergedMap.values()));
    } catch {
      const localUsers = StorageService.getUsers().map(u => ({
        id: u.id,
        username: u.username,
        assignedNumber: u.assignedNumber
      }));
      setRegisteredDirectory(localUsers);
    } finally {
      setLoadingDirectory(false);
    }
  };

  const handleKeyPress = (digit: string) => {
    soundEngine.playDtmf(digit);
    setCallError(null);
    if (dialMode === 'room' && targetNumber === '') {
      setTargetNumber('#ROOM-' + digit);
    } else {
      setTargetNumber(prev => prev + digit);
    }
  };

  const handleBackspace = () => {
    soundEngine.playDtmf('3');
    setCallError(null);
    setTargetNumber(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    soundEngine.playChime('disconnected');
    setCallError(null);
    setTargetNumber('');
  };

  const handleDial = async () => {
    const trimmed = targetNumber.trim();
    if (!trimmed) return;
    setCallError(null);
    setIsDialing(true);

    const isRoom = trimmed.startsWith('#') || trimmed.toUpperCase().includes('ROOM');
    try {
      const res = await onStartCall(trimmed, isRoom);
      if (res && !res.success) {
        setCallError(res.error || 'The dialed number is not registered on the network.');
      } else {
        setTargetNumber('');
      }
    } catch (e: any) {
      setCallError(e.message || 'Call failed.');
    } finally {
      setIsDialing(false);
    }
  };

  const handleDirectDial = async (numberToCall: string) => {
    setCallError(null);
    setIsDialing(true);
    setTargetNumber(numberToCall);
    try {
      const res = await onStartCall(numberToCall, false);
      if (res && !res.success) {
        setCallError(res.error || 'The dialed number is not registered on the network.');
      } else {
        setTargetNumber('');
      }
    } catch (e: any) {
      setCallError(e.message || 'Call failed.');
    } finally {
      setIsDialing(false);
    }
  };

  const setPreset = (num: string) => {
    setCallError(null);
    setTargetNumber(num);
    soundEngine.playDtmf('5');
  };

  return (
    <div id="dialer-container" className="w-full max-w-sm sm:max-w-md mx-auto">
      {/* High-tech tactical chassis */}
      <div className="relative bg-[#0b0e14]/90 backdrop-blur-xl border border-neutral-800/80 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-7 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] hud-corner-box">
        
        {/* Top Status & Channel Mode */}
        <div className="flex items-center justify-between mb-3 sm:mb-4 pb-2 sm:pb-3 border-b border-neutral-800/60">
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] sm:text-[11px] font-mono tracking-wider text-neutral-400 uppercase">
              NODE ACTIVE
            </span>
            <span className="text-neutral-700">/</span>
            <span className="text-[10px] sm:text-[11px] font-mono text-emerald-400">P-256 RELAY</span>
          </div>

          <div className="text-[10px] sm:text-[11px] font-mono text-neutral-500">
            48kHz OPUS
          </div>
        </div>

        {/* Mode Selector Buttons */}
        <div className="flex bg-[#07090d] p-1 rounded-xl sm:rounded-2xl border border-neutral-800/90 mb-3 sm:mb-4">
          <button
            type="button"
            onClick={() => { setDialMode('phone'); setTargetNumber(''); setCallError(null); }}
            className={`flex-1 py-1.5 sm:py-2 text-[11px] sm:text-xs font-medium rounded-lg sm:rounded-xl flex items-center justify-center space-x-1.5 transition-all cursor-pointer min-h-[36px] ${
              dialMode === 'phone' 
                ? 'bg-neutral-800/90 text-emerald-300 shadow-[0_2px_12px_rgba(16,185,129,0.15)] border border-neutral-700' 
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Phone className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-emerald-400" />
            <span className="font-mono tracking-tight">Registered Line</span>
          </button>
          <button
            type="button"
            onClick={() => { setDialMode('room'); setTargetNumber('#ROOM-'); setCallError(null); }}
            className={`flex-1 py-1.5 sm:py-2 text-[11px] sm:text-xs font-medium rounded-lg sm:rounded-xl flex items-center justify-center space-x-1.5 transition-all cursor-pointer min-h-[36px] ${
              dialMode === 'room' 
                ? 'bg-neutral-800/90 text-cyan-300 shadow-[0_2px_12px_rgba(6,182,212,0.15)] border border-neutral-700' 
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Hash className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-cyan-400" />
            <span className="font-mono tracking-tight">Encrypted Room</span>
          </button>
        </div>

        {/* Call Rejection / Unregistered Error Banner */}
        {callError && (
          <div id="dial-error-banner" className="mb-3 sm:mb-4 bg-red-950/40 border border-red-500/50 rounded-xl sm:rounded-2xl p-3 text-left animate-shake shadow-[0_4px_20px_rgba(239,68,68,0.15)]">
            <div className="flex items-start space-x-2.5">
              <div className="p-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 shrink-0 mt-0.5">
                <ShieldAlert className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] sm:text-xs font-semibold text-red-300 tracking-wide font-mono">Signal Intercepted • Unregistered</div>
                <p className="text-[10px] sm:text-[11px] text-red-200/90 mt-0.5 leading-relaxed font-mono break-words">{callError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Illuminated Dial HUD Display */}
        <div className="relative mb-3 sm:mb-4 bg-[#06080c] border border-neutral-800/90 rounded-xl sm:rounded-2xl p-3 sm:p-4 text-center group focus-within:border-emerald-500/50 transition-colors">
          <div className="text-[9px] sm:text-[10px] font-mono text-neutral-400 tracking-widest uppercase mb-1 flex items-center justify-center space-x-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="truncate">{dialMode === 'room' ? 'SECURE MULTI-PEER AUDIO BRIDGE' : 'VERIFIED NETWORK SUBSCRIBERS ONLY'}</span>
          </div>

          <div className="flex items-center justify-center min-h-[36px] sm:min-h-[44px]">
            <input
              id="dial-input-field"
              type="text"
              value={targetNumber}
              onChange={(e) => {
                setTargetNumber(e.target.value);
                setCallError(null);
              }}
              placeholder={dialMode === 'room' ? '#ROOM-808' : '+1 (800) 000-0000 or @alias'}
              className="w-full bg-transparent text-center text-xl sm:text-2xl md:text-3xl font-mono font-semibold text-white tracking-widest focus:outline-none placeholder-neutral-700 selection:bg-emerald-500/30 truncate"
            />
          </div>

          {targetNumber && (
            <div className="absolute right-2 sm:right-3.5 top-1/2 -translate-y-1/2 flex items-center space-x-1">
              <button
                id="dial-backspace-btn"
                type="button"
                onClick={handleBackspace}
                className="p-1.5 sm:p-2 text-neutral-400 hover:text-white hover:bg-neutral-800/80 rounded-lg sm:rounded-xl transition-colors cursor-pointer"
                title="Backspace"
              >
                <Delete className="w-4 h-4" />
              </button>
            </div>
          )}

          {targetNumber && (
            <div className="mt-0.5 sm:mt-1 flex items-center justify-center space-x-2 text-[9px] sm:text-[10px] font-mono text-emerald-400/80">
              <span>LEN: {targetNumber.length}</span>
              <span>•</span>
              <button 
                type="button" 
                onClick={handleClear} 
                className="text-neutral-500 hover:text-neutral-300 underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Precision Keypad Grid - Responsive touch targets */}
        <div className="grid grid-cols-3 gap-1.5 xs:gap-2 sm:gap-2.5 md:gap-3 mb-3 sm:mb-4">
          {KEYPAD_KEYS.map(({ digit, sub }) => (
            <button
              key={digit}
              id={`keypad-btn-${digit === '*' ? 'star' : digit === '#' ? 'hash' : digit}`}
              type="button"
              onClick={() => handleKeyPress(digit)}
              className="group relative flex flex-col items-center justify-center h-11 xs:h-12 sm:h-13 md:h-14 bg-[#0e121a]/80 hover:bg-[#151c28] active:bg-emerald-950/40 border border-neutral-800/80 hover:border-emerald-500/40 active:border-emerald-400 rounded-xl sm:rounded-2xl transition-all cursor-pointer select-none shadow-[0_2px_8px_rgba(0,0,0,0.3)] hover:shadow-[0_2px_12px_rgba(16,185,129,0.1)] active:scale-95"
            >
              <span className="text-lg sm:text-xl font-mono font-semibold text-neutral-100 group-hover:text-white group-active:text-emerald-400 transition-colors leading-none">
                {digit}
              </span>
              {sub && (
                <span className="text-[8px] sm:text-[9px] font-mono tracking-wider text-neutral-500 group-hover:text-neutral-300 mt-0.5 uppercase">
                  {sub}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            id="mic-test-btn"
            type="button"
            onClick={() => {
              setMicReady(!micReady);
              soundEngine.playChime('connected');
            }}
            className={`p-3 sm:p-3.5 md:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center ${
              micReady 
                ? 'bg-[#0d121a] border-neutral-800 text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-950/20' 
                : 'bg-red-950/30 border-red-800/60 text-red-400'
            }`}
            title={micReady ? 'Input Audio Sensor Ready' : 'Audio Input Disabled'}
          >
            {micReady ? <Mic className="w-4 sm:w-5 h-4 sm:h-5" /> : <MicOff className="w-4 sm:w-5 h-4 sm:h-5" />}
          </button>

          <button
            id="start-encrypted-call-btn"
            type="button"
            onClick={handleDial}
            disabled={!targetNumber.trim() || isDialing}
            className="flex-1 py-3 sm:py-3.5 md:py-4 px-4 sm:px-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 active:from-emerald-600 active:to-teal-600 disabled:opacity-25 disabled:cursor-not-allowed text-neutral-950 font-bold font-mono tracking-wider rounded-xl sm:rounded-2xl transition-all flex items-center justify-center space-x-2 shadow-[0_4px_24px_rgba(16,185,129,0.35)] cursor-pointer min-h-[44px]"
          >
            {isDialing ? (
              <>
                <Loader2 className="w-4 sm:w-5 h-4 sm:h-5 animate-spin" />
                <span className="text-[11px] sm:text-xs uppercase">Verifying Line...</span>
              </>
            ) : (
              <>
                <Phone className="w-4 sm:w-5 h-4 sm:h-5 fill-current" />
                <span className="text-[11px] sm:text-xs uppercase truncate">
                  {dialMode === 'room' ? 'Join Encrypted Room' : 'Initiate Secure Call'}
                </span>
              </>
            )}
          </button>
        </div>

        {/* Registered Network Directory Drawer */}
        <div className="mt-4 sm:mt-5 pt-3 sm:pt-4 border-t border-neutral-800/80">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] sm:text-[11px] uppercase font-mono text-neutral-400 tracking-wider flex items-center space-x-1.5">
              <Users className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-emerald-400" />
              <span>Registered Nodes</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowDirectory(!showDirectory);
                if (!showDirectory) loadDirectory();
              }}
              className="text-[11px] sm:text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-colors flex items-center space-x-1 cursor-pointer py-1"
            >
              <span>{showDirectory ? 'Collapse' : `Browse (${registeredDirectory.length})`}</span>
            </button>
          </div>

          {/* Directory List Drawer */}
          {showDirectory && (
            <div className="bg-[#06080d] border border-neutral-800/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 mb-2.5 max-h-40 sm:max-h-48 overflow-y-auto space-y-1.5 sm:space-y-2 animate-fade-in">
              {loadingDirectory ? (
                <div className="py-3 text-center text-xs text-neutral-400 flex items-center justify-center space-x-2 font-mono">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  <span>Syncing nodes...</span>
                </div>
              ) : registeredDirectory.length === 0 ? (
                <div className="py-2.5 text-center text-[11px] text-neutral-400 font-mono">
                  No other subscriber nodes registered yet.
                </div>
              ) : (
                registeredDirectory.map((user) => {
                  const isSelf = user.assignedNumber === userAssignedNumber;
                  return (
                    <div
                      key={user.id || user.assignedNumber}
                      className="flex items-center justify-between p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-[#0e121a] border border-neutral-800/80 text-left hover:border-neutral-700 transition-colors"
                    >
                      <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-[11px] sm:text-xs font-mono font-semibold text-white truncate">
                              {user.assignedNumber}
                            </span>
                            {isSelf && (
                              <span className="text-[8px] sm:text-[9px] bg-neutral-800 text-emerald-400 border border-emerald-500/20 px-1 py-0.2 rounded font-mono shrink-0">
                                YOU
                              </span>
                            )}
                          </div>
                          <div className="text-[9px] sm:text-[10px] font-mono text-neutral-400 truncate">
                            @{user.username}
                          </div>
                        </div>
                      </div>

                      {!isSelf && (
                        <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPreset(user.assignedNumber);
                              setShowDirectory(false);
                            }}
                            className="px-2 py-1 bg-neutral-850 hover:bg-neutral-800 text-neutral-300 text-[10px] sm:text-[11px] font-mono rounded-lg transition-colors cursor-pointer flex items-center space-x-1 border border-neutral-700/60"
                            title="Paste into keypad"
                          >
                            <span>Dial</span>
                            <CornerDownLeft className="w-2.5 h-2.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowDirectory(false);
                              handleDirectDial(user.assignedNumber);
                            }}
                            className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/35 text-[10px] sm:text-[11px] font-mono font-semibold rounded-lg transition-colors cursor-pointer flex items-center space-x-1 shadow-[0_2px_8px_rgba(16,185,129,0.15)]"
                            title="Direct Call"
                          >
                            <Phone className="w-2.5 h-2.5 fill-current" />
                            <span>Call</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Quick Access Tactical Presets */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              type="button"
              onClick={() => setPreset('#ROOM-SECURITY-HQ')}
              className="p-2 sm:p-2.5 bg-[#07090e] hover:bg-[#10141e] border border-neutral-800/80 hover:border-neutral-700 rounded-lg sm:rounded-xl text-left transition-colors cursor-pointer group"
            >
              <div className="text-[11px] sm:text-xs font-mono font-medium text-neutral-200 group-hover:text-emerald-300 truncate">#ROOM-SEC-HQ</div>
              <div className="text-[9px] sm:text-[10px] text-neutral-500 flex items-center space-x-1 mt-0.5 font-mono truncate">
                <Users className="w-2.5 h-2.5 text-neutral-400 shrink-0" />
                <span className="truncate">Multi-Peer Channel</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPreset('#ROOM-CONF-01')}
              className="p-2 sm:p-2.5 bg-[#07090e] hover:bg-[#10141e] border border-neutral-800/80 hover:border-neutral-700 rounded-lg sm:rounded-xl text-left transition-colors cursor-pointer group"
            >
              <div className="text-[11px] sm:text-xs font-mono font-medium text-neutral-200 group-hover:text-cyan-300 truncate">#ROOM-CONF-01</div>
              <div className="text-[9px] sm:text-[10px] text-neutral-500 flex items-center space-x-1 mt-0.5 font-mono truncate">
                <Users className="w-2.5 h-2.5 text-neutral-400 shrink-0" />
                <span className="truncate">Briefing Room</span>
              </div>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
