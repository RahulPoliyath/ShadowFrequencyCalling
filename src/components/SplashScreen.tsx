/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Shield, Lock, Radio, Cpu, Activity, Zap, CheckCircle2, ChevronRight } from 'lucide-react';
import { soundEngine } from '../services/audio';

interface SplashScreenProps {
  onComplete: () => void;
}

const BOOT_STEPS = [
  { pct: 0, text: 'INITIALIZING ZERO-KNOWLEDGE NODE SANDBOX...', code: 'SEC-01' },
  { pct: 20, text: 'SAMPLING QUANTUM-SAFE CSPRNG ENTROPY POOL...', code: 'ENT-256' },
  { pct: 40, text: 'PRE-DERIVING ECDH P-256 & AES-GCM SESSION CIPHERS...', code: 'CIPH-OK' },
  { pct: 60, text: 'CALIBRATING DSP NOISE GATE & ACOUSTIC AEC...', code: 'DSP-VAD' },
  { pct: 80, text: 'ENGAGING RFC1918 PRIVATE LAN IP LEAK SUPPRESSOR...', code: 'NET-STEALTH' },
  { pct: 95, text: 'SYSTEM ARMED • DECRYPTING INTERFACE...', code: 'READY' },
];

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(1);
  const [progress, setProgress] = useState<number>(0);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);

  useEffect(() => {
    // If already booted in this browser session, skip immediately
    if (typeof window !== 'undefined' && sessionStorage.getItem('sf_boot_done')) {
      onComplete();
      return;
    }

    const startTime = Date.now();
    const totalDurationMs = 1000;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.floor((elapsed / totalDurationMs) * 100));
      setProgress(pct);

      const secLeft = Math.max(0, Math.ceil((totalDurationMs - elapsed) / 1000));
      setSecondsRemaining(secLeft);

      // Check which boot message should be displayed
      const stepIdx = BOOT_STEPS.slice().reverse().findIndex(s => pct >= s.pct);
      if (stepIdx !== -1) {
        setCurrentStepIndex(BOOT_STEPS.length - 1 - stepIdx);
      }

      if (elapsed >= totalDurationMs) {
        clearInterval(interval);
        sessionStorage.setItem('sf_boot_done', '1');
        try {
          soundEngine.playChime('verified');
        } catch {}
        onComplete();
      }
    }, 25);

    return () => clearInterval(interval);
  }, [onComplete]);

  const handleSkip = () => {
    sessionStorage.setItem('sf_boot_done', '1');
    try {
      soundEngine.playChime('connected');
    } catch {}
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-100 flex flex-col items-center justify-between bg-[#040609] text-neutral-100 p-6 select-none overflow-hidden font-mono">
      {/* Background Ambience & Scanning Grid */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(16,185,129,0.08)_0%,transparent_65%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Top Telemetry Header */}
      <div className="w-full max-w-4xl flex items-center justify-between z-10 pt-2 text-[10px] sm:text-xs text-neutral-500">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-emerald-400 font-bold tracking-widest">SHADOWFREQUENCY // DEFENSE NODE</span>
        </div>

        <button
          type="button"
          onClick={handleSkip}
          className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-neutral-800 bg-[#0a0d14] text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors cursor-pointer text-[10px] tracking-wider"
        >
          <span>SKIP BOOT</span>
          <ChevronRight className="w-3 h-3 ml-0.5 text-neutral-500" />
        </button>
      </div>

      {/* Center Holographic Core Visual */}
      <div className="flex flex-col items-center justify-center my-auto z-10 max-w-lg w-full text-center px-4">
        {/* Pulsing Concentric Rings */}
        <div className="relative flex items-center justify-center w-28 h-28 sm:w-36 sm:h-36 mb-6">
          <div className="absolute inset-0 rounded-full border border-emerald-500/20 animate-ping opacity-30" />
          <div className="absolute -inset-3 rounded-full border border-dashed border-emerald-500/30 animate-[spin_18s_linear_infinite]" />
          <div className="absolute -inset-6 rounded-full border border-neutral-800" />

          {/* Central Logo Box */}
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-[#090d16] border border-emerald-500/40 shadow-[0_0_40px_rgba(16,185,129,0.2)] flex items-center justify-center relative overflow-hidden">
            <Radio className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-400 animate-pulse" />
            <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/10 to-transparent" />
          </div>
        </div>

        {/* Title & Tagline */}
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wider text-white font-mono flex items-center justify-center space-x-2">
          <span>SHADOW</span>
          <span className="text-emerald-400">FREQUENCY</span>
        </h1>
        <p className="text-xs sm:text-sm text-neutral-400 mt-1 tracking-widest uppercase">
          Zero-Knowledge Encrypted Mesh
        </p>

        {/* Tactical Terminal Feed Box */}
        <div className="w-full bg-[#070a10] border border-neutral-800/90 rounded-2xl p-4 sm:p-5 mt-6 text-left shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between text-[10px] text-neutral-500 pb-2 mb-3 border-b border-neutral-800/80">
            <span className="flex items-center space-x-1.5 text-emerald-400 font-semibold">
              <Activity className="w-3 h-3 animate-spin" />
              <span>SECURITY PROTOCOL INITIALIZATION</span>
            </span>
            <span className="text-neutral-400 font-mono">T-{secondsRemaining}s</span>
          </div>

          <div className="space-y-2 min-h-[90px]">
            {BOOT_STEPS.slice(0, currentStepIndex + 1).map((step, idx) => {
              const isCurrent = idx === currentStepIndex;
              return (
                <div
                  key={step.code}
                  className={`flex items-start justify-between text-[11px] sm:text-xs transition-opacity duration-300 ${
                    isCurrent ? 'text-emerald-300 font-semibold' : 'text-neutral-500'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <span className="text-[10px] text-emerald-500/70 font-mono">&gt;</span>
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
              <span>INITIALIZING SECURE ENCLAVE</span>
              <span className="text-emerald-400 font-bold">{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-75 shadow-[0_0_12px_rgba(16,185,129,0.8)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Security Badges */}
      <div className="w-full max-w-4xl flex flex-wrap items-center justify-center sm:justify-between gap-3 text-[9px] sm:text-[10px] text-neutral-500 z-10 border-t border-neutral-900 pt-3">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>ECDH P-256 + AES-GCM</span>
          </span>
          <span>•</span>
          <span>Opus DTX Acoustic Guard</span>
          <span>•</span>
          <span>NIST SP 800-56A</span>
        </div>

        <div className="text-neutral-500">
          AUTO-LAUNCH IN <span className="text-emerald-400 font-bold">{secondsRemaining} SECONDS</span>
        </div>
      </div>
    </div>
  );
};
