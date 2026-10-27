import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import db from './db.js';
import { addLog, getRecentLogs } from './logger.js';
import {
  fetchShowcaseProducts,
  getCachedProducts,
  getCategories,
  seedSampleProductsIfEmpty,
  upsertProducts
} from './services/showcaseService.js';
import {
  getQueue,
  getQueueStats,
  addToQueue,
  updateJobStatus,
  retryJob,
  removeFromQueue,
  clearQueue
} from './services/queueService.js';

import {
  startWorker,
  stopWorker,
  getWorkerStatus,
  processNextJob,
  openBrowserUrl
} from './services/automationWorker.js';
import { buildMetaAutoPrompt, STYLES } from './services/metaPromptEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');

dotenv.config({ path: envPath });

const settingsPath = path.join(__dirname, 'data', 'settings.json');
try {
  if (fs.existsSync(settingsPath)) {
    const custom = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    for (const [k, v] of Object.entries(custom)) {
      if (v !== undefined && v !== '') process.env[k] = String(v);
    }
  }
} catch (e) {}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ limit: '150mb', extended: true }));

const downloadsDir = path.join(__dirname, '..', 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}
app.use('/downloads', express.static(downloadsDir));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'AFFI_PRO',
    time: new Date().toISOString(),
    dryRun: process.env.DRY_RUN === 'true',
  });
});

// Config Endpoints
app.get('/api/config', (req, res) => {
  const cookie = process.env.TIKTOK_COOKIE || '';
  res.json({
    tiktokCookieConfigured: Boolean(cookie.trim()),
    tiktokCookiePreview: cookie ? `${cookie.slice(0, 25)}... (ยาว ${cookie.length} ตัวอักษร)` : 'ยังไม่ได้ตั้งค่า',
    userAgent: process.env.TIKTOK_USER_AGENT || '',
    deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    deepseekKeyConfigured: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
    dryRun: process.env.DRY_RUN === 'true',
    maxRetries: Number(process.env.MAX_RETRIES) || 3,
    postDelaySeconds: Number(process.env.POST_DELAY_SECONDS) || 60,
  });
});

app.post('/api/config', (req, res) => {
  try {
    const { tiktokCookie, dryRun, maxRetries, postDelaySeconds, deepseekApiKey, deepseekModel } = req.body;
    
    if (tiktokCookie !== undefined) process.env.TIKTOK_COOKIE = String(tiktokCookie).trim();
    if (dryRun !== undefined) process.env.DRY_RUN = String(dryRun);
    if (maxRetries !== undefined) process.env.MAX_RETRIES = String(maxRetries);
    if (postDelaySeconds !== undefined) process.env.POST_DELAY_SECONDS = String(postDelaySeconds);
    if (deepseekApiKey !== undefined) process.env.DEEPSEEK_API_KEY = String(deepseekApiKey).trim();
    if (deepseekModel !== undefined) process.env.DEEPSEEK_MODEL = String(deepseekModel).trim();

    // Persist to server/data/settings.json (NEVER write to root .env to prevent Vite reload loops!)
    const currentSettings = {
      TIKTOK_COOKIE: process.env.TIKTOK_COOKIE || '',
      TIKTOK_USER_AGENT: process.env.TIKTOK_USER_AGENT || '',
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
      DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      DRY_RUN: process.env.DRY_RUN || 'true',
      MAX_RETRIES: process.env.MAX_RETRIES || '3',
      POST_DELAY_SECONDS: process.env.POST_DELAY_SECONDS || '60',
    };
    fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 2), 'utf8');

    addLog('info', 'อัปเดตการตั้งค่าระบบเรียบร้อย');
    res.json({ ok: true, message: 'บันทึกการตั้งค่าเรียบร้อย' });
  } catch (err) {
    addLog('error', `บันทึกการตั้งค่าไม่สำเร็จ: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Showcase Products Endpoints
app.post('/api/showcase/fetch', async (req, res) => {
  try {
    const { cookieOverride } = req.body || {};
    const result = await fetchShowcaseProducts(cookieOverride);
    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
  }
});

app.post('/api/showcase/sync-batch', (req, res) => {
  try {
    const { products } = req.body || {};
    if (!Array.isArray(products)) {
      return res.status(400).json({ success: false, error: 'products must be an array' });
    }
    const result = upsertProducts(products);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/showcase/products', (req, res) => {
  try {
    const { search = '', category = 'all' } = req.query;
    const products = getCachedProducts(search, category);
    res.json({ success: true, count: products.length, products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/showcase/categories', (req, res) => {
  try {
    const categories = getCategories();
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Queue Endpoints
app.get('/api/queue', (req, res) => {
  try {
    const { status = 'all' } = req.query;
    const items = getQueue(status);
    const stats = getQueueStats();
    res.json({ success: true, items, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/queue/stats', (req, res) => {
  try {
    const stats = getQueueStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/queue/add', (req, res) => {
  try {
    const { productIds, maxRetries } = req.body;
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุรหัสสินค้าที่ต้องการเพิ่ม' });
    }
    const retries = maxRetries !== undefined ? Number(maxRetries) : (Number(process.env.MAX_RETRIES) || 3);
    const result = addToQueue(productIds, retries);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/queue/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = removeFromQueue(id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/queue/:id/retry', (req, res) => {
  try {
    const { id } = req.params;
    const result = retryJob(id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/queue/clear', (req, res) => {
  try {
    const { type = 'all' } = req.body || {};
    const result = clearQueue(type);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Automation Worker Endpoints
app.get('/api/worker/status', (req, res) => {
  res.json({ success: true, ...getWorkerStatus() });
});

app.get('/api/worker/current-job', (req, res) => {
  try {
    const { jobId } = req.query;
    if (jobId) {
      const specific = db.prepare('SELECT * FROM queue WHERE id = ? OR product_id = ?').get(jobId, jobId);
      if (specific) {
        const prompt = specific.prompt || buildMetaAutoPrompt(specific);
        return res.json({ success: true, job: { ...specific, masterPrompt: prompt } });
      }
    }
    const status = getWorkerStatus();
    if (status.currentJob) {
      const prompt = status.currentJob.prompt || buildMetaAutoPrompt(status.currentJob);
      return res.json({ success: true, job: { ...status.currentJob, masterPrompt: prompt } });
    }
    // Check if any job is currently generating or ready to post
    const active = db.prepare(`
      SELECT * FROM queue WHERE status IN ('generating', 'posting', 'clip_ready', 'pending') 
      ORDER BY CASE status 
        WHEN 'generating' THEN 1 
        WHEN 'posting' THEN 2 
        WHEN 'clip_ready' THEN 3 
        WHEN 'pending' THEN 4 
      END, updated_at DESC LIMIT 1
    `).get();

    if (active) {
      const prompt = active.prompt || buildMetaAutoPrompt(active);
      return res.json({ success: true, job: { ...active, masterPrompt: prompt } });
    }
    res.json({ success: true, job: null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/worker/start', (req, res) => {
  const result = startWorker();
  res.json(result);
});

app.post('/api/worker/stop', (req, res) => {
  const result = stopWorker();
  res.json(result);
});

app.post('/api/worker/step', async (req, res) => {
  try {
    const result = await processNextJob();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/worker/prompt/:id', (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE product_id = ?').get(req.params.id) ||
                    db.prepare('SELECT * FROM queue WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Not found' });
    const prompt = buildMetaAutoPrompt(product);
    res.json({ prompt, styles: STYLES });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/worker/open-browser', (req, res) => {
  const { url } = req.body || {};
  if (url) {
    openBrowserUrl(url);
    res.json({ ok: true, url });
  } else {
    res.status(400).json({ ok: false, error: 'Missing url' });
  }
});

app.get('/api/worker/proxy-image', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).send('Missing url');
    const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!resp.ok) return res.status(resp.status).send('Failed fetching image');
    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    const buffer = await resp.arrayBuffer();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/api/worker/upload-clip', (req, res) => {
  try {
    const { jobId, videoBase64, filename } = req.body || {};
    if (!jobId || !videoBase64) {
      return res.status(400).json({ ok: false, error: 'Missing jobId or videoBase64' });
    }

    const cleanName = filename || `clip_${Date.now()}.mp4`;
    const targetPath = path.join(downloadsDir, cleanName);
    const buffer = Buffer.from(videoBase64.replace(/^data:video\/\w+;base64,/, ''), 'base64');
    fs.writeFileSync(targetPath, buffer);

    updateJobStatus(jobId, 'clip_ready', { video_path: targetPath });
    addLog('success', `รับคลิปจากเบราว์เซอร์สำเร็จ: ${cleanName}`, jobId);
    res.json({ ok: true, videoPath: targetPath });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/worker/post-complete', (req, res) => {
  try {
    const { jobId, success, error } = req.body || {};
    if (!jobId) return res.status(400).json({ ok: false, error: 'Missing jobId' });

    if (success) {
      updateJobStatus(jobId, 'posted');
      addLog('success', 'บอทรายงาน: โพสต์ TikTok และปักตะกร้าสำเร็จเรียบร้อย', jobId);
      res.json({ ok: true });
    } else {
      updateJobStatus(jobId, 'failed', { error: error || 'TikTok bot failed' });
      addLog('error', `บอทรายงานความล้มเหลว: ${error}`, jobId);
      res.json({ ok: false, error });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Logs Endpoint
app.get('/api/logs', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const logs = getRecentLogs(limit);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Seed sample products if first start
seedSampleProductsIfEmpty();

app.listen(PORT, () => {
  addLog('success', `AFFI_PRO Backend Server กำลังทำงานที่พอร์ต http://localhost:${PORT}`);
});
