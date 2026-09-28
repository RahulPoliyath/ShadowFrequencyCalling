/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  FileText, Shield, Lock, AlertTriangle, CheckCircle2, 
  Check, ArrowRight, X, ExternalLink, Scale, ShieldAlert
} from 'lucide-react';
import { soundEngine } from '../services/audio';

interface TermsAndConditionsModalProps {
  onAccept: () => void;
  onDecline?: () => void;
  isStandalone?: boolean; // When rendered as a blocking overlay in App.tsx
}

export const TermsAndConditionsModal: React.FC<TermsAndConditionsModalProps> = ({
  onAccept,
  onDecline,
  isStandalone = false
}) => {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToEmergencyPolicy, setAgreedToEmergencyPolicy] = useState(false);
  const [agreedToAup, setAgreedToAup] = useState(false);

  const allAgreed = agreedToTerms && agreedToEmergencyPolicy && agreedToAup;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 40) {
      setHasScrolledToBottom(true);
    }
  };

  const handleAcceptClick = () => {
    if (!allAgreed) return;
    try {
      soundEngine.playChime('verified');
    } catch {}
    onAccept();
  };

  return (
    <div 
      id="terms-conditions-enclave" 
      className={`${
        isStandalone ? 'fixed inset-0 z-70 bg-black/90 backdrop-blur-2xl' : 'w-full'
      } flex items-center justify-center p-2 sm:p-4 text-neutral-100 select-none font-mono`}
    >
      <div className="w-full max-w-2xl bg-[#090c12] border border-neutral-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-[0_25px_80px_rgba(0,0,0,0.95)] flex flex-col justify-between max-h-[90dvh] hud-corner-box">
        
        {/* Header */}
        <div className="border-b border-neutral-800/90 pb-3 mb-3 sm:mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xs sm:text-sm md:text-base font-bold text-white tracking-wide">
                  Terms of Service & Cryptographic Protocols
                </h2>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[9px] text-amber-400 font-bold uppercase">
                  Mandatory
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-neutral-400 mt-0.5">
                Rev. 2026.04 • Peer-to-Peer Enclave Agreement (Unskippable)
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable Terms Content */}
        <div 
          onScroll={handleScroll}
          className="bg-[#05070a] border border-neutral-800/90 rounded-xl p-3.5 sm:p-4 overflow-y-auto max-h-[46dvh] sm:max-h-[50dvh] text-[11px] sm:text-xs text-neutral-300 space-y-4 leading-relaxed pr-2 font-mono scrollbar-thin scrollbar-thumb-neutral-700"
        >
          {/* Important Notice Callout */}
          <div className="p-3 bg-amber-950/20 border border-amber-500/40 rounded-xl flex items-start space-x-2.5 text-amber-300/90 text-[10px] sm:text-[11px]">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-amber-300">LEGAL BINDING NOTICE:</span> By signing up, you enter into a legally binding peer protocol agreement. You acknowledge that ShadowFrequency operates as a zero-knowledge communication node. Review all sections thoroughly.
            </div>
          </div>

          {/* Section 1 */}
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
              <span>1. Zero-Knowledge Cryptography & Key Custody</span>
            </h3>
            <p className="text-neutral-400">
              All communications on ShadowFrequency are encrypted client-side using NIST SP 800-56A ECDH P-256 ephemeral key exchange and AES-256-GCM. 
              The server and network relays possess zero access to private keys or audio cleartext. You retain 100% sovereign custody of your passphrase; because no central identity database exists, forgotten credentials cannot be restored by anyone.
            </p>
          </div>

          {/* Section 2 */}
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
              <span>2. Absolute Non-Retention of Voice Audio</span>
            </h3>
            <p className="text-neutral-400">
              Audio packets flow strictly peer-to-peer over DTLS-SRTP. The platform maintains zero audio recordings, zero transcripts, and zero wiretap taps. When an audio call ends, memory buffers are scrubbed with cryptographic zero-fill.
            </p>
          </div>

          {/* Section 3 */}
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-amber-400 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
              <span>3. Critical Emergency Services Disclaimer (No 911 / 112)</span>
            </h3>
            <p className="text-neutral-400">
              ShadowFrequency is an encrypted peer-to-peer data transport software and <span className="text-white font-bold underline">DOES NOT replace a traditional public telephone service</span>. 
              It cannot route emergency calls (such as 911, 999, or 112) or transmit physical location data to emergency dispatchers. You must always maintain an alternate telecommunication device for emergency life-safety services.
            </p>
          </div>

          {/* Section 4 */}
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
              <span>4. Strict Acceptable Use Policy (AUP)</span>
            </h3>
            <p className="text-neutral-400 mb-1.5">
              Operatives agree never to use ShadowFrequency to:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-neutral-400 text-[10px] sm:text-[11px]">
              <li>Engage in harassment, extortion, terroristic threats, or criminal conspiracies.</li>
              <li>Transmit or distribute child sexual abuse material (CSAM) or facilitate human trafficking.</li>
              <li>Conduct unauthorized network intrusion, port scanning, denial of service (DoS), or packet spoofing.</li>
              <li>Impersonate law enforcement, medical personnel, or emergency responders.</li>
            </ul>
          </div>

          {/* Section 5 */}
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
              <span>5. Peer-to-Peer Relay & WebRTC Signaling</span>
            </h3>
            <p className="text-neutral-400">
              You authorize the client to exchange cryptographic public keys and sanitized ICE candidates via the network. Private RFC 1918 local subnets are actively filtered by your browser to prevent physical network reconnaissance.
            </p>
          </div>

          {/* Section 6 */}
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
              <span>6. Amnesic Deletion & Anti-Forensics</span>
            </h3>
            <p className="text-neutral-400">
              You retain the unilateral right to invoke the Amnesic Burn protocol at any time to irreversibly purge all local ledger records, assigned identities, and keys.
            </p>
          </div>

          {/* Section 7 */}
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
              <span>7. Limitation of Liability</span>
            </h3>
            <p className="text-neutral-400">
              The software is provided &quot;as is&quot; without warranties of any kind. Developers and network operators shall not be held liable for any damages, key loss, device seizure, or connectivity interruptions arising from software operation.
            </p>
          </div>

          <div className="pt-2 text-center text-neutral-600 text-[10px]">
            --- END OF TERMS &amp; CONDITIONS ---
          </div>
        </div>

        {/* Required Mandatory Checkboxes (Cannot proceed without checking all 3) */}
        <div className="mt-3 sm:mt-4 space-y-2 border-t border-neutral-800/80 pt-3">
          <label className="flex items-start space-x-2.5 cursor-pointer text-[10px] sm:text-xs text-neutral-300">
            <input
              type="checkbox"
              id="terms-check-terms"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded bg-[#06080d] border-neutral-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer accent-emerald-500"
            />
            <span>
              I accept the <strong className="text-white">Zero-Knowledge Terms of Service</strong> and acknowledge sovereign custody of my private keys.
            </span>
          </label>

          <label className="flex items-start space-x-2.5 cursor-pointer text-[10px] sm:text-xs text-neutral-300">
            <input
              type="checkbox"
              id="terms-check-emergency"
              checked={agreedToEmergencyPolicy}
              onChange={(e) => setAgreedToEmergencyPolicy(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded bg-[#06080d] border-neutral-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer accent-emerald-500"
            />
            <span>
              I understand that <strong className="text-amber-300">Emergency 911 / 112 services are NOT supported</strong> on this data network.
            </span>
          </label>

          <label className="flex items-start space-x-2.5 cursor-pointer text-[10px] sm:text-xs text-neutral-300">
            <input
              type="checkbox"
              id="terms-check-aup"
              checked={agreedToAup}
              onChange={(e) => setAgreedToAup(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded bg-[#06080d] border-neutral-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer accent-emerald-500"
            />
            <span>
              I pledge compliance with the <strong className="text-white">Strict Acceptable Use Policy</strong> (zero tolerance for illegal acts).
            </span>
          </label>
        </div>

        {/* Action Controls - Strictly No Skip Button */}
        <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2">
          {onDecline && (
            <button
              type="button"
              onClick={onDecline}
              className="w-full sm:w-auto px-4 py-2 border border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-white text-xs font-mono rounded-xl transition-colors cursor-pointer min-h-[38px]"
            >
              Decline &amp; Cancel Signup
            </button>
          )}

          <div className="flex-1 w-full flex items-center justify-end">
            <button
              id="accept-terms-btn"
              type="button"
              disabled={!allAgreed}
              onClick={handleAcceptClick}
              className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-neutral-950 font-bold font-mono text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(16,185,129,0.3)] cursor-pointer min-h-[40px]"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Accept Terms &amp; Activate Enclave</span>
            </button>
          </div>
        </div>

        {!allAgreed && (
          <p className="text-[10px] text-neutral-500 text-center mt-2 font-mono">
            * You must review and check all 3 compliance agreements above to proceed. Terms cannot be skipped.
          </p>
        )}

      </div>
    </div>
  );
};
