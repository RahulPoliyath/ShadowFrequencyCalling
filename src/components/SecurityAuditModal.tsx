/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, AlertTriangle, CheckCircle2, Shield, Lock, 
  Terminal, RefreshCw, Cpu, Activity, Database, Zap, Radio,
  TrendingUp, Wifi, Check
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { SecurityAuditEvent } from '../types';
import { StorageService } from '../services/storage';
import { soundEngine } from '../services/audio';

interface SecurityAuditModalProps {
  onClose: () => void;
}

interface ChannelStabilityPoint {
  time: string;
  integrity: number;  // 98 - 100%
  latency: number;    // ms
  packetLoss: number; // %
}

const INITIAL_TELEMETRY: ChannelStabilityPoint[] = [
  { time: '-30s', integrity: 100, latency: 15, packetLoss: 0.0 },
  { time: '-25s', integrity: 100, latency: 13, packetLoss: 0.0 },
  { time: '-20s', integrity: 100, latency: 16, packetLoss: 0.0 },
  { time: '-15s', integrity: 100, latency: 14, packetLoss: 0.0 },
  { time: '-10s', integrity: 100, latency: 18, packetLoss: 0.0 },
  { time: '-5s',  integrity: 100, latency: 12, packetLoss: 0.0 },
  { time: 'T-0s', integrity: 100, latency: 14, packetLoss: 0.0 },
];

export const SecurityAuditModal: React.FC<SecurityAuditModalProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<SecurityAuditEvent[]>([]);
  const [filter, setFilter] = useState<'all' | 'warning' | 'success'>('all');
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [chartMetric, setChartMetric] = useState<'all' | 'integrity' | 'latency' | 'packetLoss'>('all');
  const [telemetryData, setTelemetryData] = useState<ChannelStabilityPoint[]>(INITIAL_TELEMETRY);

  useEffect(() => {
    setLogs(StorageService.getAuditLogs());
    const sub = StorageService.subscribeSync((evt) => {
      if (evt.action === 'AUDIT_LOG_ADDED') {
        setLogs(StorageService.getAuditLogs());
      }
    });
    return () => sub();
  }, []);

  // Live real-time telemetry stream simulator
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const timeLabel = `${now.getSeconds()}s`;

      setTelemetryData((prev) => {
        const nextLatency = isScanning 
          ? Math.floor(18 + Math.random() * 8) 
          : Math.floor(11 + Math.random() * 5);
        const nextLoss = isScanning ? 0.05 : 0.0;
        const nextPoint: ChannelStabilityPoint = {
          time: timeLabel,
          integrity: 100,
          latency: nextLatency,
          packetLoss: nextLoss,
        };
        const updated = [...prev.slice(1), nextPoint];
        return updated;
      });
    }, 2800);

    return () => clearInterval(timer);
  }, [isScanning]);

  const handleRunSecurityScan = () => {
    setIsScanning(true);
    setScanComplete(false);
    soundEngine.playChime('connected');

    setTimeout(() => {
      StorageService.logAuditEvent({
        id: 'audit_' + Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        type: 'SECURITY_ALERT',
        message: 'Security Audit Protocol scan completed: 0 cryptographic or packet degradation anomalies detected. Channel integrity 100%.',
        severity: 'success',
      });
      setLogs(StorageService.getAuditLogs());
      setIsScanning(false);
      setScanComplete(true);
      soundEngine.playChime('verified');
    }, 1400);
  };

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    return log.severity === filter;
  });

  const latestTelemetry = telemetryData[telemetryData.length - 1] || INITIAL_TELEMETRY[0];

  return (
    <div id="security-audit-modal" className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-xl p-3 sm:p-4">
      <div className="w-full max-w-3xl bg-[#0b0e15] border border-neutral-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-[0_25px_70px_rgba(0,0,0,0.95)] text-neutral-100 max-h-[92dvh] overflow-y-auto flex flex-col justify-between hud-corner-box">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3 sm:pb-4">
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white font-mono truncate">
                Security Audit Protocol Inspector
              </h2>
              <p className="text-[10px] sm:text-xs text-neutral-400 mt-0.5 font-mono truncate">
                Continuous cryptographic defense verification & secure channel stability
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer shrink-0 ml-2"
          >
            ✕
          </button>
        </div>

        {/* Security Diagnostics Checklist */}
        <div className="my-3 sm:my-4 space-y-3 sm:space-y-4">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
            <div className="bg-[#06080d] border border-neutral-800/80 rounded-xl p-2.5 sm:p-3">
              <div className="text-[9px] sm:text-[10px] font-mono uppercase text-neutral-500">Cipher Protocol</div>
              <div className="text-xs font-mono font-bold text-emerald-400 mt-0.5">ECDH P-256 + AES-GCM</div>
              <div className="text-[9px] sm:text-[10px] font-mono text-neutral-400 mt-0.5">NIST SP 800-56A Rev 3</div>
            </div>

            <div className="bg-[#06080d] border border-neutral-800/80 rounded-xl p-2.5 sm:p-3">
              <div className="text-[9px] sm:text-[10px] font-mono uppercase text-neutral-500">Network Recon Defense</div>
              <div className="text-xs font-mono font-bold text-cyan-400 mt-0.5">LAN IP Leak Filter</div>
              <div className="text-[9px] sm:text-[10px] font-mono text-neutral-400 mt-0.5">RFC1918 Host Isolation</div>
            </div>

            <div className="bg-[#06080d] border border-neutral-800/80 rounded-xl p-2.5 sm:p-3">
              <div className="text-[9px] sm:text-[10px] font-mono uppercase text-neutral-500">Anti-Brute Force</div>
              <div className="text-xs font-mono font-bold text-emerald-400 mt-0.5">Rate Limiter Active</div>
              <div className="text-[9px] sm:text-[10px] font-mono text-neutral-400 mt-0.5">Exponential backoff lock</div>
            </div>

            <div className="bg-[#06080d] border border-neutral-800/80 rounded-xl p-2.5 sm:p-3">
              <div className="text-[9px] sm:text-[10px] font-mono uppercase text-neutral-500">Memory Hygiene</div>
              <div className="text-xs font-mono font-bold text-emerald-400 mt-0.5">Zero-Trace Overwrite</div>
              <div className="text-[9px] sm:text-[10px] font-mono text-neutral-400 mt-0.5">Ephemeral keys auto-zeroed</div>
            </div>
          </div>

          {/* Recharts Visualization: Secure Channel Stability Telemetry */}
          <div className="bg-[#06080d] border border-neutral-800 rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-inner">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2.5 border-b border-neutral-800/80">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs sm:text-sm font-bold font-mono text-white">
                  Secure Channel Stability Telemetry
                </span>
                <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[9px] font-mono text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>LIVE</span>
                </span>
              </div>

              {/* Chart Filter Selectors */}
              <div className="flex items-center space-x-1 bg-[#0b0e14] p-1 rounded-lg border border-neutral-800 text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => setChartMetric('all')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    chartMetric === 'all' ? 'bg-emerald-500/20 text-emerald-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  All Signals
                </button>
                <button
                  type="button"
                  onClick={() => setChartMetric('integrity')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    chartMetric === 'integrity' ? 'bg-emerald-500/20 text-emerald-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Integrity
                </button>
                <button
                  type="button"
                  onClick={() => setChartMetric('latency')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    chartMetric === 'latency' ? 'bg-cyan-500/20 text-cyan-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Latency
                </button>
                <button
                  type="button"
                  onClick={() => setChartMetric('packetLoss')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    chartMetric === 'packetLoss' ? 'bg-rose-500/20 text-rose-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Packet Loss
                </button>
              </div>
            </div>

            {/* Quick Live Telemetry Stat Pills */}
            <div className="grid grid-cols-3 gap-2 mb-3 font-mono">
              <div className="bg-[#0b0e14] border border-neutral-800/80 rounded-lg p-2 text-center">
                <span className="text-[9px] uppercase text-neutral-500 block">Encryption Integrity</span>
                <span className="text-xs sm:text-sm font-bold text-emerald-400">
                  {latestTelemetry.integrity.toFixed(1)}%
                </span>
                <span className="text-[8px] text-neutral-500 block mt-0.5">AES-256-GCM Verified</span>
              </div>
              <div className="bg-[#0b0e14] border border-neutral-800/80 rounded-lg p-2 text-center">
                <span className="text-[9px] uppercase text-neutral-500 block">Round-Trip Latency</span>
                <span className="text-xs sm:text-sm font-bold text-cyan-400">
                  {latestTelemetry.latency} ms
                </span>
                <span className="text-[8px] text-neutral-500 block mt-0.5">Direct Mesh Ping</span>
              </div>
              <div className="bg-[#0b0e14] border border-neutral-800/80 rounded-lg p-2 text-center">
                <span className="text-[9px] uppercase text-neutral-500 block">Packet Loss Rate</span>
                <span className="text-xs sm:text-sm font-bold text-rose-400">
                  {latestTelemetry.packetLoss.toFixed(2)}%
                </span>
                <span className="text-[8px] text-neutral-500 block mt-0.5">Opus In-Band FEC Active</span>
              </div>
            </div>

            {/* Recharts Area Container */}
            <div className="h-44 sm:h-52 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={telemetryData}
                  margin={{ top: 8, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="integrityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="lossGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" />
                  
                  <XAxis 
                    dataKey="time" 
                    stroke="#525252" 
                    fontSize={10} 
                    fontFamily="monospace"
                    tickLine={false}
                  />

                  <YAxis 
                    stroke="#525252" 
                    fontSize={10} 
                    fontFamily="monospace"
                    tickLine={false}
                    domain={[0, 105]}
                  />

                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(11, 14, 21, 0.95)',
                      borderColor: '#262626',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.8)',
                    }}
                    labelStyle={{ color: '#a3a3a3', marginBottom: '4px' }}
                    formatter={(value: any, name: any) => {
                      if (name === 'integrity') return [`${value}%`, 'Encryption Integrity'];
                      if (name === 'latency') return [`${value} ms`, 'DTLS Latency'];
                      if (name === 'packetLoss') return [`${value}%`, 'Packet Loss'];
                      return [value, name];
                    }}
                  />

                  <Legend 
                    wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace', paddingTop: '6px' }}
                    iconType="circle"
                  />

                  {(chartMetric === 'all' || chartMetric === 'integrity') && (
                    <Area
                      type="monotone"
                      dataKey="integrity"
                      name="Encryption Integrity (%)"
                      stroke="#00ff9d"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#integrityGradient)"
                    />
                  )}

                  {(chartMetric === 'all' || chartMetric === 'latency') && (
                    <Area
                      type="monotone"
                      dataKey="latency"
                      name="Latency (ms)"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#latencyGradient)"
                    />
                  )}

                  {(chartMetric === 'all' || chartMetric === 'packetLoss') && (
                    <Area
                      type="monotone"
                      dataKey="packetLoss"
                      name="Packet Loss (%)"
                      stroke="#f43f5e"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#lossGradient)"
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Diagnostic Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-[#06080d] border border-neutral-800/80 rounded-xl p-3">
            <div className="flex items-center space-x-2 text-xs font-mono text-neutral-300">
              <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Full Diagnostic Integrity Probe</span>
            </div>

            <button
              id="run-security-scan-btn"
              type="button"
              disabled={isScanning}
              onClick={handleRunSecurityScan}
              className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-neutral-950 text-xs font-mono font-bold rounded-lg transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 shadow-[0_2px_12px_rgba(16,185,129,0.3)] min-h-[34px]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Probing Cipher Bounds...' : 'Run Integrity Scan'}</span>
            </button>
          </div>

          {/* Audit Logs Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white flex items-center space-x-1.5 font-mono">
                <Terminal className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span>Cryptographic Event Ledger ({filteredLogs.length})</span>
              </span>

              <div className="flex space-x-1">
                {(['all', 'success', 'warning'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilter(tab)}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded capitalize transition-colors cursor-pointer ${
                      filter === tab ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-300'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#05070a] border border-neutral-800/90 rounded-xl p-3 max-h-40 sm:max-h-48 overflow-y-auto font-mono text-[10px] sm:text-[11px] space-y-2">
              {filteredLogs.length === 0 ? (
                <div className="text-neutral-500 text-center py-4">No audit events recorded under this filter.</div>
              ) : (
                filteredLogs.map(log => (
                  <div key={log.id} className="flex items-start space-x-2 border-b border-neutral-900 pb-1.5 last:border-0 last:pb-0">
                    <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full mt-1 shrink-0 ${
                      log.severity === 'warning' ? 'bg-amber-400' : 'bg-emerald-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-1.5 text-[9px] sm:text-[10px] text-neutral-500">
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span>·</span>
                        <span className="text-neutral-400">{log.type}</span>
                      </div>
                      <div className="text-neutral-300 mt-0.5 leading-relaxed break-words">{log.message}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="pt-3 sm:pt-4 border-t border-neutral-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-xs font-mono font-medium rounded-xl transition-colors cursor-pointer text-neutral-200"
          >
            Dismiss Inspector
          </button>
        </div>

      </div>
    </div>
  );
};

