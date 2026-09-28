/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Bot, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, 
  RefreshCw, Zap, Play, Terminal, Eye, EyeOff, Radio, Lock,
  Cpu, Activity, Check, X, Sparkles, AlertCircle, Trash2, ArrowUpRight
} from 'lucide-react';
import { SecurityBotState, BotDiagnosticCheck, SecurityBotIncident } from '../types';
import { securityBot } from '../services/securityBot';

interface SecurityBotWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
}

export const SecurityBotWidget: React.FC<SecurityBotWidgetProps> = ({
  isOpen,
  onClose,
  onOpen
}) => {
  const [botState, setBotState] = useState<SecurityBotState>(securityBot.getState());
  const [isScanning, setIsScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<'matrix' | 'feed'>('matrix');
  const [selectedIncident, setSelectedIncident] = useState<SecurityBotIncident | null>(null);

  useEffect(() => {
    const unsub = securityBot.subscribe((next) => {
      setBotState(next);
      setIsScanning(next.status === 'scanning');
    });
    return () => unsub();
  }, []);

  const handleRunScan = async () => {
    setIsScanning(true);
    await securityBot.executePatrolScan(true);
    setIsScanning(false);
  };

  const handleSimulateThreat = (type: 'dom_xss' | 'storage_tamper' | 'flood') => {
    securityBot.simulateThreatTest(type);
  };

  const hasAlert = botState.status === 'alert';
  const isMitigating = botState.status === 'mitigating';

  return (
    <>
      {/* Floating Tactical Bot Capsule (Always visible on bottom-right) */}
      <div 
        id="xranonymous-bot-capsule" 
        className="fixed bottom-16 sm:bottom-4 right-3 sm:right-4 z-40 flex items-center select-none font-mono"
      >
        <button
          type="button"
          onClick={onOpen}
          className={`group flex items-center space-x-2 px-3 py-1.5 rounded-full border transition-all cursor-pointer shadow-[0_4px_25px_rgba(0,0,0,0.8)] backdrop-blur-xl ${
            hasAlert
              ? 'bg-rose-950/80 border-rose-500/70 text-rose-300 animate-pulse shadow-[0_0_20px_rgba(244,63,94,0.4)]'
              : isMitigating
              ? 'bg-amber-950/80 border-amber-500/70 text-amber-300 animate-pulse'
              : 'bg-[#090d15]/90 hover:bg-[#0d131f] border-emerald-500/40 hover:border-emerald-500/70 text-emerald-300'
          }`}
          title="Open XrAnonymous Real-Time Security Bot"
        >
          {/* Cyber Eye Indicator */}
          <div className="relative flex items-center justify-center">
            <span className={`w-2.5 h-2.5 rounded-full ${
              hasAlert ? 'bg-rose-400' : isMitigating ? 'bg-amber-400' : 'bg-emerald-400'
            } ${botState.isPatrolling ? 'animate-ping' : ''} opacity-75 absolute`} />
            <div className={`w-2 h-2 rounded-full relative ${
              hasAlert ? 'bg-rose-500' : isMitigating ? 'bg-amber-400' : 'bg-emerald-400'
            }`} />
          </div>

          <div className="flex items-center space-x-1.5 text-[11px] font-bold tracking-wider">
            <Bot className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden xs:inline sm:inline">XRANONYMOUS BOT:</span>
            <span className={hasAlert ? 'text-rose-400' : 'text-white'}>
              {hasAlert 
                ? 'ALERT DETECTED' 
                : isMitigating 
                ? 'MITIGATING' 
                : isScanning 
                ? 'SCANNING...' 
                : `${botState.overallHealthScore}% SECURE`}
            </span>
          </div>

          {botState.threatsNeutralizedCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-bold border border-emerald-500/40">
              +{botState.threatsNeutralizedCount}
            </span>
          )}
        </button>
      </div>

      {/* Main Full-Screen Real-Time Security Bot Console Modal */}
      {isOpen && (
        <div 
          id="security-bot-console-modal" 
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-xl p-2 sm:p-4 select-none font-mono"
        >
          <div className="w-full max-w-3xl bg-[#090c12] border border-neutral-800 rounded-2xl p-3.5 sm:p-5 shadow-[0_25px_80px_rgba(0,0,0,0.95)] text-neutral-100 max-h-[88dvh] overflow-y-auto flex flex-col justify-between hud-corner-box">
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-neutral-800 pb-3 gap-2.5">
              <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-[0_0_20px_rgba(16,185,129,0.25)]">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xs sm:text-sm md:text-base font-bold text-white tracking-wide truncate">
                      XrAnonymous Inbuilt Security Bot
                    </h2>
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/30 text-[8px] text-emerald-400 font-bold uppercase">
                      Real-Time Autonomous
                    </span>
                  </div>
                  <p className="text-[9px] sm:text-[10px] text-neutral-400 mt-0.5 truncate">
                    Automated background guardian · Proactive threat detection · Self-healing mitigations
                  </p>
                </div>
              </div>

              {/* Close Button */}
              <div className="flex items-center space-x-1.5 self-end sm:self-center">
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer text-xs"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Quick Status Bar & Bot Controls */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-2.5 sm:my-3">
              <div className="bg-[#05070a] border border-neutral-800/80 rounded-xl p-2.5 text-center">
                <span className="text-[8px] uppercase text-neutral-500 block">Health Posture</span>
                <span className="text-sm sm:text-base font-bold text-emerald-400">
                  {botState.overallHealthScore}%
                </span>
                <span className="text-[8px] text-neutral-400 block mt-0.5">Enclave Hardened</span>
              </div>

              <div className="bg-[#05070a] border border-neutral-800/80 rounded-xl p-2.5 text-center">
                <span className="text-[8px] uppercase text-neutral-500 block">Neutralized Threats</span>
                <span className="text-sm sm:text-base font-bold text-cyan-400">
                  {botState.threatsNeutralizedCount}
                </span>
                <span className="text-[8px] text-neutral-400 block mt-0.5">Auto-Remediated</span>
              </div>

              <div className="bg-[#05070a] border border-neutral-800/80 rounded-xl p-2.5 text-center">
                <span className="text-[8px] uppercase text-neutral-500 block">Patrol Cadence</span>
                <span className="text-sm sm:text-base font-bold text-white">
                  {botState.isPatrolling ? '25s' : 'PAUSED'}
                </span>
                <span className="text-[8px] text-neutral-400 block mt-0.5">Autonomous Loop</span>
              </div>

              <div className="bg-[#05070a] border border-neutral-800/80 rounded-xl p-2.5 text-center">
                <span className="text-[8px] uppercase text-neutral-500 block">Self-Healing</span>
                <span className="text-sm sm:text-base font-bold text-emerald-400">
                  {botState.autoMitigate ? 'ACTIVE' : 'OFF'}
                </span>
                <span className="text-[8px] text-neutral-400 block mt-0.5">Instant Mitigate</span>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-2 bg-[#05070a] border border-neutral-800/90 rounded-xl mb-3">
              <div className="flex items-center space-x-1 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={isScanning}
                  onClick={handleRunScan}
                  className="flex-1 sm:flex-none px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-neutral-950 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 min-h-[32px] shadow-[0_2px_10px_rgba(16,185,129,0.2)]"
                >
                  <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
                  <span>{isScanning ? 'Scanning Node...' : 'Run Immediate Deep Scan'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => securityBot.toggleAutoMitigate()}
                  className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-mono transition-colors cursor-pointer min-h-[32px] ${
                    botState.autoMitigate 
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' 
                      : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                  }`}
                  title="Toggle automated self-healing remediation"
                >
                  Auto-Healing: {botState.autoMitigate ? 'ON' : 'OFF'}
                </button>

                <button
                  type="button"
                  onClick={() => securityBot.togglePatrol()}
                  className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-mono transition-colors cursor-pointer min-h-[32px] ${
                    botState.isPatrolling 
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300' 
                      : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                  }`}
                  title="Toggle background continuous patrol"
                >
                  Patrol: {botState.isPatrolling ? 'ACTIVE' : 'PAUSED'}
                </button>
              </div>

              {/* Benign Threat Simulator Dropdown */}
              <div className="flex items-center space-x-1 w-full sm:w-auto justify-end">
                <span className="text-[9px] text-neutral-500 hidden sm:inline">Test Bot:</span>
                <button
                  type="button"
                  onClick={() => handleSimulateThreat('dom_xss')}
                  className="px-2 py-1 bg-[#0b0e14] hover:bg-neutral-800 border border-neutral-800 rounded text-[9px] text-neutral-300 hover:text-white transition-colors cursor-pointer"
                  title="Test XSS Defense"
                >
                  Simulate XSS
                </button>
                <button
                  type="button"
                  onClick={() => handleSimulateThreat('storage_tamper')}
                  className="px-2 py-1 bg-[#0b0e14] hover:bg-neutral-800 border border-neutral-800 rounded text-[9px] text-neutral-300 hover:text-white transition-colors cursor-pointer"
                  title="Test Storage Poisoning Defense"
                >
                  Simulate Tamper
                </button>
                <button
                  type="button"
                  onClick={() => handleSimulateThreat('flood')}
                  className="px-2 py-1 bg-[#0b0e14] hover:bg-neutral-800 border border-neutral-800 rounded text-[9px] text-neutral-300 hover:text-white transition-colors cursor-pointer"
                  title="Test DDoS Flood Defense"
                >
                  Simulate Flood
                </button>
              </div>
            </div>

            {/* Tab Selector */}
            <div className="flex items-center space-x-1 p-0.5 bg-[#05070a] border border-neutral-800/80 rounded-xl mb-2.5 text-[10px]">
              <button
                type="button"
                onClick={() => setActiveTab('matrix')}
                className={`flex-1 py-1 rounded-lg flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  activeTab === 'matrix'
                    ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>Diagnostic Test Matrix (6 Automated Checks)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('feed')}
                className={`flex-1 py-1 rounded-lg flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  activeTab === 'feed'
                    ? 'bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 font-bold'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Terminal className="w-3 h-3 text-cyan-400" />
                <span>Real-Time Incident &amp; Protection Feed ({botState.incidents.length})</span>
              </button>
            </div>

            {/* TAB 1: DIAGNOSTIC MATRIX */}
            {activeTab === 'matrix' && (
              <div className="space-y-2 overflow-y-auto max-h-[46dvh] pr-1 scrollbar-thin">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {botState.checks.map((check) => {
                    const isPassed = check.status === 'passed';
                    const isFixed = check.status === 'fixed';
                    const isWarning = check.status === 'warning';

                    return (
                      <div 
                        key={check.id}
                        className={`bg-[#06080d] border rounded-xl p-2.5 flex flex-col justify-between ${
                          isWarning 
                            ? 'border-amber-500/50 bg-amber-950/10' 
                            : isFixed 
                            ? 'border-cyan-500/40 bg-cyan-950/10' 
                            : 'border-neutral-800/80 hover:border-neutral-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[8px] uppercase px-1.5 py-0.2 rounded bg-neutral-900 border border-neutral-800 text-neutral-400">
                              {check.category}
                            </span>

                            {isPassed && (
                              <span className="inline-flex items-center space-x-1 text-[9px] text-emerald-400 font-bold">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>SECURE</span>
                              </span>
                            )}
                            {isFixed && (
                              <span className="inline-flex items-center space-x-1 text-[9px] text-cyan-400 font-bold">
                                <Sparkles className="w-3 h-3" />
                                <span>AUTO-HEALED</span>
                              </span>
                            )}
                            {isWarning && (
                              <span className="inline-flex items-center space-x-1 text-[9px] text-amber-400 font-bold">
                                <AlertTriangle className="w-3 h-3" />
                                <span>ATTENTION</span>
                              </span>
                            )}
                          </div>

                          <h3 className="text-[11px] font-bold text-white mb-0.5">
                            {check.name}
                          </h3>
                          <p className="text-[9px] sm:text-[10px] text-neutral-400 leading-relaxed mb-1.5">
                            {check.details}
                          </p>
                        </div>

                        <div className="pt-1.5 border-t border-neutral-800/60 flex items-center justify-between text-[8px] text-neutral-500">
                          <span>Verified: {new Date(check.lastRun).toLocaleTimeString()}</span>
                          <span className="text-emerald-400 font-mono">{check.recommendation}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: REAL-TIME INCIDENT FEED */}
            {activeTab === 'feed' && (
              <div className="space-y-2 overflow-y-auto max-h-[46dvh] pr-1 scrollbar-thin">
                <div className="flex items-center justify-between pb-1 text-[9px] text-neutral-400">
                  <span>Live telemetry incidents and autonomous self-healing events:</span>
                  <button
                    type="button"
                    onClick={() => securityBot.clearIncidents()}
                    className="hover:text-red-400 flex items-center space-x-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear Feed</span>
                  </button>
                </div>

                {botState.incidents.length === 0 ? (
                  <div className="bg-[#06080d] border border-neutral-800 rounded-xl p-6 text-center text-neutral-500 text-[10px]">
                    No security incidents logged. Node is functioning under hardened parameters.
                  </div>
                ) : (
                  botState.incidents.map((inc) => {
                    const isMitigated = inc.severity === 'mitigated';
                    const isHigh = inc.severity === 'high';

                    return (
                      <div
                        key={inc.id}
                        className={`bg-[#06080d] border rounded-xl p-2.5 transition-all ${
                          isHigh
                            ? 'border-rose-500/50 bg-rose-950/15'
                            : isMitigated
                            ? 'border-emerald-500/40 bg-emerald-950/10'
                            : 'border-neutral-800/80'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center space-x-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              isHigh ? 'bg-rose-400' : isMitigated ? 'bg-emerald-400' : 'bg-cyan-400'
                            }`} />
                            <span className="text-[10px] font-bold text-white">
                              {inc.title}
                            </span>
                            <span className="text-[8px] px-1 py-0.2 rounded bg-neutral-900 border border-neutral-800 text-neutral-400">
                              {inc.type}
                            </span>
                          </div>

                          <span className="text-[8px] text-neutral-500">
                            {new Date(inc.timestamp).toLocaleTimeString()}
                          </span>
                        </div>

                        <p className="text-[9px] sm:text-[10px] text-neutral-300 leading-relaxed mb-1">
                          {inc.description}
                        </p>

                        {inc.autoRemediated && (
                          <div className="text-[8px] text-emerald-400 flex items-center space-x-1 mt-1 bg-emerald-950/30 p-1 rounded border border-emerald-500/20">
                            <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                            <span><strong>Auto-Remediated:</strong> {inc.remediationAction || 'Remediation completed'}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Footer */}
            <div className="pt-2.5 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-2 mt-2">
              <div className="flex items-center space-x-1.5 text-[9px] text-neutral-500">
                <Bot className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>XrAnonymous Autonomous Defense Engine · Active Node Monitor</span>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-[10px] font-mono font-medium rounded-lg transition-colors cursor-pointer text-neutral-200"
              >
                Close Console
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
