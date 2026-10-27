# AFFI_PRO — TikTok Affiliate Showcase & Auto-Video Studio

ระบบบริหารจัดการดึงสินค้าจาก **TikTok Showcase API**, นำเข้าคิวผลิตคลิปผ่าน **Meta AI Auto** และโพสต์ลง **TikTok Studio** พร้อมปักตะกร้าสินค้าอัตโนมัติ 100%

---

## จุดเด่นของระบบ (Key Features)

1. **ดึงสินค้าจาก TikTok Showcase อัตโนมัติ:**
   - เชื่อมต่อ API `https://shop.tiktok.com/api/v1/streamer_desktop/showcase_product/list`
   - วนลูป Pagination ดึงสินค้าตาม `offset` จนครบทุกหน้า
   - มี Extension Bridge ช่วยดูด Cookie จากเบราว์เซอร์อัตโนมัติ ไม่ต้องคัดลอกด้วยตนเอง

2. **ระบบคิวงานและการจัดการข้อมูล (Persistent Queue):**
   - บันทึกข้อมูลลงฐานข้อมูล **SQLite** ในตัว (`affi_pro.db`) ไม่สูญหายเมื่อปิดโปรแกรม
   - วงจรสถานะงาน: `pending` → `generating` → `clip_ready` → `posting` → `posted` (หรือ `failed` พร้อมระบบ Retry)

3. **สร้างคลิปวิดีโอผ่าน Meta AI อัตโนมัติ (`meta_bot.js`):**
   - แนบรูปภาพสินค้าเข้า Meta AI อัตโนมัติผ่าน `DataTransfer`
   - ใส่ **Master Prompt ฉบับเต็ม 4,800+ ตัวอักษร** (กฎล็อกสินค้าเดิม 100%, ทิศทาง Storyboard, คนแสดง, ข้อความ Typography คอนทราสต์สูง, ปิดท้ายด้วย CTA "สนใจกดที่ตะกร้าเลย")
   - รอ Meta AI ประมวลผลวิดีโอ 9:16 ความยาว 10 วินาที และดาวน์โหลดไฟล์ MP4 เก็บลงเซิร์ฟเวอร์อัตโนมัติ

4. **โพสต์คลิปและปักตะกร้าลง TikTok Studio อัตโนมัติ (`tiktok_bot.js`):**
   - แนบคลิปวิดีโอจริงเข้า Dropzone ของ TikTok Studio
   - พิมพ์แคปชันและแฮชแท็ก (#tiktokป้ายยา #ของดีบอกต่อ)
   - ค้นหาสินค้าด้วย **`product_id`** และเลือกปักตะกร้าสินค้าผ่าน `chrome.debugger` (เมาส์และคีย์บอร์ดเสมือนจริง)
   - รองรับทั้งโหมด **Dry-Run (หยุดตรวจงานก่อนโพสต์จริง)** และ **Auto-Post (โพสต์ทันที)**

---

## โครงสร้างโปรเจกต์ (Folder Structure)

```
AFFI_PRO/
├── package.json               # Dependencies (Vite, React, TS, Express, Tailwind)
├── vite.config.ts             # การตั้งค่า Vite และ Proxy เชื่อมต่อ Backend (/api -> :3001)
├── tsconfig.json              # TypeScript Configuration
├── tailwind.config.js         # Tailwind CSS styling
├── postcss.config.js
├── index.html                 # HTML Entry point
├── .env.example               # ตัวอย่างการตั้งค่า Environment
├── .env                       # ไฟล์ตั้งค่าจริง (TikTok Cookie, DeepSeek Key, Dry-run)
├── extension/                 # Chrome Extension (Automation Bridge)
│   ├── manifest.json          # Manifest V3 (Host Permissions, Debugger, Storage)
│   ├── background.js          # Service Worker จัดการ Lock, Debugger, และ Image/Video Base64
│   ├── bridge.js              # Content Script เชื่อมต่อ Dashboard กับ Extension
│   ├── meta_bot.js            # Content Script คุมหน้าจอ Meta AI แนบรูปและใส่ Prompt
│   └── tiktok_bot.js          # Content Script คุม TikTok Studio โพสต์และปักตะกร้า
├── server/                    # Node.js Backend & Persistent Queue System
│   ├── db.js                  # ฐานข้อมูล SQLite (node:sqlite ในตัว ไม่ต้องคอมไพล์)
│   ├── logger.js              # Realtime Logging Service
│   ├── index.js               # Express API Server
│   ├── data/
│   │   ├── affi_pro.db        # SQLite Database
│   │   └── settings.json      # Runtime Settings (แยกออกจาก .env ป้องกัน Vite Reload)
│   └── services/
│       ├── showcaseService.js # ดึงสินค้า Showcase จาก API
│       ├── queueService.js    # จัดการคิวงาน
│       ├── deepseekService.js # สร้างแคปชันด้วย DeepSeek
│       ├── metaPromptEngine.js# Engine สร้าง Master Prompt ล็อกสินค้า
│       └── automationWorker.js# Background Worker คุมจังหวะเปิดเบราว์เซอร์
└── src/                       # Frontend UI (Vite + React + TypeScript + Tailwind)
    ├── App.tsx                # Bento Console Dashboard
    ├── main.tsx
    ├── types.ts
    ├── services/api.ts        # API Client
    └── components/
        ├── ShowcaseTab.tsx    # ตารางสินค้า Showcase
        ├── QueueTab.tsx       # จัดการคิวงาน และปุ่ม Auto-Run
        ├── LogsTab.tsx        # บันทึกเหตุการณ์ Realtime
        └── SettingsTab.tsx    # ตั้งค่าระบบและ Cookie
```

---

## วิธีติดตั้งและเริ่มใช้งาน

### 1. ติดตั้ง Dependencies
```bash
cd AFFI_PRO
npm install
```

### 2. ติดตั้ง Extension บน Google Chrome
1. เปิดเบราว์เซอร์ Chrome ไปที่ `chrome://extensions`
2. เปิดสวิตช์ **Developer mode** ที่มุมขวาบน
3. คลิก **Load unpacked**
4. เลือกโฟลเดอร์: `AFFI_PRO/extension`
5. ไอคอนส่วนขยาย **AFFI_PRO Automation Bridge** จะพร้อมทำงานทันที

### 3. รันโปรเจกต์
เปิด Terminal 2 หน้าต่าง:

* **Terminal 1: รัน Backend Server (พอร์ต 3001)**
  ```bash
  npm run dev:server
  ```

* **Terminal 2: รัน Frontend Dashboard (พอร์ต 5173)**
  ```bash
  npm run dev:frontend
  ```

### 4. ใช้งานแดชบอร์ด
เปิดเบราว์เซอร์ไปที่: **[http://localhost:5173](http://localhost:5173)**
- **แท็บ Showcase:** ดึงสินค้าจากร้านค้า TikTok Shop และกด "เพิ่มเข้าคิว"
- **แท็บ คิวงาน & บอท:** กดปุ่ม **"🟢 เริ่มทำงานอัตโนมัติ"** ระบบจะเปิด Meta AI สร้างคลิป และเปิด TikTok Studio ปักตะกร้าให้อัตโนมัติ 100%
