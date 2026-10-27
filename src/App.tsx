import React, { useState, useEffect } from 'react';
import { ShowcaseTab } from './components/ShowcaseTab';
import { QueueTab } from './components/QueueTab';
import { LogsTab } from './components/LogsTab';
import { SettingsTab } from './components/SettingsTab';
import { fetchConfig, getQueue } from './services/api';
import { SystemConfig, QueueStats } from './types';
import {
  ShoppingBag,
  Layers,
  Terminal,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Zap,
  Activity,
  CheckCircle2
} from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'showcase' | 'queue' | 'logs' | 'settings'>('showcase');
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [isBridgeConnected, setIsBridgeConnected] = useState<boolean>(false);
  const [autoSyncBanner, setAutoSyncBanner] = useState<string | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats>({
    total: 0,
    pending: 0,
    generating: 0,
    clip_ready: 0,
    posting: 0,
    posted: 0,
    failed: 0,
  });

  const loadTopBarInfo = async () => {
    try {
      const [cfg, qRes] = await Promise.all([
        fetchConfig(),
        getQueue('all'),
      ]);
      setConfig(cfg);
      if (qRes.success) setQueueStats(qRes.stats);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadTopBarInfo();
    const interval = setInterval(loadTopBarInfo, 8000);

    // Listen to Chrome Extension Bridge messages
    const handleBridgeMessage = (event: MessageEvent) => {
      if (event.source !== window) return;

      if (event.data?.type === 'AFFI_PRO_BRIDGE_AVAILABLE') {
        setIsBridgeConnected(true);
      }

      if (event.data?.type === 'AFFI_PRO_COOKIES_AUTO_SYNCED') {
        setIsBridgeConnected(true);
        loadTopBarInfo();
        setAutoSyncBanner(`⚡ ระบบดึง Cookie (${event.data.count} ตัว) จาก Chrome ให้เรียบร้อยอัตโนมัติ!`);
        setTimeout(() => setAutoSyncBanner(null), 4000);
      }

      if (event.data?.type === 'AFFI_PRO_COOKIE_SYNC_RESPONSE' && event.data.success) {
        setIsBridgeConnected(true);
        loadTopBarInfo();
        setAutoSyncBanner(`⚡ ดึงและอัปเดต Cookie ${event.data.count} ตัวสำเร็จ!`);
        setTimeout(() => setAutoSyncBanner(null), 4000);
      }
    };

    window.addEventListener('message', handleBridgeMessage);

    // Request cookie sync right on launch
    window.postMessage({ type: 'AFFI_PRO_REQUEST_COOKIE_SYNC' }, '*');

    return () => {
      clearInterval(interval);
      window.removeEventListener('message', handleBridgeMessage);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Prompt',sans-serif]">
      {/* Auto Sync Banner */}
      {autoSyncBanner && (
        <div className="bg-emerald-500/20 border-b border-emerald-500/40 text-emerald-300 px-6 py-2.5 text-center text-xs font-semibold flex items-center justify-center gap-2 animate-pulse">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {autoSyncBanner}
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-sky-500/20 text-slate-950 font-black text-xl">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-sky-400 to-indigo-300 bg-clip-text text-transparent">
                  AFFI_PRO
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 tracking-wider">
                  V1.0
                </span>
                {isBridgeConnected && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    ● Bridge เชื่อมต่อแล้ว
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                ระบบดึงสินค้า TikTok Showcase • ผลิตคลิป Meta Auto • โพสต์ปักตะกร้าอัตโนมัติ
              </p>
            </div>
          </div>

          {/* Status Pills */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {/* Dry Run Badge */}
            {config?.dryRun ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium">
                <Zap className="w-3.5 h-3.5" />
                โหมด Dry-run
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                โหมด Live (โพสต์จริง)
              </span>
            )}

            {/* Cookie Status */}
            {config?.tiktokCookieConfigured ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                TikTok Cookie พร้อม (ดึงให้อัตโนมัติ)
              </span>
            ) : (
              <span
                onClick={() => setActiveTab('settings')}
                className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium hover:bg-amber-500/20 transition-colors"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                รอเชื่อมต่อ Cookie
              </span>
            )}

            {/* Queue Counter Badge */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-slate-300 font-mono text-[11px] border border-slate-700/80">
              <Activity className="w-3 h-3 text-sky-400" />
              คิวทั้งหมด {queueStats.total}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto mt-4 pt-3 border-t border-slate-800/40 flex items-center gap-1 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('showcase')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === 'showcase'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            1. คลังสินค้า Showcase
          </button>

          <button
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === 'queue'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            2. คิวรอผลิต &amp; โพสต์
            {queueStats.pending > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'queue' ? 'bg-slate-950 text-white' : 'bg-amber-500 text-slate-950'
              }`}>
                {queueStats.pending}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === 'logs'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Terminal className="w-4 h-4" />
            3. บันทึกระบบ (Logs)
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === 'settings'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Settings className="w-4 h-4" />
            4. ตั้งค่าระบบ
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'showcase' && (
          <ShowcaseTab
            onQueueAdded={loadTopBarInfo}
            onNavigateToSettings={() => setActiveTab('settings')}
          />
        )}
        {activeTab === 'queue' && <QueueTab onQueueUpdated={loadTopBarInfo} />}
        {activeTab === 'logs' && <LogsTab />}
        {activeTab === 'settings' && <SettingsTab isBridgeConnected={isBridgeConnected} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-600">
        AFFI_PRO • Automated TikTok Showcase &amp; Meta AI Video Studio • Built with Vite TS + SQLite
      </footer>
    </div>
  );
};
export default App;
