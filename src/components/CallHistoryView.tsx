/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  PhoneIncoming, PhoneOutgoing, PhoneMissed, Trash2, ShieldCheck, 
  Search, Phone, Download, AlertOctagon, CheckCircle2, Laptop,
  Key, ShieldAlert, Cpu
} from 'lucide-react';
import { CallRecord, CallDirection, CallStatus } from '../types';

interface CallHistoryViewProps {
  records: CallRecord[];
  onStartCall: (target: string, isRoomCode: boolean) => Promise<{ success: boolean; error?: string }> | void;
  onDeleteRecord: (id: string) => void;
  onShredAll: () => void;
}

export const CallHistoryView: React.FC<CallHistoryViewProps> = ({
  records,
  onStartCall,
  onDeleteRecord,
  onShredAll,
}) => {
  const [filter, setFilter] = useState<'all' | 'inbound' | 'outbound' | 'missed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAuditRecord, setSelectedAuditRecord] = useState<CallRecord | null>(null);
  const [confirmShredAll, setConfirmShredAll] = useState(false);
  const [callbackError, setCallbackError] = useState<string | null>(null);

  const handleCallback = async (remoteNumber: string) => {
    setCallbackError(null);
    const isRoom = remoteNumber.startsWith('#');
    const res = await onStartCall(remoteNumber, isRoom);
    if (res && !res.success) {
      setCallbackError(res.error || 'Failed to call back: Target number is not registered on the network.');
      setTimeout(() => setCallbackError(null), 5000);
    }
  };

  const filteredRecords = records.filter(record => {
    if (filter === 'inbound' && record.direction !== 'inbound') return false;
    if (filter === 'outbound' && record.direction !== 'outbound') return false;
    if (filter === 'missed' && record.status !== 'missed') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        record.remoteNumber.toLowerCase().includes(q) ||
        record.remoteAlias.toLowerCase().includes(q) ||
        record.roomNumber.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return '0s';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + 
      ' · ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleExportAudit = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(records, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `shadowfrequency_audit_log_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div id="call-history-view" className="w-full max-w-4xl mx-auto px-1 sm:px-0">
      
      {/* Header & Global Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white font-mono">Call Ledger</h2>
            <span className="text-xs font-mono text-emerald-400">
              ({records.length} {records.length === 1 ? 'entry' : 'entries'})
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-neutral-400 mt-0.5 font-mono">
            Zero-knowledge cryptographic session logs with client-side verification proofs.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleExportAudit}
            disabled={records.length === 0}
            className="flex-1 sm:flex-initial px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#0c1017] hover:bg-[#141b26] text-neutral-300 border border-neutral-800 hover:border-neutral-700 rounded-xl text-xs font-mono transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer min-h-[36px]"
          >
            <Download className="w-3.5 h-3.5 text-neutral-400" />
            <span>Export JSON</span>
          </button>

          <button
            id="shred-all-history-btn"
            type="button"
            onClick={() => setConfirmShredAll(true)}
            disabled={records.length === 0}
            className="flex-1 sm:flex-initial px-3 py-1.5 sm:px-3.5 sm:py-2 bg-red-950/30 hover:bg-red-900/50 text-red-400 border border-red-800/60 rounded-xl text-xs font-mono font-medium transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer min-h-[36px]"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Emergency Shred</span>
          </button>
        </div>
      </div>

      {/* Unregistered line error banner when calling back */}
      {callbackError && (
        <div className="mb-4 bg-red-950/40 border border-red-500/50 rounded-xl sm:rounded-2xl p-3 sm:p-4 text-left animate-shake shadow-[0_4px_20px_rgba(239,68,68,0.15)]">
          <div className="flex items-start space-x-2.5">
            <div className="p-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 shrink-0 mt-0.5">
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-red-300 font-mono">Callback Routing Aborted</div>
              <p className="text-[11px] sm:text-xs text-red-200 mt-0.5 font-mono leading-relaxed break-words">{callbackError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 mb-4 sm:mb-6">
        {/* Interactive Segmented Filter Controls */}
        <div className="flex bg-[#06080d] p-1 rounded-xl border border-neutral-800 w-full sm:w-auto overflow-x-auto no-scrollbar">
          {(['all', 'inbound', 'outbound', 'missed'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`flex-1 sm:flex-initial px-3 sm:px-3.5 py-1.5 text-xs font-mono font-medium rounded-lg capitalize transition-all cursor-pointer whitespace-nowrap min-h-[32px] ${
                filter === tab 
                  ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700' 
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search line, peer, or room..."
            className="w-full bg-[#06080d] border border-neutral-800/90 rounded-xl pl-9 pr-3 py-1.5 sm:py-2 text-xs font-mono text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-emerald-500/60 min-h-[36px]"
          />
        </div>
      </div>

      {/* Call History Ledger List */}
      {filteredRecords.length === 0 ? (
        <div className="bg-[#0a0d14]/70 border border-neutral-800/80 rounded-2xl p-8 sm:p-12 text-center text-neutral-400 hud-corner-box">
          <ShieldCheck className="w-8 h-8 sm:w-10 sm:h-10 mx-auto text-neutral-600 mb-2 sm:mb-3" />
          <p className="text-sm font-mono font-semibold text-neutral-200">No Records Found</p>
          <p className="text-xs font-mono text-neutral-500 mt-1 max-w-sm mx-auto">
            {records.length === 0 
              ? 'Your cryptographic ledger is clean. Calls dialed or answered will appear here with verification proofs.'
              : 'No log entries match the current filter or search criteria.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-2.5">
          {filteredRecords.map((record) => {
            const isMissed = record.status === 'missed';
            return (
              <div
                key={record.id}
                id={`call-record-${record.id}`}
                className="bg-[#0b0e15] border border-neutral-800/80 hover:border-neutral-700 rounded-xl sm:rounded-2xl p-3 sm:p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
              >
                {/* Left: Direction Icon & Call Details */}
                <div className="flex items-center space-x-3 min-w-0">
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isMissed 
                      ? 'bg-red-950/40 text-red-400 border border-red-800/40' 
                      : record.direction === 'inbound'
                      ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40'
                      : 'bg-cyan-950/40 text-cyan-400 border border-cyan-800/40'
                  }`}>
                    {isMissed ? (
                      <PhoneMissed className="w-4 h-4 sm:w-5 sm:h-5" />
                    ) : record.direction === 'inbound' ? (
                      <PhoneIncoming className="w-4 h-4 sm:w-5 sm:h-5" />
                    ) : (
                      <PhoneOutgoing className="w-4 h-4 sm:w-5 sm:h-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs sm:text-sm font-mono font-bold text-white tracking-wide truncate">
                        {record.remoteNumber}
                      </span>
                      {record.encryptionDetails?.isVerified && (
                        <span className="text-[9px] sm:text-[10px] font-mono text-emerald-400 flex items-center space-x-1 shrink-0">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Verified</span>
                        </span>
                      )}
                    </div>
                    {/* Clean text metadata with typographical separators */}
                    <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-mono text-neutral-400 mt-0.5 truncate">
                      <span className="truncate">{record.remoteAlias}</span>
                      <span aria-hidden="true" className="text-neutral-600">·</span>
                      <span className="tabular-nums shrink-0">{formatDuration(record.duration)}</span>
                      <span aria-hidden="true" className="text-neutral-600">·</span>
                      <span className="tabular-nums shrink-0">{formatDate(record.timestamp)}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Device origin & Actions */}
                <div className="flex items-center justify-between sm:justify-end space-x-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-800/60">
                  <div className="text-[10px] font-mono text-neutral-400 flex items-center space-x-1 px-2 py-0.5 sm:py-1 bg-[#06080d] rounded-lg border border-neutral-800 shrink-0">
                    <Laptop className="w-3 h-3 text-neutral-400" />
                    <span className="truncate max-w-[90px] sm:max-w-none">{record.deviceOrigin}</span>
                  </div>

                  <div className="flex items-center space-x-1 sm:space-x-1.5">
                    {/* Cryptographic Proof Action */}
                    <button
                      type="button"
                      onClick={() => setSelectedAuditRecord(record)}
                      className="p-1.5 sm:p-2 text-neutral-400 hover:text-emerald-400 hover:bg-neutral-800/80 rounded-lg sm:rounded-xl transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                      title="View Cryptographic Proof"
                    >
                      <ShieldCheck className="w-4 h-4" />
                    </button>

                    {/* Redial Action */}
                    <button
                      type="button"
                      onClick={() => handleCallback(record.remoteNumber)}
                      className="p-1.5 sm:p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg sm:rounded-xl transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                      title="Dial Peer"
                    >
                      <Phone className="w-4 h-4" />
                    </button>

                    {/* Shred Record Action */}
                    <button
                      type="button"
                      onClick={() => onDeleteRecord(record.id)}
                      className="p-1.5 sm:p-2 text-neutral-500 hover:text-red-400 hover:bg-neutral-800/80 rounded-lg sm:rounded-xl transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                      title="Cryptographically Shred Record"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal for Shred All */}
      {confirmShredAll && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-[#0b0e15] border border-red-900/60 rounded-2xl sm:rounded-3xl p-5 sm:p-7 text-neutral-100 shadow-2xl hud-corner-box">
            <div className="w-10 h-10 rounded-2xl bg-red-950/60 border border-red-800 flex items-center justify-center text-red-400 mb-3">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white mb-1 font-mono">Confirm Emergency Overwrite</h3>
            <p className="text-xs text-neutral-300 mb-4 sm:mb-5 leading-relaxed font-mono">
              Cryptographically zero-overwrite and purge all {records.length} call records, timestamps, and ephemeral SAS keys immediately.
            </p>
            <div className="flex space-x-2.5">
              <button
                type="button"
                onClick={() => setConfirmShredAll(false)}
                className="flex-1 py-2 sm:py-2.5 bg-neutral-800 hover:bg-neutral-700 text-xs font-mono font-medium rounded-xl transition-colors cursor-pointer"
              >
                Abort
              </button>
              <button
                type="button"
                onClick={() => {
                  onShredAll();
                  setConfirmShredAll(false);
                }}
                className="flex-1 py-2 sm:py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-mono font-bold rounded-xl transition-colors cursor-pointer shadow-[0_4px_20px_rgba(239,68,68,0.4)]"
              >
                Zero-Overwrite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cryptographic Proof Modal */}
      {selectedAuditRecord && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-lg bg-[#0b0e15] border border-neutral-800 rounded-2xl sm:rounded-3xl p-5 sm:p-7 text-neutral-100 shadow-2xl max-h-[90dvh] overflow-y-auto hud-corner-box">
            <div className="flex items-center space-x-3 mb-4 border-b border-neutral-800 pb-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold text-white font-mono truncate">E2EE Handshake Cryptographic Proof</h3>
                <p className="text-[10px] sm:text-[11px] font-mono text-neutral-400 truncate">Record Hash: {selectedAuditRecord.id}</p>
              </div>
            </div>

            <div className="space-y-2.5 font-mono text-xs mb-5">
              <div className="bg-[#06080d] border border-neutral-800 rounded-xl p-3">
                <div className="text-neutral-500 text-[9px] uppercase">Cipher Suite</div>
                <div className="text-emerald-400 font-semibold mt-0.5 text-xs">{selectedAuditRecord.encryptionDetails.cipher}</div>
              </div>

              <div className="bg-[#06080d] border border-neutral-800 rounded-xl p-3">
                <div className="text-neutral-500 text-[9px] uppercase">Short Authentication String (SAS)</div>
                <div className="text-white text-sm sm:text-base font-bold mt-0.5 tracking-wider">
                  {selectedAuditRecord.encryptionDetails.sasCode} · {selectedAuditRecord.encryptionDetails.sasEmojis.join(' ')}
                </div>
              </div>

              <div className="bg-[#06080d] border border-neutral-800 rounded-xl p-3">
                <div className="text-neutral-500 text-[9px] uppercase">Session Key Fingerprint (SHA-256)</div>
                <div className="text-neutral-300 text-[10px] sm:text-[11px] break-all mt-0.5">
                  {selectedAuditRecord.encryptionDetails.keyFingerprint}
                </div>
              </div>

              <div className="bg-[#06080d] border border-neutral-800 rounded-xl p-3 flex justify-between items-center text-xs">
                <span className="text-neutral-500 text-[9px] uppercase">Device Origin</span>
                <span className="text-neutral-200">{selectedAuditRecord.deviceOrigin}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedAuditRecord(null)}
              className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-xs font-mono font-medium rounded-xl transition-colors cursor-pointer"
            >
              Close Ledger Proof
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
