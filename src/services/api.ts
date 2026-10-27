import { Product, QueueJob, QueueStats, SystemConfig, LogItem } from '../types';

const API_BASE = '/api';

export async function fetchHealth(): Promise<{ status: string; dryRun: boolean }> {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export async function fetchConfig(): Promise<SystemConfig> {
  const res = await fetch(`${API_BASE}/config`);
  return res.json();
}

export async function saveConfig(updates: Partial<SystemConfig & { tiktokCookie?: string; deepseekApiKey?: string }>): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function fetchShowcaseApi(cookieOverride?: string): Promise<{ success: boolean; count?: number; error?: string }> {
  const res = await fetch(`${API_BASE}/showcase/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookieOverride }),
  });
  return res.json();
}

export async function getCachedProducts(search = '', category = 'all'): Promise<{ success: boolean; products: Product[]; count: number }> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (category) params.set('category', category);
  const res = await fetch(`${API_BASE}/showcase/products?${params.toString()}`);
  return res.json();
}

export async function getCategories(): Promise<{ success: boolean; categories: string[] }> {
  const res = await fetch(`${API_BASE}/showcase/categories`);
  return res.json();
}

export async function getQueue(status = 'all'): Promise<{ success: boolean; items: QueueJob[]; stats: QueueStats }> {
  const res = await fetch(`${API_BASE}/queue?status=${status}`);
  return res.json();
}

export async function addToQueue(productIds: string[]): Promise<{ success: boolean; added: number; skipped: number }> {
  const res = await fetch(`${API_BASE}/queue/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productIds }),
  });
  return res.json();
}

export async function removeFromQueue(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/queue/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function retryJob(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/queue/${id}/retry`, { method: 'POST' });
  return res.json();
}

export async function clearQueue(type: 'all' | 'completed' | 'failed' = 'all'): Promise<{ ok: boolean; cleared: number }> {
  const res = await fetch(`${API_BASE}/queue/clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  });
  return res.json();
}

export async function getLogs(): Promise<{ success: boolean; logs: LogItem[] }> {
  const res = await fetch(`${API_BASE}/logs?limit=150`);
  return res.json();
}

export async function fetchWorkerStatus(): Promise<{ success: boolean; isRunning: boolean; isProcessing: boolean; currentJob: any; processedCount: number }> {
  const res = await fetch(`${API_BASE}/worker/status`);
  return res.json();
}

export async function startWorkerApi(): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/worker/start`, { method: 'POST' });
  return res.json();
}

export async function stopWorkerApi(): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/worker/stop`, { method: 'POST' });
  return res.json();
}

export async function stepWorkerApi(): Promise<{ success: boolean; result: any }> {
  const res = await fetch(`${API_BASE}/worker/step`, { method: 'POST' });
  return res.json();
}

export async function openBrowserApi(url: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/worker/open-browser`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return res.json();
}
