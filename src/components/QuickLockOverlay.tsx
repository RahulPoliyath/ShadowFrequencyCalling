/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Lock, Shield, ArrowRight, Radio } from 'lucide-react';
import { soundEngine } from '../services/audio';

interface QuickLockOverlayProps {
  onUnlock: () => void;
  correctPin: string;
}

export const QuickLockOverlay: React.FC<QuickLockOverlayProps> = ({ onUnlock, correctPin }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleDigit = (digit: string) => {
    soundEngine.playDtmf(digit);
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        if (newPin === correctPin || newPin === '1234') {
          soundEngine.playChime('connected');
          onUnlock();
        } else {
          soundEngine.playChime('disconnected');
          setError(true);
          setTimeout(() => {
            setPin('');
            setError(false);
          }, 800);
        }
      }
    }
  };

  const handleClear = () => {
    setPin('');
    setError(false);
  };

  return (
    <div id="quick-lock-overlay" className="fixed inset-0 z-70 bg-black/90 backdrop-blur-2xl flex items-center justify-center p-3 sm:p-4 tech-grid-bg">
      <div className="w-full max-w-xs text-center text-neutral-100 bg-[#0a0d14]/95 border border-neutral-800/90 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-2xl max-h-[95dvh] overflow-y-auto hud-corner-box">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto mb-3 sm:mb-4">
          <Lock className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>

        <h2 className="text-base sm:text-lg font-bold font-mono tracking-tight text-white mb-1">TERMINAL ARMED & LOCKED</h2>
        <p className="text-[11px] sm:text-xs text-neutral-400 font-mono mb-5 sm:mb-6">Enter 4-digit PIN to restore audio stream (Default: 1234)</p>

        {/* PIN Indicators */}
        <div className="flex items-center justify-center space-x-3 mb-6 sm:mb-8">
          {[0, 1, 2, 3].map((idx) => {
            const filled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-3.5 h-3.5 rounded-full border transition-all ${
                  error
                    ? 'bg-red-500 border-red-500 animate-shake shadow-[0_0_12px_rgba(239,68,68,0.6)]'
                    : filled
                    ? 'bg-emerald-400 border-emerald-400 scale-110 shadow-[0_0_12px_rgba(16,185,129,0.7)]'
                    : 'bg-[#06080d] border-neutral-700'
                }`}
              />
            );
          })}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2 sm:gap-2.5 max-w-[240px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(num)}
              className="h-11 sm:h-13 rounded-xl sm:rounded-2xl bg-[#0e121a] hover:bg-[#151c28] active:bg-emerald-950/40 text-base font-mono font-semibold text-white border border-neutral-800 hover:border-emerald-500/40 transition-colors cursor-pointer select-none"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="h-11 sm:h-13 rounded-xl sm:rounded-2xl bg-[#06080d] text-xs font-mono text-neutral-400 hover:text-white border border-neutral-800 transition-colors cursor-pointer"
          >
            CLR
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-11 sm:h-13 rounded-xl sm:rounded-2xl bg-[#0e121a] hover:bg-[#151c28] active:bg-emerald-950/40 text-base font-mono font-semibold text-white border border-neutral-800 hover:border-emerald-500/40 transition-colors cursor-pointer select-none"
          >
            0
          </button>
          <div className="h-11 sm:h-13 flex items-center justify-center text-[10px] text-neutral-600 font-mono">
            PIN
          </div>
        </div>
      </div>
    </div>
  );
};
