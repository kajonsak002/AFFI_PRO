import db from '../db.js';
import { addLog } from '../logger.js';

export function getQueue(statusFilter = null) {
  let query = 'SELECT * FROM queue WHERE 1=1';
  const params = [];

  if (statusFilter && statusFilter !== 'all') {
    query += ' AND status = ?';
    params.push(statusFilter);
  }

  query += ' ORDER BY created_at DESC';
  const stmt = db.prepare(query);
  return stmt.all(...params);
}

export function getQueueStats() {
  const stmt = db.prepare(`
    SELECT status, COUNT(*) as count FROM queue GROUP BY status
  `);
  const rows = stmt.all();
  const stats = {
    total: 0,
    pending: 0,
    generating: 0,
    clip_ready: 0,
    posting: 0,
    posted: 0,
    failed: 0,
  };

  rows.forEach((r) => {
    stats[r.status] = r.count;
    stats.total += r.count;
  });

  return stats;
}

export function addToQueue(productIds, maxRetries = 3) {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return { added: 0, skipped: 0, items: [] };
  }

  const selectProduct = db.prepare('SELECT * FROM products WHERE product_id = ?');
  const checkExisting = db.prepare('SELECT id, status FROM queue WHERE product_id = ?');
  const insertQueue = db.prepare(`
    INSERT INTO queue (
      id, product_id, title, price, cover_url, caption, video_path, status, error, retry_count, max_retries, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let addedCount = 0;
  let skippedCount = 0;
  const addedItems = [];
  const now = Date.now();

  for (const pid of productIds) {
    const cleanId = String(pid).trim();
    if (!cleanId) continue;

    // Check duplicate in queue
    const existing = checkExisting.get(cleanId);
    if (existing) {
      addLog('warn', `สินค้า Product ID ${cleanId} มีอยู่ในคิวแล้ว (สถานะ: ${existing.status}) — ข้ามการเพิ่มซ้ำ`);
      skippedCount += 1;
      continue;
    }

    const prod = selectProduct.get(cleanId);
    if (!prod) {
      addLog('warn', `ไม่พบข้อมูลสินค้า Product ID ${cleanId} ในระบบคลังสินค้า — ข้ามการเพิ่ม`);
      skippedCount += 1;
      continue;
    }

    const jobId = `job_${now}_${cleanId}`;
    insertQueue.run(
      jobId,
      prod.product_id,
      prod.title,
      prod.price,
      prod.cover_url,
      '', // Caption will be filled in Phase 2
      '', // Video path will be filled in Phase 2
      'pending',
      null,
      0,
      maxRetries,
      now,
      now
    );

    addedCount += 1;
    addedItems.push({ id: jobId, product_id: prod.product_id, title: prod.title });
    addLog('info', `เพิ่มสินค้า "${prod.title.slice(0, 30)}..." (ID: ${cleanId}) เข้าคิวผลิตสำเร็จ`, jobId);
  }

  addLog('success', `สรุปการเพิ่มเข้าคิว: เพิ่มสำเร็จ ${addedCount} รายการ, ข้าม (ซ้ำหรือไม่พบ) ${skippedCount} รายการ`);

  return {
    added: addedCount,
    skipped: skippedCount,
    items: addedItems,
  };
}

export function updateJobStatus(jobId, status, patch = {}) {
  const allowedStatuses = ['pending', 'generating', 'clip_ready', 'posting', 'posted', 'failed'];
  if (!allowedStatuses.includes(status)) {
    throw new Error(`สถานะคิว "${status}" ไม่ถูกต้อง`);
  }

  const existing = db.prepare('SELECT * FROM queue WHERE id = ?').get(jobId);
  if (!existing) {
    throw new Error(`ไม่พบงานคิว ID: ${jobId}`);
  }

  const now = Date.now();
  const caption = patch.caption !== undefined ? patch.caption : existing.caption;
  const prompt = patch.prompt !== undefined ? patch.prompt : existing.prompt;
  const videoPath = patch.video_path !== undefined ? patch.video_path : existing.video_path;
  const error = patch.error !== undefined ? patch.error : (status === 'failed' ? existing.error : null);
  const retryCount = patch.retry_count !== undefined ? patch.retry_count : existing.retry_count;
  const postedAt = status === 'posted' ? now : existing.posted_at;

  const update = db.prepare(`
    UPDATE queue SET
      status = ?,
      caption = ?,
      prompt = ?,
      video_path = ?,
      error = ?,
      retry_count = ?,
      updated_at = ?,
      posted_at = ?
    WHERE id = ?
  `);

  update.run(status, caption, prompt, videoPath, error, retryCount, now, postedAt, jobId);
  addLog(status === 'failed' ? 'error' : status === 'posted' ? 'success' : 'info',
    `อัปเดตสถานะงานคิวเป็น "${status}"`, jobId);

  return { ok: true, status };
}

export function retryJob(jobId) {
  const job = db.prepare('SELECT * FROM queue WHERE id = ?').get(jobId);
  if (!job) throw new Error(`ไม่พบงานคิว ID: ${jobId}`);

  const update = db.prepare(`
    UPDATE queue SET
      status = 'pending',
      error = NULL,
      updated_at = ?
    WHERE id = ?
  `);

  update.run(Date.now(), jobId);
  addLog('info', `สั่งลองใหม่ (Retry) สำหรับงาน ID: ${jobId}`, jobId);
  return { ok: true };
}

export function removeFromQueue(jobId) {
  const del = db.prepare('DELETE FROM queue WHERE id = ?');
  const info = del.run(jobId);
  if (info.changes > 0) {
    addLog('info', `ลบงาน ID: ${jobId} ออกจากคิวเรียบร้อย`);
    return { ok: true };
  }
  return { ok: false, message: 'ไม่พบงานที่ต้องการลบ' };
}

export function clearQueue(type = 'all') {
  let del;
  if (type === 'completed') {
    del = db.prepare("DELETE FROM queue WHERE status = 'posted'");
  } else if (type === 'failed') {
    del = db.prepare("DELETE FROM queue WHERE status = 'failed'");
  } else {
    del = db.prepare('DELETE FROM queue');
  }

  const info = del.run();
  addLog('warn', `ล้างคิว (${type}) สำเร็จ ลบไปทั้งหมด ${info.changes} รายการ`);
  return { ok: true, cleared: info.changes };
}
