import React, { useState, useEffect } from 'react';
import { Product } from '../types';
import { getCachedProducts, getCategories, fetchShowcaseApi, addToQueue } from '../services/api';
import {
  RefreshCw,
  Search,
  Plus,
  Check,
  Copy,
  AlertTriangle,
  Package,
  Layers,
  Sparkles,
  ShoppingBag,
  CheckSquare,
  Square
} from 'lucide-react';

interface ShowcaseTabProps {
  onQueueAdded: () => void;
  onNavigateToSettings: () => void;
}

export const ShowcaseTab: React.FC<ShowcaseTabProps> = ({ onQueueAdded, onNavigateToSettings }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFetchingApi, setIsFetchingApi] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadLocalProducts = async () => {
    setIsLoading(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        getCachedProducts(searchTerm, selectedCategory),
        getCategories(),
      ]);
      if (prodRes.success) setProducts(prodRes.products);
      if (catRes.success) setCategories(catRes.categories);
    } catch (err: any) {
      showToast(`โหลดสินค้าไม่สำเร็จ: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLocalProducts();
  }, [searchTerm, selectedCategory]);

  const handleFetchFromTiktok = async () => {
    setIsFetchingApi(true);
    setErrorMessage(null);
    try {
      // 1. ลองดึงผ่าน Backend API ก่อน
      let res = await fetchShowcaseApi();
      if (!res.success) {
        // 2. ถ้า Backend ไม่สำเร็จ (เช่น ยังไม่มี Cookie หรือติด CAPTCHA) ลองขอให้ Extension ดึงตรงจาก Browser Session
        showToast('กำลังลองดึงผ่าน Browser Session ของ Chrome Extension...');
        const browserResult = await new Promise<any>((resolve) => {
          const timeout = setTimeout(() => resolve(null), 6000);
          const handler = (event: MessageEvent) => {
            if (event.data?.type === 'AFFI_PRO_BROWSER_SYNC_ALL_RESPONSE') {
              clearTimeout(timeout);
              window.removeEventListener('message', handler);
              resolve(event.data.result);
            }
          };
          window.addEventListener('message', handler);
          window.postMessage({ type: 'AFFI_PRO_REQUEST_BROWSER_SYNC_ALL' }, '*');
        });

        if (browserResult && browserResult.success) {
          showToast(`ดึงสินค้าผ่าน Chrome Session สำเร็จ ${browserResult.count} รายการ!`);
          await loadLocalProducts();
          return;
        }

        setErrorMessage(res.error || 'ดึงสินค้าจาก TikTok Showcase ไม่สำเร็จ กรุณาตรวจสอบว่าเปิด Extension ใน Chrome หรือยัง');
      } else {
        showToast(`ดึงสินค้าสำเร็จ ${res.count} รายการ!`);
        await loadLocalProducts();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'เชื่อมต่อ TikTok Shop API ไม่สำเร็จ');
    } finally {
      setIsFetchingApi(false);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === products.length && products.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map((p) => p.product_id)));
    }
  };

  const handleAddSingleToQueue = async (productId: string) => {
    try {
      const res = await addToQueue([productId]);
      if (res.success) {
        if (res.added > 0) {
          showToast(`เพิ่มสินค้ารหัส ${productId} เข้าคิวแล้ว`);
          onQueueAdded();
        } else {
          showToast(`สินค้านี้มีอยู่ในคิวแล้ว (ข้ามการเพิ่มซ้ำ)`);
        }
      }
    } catch (err: any) {
      showToast(`เกิดข้อผิดพลาด: ${err.message}`);
    }
  };

  const handleAddSelectedToQueue = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const res = await addToQueue(ids);
      if (res.success) {
        showToast(`เพิ่ม ${res.added} รายการเข้าคิวแล้ว! (ข้ามรายการซ้ำ ${res.skipped} รายการ)`);
        setSelectedIds(new Set());
        onQueueAdded();
      }
    } catch (err: any) {
      showToast(`เกิดข้อผิดพลาด: ${err.message}`);
    }
  };

  const copyToClipboard = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
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

      {/* Session Expired / Error Banner */}
      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle className="w-6 h-6 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-sm">การดึงข้อมูลจาก TikTok Showcase ล้มเหลว</h4>
              <p className="text-xs text-red-300/80 mt-0.5">{errorMessage}</p>
            </div>
          </div>
          <button
            onClick={onNavigateToSettings}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold whitespace-nowrap transition-all"
          >
            ไปที่หน้าตั้งค่า Cookie
          </button>
        </div>
      )}

      {/* Top Action Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-md flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาชื่อสินค้า หรือ Product ID..."
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500 transition-colors"
          >
            <option value="all">ทุกหมวดหมู่ ({products.length})</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleFetchFromTiktok}
            disabled={isFetchingApi}
            className="flex items-center gap-2 px-5 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 text-slate-950 font-semibold rounded-xl text-sm transition-all shadow-lg shadow-sky-500/20 disabled:text-slate-600"
          >
            <RefreshCw className={`w-4 h-4 ${isFetchingApi ? 'animate-spin' : ''}`} />
            {isFetchingApi ? 'กำลังดึงจาก TikTok API...' : 'ดึงสินค้าจาก Showcase'}
          </button>
        </div>
      </div>

      {/* Selection Control Bar */}
      {products.length > 0 && (
        <div className="flex items-center justify-between px-2">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            {selectedIds.size === products.length && products.length > 0 ? (
              <CheckSquare className="w-4 h-4 text-sky-400" />
            ) : (
              <Square className="w-4 h-4 text-slate-600" />
            )}
            เลือกทั้งหมด ({selectedIds.size}/{products.length} รายการ)
          </button>

          {selectedIds.size > 0 && (
            <button
              onClick={handleAddSelectedToQueue}
              className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-semibold rounded-lg text-xs shadow-md shadow-emerald-500/20 hover:brightness-110 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              เพิ่มที่เลือก {selectedIds.size} รายการเข้าคิว
            </button>
          )}
        </div>
      )}

      {/* Products Grid / Table */}
      {isLoading ? (
        <div className="py-20 text-center text-slate-500">
          <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-3 text-sky-500" />
          <p className="text-sm">กำลังโหลดข้อมูลสินค้า...</p>
        </div>
      ) : products.length === 0 ? (
        <div className="py-16 text-center bg-slate-900/30 border border-slate-800/80 rounded-2xl">
          <Package className="w-12 h-12 mx-auto text-slate-700 mb-3" />
          <h3 className="text-base font-semibold text-slate-300">ไม่พบรายการสินค้าในคลัง</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            กดปุ่ม "ดึงสินค้าจาก Showcase" ด้านบน หรือตรวจสอบว่าได้ใส่ TIKTOK_COOKIE ในหน้าตั้งค่าแล้ว
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => {
            const isSelected = selectedIds.has(product.product_id);
            return (
              <div
                key={product.product_id}
                className={`relative bg-slate-900/70 border rounded-2xl p-4 transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'border-sky-500 shadow-lg shadow-sky-500/10 bg-slate-900/90'
                    : 'border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                {/* Top Section */}
                <div>
                  <div className="flex items-start gap-3.5">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelect(product.product_id)}
                      className="mt-1 text-slate-500 hover:text-sky-400 transition-colors flex-shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-sky-400" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-600" />
                      )}
                    </button>

                    {/* Image */}
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-950 flex-shrink-0 border border-slate-800">
                      {product.cover_url ? (
                        <img
                          src={product.cover_url}
                          alt={product.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-700">
                          <ShoppingBag className="w-6 h-6" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h4
                        className="text-sm font-medium text-slate-100 line-clamp-2 leading-snug"
                        title={product.title}
                      >
                        {product.title}
                      </h4>

                      {/* Product ID Pill */}
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
                        <span className="font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800/80">
                          {product.product_id}
                        </span>
                        <button
                          onClick={() => copyToClipboard(product.product_id)}
                          title="คัดลอก Product ID"
                          className="hover:text-sky-400 transition-colors"
                        >
                          {copiedId === product.product_id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Price & Meta Badges */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-emerald-400 font-bold text-base">{product.price}</span>
                      <span className="text-[11px] text-slate-400 ml-2">คอม {product.commission}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      สต๊อก: <span className="text-slate-300 font-medium">{product.stock.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="mt-4 pt-3 flex items-center justify-between gap-2 border-t border-slate-800/50">
                  <span className="text-[10px] text-slate-500 truncate max-w-[140px]">
                    {product.shop_name}
                  </span>
                  <button
                    onClick={() => handleAddSingleToQueue(product.product_id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-sky-500 hover:text-slate-950 text-slate-300 rounded-xl text-xs font-medium transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    เพิ่มเข้าคิว
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
