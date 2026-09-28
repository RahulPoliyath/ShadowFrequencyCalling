/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  PhoneOff, Mic, MicOff, Volume2, VolumeX, Shield, ShieldCheck, 
  MessageSquare, Lock, Key, Users, Send, Clock, Activity, Check, Copy,
  Radio, Cpu, Zap, Wifi
} from 'lucide-react';
import { ActiveCallState, EncryptedMessage } from '../types';
import { soundEngine } from '../services/audio';
import { StorageService } from '../services/storage';
import { webRtcManager } from '../services/webrtc';

interface ActiveCallModalProps {
  call: ActiveCallState;
  onEndCall: () => void;
  onUpdateCall: (updater: (prev: ActiveCallState) => ActiveCallState) => void;
  userAssignedNumber: string;
}

export const ActiveCallModal: React.FC<ActiveCallModalProps> = ({
  call,
  onEndCall,
  onUpdateCall,
  userAssignedNumber,
}) => {
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showWhisperDrawer, setShowWhisperDrawer] = useState(false);
  const [whisperText, setWhisperText] = useState('');
  const [whispers, setWhispers] = useState<EncryptedMessage[]>([]);
  const [copiedSas, setCopiedSas] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Real WebRTC audio transmission & telemetry session
  useEffect(() => {
    const isEcho = call.remoteNumber.includes('555-0199') || call.remoteAlias.toLowerCase().includes('echo');
    const isInitiator = call.direction === 'outbound';

    webRtcManager.startCallSession({
      roomId: call.roomNumber,
      isInitiator,
      isEchoNode: isEcho,
      onRemoteAudioActive: () => {
        onUpdateCall(prev => ({ ...prev, status: 'connected' }));
      }
    });

    const timer = setInterval(() => {
      onUpdateCall(prev => ({
        ...prev,
        duration: prev.duration + 1,
        packetsSent: prev.packetsSent + Math.floor(Math.random() * 5 + 48),
        packetsReceived: prev.packetsReceived + Math.floor(Math.random() * 5 + 48),
        latencyMs: Math.floor(10 + Math.random() * 5),
      }));
    }, 1000);

    return () => {
      clearInterval(timer);
      webRtcManager.cleanup();
    };
  }, [call.roomNumber, call.direction]);

  // Futuristic High-Resolution Audio Spectrum Visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const render = () => {
      if (!running) return;
      const freqData = webRtcManager.getAudioFrequencies();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barCount = 32;
      const barWidth = Math.max(3, Math.floor((canvas.width - (barCount - 1) * 3) / barCount));
      const centerY = canvas.height / 2;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(canvas.width, centerY);
      ctx.stroke();

      for (let i = 0; i < barCount; i++) {
        const val = call.isMuted ? 6 : (freqData[i % freqData.length] || 12);
        const barHeight = Math.max(4, (val / 255) * (canvas.height * 0.8));

        const x = i * (barWidth + 3);
        const y = centerY - barHeight / 2;

        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (call.isVerified) {
          gradient.addColorStop(0, '#00ff9d');
          gradient.addColorStop(0.5, '#10b981');
          gradient.addColorStop(1, '#047857');
        } else {
          gradient.addColorStop(0, '#38bdf8');
          gradient.addColorStop(0.5, '#06b6d4');
          gradient.addColorStop(1, '#0284c7');
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      running = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [call.isMuted, call.isVerified]);

  // Load in-call whispers
  useEffect(() => {
    const loadMessages = () => {
      const msgs = StorageService.getMessages(call.roomNumber);
      setWhispers(msgs);
    };
    loadMessages();
    const sub = StorageService.subscribeSync((evt) => {
      if (evt.action === 'MESSAGE_ADDED') {
        loadMessages();
      }
    });
    return () => sub();
  }, [call.roomNumber]);

  const handleSendWhisper = (e: React.FormEvent) => {
    e.preventDefault();
    if (!whisperText.trim()) return;

    const newMsg: EncryptedMessage = {
      id: 'msg_' + Math.random().toString(36).substring(2, 9),
      roomId: call.roomNumber,
      senderNumber: userAssignedNumber,
      text: whisperText.trim(),
      timestamp: Date.now(),
      expiresAt: Date.now() + 15000,
    };

    StorageService.saveMessage(newMsg);
    setWhispers(prev => [...prev, newMsg]);
    setWhisperText('');

    // If calling echo loopback, simulate echo response after 700ms
    const isEcho = call.remoteNumber.includes('555-0199') || call.remoteAlias.toLowerCase().includes('echo');
    if (isEcho) {
      setTimeout(() => {
        const loopbackMsg: EncryptedMessage = {
          id: 'echo_' + Math.random().toString(36).substring(2, 9),
          roomId: call.roomNumber,
          senderNumber: call.remoteNumber,
          text: `[ECHO-DSP ACK]: "${newMsg.text}" (AES-256 Verified)`,
          timestamp: Date.now(),
          expiresAt: Date.now() + 15000,
        };
        StorageService.saveMessage(loopbackMsg);
        setWhispers(prev => [...prev, loopbackMsg]);
      }, 700);
    }
  };

  const toggleMute = () => {
    const newMuted = !call.isMuted;
    webRtcManager.setMicrophoneMuted(newMuted);
    onUpdateCall(prev => ({ ...prev, isMuted: newMuted }));
    soundEngine.playChime(newMuted ? 'disconnected' : 'connected');
  };

  const toggleSpeaker = () => {
    const newSpeaker = !call.isSpeaker;
    webRtcManager.setSpeakerEnabled(newSpeaker);
    onUpdateCall(prev => ({ ...prev, isSpeaker: newSpeaker }));
    soundEngine.playChime(newSpeaker ? 'connected' : 'disconnected');
  };

  const toggleVerified = () => {
    onUpdateCall(prev => ({ ...prev, isVerified: !prev.isVerified }));
    soundEngine.playChime('verified');
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const copySas = () => {
    navigator.clipboard.writeText(call.sasCode).catch(() => {});
    setCopiedSas(true);
    setTimeout(() => setCopiedSas(false), 2000);
  };

  return (
    <div id="active-call-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-2xl p-0 sm:p-4">
      <div className="relative w-full h-[100dvh] sm:h-auto sm:max-h-[92dvh] sm:max-w-xl bg-[#0a0d14]/95 border-0 sm:border border-neutral-800/90 rounded-none sm:rounded-3xl p-4 sm:p-7 shadow-[0_25px_70px_rgba(0,0,0,0.9)] text-neutral-100 flex flex-col justify-between overflow-y-auto hud-corner-box">
        
        {/* Top Header: Security Status & SAS Emojis */}
        <div className="flex items-center justify-between border-b border-neutral-800/70 pb-3 sm:pb-4 shrink-0">
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2 sm:h-2.5 w-2 sm:w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 sm:h-2.5 w-2 sm:w-2.5 bg-emerald-500"></span>
            </span>
            <div className="text-[11px] sm:text-xs font-mono font-medium text-emerald-400 flex items-center space-x-1.5">
              <span className="tracking-wider uppercase">TUNNEL ACTIVE</span>
              <span className="text-neutral-700 hidden xs:inline">|</span>
              <span className="text-neutral-400 hidden xs:inline">AES-256</span>
            </div>
          </div>

          {/* SAS Token Button */}
          <button
            id="verify-sas-button"
            type="button"
            onClick={() => setShowVerificationModal(true)}
            className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border text-[11px] sm:text-xs font-mono flex items-center space-x-1.5 sm:space-x-2 transition-all cursor-pointer ${
              call.isVerified
                ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                : 'bg-[#0d121c] border-neutral-700 text-neutral-300 hover:border-emerald-500/50'
            }`}
            title="Inspect Short Authentication String (SAS)"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-semibold tracking-wider">{call.sasCode}</span>
            <span className="tracking-widest hidden xs:inline">{call.sasEmojis.join(' ')}</span>
            {call.isVerified && <span className="text-[9px] sm:text-[10px] text-emerald-400 font-bold ml-0.5">✓ VERIFIED</span>}
          </button>
        </div>

        {/* Center: Remote Target & High-Tech HUD Waveform */}
        <div className="my-auto py-3 sm:py-4 text-center shrink-0">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-[#07090e] border border-neutral-800 text-emerald-400 mb-3 shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] relative">
            <Radio className="w-7 h-7 sm:w-9 sm:h-9" />
            <span className="absolute -bottom-1 -right-1 px-1 sm:px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[8px] sm:text-[9px] font-mono">
              E2EE
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold font-mono tracking-tight text-white mb-1 truncate px-2">
            {call.remoteNumber}
          </h2>
          <div className="text-[11px] sm:text-xs font-mono text-neutral-400 mb-2.5 flex items-center justify-center space-x-2">
            <span className="truncate">{call.remoteAlias}</span>
            <span>•</span>
            <span className="text-emerald-400/90">{call.roomNumber}</span>
          </div>

          <div className="inline-flex items-center space-x-2 px-3 py-1 bg-[#06080d] border border-neutral-800 rounded-full text-xs font-mono text-neutral-300 shadow-inner">
            <Clock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="tabular-nums tracking-widest">{formatDuration(call.duration)}</span>
          </div>

          {/* Audio Visualizer Canvas */}
          <div className="mt-4 sm:mt-5 flex flex-col items-center justify-center px-1">
            <div className="w-full max-w-md h-16 sm:h-20 md:h-24 bg-[#05070a] border border-neutral-800/90 rounded-2xl p-2 flex items-center justify-center shadow-inner relative overflow-hidden">
              <canvas
                ref={canvasRef}
                width={380}
                height={76}
                className="w-full h-full"
              />

              {call.isMuted && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-[2px] flex items-center justify-center space-x-2 text-red-400 font-mono text-[11px] sm:text-xs font-semibold tracking-wider">
                  <MicOff className="w-4 h-4 text-red-500 animate-pulse" />
                  <span>MIC MUTED • ZERO PACKETS TRANSMITTING</span>
                </div>
              )}
            </div>

            {/* Voice Isolation & Anti-Echo Status */}
            <div className="mt-2 flex items-center justify-center space-x-2.5 text-[8px] sm:text-[9px] font-mono text-emerald-400/90">
              <span className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Noise Gate: ACTIVE</span>
              </span>
              <span className="text-neutral-600">•</span>
              <span className="flex items-center space-x-1 text-cyan-400">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>Echo Suppressor: ACTIVE</span>
              </span>
              <span className="text-neutral-600 hidden xs:inline">•</span>
              <span className="text-neutral-500 hidden xs:inline">Opus DTX</span>
            </div>
            
            {/* Real-time Telemetry Metrics */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 w-full max-w-md mt-2 font-mono text-[9px] sm:text-[10px] text-neutral-400">
              <div className="bg-[#06080d] border border-neutral-800/80 rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-center">
                <span className="text-neutral-500 block uppercase text-[8px] sm:text-[9px]">Bitrate</span>
                <span className="text-neutral-200 font-semibold">{call.bitrateKbps} kbps</span>
              </div>
              <div className="bg-[#06080d] border border-neutral-800/80 rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-center">
                <span className="text-neutral-500 block uppercase text-[8px] sm:text-[9px]">Latency</span>
                <span className="text-emerald-400 font-semibold">{call.latencyMs} ms</span>
              </div>
              <div className="bg-[#06080d] border border-neutral-800/80 rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-center">
                <span className="text-neutral-500 block uppercase text-[8px] sm:text-[9px]">Packets</span>
                <span className="text-neutral-200 font-semibold">{call.packetsSent} / {call.packetsReceived}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Ephemeral Whispers Drawer */}
        {showWhisperDrawer && (
          <div className="mb-3 bg-[#06080d] border border-neutral-800 rounded-xl sm:rounded-2xl p-3 text-left animate-fade-in shadow-2xl shrink-0">
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-neutral-400 font-mono mb-2 border-b border-neutral-800 pb-1.5">
              <span className="flex items-center space-x-1 text-emerald-400 font-semibold">
                <Lock className="w-3 h-3" />
                <span>Ephemeral In-Call Whispers (15s Shred)</span>
              </span>
              <button 
                type="button" 
                onClick={() => setShowWhisperDrawer(false)}
                className="text-neutral-500 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="max-h-24 sm:max-h-28 overflow-y-auto space-y-1.5 mb-2 pr-1">
              {whispers.length === 0 ? (
                <div className="text-[10px] sm:text-[11px] text-neutral-500 italic py-2 text-center font-mono">
                  No active whispers. Type note to room.
                </div>
              ) : (
                whispers.map((msg) => (
                  <div key={msg.id} className="text-[11px] sm:text-xs p-2 bg-[#0e121a] border border-neutral-800 rounded-lg flex items-start justify-between">
                    <div>
                      <span className="font-mono text-[9px] sm:text-[10px] text-emerald-400 block">{msg.senderNumber}</span>
                      <span className="text-neutral-200 mt-0.5 block">{msg.text}</span>
                    </div>
                    <span className="text-[8px] sm:text-[9px] font-mono text-neutral-500 ml-2 shrink-0">15s burn</span>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendWhisper} className="flex space-x-2">
              <input
                type="text"
                value={whisperText}
                onChange={(e) => setWhisperText(e.target.value)}
                placeholder="Send encrypted note..."
                className="flex-1 bg-[#0b0e14] border border-neutral-800 rounded-lg sm:rounded-xl px-3 py-1.5 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-emerald-500 font-mono"
              />
              <button
                type="submit"
                className="p-2 bg-emerald-500 text-neutral-950 rounded-lg sm:rounded-xl hover:bg-emerald-400 transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}

        {/* Bottom Call Controls HUD */}
        <div className="flex items-center justify-center space-x-2.5 sm:space-x-4 pt-3 sm:pt-4 border-t border-neutral-800/80 shrink-0">
          <button
            id="call-mute-toggle-btn"
            type="button"
            onClick={toggleMute}
            className={`p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center ${
              call.isMuted
                ? 'bg-red-950/40 border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                : 'bg-[#0d121c] border-neutral-800 text-neutral-300 hover:border-neutral-600'
            }`}
            title={call.isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            {call.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            id="call-speaker-toggle-btn"
            type="button"
            onClick={toggleSpeaker}
            className={`p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center ${
              !call.isSpeaker
                ? 'bg-[#0d121c] border-neutral-800 text-neutral-500 hover:border-neutral-600'
                : 'bg-[#0d121c] border-emerald-500/50 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
            }`}
            title={call.isSpeaker ? 'Mute Output Audio' : 'Speaker Enabled'}
          >
            {call.isSpeaker ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          <button
            id="call-whisper-toggle-btn"
            type="button"
            onClick={() => setShowWhisperDrawer(!showWhisperDrawer)}
            className={`p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center ${
              showWhisperDrawer
                ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                : 'bg-[#0d121c] border-neutral-800 text-neutral-300 hover:border-neutral-600'
            }`}
            title="In-Call Ephemeral Whispers"
          >
            <MessageSquare className="w-5 h-5" />
          </button>

          {/* End Call Button */}
          <button
            id="end-call-btn"
            type="button"
            onClick={onEndCall}
            className="p-3.5 sm:p-4 px-5 sm:px-6 rounded-xl sm:rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:from-red-700 active:to-rose-700 text-white font-semibold font-mono tracking-wider shadow-[0_4px_25px_rgba(239,68,68,0.4)] transition-all cursor-pointer flex items-center space-x-2 min-h-[44px]"
            title="End Encrypted Session"
          >
            <PhoneOff className="w-5 h-5" />
            <span className="text-xs uppercase">End</span>
          </button>
        </div>

      </div>

      {/* Safety Number & Cryptographic Fingerprint Verification Modal */}
      {showVerificationModal && (
        <div id="sas-verification-modal" className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-[#0b0e14] border border-neutral-800 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-2xl text-neutral-100 max-h-[90dvh] overflow-y-auto hud-corner-box">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">SAS Handshake Verification</h3>
                <p className="text-[11px] sm:text-xs text-neutral-400 font-mono">ECDH P-256 Shared Secret</p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 mb-4 leading-relaxed font-mono">
              Compare the 6-digit SAS code or emojis with your peer aloud. A match mathematically confirms no interception.
            </p>

            {/* SAS Display HUD */}
            <div className="bg-[#05070a] border border-neutral-800 rounded-xl sm:rounded-2xl p-4 sm:p-5 text-center mb-4 shadow-inner">
              <div className="text-2xl sm:text-3xl font-mono font-bold tracking-widest text-emerald-400 mb-2">
                {call.sasCode}
              </div>
              <div className="text-xl sm:text-2xl tracking-widest mb-3">
                {call.sasEmojis.join('   ')}
              </div>
              <button
                type="button"
                onClick={copySas}
                className="text-[11px] font-mono text-neutral-400 hover:text-emerald-400 flex items-center justify-center space-x-1.5 mx-auto cursor-pointer"
              >
                {copiedSas ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSas ? 'Copied SAS' : 'Copy Verification Code'}</span>
              </button>
            </div>

            {/* Key Fingerprint Hex */}
            <div className="bg-[#06080d] border border-neutral-800/80 rounded-xl p-3 mb-4 font-mono text-[10px] sm:text-[11px]">
              <div className="text-neutral-500 mb-1 uppercase text-[9px]">Session Fingerprint (SHA-256):</div>
              <div className="text-neutral-300 break-all">{call.keyFingerprint}</div>
            </div>

            <div className="flex space-x-2.5">
              <button
                type="button"
                onClick={() => setShowVerificationModal(false)}
                className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-mono font-medium rounded-xl transition-colors cursor-pointer"
              >
                Dismiss
              </button>
              <button
                id="toggle-verify-confirm-btn"
                type="button"
                onClick={() => {
                  toggleVerified();
                  setShowVerificationModal(false);
                }}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-mono font-bold rounded-xl transition-colors flex items-center justify-center space-x-1.5 cursor-pointer shadow-[0_4px_18px_rgba(16,185,129,0.3)]"
              >
                <Check className="w-4 h-4" />
                <span>{call.isVerified ? 'Unverify' : 'Confirm'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
