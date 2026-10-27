// AFFI_PRO - Automation Worker (Backend side)
// ไม่จำลองอะไรเลย! แค่เตรียมข้อมูล (prompt, caption) ลง DB
// การสร้างคลิปจริงทำโดย meta_bot.js (original meta-ai-bot.js) ในเบราว์เซอร์
// การโพสต์จริงทำโดย tiktok_bot.js (original tiktok-post-bot.js) ในเบราว์เซอร์

import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import db from '../db.js';
import { addLog } from '../logger.js';
import { generateCaption } from './deepseekService.js';
import { updateJobStatus } from './queueService.js';
import { buildMetaAutoPrompt } from './metaPromptEngine.js';

export function openBrowserUrl(targetUrl) {
  try {
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
    const chrome = chromePaths.find((p) => fs.existsSync(p));

    if (chrome) {
      exec(`"${chrome}" "${targetUrl}"`);
    } else if (process.platform === 'win32') {
      exec(`start "" "${targetUrl}"`);
    } else {
      exec(`open "${targetUrl}"`);
    }
  } catch (e) {
    console.warn('Failed opening browser URL:', e);
  }
}

let isWorkerRunning = false;
let isProcessingItem = false;
let workerInterval = null;
let currentActiveJob = null;
let processedCount = 0;

// เตรียมข้อมูลงานใหม่: สร้าง caption + prompt แล้วเปลี่ยนสถานะเป็น generating
// การเปิดเบราว์เซอร์จริงทำโดย Extension (background.js → meta_bot.js)
export async function processNextJob() {
  if (isProcessingItem) return { status: 'busy' };
  isProcessingItem = true;

  try {
    // ตรวจสอบงานที่กำลังรอเบราว์เซอร์อยู่
    const generatingJob = db.prepare(
      "SELECT * FROM queue WHERE status = 'generating' ORDER BY updated_at DESC LIMIT 1"
    ).get();

    if (generatingJob) {
      const elapsed = Date.now() - (generatingJob.updated_at || Date.now());
      if (elapsed > 25 * 60 * 1000) {
        addLog('warn', `งาน "${generatingJob.title.slice(0, 25)}..." รอ Meta AI นานเกิน 25 นาที รีเซ็ตกลับ pending`, generatingJob.id);
        updateJobStatus(generatingJob.id, 'pending', { error: 'Timeout: Meta AI ใช้เวลาเกินกำหนด' });
        return { status: 'timeout_reset', jobId: generatingJob.id };
      }
      currentActiveJob = { ...generatingJob, step: 'waiting_meta_ai' };
      return { status: 'waiting_for_browser', jobId: generatingJob.id, message: 'กำลังรอ Meta AI สร้างคลิปบนเบราว์เซอร์...' };
    }

    const postingJob = db.prepare(
      "SELECT * FROM queue WHERE status = 'posting' ORDER BY updated_at DESC LIMIT 1"
    ).get();

    if (postingJob) {
      const elapsed = Date.now() - (postingJob.updated_at || Date.now());
      if (elapsed > 15 * 60 * 1000) {
        addLog('warn', `งาน "${postingJob.title.slice(0, 25)}..." รอ TikTok Studio นานเกิน 15 นาที รีเซ็ตกลับ clip_ready`, postingJob.id);
        updateJobStatus(postingJob.id, 'clip_ready', { error: 'Timeout: TikTok Studio ใช้เวลาเกินกำหนด' });
        return { status: 'timeout_reset', jobId: postingJob.id };
      }
      currentActiveJob = { ...postingJob, step: 'waiting_tiktok' };
      return { status: 'waiting_for_browser', jobId: postingJob.id, message: 'กำลังรอ TikTok Studio โพสต์คลิปบนเบราว์เซอร์...' };
    }

    // งาน clip_ready → เปลี่ยนเป็น posting (เปิด TikTok Studio ให้)
    const readyJob = db.prepare(
      "SELECT * FROM queue WHERE status = 'clip_ready' ORDER BY updated_at ASC LIMIT 1"
    ).get();

    if (readyJob) {
      currentActiveJob = { ...readyJob, step: 'posting' };
      updateJobStatus(readyJob.id, 'posting');
      addLog('info', `คลิปพร้อมแล้ว! กำลังเปิด TikTok Studio บน Chrome เพื่อโพสต์และปักตะกร้า Product ID: ${readyJob.product_id}`, readyJob.id);
      openBrowserUrl('https://www.tiktok.com/tiktokstudio/upload');
      return { status: 'ready_to_post', jobId: readyJob.id };
    }

    // งาน pending → เตรียม caption + prompt แล้วเปลี่ยนเป็น generating และเปิด Meta AI อัตโนมัติ!
    const pendingJob = db.prepare(
      "SELECT * FROM queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
    ).get();

    if (pendingJob) {
      currentActiveJob = { ...pendingJob, step: 'preparing' };

      // สร้าง caption
      let captionText = '';
      try {
        const captionRes = await generateCaption(pendingJob);
        captionText = captionRes.caption;
      } catch (e) {
        captionText = `${pendingJob.title}\nสนใจกดที่ตะกร้าเลย 🛒\n#tiktokป้ายยา #ของดีบอกต่อ`;
      }

      // สร้าง Master Prompt (ใช้ engine ที่ port มาจากระบบเดิม 100%)
      const masterPrompt = buildMetaAutoPrompt(pendingJob);
      addLog('info', `สร้าง Master Prompt ล็อกสินค้า (${masterPrompt.length} chars) + แคปชั่น สำเร็จ`, pendingJob.id);

      // บันทึกลง DB แล้วเปลี่ยนสถานะเป็น generating
      updateJobStatus(pendingJob.id, 'generating', {
        caption: captionText,
        prompt: masterPrompt,
      });

      addLog('info', `🚀 สั่งเปิดหน้าต่าง Meta AI บน Chrome อัตโนมัติแล้ว! กำลังรอ Bot สร้างคลิปจริงบนหน้าจอ...`, pendingJob.id);
      openBrowserUrl('https://www.meta.ai/?jarbland-autovideo=1');

      return { status: 'prepared', jobId: pendingJob.id, productId: pendingJob.product_id };
    }

    return { status: 'idle' };
  } finally {
    isProcessingItem = false;
    currentActiveJob = null;
  }
}

export function startWorker() {
  if (isWorkerRunning) return { ok: true, message: 'Worker กำลังทำงานอยู่แล้ว' };
  isWorkerRunning = true;
  addLog('success', '🟢 Worker เริ่มทำงาน (ตรวจสอบคิว + เปิดเบราว์เซอร์อัตโนมัติ)');

  // ประมวลผลงานแรกทันที ไม่ต้องรอหน่วงเวลา!
  processNextJob().catch((err) => addLog('error', `Worker Error: ${err.message}`));

  workerInterval = setInterval(async () => {
    if (!isWorkerRunning || isProcessingItem) return;
    try { await processNextJob(); } catch (err) { addLog('error', `Worker Error: ${err.message}`); }
  }, 4000);

  return { ok: true, message: 'เริ่มต้น Worker สำเร็จ' };
}

export function stopWorker() {
  if (!isWorkerRunning) return { ok: true, message: 'Worker หยุดอยู่แล้ว' };
  isWorkerRunning = false;
  if (workerInterval) { clearInterval(workerInterval); workerInterval = null; }
  addLog('warn', '⏸️ หยุด Worker ชั่วคราว');
  return { ok: true, message: 'หยุด Worker เรียบร้อย' };
}

export function getWorkerStatus() {
  return {
    isRunning: isWorkerRunning,
    isProcessing: isProcessingItem,
    currentJob: currentActiveJob,
    processedCount,
  };
}
