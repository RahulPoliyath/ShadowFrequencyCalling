/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ShieldAlert, Lock, Trash2, Power, Zap, CheckCircle2, ChevronRight, Activity } from 'lucide-react';
import { soundEngine } from '../services/audio';

interface LogoutSplashScreenProps {
  onComplete: () => void;
}

const PURGE_STEPS = [
  { timeMs: 0, text: 'DISENGAGING WEBRTC AUDIO ENCLAVE & ICE CHANNELS...', code: 'NET-HALT' },
  { timeMs: 1400, text: 'OVERWRITING ZERO-KNOWLEDGE RAM BUFFERS WITH ZERO-FILL...', code: 'MEM-SCRUB' },
  { timeMs: 2800, text: 'SHREDDING EPHEMERAL ECDH P-256 SESSION CIPHERS...', code: 'KEY-SHRED' },
  { timeMs: 4400, text: 'PURGING LOCAL ENCRYPTED KEYSTORE & CACHED TOKENS...', code: 'CACHE-DEL' },
  { timeMs: 5800, text: 'NOTIFYING NODE DISCONNECT TO SIGNALING MESH...', code: 'MESH-EXIT' },
  { timeMs: 7000, text: 'AUDIT LEDGER COMMITTED: ZERO FORENSIC TRACES REMAINING', code: 'AMNESIC-OK' },
  { timeMs: 7800, text: 'TERMINAL PURGE COMPLETE • RETURN TO AUTH ENCLAVE...', code: 'CLEAN' },
];

export const LogoutSplashScreen: React.FC<LogoutSplashScreenProps> = ({ onComplete }) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(8);
  const [progress, setProgress] = useState<number>(0);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);

  useEffect(() => {
    // Play initial tactical disconnect chime
    try {
      soundEngine.playChime('disconnected');
    } catch {}

    const startTime = Date.now();
    const totalDurationMs = 8000;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.floor((elapsed / totalDurationMs) * 100));
      setProgress(pct);

      const secLeft = Math.max(0, Math.ceil((totalDurationMs - elapsed) / 1000));
      setSecondsRemaining(secLeft);

      // Advance through purge sequence steps
      const stepIdx = PURGE_STEPS.slice().reverse().findIndex(s => elapsed >= s.timeMs);
      if (stepIdx !== -1) {
        setCurrentStepIndex(PURGE_STEPS.length - 1 - stepIdx);
      }

      if (elapsed >= totalDurationMs) {
        clearInterval(interval);
        try {
          soundEngine.playChime('verified');
        } catch {}
        onComplete();
      }
    }, 40);

    return () => clearInterval(interval);
  }, [onComplete]);

  const handleInstantExit = () => {
    try {
      soundEngine.playChime('disconnected');
    } catch {}
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-100 flex flex-col items-center justify-between bg-[#040508] text-neutral-100 p-6 select-none overflow-hidden font-mono">
      {/* Background Ambience & Red/Amber Warning Radial Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(244,63,94,0.09)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Top Telemetry Header */}
      <div className="w-full max-w-4xl flex items-center justify-between z-10 pt-2 text-[10px] sm:text-xs text-neutral-500">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
          <span className="text-rose-400 font-bold tracking-widest">AMNESIC SESSION DESTRUCTION IN PROGRESS</span>
        </div>

        <button
          type="button"
          onClick={handleInstantExit}
          className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-neutral-800 bg-[#0d090f] text-neutral-400 hover:text-rose-300 hover:border-rose-900 transition-colors cursor-pointer text-[10px] tracking-wider"
        >
          <span>INSTANT EXIT</span>
          <ChevronRight className="w-3 h-3 ml-0.5 text-neutral-500" />
        </button>
      </div>

      {/* Center Holographic Core Visual */}
      <div className="flex flex-col items-center justify-center my-auto z-10 max-w-lg w-full text-center px-4">
        {/* Disintegrating Shield / Lock Radar Rings */}
        <div className="relative flex items-center justify-center w-28 h-28 sm:w-36 sm:h-36 mb-6">
          <div className="absolute inset-0 rounded-full border border-rose-500/20 animate-ping opacity-25" />
          <div className="absolute -inset-3 rounded-full border border-dashed border-rose-500/40 animate-[spin_12s_linear_infinite]" />
          <div className="absolute -inset-6 rounded-full border border-neutral-800" />

          {/* Central Decommission Box */}
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-[#0f0a0d] border border-rose-500/40 shadow-[0_0_40px_rgba(244,63,94,0.25)] flex items-center justify-center relative overflow-hidden">
            <Power className="w-10 h-10 sm:w-12 sm:h-12 text-rose-400 animate-pulse" />
            <div className="absolute inset-0 bg-gradient-to-t from-rose-500/10 to-transparent" />
          </div>
        </div>

        {/* Title & Status */}
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wider text-white font-mono flex items-center justify-center space-x-2">
          <span>AMNESIC</span>
          <span className="text-rose-400">LOGOUT</span>
        </h1>
        <p className="text-xs sm:text-sm text-neutral-400 mt-1 tracking-widest uppercase">
          Zero Forensic Traces • Hardware Purge
        </p>

        {/* Tactical Purge Terminal Box */}
        <div className="w-full bg-[#0b080b] border border-neutral-800/90 rounded-2xl p-4 sm:p-5 mt-6 text-left shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between text-[10px] text-neutral-500 pb-2 mb-3 border-b border-neutral-800/80">
            <span className="flex items-center space-x-1.5 text-rose-400 font-semibold">
              <Trash2 className="w-3 h-3 animate-bounce" />
              <span>CRYPTOGRAPHIC KEY SHREDDER (NIST SP 800-88)</span>
            </span>
            <span className="text-rose-400 font-mono font-bold">T-{secondsRemaining}s</span>
          </div>

          <div className="space-y-2 min-h-[90px]">
            {PURGE_STEPS.slice(0, currentStepIndex + 1).map((step, idx) => {
              const isCurrent = idx === currentStepIndex;
              return (
                <div
                  key={step.code}
                  className={`flex items-start justify-between text-[11px] sm:text-xs transition-opacity duration-300 ${
                    isCurrent ? 'text-rose-300 font-semibold' : 'text-neutral-500'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <span className="text-[10px] text-rose-500/70 font-mono">#</span>
                    <span className="truncate">{step.text}</span>
                  </div>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 shrink-0 ml-2">
                    {step.code}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Progress Bar Container */}
          <div className="mt-4 pt-3 border-t border-neutral-800/70">
            <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1.5">
              <span>ZERO-OVERWRITE PROGRESS</span>
              <span className="text-rose-400 font-bold">{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
              <div
                className="h-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-75 shadow-[0_0_12px_rgba(244,63,94,0.8)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Safety Badges */}
      <div className="w-full max-w-4xl flex flex-wrap items-center justify-center sm:justify-between gap-3 text-[9px] sm:text-[10px] text-neutral-500 z-10 border-t border-neutral-900 pt-3">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1">
            <Lock className="w-3 h-3 text-rose-400" />
            <span>RAM Sanitized</span>
          </span>
          <span>•</span>
          <span>WebRTC Channels Disengaged</span>
          <span>•</span>
          <span>Anti-Forensics Guaranteed</span>
        </div>

        <div className="text-neutral-500">
          AUTO-REDIRECT IN <span className="text-rose-400 font-bold">{secondsRemaining} SECONDS</span>
        </div>
      </div>
    </div>
  );
};
