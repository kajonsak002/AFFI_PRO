import React, { useState, useEffect } from 'react';
import { SystemConfig } from '../types';
import { fetchConfig, saveConfig } from '../services/api';
import { Settings, Save, ShieldAlert, Key, Sparkles, Sliders, CheckCircle2, Zap } from 'lucide-react';

interface SettingsTabProps {
  isBridgeConnected?: boolean;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ isBridgeConnected = false }) => {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [tiktokCookie, setTiktokCookie] = useState<string>('');
  const [deepseekApiKey, setDeepseekApiKey] = useState<string>('');
  const [deepseekModel, setDeepseekModel] = useState<string>('deepseek-chat');
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [maxRetries, setMaxRetries] = useState<number>(3);
  const [postDelaySeconds, setPostDelaySeconds] = useState<number>(60);
  
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadConfig = async () => {
    try {
      const cfg = await fetchConfig();
      setConfig(cfg);
      setDeepseekModel(cfg.deepseekModel || 'deepseek-chat');
      setDryRun(cfg.dryRun ?? true);
      setMaxRetries(cfg.maxRetries || 3);
      setPostDelaySeconds(cfg.postDelaySeconds || 60);
    } catch (err: any) {
      showToast(`โหลดการตั้งค่าไม่สำเร็จ: ${err.message}`);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload: any = {
        dryRun,
        maxRetries,
        postDelaySeconds,
        deepseekModel,
      };
      if (tiktokCookie.trim()) payload.tiktokCookie = tiktokCookie.trim();
      if (deepseekApiKey.trim()) payload.deepseekApiKey = deepseekApiKey.trim();

      const res = await saveConfig(payload);
      if (res.ok) {
        showToast('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว!');
        setTiktokCookie('');
        setDeepseekApiKey('');
        await loadConfig();
      } else {
        showToast(`บันทึกไม่สำเร็จ: ${res.message}`);
      }
    } catch (err: any) {
      showToast(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-sky-500 text-white px-5 py-3 rounded-xl shadow-2xl shadow-sky-500/30 flex items-center gap-2 text-sm font-medium animate-bounce">
          <Sparkles className="w-4 h-4" />
          {toastMessage}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* TikTok Showcase API Section */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Key className="w-5 h-5 text-sky-400" />
              <h3 className="text-base font-semibold text-slate-100">ตั้งค่า TikTok Shop Showcase API</h3>
            </div>
            {isBridgeConnected && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Bridge เชื่อมต่อแล้ว (ดึงอัตโนมัติ)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            ระบบมี <b>Chrome Extension Bridge</b> ทำหน้าที่ดึง Cookie จากเบราว์เซอร์ให้อัตโนมัติโดยที่ผู้ใช้ไม่ต้องคัดลอกมาวางเอง
          </p>

          {/* Quick Auto Extract Button */}
          <div className="bg-slate-950/60 border border-sky-500/20 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-sky-400" />
                ดึง Cookie จาก Chrome อัตโนมัติ (Zero-Touch)
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                หากเปิด Extension ใน Chrome ไว้ ระบบจะดึงและซิงค์ให้ทันที
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                window.postMessage({ type: 'AFFI_PRO_REQUEST_COOKIE_SYNC' }, '*');
                showToast('ส่งคำขอดึง Cookie ไปยัง Chrome Extension แล้ว...');
                setTimeout(loadConfig, 1500);
              }}
              className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-sky-500/20 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Zap className="w-3.5 h-3.5" />
              ดึง Cookie เดี๋ยวนี้
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              หรือระบุ TikTok Cookie ด้วยตนเอง (ถ้าไม่ใช้ Extension)
            </label>
            <textarea
              rows={4}
              value={tiktokCookie}
              onChange={(e) => setTiktokCookie(e.target.value)}
              placeholder={config?.tiktokCookieConfigured ? `มีค่าเดิมอยู่แล้ว: ${config.tiktokCookiePreview} (วางค่าใหม่หากต้องการเปลี่ยน)` : 'วาง Cookie ที่นี่...'}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
            />
            {config?.tiktokCookieConfigured && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium mt-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                ตั้งค่า Cookie ในระบบเรียบร้อยแล้ว
              </span>
            )}
          </div>
        </div>

        {/* DeepSeek API Section (Phase 2 Prep) */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h3 className="text-base font-semibold text-slate-100">ตั้งค่า DeepSeek AI (สำหรับเขียนแคปชั่นในเฟส 2)</h3>
          </div>
          <p className="text-xs text-slate-400">
            ใช้โมเดล DeepSeek ที่ประหยัดที่สุดเพื่อสร้างแคปชั่นสั้นกระชับ &lt; 100 ตัวอักษรพร้อมแฮชแท็ก 3-5 อัน
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">DeepSeek Model</label>
              <input
                type="text"
                value={deepseekModel}
                onChange={(e) => setDeepseekModel(e.target.value)}
                placeholder="deepseek-chat"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500"
              />
              <span className="text-[11px] text-slate-500">ค่าเริ่มต้น: deepseek-chat (คุ้มค่าและประหยัดที่สุด)</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">DeepSeek API Key</label>
              <input
                type="password"
                value={deepseekApiKey}
                onChange={(e) => setDeepseekApiKey(e.target.value)}
                placeholder={config?.deepseekKeyConfigured ? '•••••••••••••••• (ตั้งค่าแล้ว)' : 'sk-...'}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500"
              />
              <span className="text-[11px] text-slate-500">เก็บใน .env เท่านั้น ไม่เปิดเผยสู่ภายนอก</span>
            </div>
          </div>
        </div>

        {/* System & Automation Options */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-semibold text-slate-100">ตัวเลือกระบบ & โหมดความปลอดภัย</h3>
          </div>

          {/* Dry Run Toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-950/80 border border-slate-800/80 rounded-xl">
            <div>
              <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                โหมด Dry-run (จำลองการทำงาน)
                {dryRun && (
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                    เปิดใช้งาน
                  </span>
                )}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                เมื่อเปิดโหมดนี้ ระบบจะทดสอบกระบวนการทั้งหมดโดยไม่กดปุ่ม Post จริงบน TikTok Studio
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Retries and Delay */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">จำนวน Retry สูงสุดต่องาน (ครั้ง)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value))}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">หน่วงเวลาระหว่างโพสต์แต่ละคลิป (วินาที)</label>
              <input
                type="number"
                min={10}
                max={3600}
                value={postDelaySeconds}
                onChange={(e) => setPostDelaySeconds(Number(e.target.value))}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-3 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-sm shadow-xl shadow-sky-500/20 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าทั้งหมด'}
          </button>
        </div>
      </form>
    </div>
  );
};
