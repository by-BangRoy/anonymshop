import React from 'react';
import {
  History,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
} from 'lucide-react';
import { BoostLogEntry } from '../types/shopee';

interface ActivityLogsProps {
  logs: BoostLogEntry[];
  onClearLogs?: () => void;
}

export const ActivityLogs: React.FC<ActivityLogsProps> = ({ logs, onClearLogs }) => {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-orange-600" />
          <h3 className="text-base font-bold text-slate-900">
            Log Riwayat Server Shopee
          </h3>
          <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {logs.length} Event
          </span>
        </div>

        {onClearLogs && logs.length > 0 && (
          <button
            type="button"
            onClick={onClearLogs}
            className="text-xs text-slate-500 hover:text-slate-700 hover:underline"
          >
            Bersihkan Log
          </button>
        )}
      </div>

      {/* Log list */}
      {logs.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500">
          Belum ada riwayat aktivitas boost. Tempelkan link produk Shopee untuk mulai menaikkan produk.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
          {logs.map((entry) => {
            const isSuccess = entry.status === 'success';
            const dateStr = new Date(entry.timestamp).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            return (
              <div
                key={entry.id}
                className="p-3 sm:p-3.5 hover:bg-slate-50/70 transition-colors flex items-start gap-3 text-xs"
              >
                {/* Status icon */}
                <div className="mt-0.5 shrink-0">
                  {isSuccess ? (
                    <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-red-100 text-red-700 flex items-center justify-center">
                      <XCircle className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>

                {/* Event details */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900 line-clamp-1">
                      {entry.productName}
                    </span>
                    <span className="text-2xs font-mono text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">
                      ID: {entry.itemId}
                    </span>
                    <span className="text-2xs font-semibold px-2 py-0.2 rounded bg-orange-100 text-orange-800">
                      Slot {entry.slotNumber}
                    </span>
                    <span
                      className={`text-2xs px-2 py-0.2 rounded font-medium ${
                        entry.source === 'auto'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {entry.source === 'auto' ? 'Auto-Loop 4 Jam' : 'Manual Trigger'}
                    </span>
                    {entry.proxyUsed && (
                      <span className="text-2xs px-1.5 py-0.2 rounded font-mono bg-blue-50 text-blue-700 flex items-center gap-0.5">
                        <Shield className="w-2.5 h-2.5" />
                        {entry.proxyUsed}
                      </span>
                    )}
                  </div>

                  <p className="text-2xs text-slate-600 mt-1">
                    {entry.message}
                  </p>
                </div>

                {/* Timestamp */}
                <div className="text-right text-2xs text-slate-500 shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>{dateStr}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
