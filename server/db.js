import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'affi_pro.db');
const db = new DatabaseSync(dbPath);

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    product_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    price TEXT,
    cover_url TEXT,
    images_json TEXT,
    stock INTEGER DEFAULT 0,
    commission TEXT,
    category TEXT,
    shop_name TEXT,
    raw_data TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS queue (
    id TEXT PRIMARY KEY,
    product_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    price TEXT,
    cover_url TEXT,
    caption TEXT,
    video_path TEXT,
    status TEXT NOT NULL,
    error TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    posted_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    job_id TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status);
  CREATE INDEX IF NOT EXISTS idx_queue_product_id ON queue(product_id);
  CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);
`);

try {
  db.exec(`ALTER TABLE queue ADD COLUMN prompt TEXT;`);
} catch (e) {}

console.log(`[Database] SQLite connected successfully at: ${dbPath}`);

export default db;
