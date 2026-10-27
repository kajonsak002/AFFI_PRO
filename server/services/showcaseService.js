import db from '../db.js';
import { addLog } from '../logger.js';

const SLEEP = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchShowcaseProducts(cookieOverride = null) {
  const cookie = cookieOverride || process.env.TIKTOK_COOKIE || '';
  const userAgent = process.env.TIKTOK_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  if (!cookie || !cookie.trim()) {
    const errorMsg = 'ไม่พบ Cookie ของ TikTok ในการตั้งค่า กรุณากรอก TIKTOK_COOKIE ใน .env หรือหน้าตั้งค่า';
    addLog('warn', errorMsg);
    throw new Error(errorMsg);
  }

  const allProducts = [];
  const pageSize = 6;
  let offset = 0;
  let total = Infinity;
  let pageNumber = 1;

  addLog('info', `เริ่มดึงสินค้า Showcase จาก TikTok Shop API (ทีละ ${pageSize} รายการ)...`);

  while (offset < total) {
    const url = `https://shop.tiktok.com/api/v1/streamer_desktop/showcase_product/list?offset=${offset}&count=${pageSize}`;
    addLog('info', `กำลังเรียกหน้า ${pageNumber} (offset=${offset})...`);

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cookie': cookie,
          'User-Agent': userAgent,
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://shop.tiktok.com/',
        },
      });
    } catch (netErr) {
      const errText = `เชื่อมต่อ TikTok Shop API ล้มเหลว: ${netErr.message}`;
      addLog('error', errText);
      throw new Error(errText);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        const authErr = `TikTok แจ้งเตือนสิทธิ์ (HTTP ${response.status}): Session หมดอายุ กรุณาอัปเดต Cookie ใหม่`;
        addLog('error', authErr);
        throw new Error(authErr);
      }
      const httpErr = `TikTok API ตอบกลับ HTTP ${response.status}: ${response.statusText}`;
      addLog('error', httpErr);
      throw new Error(httpErr);
    }

    // Check for bdturing verify header
    const bdturing = response.headers.get('bdturing-verify');
    if (bdturing) {
      const captchaErr = 'TikTok ตรวจพบ CAPTCHA / Bdturing Verification: Session Cookie ไม่สมบูรณ์หรือหมดอายุ กรุณาเปิดเว็บ TikTok Shop บนเบราว์เซอร์แล้วคัดลอก Cookie ใหม่';
      addLog('error', captchaErr);
      throw new Error(captchaErr);
    }

    let json;
    try {
      json = await response.json();
    } catch (parseErr) {
      const errText = `ไม่สามารถแปลงผลลัพธ์เป็น JSON ได้: ${parseErr.message}`;
      addLog('error', errText);
      throw new Error(errText);
    }

    if (json.code !== 0) {
      const msg = json.message || 'รหัสผลลัพธ์ไม่ถูกต้อง';
      const apiErr = `TikTok API แจ้งข้อผิดพลาด (code=${json.code}): ${msg} (อาจเกิดจาก Session หมดอายุ)`;
      addLog('error', apiErr);
      throw new Error(apiErr);
    }

    const data = json.data || {};
    const items = Array.isArray(data.products) ? data.products : [];
    
    if (typeof data.total === 'number') {
      total = data.total;
    }

    if (items.length === 0) {
      addLog('info', `ไม่มีสินค้าในหน้านี้ จบการดึงข้อมูล`);
      break;
    }

    // Map each item from real schema
    for (const item of items) {
      const coverUrl = item.cover?.url_list?.[0] || item.cover?.thumb_url_list?.[0] || '';
      const imagesList = Array.isArray(item.images)
        ? item.images.map((img) => img.url_list?.[0] || img.thumb_url_list?.[0]).filter(Boolean)
        : [];
      
      const commission = item.affiliate_info?.commission_with_currency ||
                         item.affiliate_info?.est_commission_expense ||
                         (item.affiliate_info?.commission_rate ? `${item.affiliate_info.commission_rate / 100}%` : '—');

      const mapped = {
        product_id: String(item.product_id),
        title: String(item.title || 'ไม่มีชื่อสินค้า').trim(),
        price: String(item.format_available_price || '—').trim(),
        cover_url: coverUrl,
        images_json: JSON.stringify(imagesList),
        stock: Number(item.stock_num) || 0,
        commission: commission,
        category: item.category_info?.name || 'ทั่วไป',
        shop_name: item.seller_info?.shop_name || 'TikTok Shop',
        raw_data: JSON.stringify(item),
        updated_at: Date.now(),
      };

      allProducts.push(mapped);

      // Save to SQLite products table
      const upsert = db.prepare(`
        INSERT INTO products (
          product_id, title, price, cover_url, images_json, stock, commission, category, shop_name, raw_data, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(product_id) DO UPDATE SET
          title = excluded.title,
          price = excluded.price,
          cover_url = excluded.cover_url,
          images_json = excluded.images_json,
          stock = excluded.stock,
          commission = excluded.commission,
          category = excluded.category,
          shop_name = excluded.shop_name,
          raw_data = excluded.raw_data,
          updated_at = excluded.updated_at
      `);

      upsert.run(
        mapped.product_id,
        mapped.title,
        mapped.price,
        mapped.cover_url,
        mapped.images_json,
        mapped.stock,
        mapped.commission,
        mapped.category,
        mapped.shop_name,
        mapped.raw_data,
        mapped.updated_at
      );
    }

    offset += items.length;
    pageNumber += 1;

    addLog('info', `ดึงสำเร็จ ${allProducts.length}/${total === Infinity ? '?' : total} รายการ`);

    // Safety limit to avoid infinite loops
    if (offset >= total || pageNumber > 100) break;

    // Small delay between requests to be polite to TikTok server
    await SLEEP(400);
  }

  addLog('success', `ดึงสินค้าจาก Showcase เสร็จสมบูรณ์ รวม ${allProducts.length} รายการ`);
  return {
    success: true,
    count: allProducts.length,
    total: total === Infinity ? allProducts.length : total,
    products: allProducts,
  };
}

export function getCachedProducts(search = '', category = 'all') {
  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (search && search.trim()) {
    query += ' AND (title LIKE ? OR product_id LIKE ?)';
    params.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }

  if (category && category !== 'all') {
    query += ' AND category = ?';
    params.push(category);
  }

  query += ' ORDER BY updated_at DESC';

  const stmt = db.prepare(query);
  const rows = stmt.all(...params);

  return rows.map((r) => ({
    ...r,
    images: r.images_json ? JSON.parse(r.images_json) : [],
  }));
}

export function getCategories() {
  const stmt = db.prepare('SELECT DISTINCT category FROM products WHERE category IS NOT NULL');
  const rows = stmt.all();
  return rows.map((r) => r.category).filter(Boolean);
}

// Preload real sample data into cache for preview/offline development
export function seedSampleProductsIfEmpty() {
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM products');
  const result = countStmt.get();
  if (result.count === 0) {
    addLog('info', 'คลังสินค้าว่างเปล่า กำลังเตรียมสินค้าตัวอย่าง 6 รายการจาก Showcase API...');
    const samples = [
      {
        product_id: "1734082754881488214",
        title: "LUPEFOTO  ลิปทินท์ เนื้อแมตต์นุ่ม ไม่ทำให้ปากแห้ง",
        price: "฿159.00",
        cover_url: "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/07239994c01148ef97495bd1ecd84cbf~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my3&from=1523225687",
        stock: 3855,
        commission: "฿23.85 (15%)",
        category: "ความงามและการดูแลส่วนบุคคล",
        shop_name: "lupefoto"
      },
      {
        product_id: "1735230487160325752",
        title: "LUCKGO ลิปสติกเนื้อฉ่ำวาว สีสวยชัด ชุ่มชื้น ติดทนนาน ให้ริมฝีปากดูอวบอิ่ม มีให้เลือก 6 สี",
        price: "฿64.00",
        cover_url: "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/c17067c496d647b1a0d03d57c337126c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my3&from=1523225687",
        stock: 12237,
        commission: "฿6.40 (10%)",
        category: "ความงามและการดูแลส่วนบุคคล",
        shop_name: "user9680146148381"
      },
      {
        product_id: "1736087114942810012",
        title: "【W PET】 ผ้าเช็ดทำความสะอาดสัตว์เลี้ยง แพ็ก 100 แผ่น เหมาะสำหรับแมวและสุนัขทุกช่วงอายุ",
        price: "฿52.44",
        cover_url: "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/b404356cc528457dab7e227fb5d5fd08~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my3&from=1523225687",
        stock: 8098,
        commission: "฿7.87 (15%)",
        category: "อุปกรณ์สำหรับสัตว์เลี้ยง",
        shop_name: "shijisxb0u4"
      },
      {
        product_id: "1731218405329372921",
        title: "ไม้ม็อปลูกลิ้งทำความสอาด ขน สัตรเลี้ยง ด้ามปรับความยาว ได้ตามต้องการ ลูกกลิ้ง ขจัดฝุ่น",
        price: "฿9.90",
        cover_url: "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/ac9cc20c3aa74a75860dde499daaaad7~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my3&from=1523225687",
        stock: 211041,
        commission: "฿0.99 (10%)",
        category: "อุปกรณ์สำหรับสัตว์เลี้ยง",
        shop_name: "yutai052"
      },
      {
        product_id: "1736357292696175682",
        title: "THSPET อาหารเปียกแมว สำหรับแมวและสุนัข สูตรนมแพะ เนื้อแท้ในน้ำเกรวี่ 0% แลคโตส 70g",
        price: "฿9.50",
        cover_url: "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/2cb2de63e08e4c4fab7120f8e217390f~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my3&from=1523225687",
        stock: 116997,
        commission: "฿0.81 (8.5%)",
        category: "อุปกรณ์สำหรับสัตว์เลี้ยง",
        shop_name: "THSPET THAILAND"
      },
      {
        product_id: "1733209406515152190",
        title: "เปียกแมว อาหารเปียก อาหารแมว แมวเปียก 80ก. โภชนาการที่สมดุล มีทอรีน",
        price: "฿9.00",
        cover_url: "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/300b034ed785495fa01d59fa2a7a71b6~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my3&from=1523225687",
        stock: 154263,
        commission: "฿0.90 (10%)",
        category: "อุปกรณ์สำหรับสัตว์เลี้ยง",
        shop_name: "thchongwu6688"
      }
    ];

    const insert = db.prepare(`
      INSERT OR IGNORE INTO products (
        product_id, title, price, cover_url, images_json, stock, commission, category, shop_name, raw_data, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const p of samples) {
      insert.run(
        p.product_id,
        p.title,
        p.price,
        p.cover_url,
        JSON.stringify([p.cover_url]),
        p.stock,
        p.commission,
        p.category,
        p.shop_name,
        JSON.stringify(p),
        Date.now()
      );
    }
    addLog('success', 'บันทึกสินค้าตัวอย่าง 6 รายการเข้าคลังเรียบร้อย');
  }
}

export function upsertProducts(items) {
  if (!Array.isArray(items)) return { success: false, count: 0 };
  let count = 0;
  const upsert = db.prepare(`
    INSERT INTO products (
      product_id, title, price, cover_url, images_json, stock, commission, category, shop_name, raw_data, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_id) DO UPDATE SET
      title = excluded.title,
      price = excluded.price,
      cover_url = excluded.cover_url,
      images_json = excluded.images_json,
      stock = excluded.stock,
      commission = excluded.commission,
      category = excluded.category,
      shop_name = excluded.shop_name,
      raw_data = excluded.raw_data,
      updated_at = excluded.updated_at
  `);

  for (const item of items) {
    if (!item.product_id) continue;
    const coverUrl = item.cover_url || item.cover?.url_list?.[0] || item.cover?.thumb_url_list?.[0] || '';
    const imagesList = item.images_json
      ? (typeof item.images_json === 'string' ? item.images_json : JSON.stringify(item.images_json))
      : (Array.isArray(item.images) ? JSON.stringify(item.images.map(img => img.url_list?.[0] || img.thumb_url_list?.[0]).filter(Boolean)) : JSON.stringify([coverUrl]));

    const commission = item.commission ||
      item.affiliate_info?.commission_with_currency ||
      item.affiliate_info?.est_commission_expense ||
      (item.affiliate_info?.commission_rate ? `${item.affiliate_info.commission_rate / 100}%` : '—');

    upsert.run(
      String(item.product_id),
      String(item.title || 'ไม่มีชื่อสินค้า').trim(),
      String(item.price || item.format_available_price || '—').trim(),
      coverUrl,
      imagesList,
      Number(item.stock || item.stock_num) || 0,
      commission,
      item.category || item.category_info?.name || 'ทั่วไป',
      item.shop_name || item.seller_info?.shop_name || 'TikTok Shop',
      typeof item.raw_data === 'string' ? item.raw_data : JSON.stringify(item),
      Date.now()
    );
    count++;
  }
  addLog('success', `ซิงค์และบันทึกสินค้าลงฐานข้อมูลสำเร็จ ${count} รายการ`);
  return { success: true, count };
}
