export interface Product {
  product_id: string;
  title: string;
  price: string;
  cover_url: string;
  images: string[];
  stock: number;
  commission: string;
  category: string;
  shop_name: string;
  updated_at: number;
}

export type QueueStatus = 'pending' | 'generating' | 'clip_ready' | 'posting' | 'posted' | 'failed';

export interface QueueJob {
  id: string;
  product_id: string;
  title: string;
  price: string;
  cover_url: string;
  caption: string;
  video_path: string;
  status: QueueStatus;
  error?: string | null;
  retry_count: number;
  max_retries: number;
  created_at: number;
  updated_at: number;
  posted_at?: number | null;
}

export interface QueueStats {
  total: number;
  pending: number;
  generating: number;
  clip_ready: number;
  posting: number;
  posted: number;
  failed: number;
}

export interface SystemConfig {
  tiktokCookieConfigured: boolean;
  tiktokCookiePreview: string;
  userAgent: string;
  deepseekModel: string;
  deepseekKeyConfigured: boolean;
  dryRun: boolean;
  maxRetries: number;
  postDelaySeconds: number;
}

export interface LogItem {
  id: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  job_id?: string | null;
  created_at: number;
}
