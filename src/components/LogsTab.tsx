import React, { useState, useEffect } from 'react';
import { LogItem } from '../types';
import { getLogs } from '../services/api';
import { RefreshCw, Terminal, CheckCircle2, AlertTriangle, AlertOctagon, Info } from 'lucide-react';

export const LogsTab: React.FC = () => {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const res = await getLogs();
      if (res.success) setLogs(res.logs);
    } catch (err) {
      console.error('Failed to load logs', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadLogs, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const getLogIcon = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return <AlertOctagon className="w-4 h-4 text-red-400 flex-shrink-0" />;
      case 'warn':
        return <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-sky-400 flex-shrink-0" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-sky-400" />
          <h3 className="text-sm font-semibold text-slate-100">บันทึกการทำงานของระบบ (Live Logs)</h3>
          <span className="text-xs text-slate-500 ml-2">({logs.length} บันทึกล่าสุด)</span>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded bg-slate-950 border-slate-800 text-sky-500 focus:ring-0"
            />
            รีเฟรชอัตโนมัติ (3s)
          </label>

          <button
            onClick={loadLogs}
            disabled={isLoading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-colors"
            title="รีเฟรชบันทึก"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Log Console Container */}
      <div className="bg-slate-950/90 border border-slate-800/80 rounded-2xl p-4 font-mono text-xs overflow-y-auto max-h-[600px] space-y-2 shadow-inner">
        {logs.length === 0 ? (
          <div className="py-12 text-center text-slate-600">ยังไม่มีบันทึกการทำงาน</div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-3 py-1.5 px-2 rounded-lg hover:bg-slate-900/50 transition-colors border-b border-slate-900/40"
            >
              <span className="text-slate-500 text-[11px] whitespace-nowrap">
                {new Date(log.created_at).toLocaleTimeString('th-TH')}
              </span>
              {getLogIcon(log.level)}
              <div className="flex-1 min-w-0">
                <span className={`leading-relaxed ${
                  log.level === 'error' ? 'text-red-300' :
                  log.level === 'warn' ? 'text-amber-300' :
                  log.level === 'success' ? 'text-emerald-300' : 'text-slate-300'
                }`}>
                  {log.message}
                </span>
                {log.job_id && (
                  <span className="ml-2 text-[10px] text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                    {log.job_id}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
