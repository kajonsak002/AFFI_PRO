# AFFI_PRO — TikTok Affiliate Showcase & Auto-Video Studio

ระบบบริหารจัดการดึงสินค้าจาก **TikTok Showcase API**, นำเข้าคิวผลิตคลิปผ่าน **Meta AI Auto** และโพสต์ลง **TikTok Studio** พร้อมปักตะกร้าสินค้าอัตโนมัติ

---

## โครงสร้างโปรเจกต์ (Folder Structure)

```
AFFI_PRO/
├── package.json               # จัดการ Dependencies (Vite, React, TS, Express, Tailwind)
├── vite.config.ts             # การตั้งค่า Vite และ Proxy เชื่อมต่อ Backend (/api -> :3001)
├── tsconfig.json              # TypeScript Configuration
├── tailwind.config.js         # Tailwind CSS styling
├── postcss.config.js
├── index.html                 # HTML Entry point
├── .env.example               # ตัวอย่างการตั้งค่า Environment
├── .env                       # ไฟล์ตั้งค่าจริง (TikTok Cookie, DeepSeek Key, Dry-run)
├── server/                    # Node.js Backend & Persistent Queue System
│   ├── db.js                  # ฐานข้อมูล SQLite (node:sqlite ในตัว ไม่ต้องคอมไพล์)
│   ├── logger.js              # Realtime Logging Service (เก็บบันทึกลง SQLite)
│   ├── index.js               # Express API Server (Showcase, Queue, Config, Logs)
│   ├── data/
│   │   └── affi_pro.db        # ไฟล์ฐานข้อมูล SQLite (คิวและสินค้าไม่หายเมื่อรีสตาร์ท)
│   └── services/
│       ├── showcaseService.js # ดึงสินค้า Showcase จาก API พร้อมวนลูป offset อัตโนมัติ
│       └── queueService.js    # จัดการคิว (pending -> generating -> clip_ready -> posting -> posted)
└── src/                       # Frontend UI (Vite + React + TypeScript + Tailwind)
    ├── App.tsx                # หน้าจอหลัก Bento Console พร้อมแท็บนำทาง
    ├── main.tsx               # React DOM Entry
    ├── index.css              # Global styles & Fonts
    ├── types.ts               # Type Definitions
    ├── services/
    │   └── api.ts             # API Client เรียกหา Backend
    └── components/
        ├── ShowcaseTab.tsx    # ตารางสินค้า, ค้นหา, กรองหมวด, เลือกทีละชิ้นหรือหลายชิ้นเข้าคิว
        ├── QueueTab.tsx       # คิวงาน 6 สถานะ, บัตรสถิติ, ปุ่ม Retry, ล้างคิว
        ├── LogsTab.tsx        # แสดงบันทึก Realtime Logs
        └── SettingsTab.tsx    # ปรับแต่ง TikTok Cookie, โหมด Dry-run, Retry, และ DeepSeek
```

---

## สถานะของคิว (Queue Lifecycle)
`pending` → `generating` → `clip_ready` → `posting` → `posted`
* หากมีข้อผิดพลาดจะเปลี่ยนเป็น `failed` พร้อมเก็บข้อความ Error และรองรับการสั่ง **Retry** ตามจำนวนครั้งที่กำหนดในคอนฟิก
* ข้อมูลทั้งหมดถูกจัดเก็บลงใน **SQLite** ทันที ไม่สูญหายเมื่อปิดหรือรีสตาร์ทโปรแกรม

---

## วิธีติดตั้งและเริ่มใช้งาน

### 1. ติดตั้ง Dependencies
```bash
cd AFFI_PRO
npm install
```

### 2. ตั้งค่า `.env`
คัดลอกไฟล์ `.env.example` ไปเป็น `.env` แล้วระบุค่า:
* `TIKTOK_COOKIE`: คัดลอกค่า Header Cookie จาก Developer Tools (Network tab) บนหน้า TikTok Shop
* `DEEPSEEK_API_KEY`: ใส่ API Key ของ DeepSeek (สำหรับเฟส 2)
* `DRY_RUN`: ตั้งเป็น `true` สำหรับการทดสอบโดยไม่โพสต์จริง หรือ `false` เมื่อต้องการโพสต์จริง

### 3. รันโปรเจกต์
เปิด Terminal 2 หน้าต่าง หรือรันคำสั่ง:

* **รัน Backend Server (พอร์ต 3001):**
  ```bash
  npm run dev:server
  ```
* **รัน Frontend Vite UI (พอร์ต 5173):**
  ```bash
  npm run dev:frontend
  ```

เปิดเบราว์เซอร์ไปที่: `http://localhost:5173`
