import React, { useState, useEffect, useRef } from 'react';
import { QueueJob, QueueStats, QueueStatus } from '../types';
import {
  getQueue,
  removeFromQueue,
  retryJob,
  clearQueue,
  fetchWorkerStatus,
  startWorkerApi,
  stopWorkerApi,
  stepWorkerApi,
  openBrowserApi
} from '../services/api';
import {
  ListFilter,
  RefreshCw,
  Trash2,
  RotateCw,
  Clock,
  PlayCircle,
  Video,
  Share2,
  CheckCircle2,
  AlertOctagon,
  Sparkles,
  Inbox,
  AlertTriangle,
  Play,
  Pause,
  Zap,
  FileVideo,
  FileText,
  X,
  Download,
  Copy,
  Check,
  FileSpreadsheet
} from 'lucide-react';

interface QueueTabProps {
  onQueueUpdated?: () => void;
}

export const QueueTab: React.FC<QueueTabProps> = ({ onQueueUpdated }) => {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [stats, setStats] = useState<QueueStats>({
    total: 0,
    pending: 0,
    generating: 0,
    clip_ready: 0,
    posting: 0,
    posted: 0,
    failed: 0,
  });
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Worker state
  const [isWorkerRunning, setIsWorkerRunning] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isStepping, setIsStepping] = useState<boolean>(false);

  // Modal preview state
  const [previewJob, setPreviewJob] = useState<QueueJob | null>(null);
  const [copiedCaption, setCopiedCaption] = useState<boolean>(false);

  const exportCsv = () => {
    if (!jobs.length) return showToast('ยังไม่มีงานในคิวให้ส่งออก');
    const headers = ['Job ID', 'Product ID', 'ชื่อสินค้า', 'ราคา', 'สถานะ', 'แคปชั่น', 'ไฟล์คลิป', 'สร้างเมื่อ', 'โพสต์เมื่อ'];
    const rows = jobs.map((j) => [
      j.id,
      j.product_id,
      `"${(j.title || '').replace(/"/g, '""')}"`,
      `"${j.price || ''}"`,
      j.status,
      `"${(j.caption || '').replace(/"/g, '""')}"`,
      j.video_path ? j.video_path.split('\\').pop()?.split('/').pop() || '' : '',
      new Date(j.created_at).toLocaleString('th-TH'),
      j.posted_at ? new Date(j.posted_at).toLocaleString('th-TH') : '',
    ]);

    const csvContent = '\ufeff' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `affi-pro-queue-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('ส่งออกรายงาน CSV สำเร็จ!');
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadQueue = async () => {
    setIsLoading(true);
    try {
      const [res, wStatus] = await Promise.all([
        getQueue(selectedStatus),
        fetchWorkerStatus(),
      ]);
      if (res.success) {
        setJobs(res.items);
        setStats(res.stats);
      }
      if (wStatus.success) {
        setIsWorkerRunning(wStatus.isRunning);
        setIsProcessing(wStatus.isProcessing);
      }
    } catch (err: any) {
      showToast(`โหลดคิวไม่สำเร็จ: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const lastAutoLaunchedRef = useRef<{ id: string; stage: string }>({ id: '', stage: '' });

  useEffect(() => {
    loadQueue();
    const interval = setInterval(async () => {
      await loadQueue();

      // เมื่อ Worker รันอยู่: ตรวจจับคิวและสั่งเปิดเบราว์เซอร์อัตโนมัติ 100%
      if (isWorkerRunning) {
        const qRes = await getQueue().catch(() => null);
        if (!qRes || !qRes.items) return;
        const items = qRes.items;
        const readyJob = items.find((j: any) => j.status === 'clip_ready');
        const postingJob = items.find((j: any) => j.status === 'posting');
        const generatingJob = items.find((j: any) => j.status === 'generating');

        const target = readyJob || postingJob;
        if (target && lastAutoLaunchedRef.current.id !== target.id + '_tiktok') {
          lastAutoLaunchedRef.current = { id: target.id + '_tiktok', stage: 'tiktok' };
          window.postMessage({ type: 'AFFI_PRO_REQUEST_LAUNCH_TIKTOK', job: target }, '*');
          openBrowserApi('https://www.tiktok.com/tiktokstudio/upload');
          window.open('https://www.tiktok.com/tiktokstudio/upload', '_blank');
          showToast(`🚀 คลิปพร้อมแล้ว! เปิด TikTok Studio ปักตะกร้าอัตโนมัติ...`);
        } else if (generatingJob && lastAutoLaunchedRef.current.id !== generatingJob.id + '_meta') {
          lastAutoLaunchedRef.current = { id: generatingJob.id + '_meta', stage: 'meta' };
          window.postMessage({ type: 'AFFI_PRO_REQUEST_LAUNCH_META', job: generatingJob }, '*');
          openBrowserApi('https://www.meta.ai/?jarbland-autovideo=1');
          window.open('https://www.meta.ai/?jarbland-autovideo=1', '_blank');
          showToast(`🚀 เปิด Meta AI บนหน้าจออัตโนมัติแล้ว! กำลังสร้างวิดีโอ...`);
        }
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedStatus, isWorkerRunning]);

  const toggleWorker = async () => {
    try {
      if (isWorkerRunning) {
        const res = await stopWorkerApi();
        if (res.ok) {
          setIsWorkerRunning(false);
          showToast('⏸️ หยุดการทำงานของ Worker ชั่วคราว');
        }
      } else {
        const res = await startWorkerApi();
        if (res.ok) {
          setIsWorkerRunning(true);
          showToast('🟢 เริ่มต้นรันคิวอัตโนมัติ! กำลังเปิดหน้าต่างงานให้ทันที...');

          // ดึงคิวงานล่าสุด แล้วเปิด Meta AI หรือ TikTok Studio ให้ทันทีโดยไม่ต้องคลิกเอง!
          const qRes = await getQueue().catch(() => null);
          const items = qRes?.items || [];
          const readyJob = items.find((j: any) => j.status === 'clip_ready');
          const postingJob = items.find((j: any) => j.status === 'posting');
          const generatingJob = items.find((j: any) => j.status === 'generating');
          const pendingJob = items.find((j: any) => j.status === 'pending');

          const tiktokTarget = readyJob || postingJob;
          const metaTarget = generatingJob || pendingJob;

          if (tiktokTarget) {
            lastAutoLaunchedRef.current = { id: tiktokTarget.id + '_tiktok', stage: 'tiktok' };
            window.postMessage({ type: 'AFFI_PRO_REQUEST_LAUNCH_TIKTOK', job: tiktokTarget }, '*');
            openBrowserApi('https://www.tiktok.com/tiktokstudio/upload');
            window.open('https://www.tiktok.com/tiktokstudio/upload', '_blank');
          } else if (metaTarget) {
            lastAutoLaunchedRef.current = { id: metaTarget.id + '_meta', stage: 'meta' };
            window.postMessage({ type: 'AFFI_PRO_REQUEST_LAUNCH_META', job: metaTarget }, '*');
            openBrowserApi('https://www.meta.ai/?jarbland-autovideo=1');
            window.open('https://www.meta.ai/?jarbland-autovideo=1', '_blank');
          }
        }
      }
      await loadQueue();
      onQueueUpdated?.();
    } catch (err: any) {
      showToast(`คำสั่ง Worker ผิดพลาด: ${err.message}`);
    }
  };

  const handleStepOnce = async () => {
    setIsStepping(true);
    showToast('⚡ กำลังเริ่มประมวลผลรายการในคิว...');
    try {
      // 1. เรียก Worker เตรียมข้อมูลงาน (Prompt + Caption)
      const res = await stepWorkerApi();
      await loadQueue();
      onQueueUpdated?.();

      // 2. ดึงข้อมูลงานล่าสุดหลัง Step
      const updatedQueue = await getQueue();
      const currentJobs = updatedQueue.items || [];
      const generatingJob = currentJobs.find((j: any) => j.status === 'generating');
      const readyJob = currentJobs.find((j: any) => j.status === 'clip_ready');
      const postingJob = currentJobs.find((j: any) => j.status === 'posting');

      const target = readyJob || postingJob;
      if (target) {
        window.postMessage({ type: 'AFFI_PRO_REQUEST_LAUNCH_TIKTOK', job: target }, '*');
        openBrowserApi('https://www.tiktok.com/tiktokstudio/upload');
        showToast(`🚀 เปิด TikTok Studio เพื่อปักตะกร้า: ${(target.title || '').slice(0, 20)}...`);
      } else if (generatingJob) {
        window.postMessage({ type: 'AFFI_PRO_REQUEST_LAUNCH_META', job: generatingJob }, '*');
        openBrowserApi('https://www.meta.ai/?jarbland-autovideo=1');
        showToast(`🚀 สั่งเปิด Meta AI บนหน้าจอแล้ว! Bot กำลังสร้างวิดีโอ...`);
      } else {
        showToast('ไม่มีงานรอสร้างในคิว (เพิ่มสินค้าจาก Showcase เข้าคิวก่อนได้เลย)');
      }
    } catch (err: any) {
      showToast(`ประมวลผลไม่สำเร็จ: ${err.message}`);
    } finally {
      setIsStepping(false);
    }
  };

  const handleRetry = async (id: string) => {
    try {
      const res = await retryJob(id);
      if (res.ok) {
        showToast('สั่งเริ่มงานใหม่แล้ว (สถานะเป็น pending)');
        await loadQueue();
        onQueueUpdated?.();
      }
    } catch (err: any) {
      showToast(`Retry ไม่สำเร็จ: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('ยืนยันลบงานนี้ออกจากคิวหรือไม่?')) return;
    try {
      const res = await removeFromQueue(id);
      if (res.ok) {
        showToast('ลบงานออกจากคิวแล้ว');
        await loadQueue();
        onQueueUpdated?.();
      }
    } catch (err: any) {
      showToast(`ลบไม่สำเร็จ: ${err.message}`);
    }
  };

  const handleClear = async (type: 'all' | 'completed' | 'failed') => {
    const label = type === 'all' ? 'ทั้งหมด' : type === 'completed' ? 'ที่โพสต์เสร็จแล้ว' : 'ที่ล้มเหลว';
    if (!confirm(`ยืนยันล้างคิวงาน${label} หรือไม่?`)) return;
    try {
      const res = await clearQueue(type);
      if (res.ok) {
        showToast(`ล้างคิวสำเร็จ ลบไป ${res.cleared} รายการ`);
        await loadQueue();
        onQueueUpdated?.();
      }
    } catch (err: any) {
      showToast(`ล้างคิวไม่สำเร็จ: ${err.message}`);
    }
  };

  const getStatusBadge = (status: QueueStatus) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Clock className="w-3.5 h-3.5" />
            รอคิวสร้างคลิป (pending)
          </span>
        );
      case 'generating':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30 animate-pulse">
            <PlayCircle className="w-3.5 h-3.5 animate-spin" />
            กำลังสร้างคลิป (generating)
          </span>
        );
      case 'clip_ready':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">
            <Video className="w-3.5 h-3.5" />
            คลิปพร้อมโพสต์ (clip_ready)
          </span>
        );
      case 'posting':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/30 animate-pulse">
            <Share2 className="w-3.5 h-3.5 animate-bounce" />
            กำลังโพสต์ TikTok (posting)
          </span>
        );
      case 'posted':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            โพสต์สำเร็จ (posted)
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30">
            <AlertOctagon className="w-3.5 h-3.5" />
            ล้มเหลว (failed)
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-sky-500 text-white px-5 py-3 rounded-xl shadow-2xl shadow-sky-500/30 flex items-center gap-2 text-sm font-medium animate-bounce">
          <Sparkles className="w-4 h-4" />
          {toastMessage}
        </div>
      )}

      {/* Worker Automation Control Center */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950/40 border border-indigo-500/30 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className={`w-3 h-3 rounded-full ${isWorkerRunning ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              ระบบ Automation Worker
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                isWorkerRunning
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}>
                {isWorkerRunning ? 'กำลังทำงานต่อเนื่อง (Running)' : 'หยุดชั่วคราว (Paused)'}
              </span>
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            ดึงงานสร้างคลิปผ่าน Meta Auto + DeepSeek Caption และส่งเข้าคิวโพสต์ TikTok พร้อมปักตะกร้าสินค้าอัตโนมัติ
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleStepOnce}
            disabled={isStepping || isProcessing}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 rounded-xl text-xs font-bold transition-all shadow flex items-center gap-2 disabled:opacity-50"
            title="ประมวลผลงานถัดไป 1 รายการเพื่อทดสอบทีละขั้น"
          >
            <Zap className={`w-4 h-4 ${isStepping ? 'animate-spin' : ''}`} />
            ทดสอบรัน 1 รายการ (Step)
          </button>

          <button
            onClick={toggleWorker}
            className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all shadow-lg flex items-center gap-2 ${
              isWorkerRunning
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
            }`}
          >
            {isWorkerRunning ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                หยุด Worker ชั่วคราว
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                เริ่มรันคิวอัตโนมัติ (Start Worker)
              </>
            )}
          </button>
        </div>
      </div>

      {/* Metrics Bento Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div
          onClick={() => setSelectedStatus('all')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all ${
            selectedStatus === 'all'
              ? 'bg-slate-800 border-sky-500 shadow-md shadow-sky-500/10'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
        >
          <span className="text-xs text-slate-400 block font-medium">คิวทั้งหมด</span>
          <span className="text-2xl font-extrabold text-white mt-1 block">{stats.total}</span>
        </div>

        <div
          onClick={() => setSelectedStatus('pending')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all ${
            selectedStatus === 'pending'
              ? 'bg-amber-500/10 border-amber-500 shadow-md shadow-amber-500/10'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
        >
          <span className="text-xs text-amber-400 block font-medium">รอคิวสร้างคลิป</span>
          <span className="text-2xl font-extrabold text-amber-400 mt-1 block">{stats.pending}</span>
        </div>

        <div
          onClick={() => setSelectedStatus('generating')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all ${
            selectedStatus === 'generating'
              ? 'bg-sky-500/10 border-sky-500 shadow-md shadow-sky-500/10'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
        >
          <span className="text-xs text-sky-400 block font-medium">กำลังสร้างคลิป</span>
          <span className="text-2xl font-extrabold text-sky-400 mt-1 block">{stats.generating}</span>
        </div>

        <div
          onClick={() => setSelectedStatus('clip_ready')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all ${
            selectedStatus === 'clip_ready'
              ? 'bg-purple-500/10 border-purple-500 shadow-md shadow-purple-500/10'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
        >
          <span className="text-xs text-purple-400 block font-medium">คลิปพร้อมโพสต์</span>
          <span className="text-2xl font-extrabold text-purple-400 mt-1 block">{stats.clip_ready}</span>
        </div>

        <div
          onClick={() => setSelectedStatus('posted')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all ${
            selectedStatus === 'posted'
              ? 'bg-emerald-500/10 border-emerald-500 shadow-md shadow-emerald-500/10'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
        >
          <span className="text-xs text-emerald-400 block font-medium">โพสต์สำเร็จ</span>
          <span className="text-2xl font-extrabold text-emerald-400 mt-1 block">{stats.posted}</span>
        </div>

        <div
          onClick={() => setSelectedStatus('failed')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all ${
            selectedStatus === 'failed'
              ? 'bg-red-500/10 border-red-500 shadow-md shadow-red-500/10'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
        >
          <span className="text-xs text-red-400 block font-medium">ล้มเหลว</span>
          <span className="text-2xl font-extrabold text-red-400 mt-1 block">{stats.failed}</span>
        </div>
      </div>

      {/* Control Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ListFilter className="w-4 h-4 text-slate-400 ml-1" />
          <span className="text-xs text-slate-400 font-medium">กรองสถานะ:</span>
          <div className="flex flex-wrap gap-1.5">
            {['all', 'pending', 'generating', 'clip_ready', 'posting', 'posted', 'failed'].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  selectedStatus === st
                    ? 'bg-sky-500 text-slate-950 font-bold'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                {st === 'all' ? 'ทั้งหมด' : st}
              </button>
            ))}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={jobs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
            title="ส่งออกรายการเป็น CSV"
          >
            <FileSpreadsheet className="w-4 h-4" />
            ส่งออก CSV
          </button>

          <button
            onClick={loadQueue}
            disabled={isLoading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-colors"
            title="รีเฟรชคิว"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {stats.posted > 0 && (
            <button
              onClick={() => handleClear('completed')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
            >
              ล้างที่โพสต์เสร็จ ({stats.posted})
            </button>
          )}

          {stats.failed > 0 && (
            <button
              onClick={() => handleClear('failed')}
              className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800/50 rounded-xl text-xs font-medium transition-colors"
            >
              ล้างที่ล้มเหลว ({stats.failed})
            </button>
          )}

          {stats.total > 0 && (
            <button
              onClick={() => handleClear('all')}
              className="p-2 bg-slate-800 hover:bg-red-600/30 hover:text-red-300 text-slate-400 rounded-xl text-xs transition-colors"
              title="ล้างคิวทั้งหมด"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Queue List */}
      {isLoading ? (
        <div className="py-20 text-center text-slate-500">
          <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-3 text-sky-500" />
          <p className="text-sm">กำลังโหลดคิวงาน...</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="py-20 text-center bg-slate-900/30 border border-slate-800/80 rounded-2xl">
          <Inbox className="w-12 h-12 mx-auto text-slate-700 mb-3" />
          <h3 className="text-base font-semibold text-slate-300">ไม่มีรายการในคิว</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            คุณสามารถไปที่หน้า "คลังสินค้า Showcase" แล้วกดปุ่ม "เพิ่มเข้าคิว" เพื่อเริ่มกระบวนการได้เลย
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4.5 hover:border-slate-700 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              {/* Product Info */}
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-950 flex-shrink-0 border border-slate-800">
                  {job.cover_url ? (
                    <img src={job.cover_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-700">♪</div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {getStatusBadge(job.status)}
                    <span className="font-mono text-[11px] text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      Product ID: {job.product_id}
                    </span>
                    {job.retry_count > 0 && (
                      <span className="text-[11px] text-amber-400 font-medium bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        ลอง {job.retry_count}/{job.max_retries} ครั้ง
                      </span>
                    )}
                  </div>

                  <h4 className="text-sm font-semibold text-slate-100 truncate" title={job.title}>
                    {job.title}
                  </h4>

                  <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-3">
                    <span className="text-emerald-400 font-bold">{job.price}</span>
                    <span>•</span>
                    <span className="text-slate-500 text-[11px]">
                      เพิ่มเมื่อ: {new Date(job.created_at).toLocaleTimeString('th-TH')}
                    </span>
                    {job.posted_at && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-400 text-[11px]">
                          โพสต์เมื่อ: {new Date(job.posted_at).toLocaleTimeString('th-TH')}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Caption Preview Box */}
                  {job.caption && (
                    <div className="mt-2 text-xs text-sky-300/90 bg-sky-950/30 border border-sky-800/40 rounded-lg px-3 py-1.5 flex items-start gap-2">
                      <FileText className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-2">
                        <b>แคปชั่น:</b> {job.caption}
                      </span>
                    </div>
                  )}

                  {/* Video Path Box with Preview Trigger */}
                  {job.video_path && (
                    <div
                      onClick={() => setPreviewJob(job)}
                      className="cursor-pointer mt-1 text-[11px] text-purple-300 bg-purple-950/30 hover:bg-purple-900/40 border border-purple-800/40 hover:border-purple-600 rounded-lg px-3 py-1 flex items-center justify-between gap-2 font-mono transition-colors"
                      title="คลิกเพื่อดูคลิปและแคปชั่น"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileVideo className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                        <span className="truncate">คลิป: {job.video_path.split('\\').pop()?.split('/').pop()}</span>
                      </div>
                      <span className="text-[10px] text-purple-400 font-bold flex items-center gap-1 flex-shrink-0">
                        <Play className="w-3 h-3 fill-current" />
                        ดูคลิป
                      </span>
                    </div>
                  )}

                  {/* Error Box if Failed */}
                  {job.error && (
                    <div className="mt-2 text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-1.5 flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{job.error}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-800/80">
                {(job.status === 'pending' || job.status === 'generating') && (
                  <button
                    onClick={() => {
                      window.postMessage({ type: 'AFFI_PRO_REQUEST_LAUNCH_META', job }, '*');
                      openBrowserApi('https://www.meta.ai/?jarbland-autovideo=1');
                      showToast(`🚀 สั่งเปิด Meta AI: Bot กำลังเตรียมสร้างคลิป...`);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 rounded-xl text-xs font-semibold transition-colors"
                    title="เปิดหน้า Meta AI บนเบราว์เซอร์จริงทันที"
                  >
                    <Video className="w-3.5 h-3.5" />
                    เปิด Meta AI
                  </button>
                )}

                {(job.status === 'clip_ready' || job.status === 'posting' || job.status === 'posted') && (
                  <button
                    onClick={() => {
                      window.postMessage({ type: 'AFFI_PRO_REQUEST_LAUNCH_TIKTOK', job }, '*');
                      openBrowserApi('https://www.tiktok.com/tiktokstudio/upload');
                      showToast(`🚀 สั่งเปิด TikTok Studio: Bot กำลังเตรียมปักตะกร้า...`);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded-xl text-xs font-semibold transition-colors"
                    title="เปิดหน้า TikTok Studio บนเบราว์เซอร์จริงทันที"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    เปิด TikTok Studio
                  </button>
                )}

                {(job.status === 'generating' || job.status === 'posting') && (
                  <button
                    onClick={() => handleRetry(job.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition-colors"
                    title="รีเซ็ตสถานะกลับเป็น รอคิว (pending) เพื่อเริ่มรันใหม่"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    รีเซ็ตเป็นรอคิว
                  </button>
                )}

                {job.status === 'posted' && (
                  <button
                    onClick={() => handleRetry(job.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition-colors"
                    title="ส่งงานนี้กลับเข้าคิวรอสร้างคลิปใหม่ (pending)"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    รันใหม่อีกครั้ง
                  </button>
                )}

                {job.status === 'failed' && (
                  <button
                    onClick={() => handleRetry(job.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-semibold transition-colors"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    ลองใหม่ (Retry)
                  </button>
                )}

                <button
                  onClick={() => handleDelete(job.id)}
                  className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                  title="ลบงานนี้"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Video Clip & Caption Preview Modal */}
      {previewJob && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Video className="w-5 h-5 text-purple-400 flex-shrink-0" />
                <h3 className="text-sm font-bold text-slate-100 truncate">{previewJob.title}</h3>
              </div>
              <button
                onClick={() => setPreviewJob(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Video Player Display */}
              <div className="aspect-[9/16] max-h-[340px] mx-auto bg-black rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center relative shadow-inner">
                {previewJob.video_path ? (
                  <video
                    src={`http://localhost:3001/downloads/${previewJob.video_path.split('\\').pop()?.split('/').pop()}`}
                    controls
                    autoPlay
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-slate-600 text-xs">ยังไม่มีไฟล์วิดีโอ</span>
                )}
              </div>

              {/* Caption Box */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-sky-400" />
                    แคปชั่น TikTok Affiliate (DeepSeek)
                  </label>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(previewJob.caption || '');
                      setCopiedCaption(true);
                      setTimeout(() => setCopiedCaption(false), 2000);
                    }}
                    className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium"
                  >
                    {copiedCaption ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        คัดลอกแล้ว
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        คัดลอกแคปชั่น
                      </>
                    )}
                  </button>
                </div>
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 leading-relaxed font-sans">
                  {previewJob.caption || 'ยังไม่มีแคปชั่น'}
                </div>
              </div>

              {/* Product Info Summary */}
              <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-950/50 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500 block">Product ID:</span>
                  <span className="font-mono text-slate-300 font-bold">{previewJob.product_id}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">ราคา:</span>
                  <span className="text-emerald-400 font-bold">{previewJob.price}</span>
                </div>
              </div>

              {/* Download MP4 Button */}
              {previewJob.video_path && (
                <a
                  href={`http://localhost:3001/downloads/${previewJob.video_path.split('\\').pop()?.split('/').pop()}`}
                  download={previewJob.video_path.split('\\').pop()?.split('/').pop()}
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/20 flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  ดาวน์โหลดไฟล์คลิป MP4
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
