import db from './db.js';

export function addLog(level, message, jobId = null) {
  const now = Date.now();
  const timeStr = new Date(now).toLocaleTimeString('th-TH');
  const levelUpper = String(level).toUpperCase();

  const prefix = levelUpper === 'ERROR' ? '❌' :
                 levelUpper === 'WARN' ? '⚠️' :
                 levelUpper === 'SUCCESS' ? '✅' : 'ℹ️';

  console.log(`[${timeStr}] ${prefix} [${levelUpper}] ${message} ${jobId ? `(Job: ${jobId})` : ''}`);

  try {
    const insert = db.prepare(`
      INSERT INTO logs (level, message, job_id, created_at)
      VALUES (?, ?, ?, ?)
    `);
    insert.run(level, message, jobId, now);
  } catch (err) {
    console.error('[Logger DB Error]', err.message);
  }
}

export function getRecentLogs(limit = 100) {
  try {
    const select = db.prepare(`
      SELECT * FROM logs ORDER BY id DESC LIMIT ?
    `);
    return select.all(limit);
  } catch (err) {
    console.error('[Logger Get Error]', err.message);
    return [];
  }
}
