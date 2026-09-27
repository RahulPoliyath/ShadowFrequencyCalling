/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { Phone, PhoneOff, Shield, Radio, CornerDownLeft } from 'lucide-react';
import { soundEngine } from '../services/audio';

interface IncomingCallBannerProps {
  incomingCall: {
    roomNumber: string;
    callerNumber: string;
    callerAlias: string;
    timestamp: number;
  };
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingCallBanner: React.FC<IncomingCallBannerProps> = ({
  incomingCall,
  onAccept,
  onDecline,
}) => {
  useEffect(() => {
    soundEngine.startRinging(true);
    return () => {
      soundEngine.stopRinging();
    };
  }, []);

  return (
    <div 
      id="incoming-call-alert" 
      className="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-60 w-[95%] max-w-lg bg-[#0b0e14]/95 border-2 border-emerald-500/80 rounded-2xl shadow-[0_15px_60px_rgba(16,185,129,0.35)] p-3.5 sm:p-5 text-neutral-100 animate-fade-in backdrop-blur-xl hud-corner-box"
    >
      <div className="flex items-center justify-between gap-3">
        
        {/* Caller Info */}
        <div className="flex items-center space-x-2.5 sm:space-x-3.5 min-w-0">
          <div className="relative shrink-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-500/15 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
              <Phone className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-3 w-3 sm:h-3.5 sm:w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 sm:h-3.5 sm:w-3.5 bg-emerald-500"></span>
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex items-center space-x-1.5 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold truncate">
              <span>INCOMING ENCRYPTED SIGNAL</span>
            </div>
            <div className="text-sm sm:text-base md:text-lg font-bold font-mono tracking-tight text-white mt-0.5 truncate">
              {incomingCall.callerNumber}
            </div>
            <div className="text-[10px] sm:text-xs font-mono text-neutral-400 flex items-center space-x-1.5 truncate">
              <span className="truncate">{incomingCall.callerAlias}</span>
              <span>·</span>
              <span className="text-neutral-500">{incomingCall.roomNumber}</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            id="decline-incoming-call-btn"
            type="button"
            onClick={onDecline}
            className="p-2.5 sm:px-3.5 sm:py-2.5 bg-red-950/40 hover:bg-red-900/60 border border-red-500/50 text-red-400 text-xs font-mono font-semibold rounded-xl shadow-md transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Decline Call"
          >
            <PhoneOff className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Ignore</span>
          </button>
          <button
            id="accept-incoming-call-btn"
            type="button"
            onClick={onAccept}
            className="p-2.5 sm:px-4 sm:py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-neutral-950 text-xs font-mono font-bold rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all cursor-pointer flex items-center justify-center min-h-[44px] min-w-[44px]"
            title="Accept Encrypted Call"
          >
            <Phone className="w-4 h-4 fill-current sm:mr-1" />
            <span className="hidden sm:inline">Connect</span>
          </button>
        </div>

      </div>
    </div>
  );
};
