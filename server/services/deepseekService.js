// AFFI_PRO - DeepSeek AI Caption Generator Service
import { addLog } from '../logger.js';

const FALLBACK_HOOKS = [
  "เดี๋ยวก่อน! ใครกำลังเจอปัญหานี้อยู่ ต้องดูอันนี้เลย",
  "เพิ่งรู้ว่าของชิ้นนี้ช่วยได้ขนาดนี้ คุ้มเกินราคามาก",
  "รู้งี้ซื้อมาตั้งนานแล้ว สะดวกขึ้นเยอะ",
  "ของมันต้องมีจริง ๆ ชิ้นเดียวจบ ไม่ต้องวุ่นวาย",
  "ใครยังทำแบบเดิมอยู่ ต้องลองเปลี่ยนมาใช้อันนี้",
  "ไม่คิดว่าจะใช้ง่ายขนาดนี้ ลองครั้งแรกก็ชอบเลย",
  "เห็นเล็ก ๆ แบบนี้ แต่ประสิทธิภาพดีเกินคาด",
  "นี่แหละของที่ตามหามานาน ใครชอบความสะดวกต้องมี",
  "ของดีที่คนยังไม่ค่อยรู้ ราคาเท่านี้แต่ทำได้ขนาดนี้",
  "ก่อนซื้อคิดว่าไม่จำเป็น แต่ตอนนี้ขาดไม่ได้แล้ว",
  "ปัญหานี้แก้ได้ง่ายกว่าที่คิด ใช้แล้วชีวิตง่ายขึ้นจริง",
  "อันนี้ไม่ได้อวย แต่มันดีจริง ใช้แล้วอยากบอกต่อ",
  "ไอเทมลับที่ควรมีติดบ้าน ซื้อเพราะลองแต่ได้ใช้ทุกวัน",
  "ดูให้จบ แล้วจะรู้ว่าทำไมยอดขายถึงปังขนาดนี้",
  "แก วันนี้มาบอกต่อ อย่าบอกใครนะ ของดีราคาดีมาก"
];

const FALLBACK_HASHTAGS = "#tiktokป้ายยา #ของดีบอกต่อ #รีวิวของดี #พิกัดในตะกร้า";

export async function generateCaption(product) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const title = product.title || 'สินค้าคุณภาพ';
  const price = product.price || '';

  // Check if DeepSeek API Key is available
  if (apiKey) {
    try {
      addLog('info', `กำลังเรียก DeepSeek API (${model}) สร้างแคปชั่นสำหรับ: ${title.slice(0, 30)}...`);

      const prompt = `คุณคือนักเขียนแคปชั่น TikTok Affiliate มือโปร ให้เขียนแคปชั่นภาษาไทยสั้นกระชับดึงดูดใจสำหรับสินค้า: "${title}" ${price ? `ราคา ${price}` : ''}
เงื่อนไขเข้มงวด:
1. ข้อความแคปชั่นสั้นกระชับ ไม่เกิน 75 ตัวอักษร
2. ต่อท้ายด้วยแฮชแท็กยอดนิยม 3-4 อัน เช่น #tiktokป้ายยา #ของดีบอกต่อ #รีวิวของใช้
3. ความยาวรวมทั้งหมดห้ามเกิน 100 ตัวอักษรเด็ดขาด
4. ตอบเฉพาะเนื้อหาแคปชั่นเพียวๆ เท่านั้น ไม่ต้องมีเครื่องหมายคำพูดหรือคำเกริ่นนำ`;

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: 'คุณคือนักเขียนแคปชั่น TikTok สั้นกระชับ ไม่เกิน 100 ตัวอักษร' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 80,
          temperature: 0.7,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        let caption = data.choices?.[0]?.message?.content?.trim();
        if (caption) {
          // Clean up formatting
          caption = caption.replace(/^["'“”]+|["'“”]+$/g, '').trim();
          if (caption.length > 110) caption = caption.slice(0, 105) + '...';
          addLog('success', `DeepSeek สร้างแคปชั่นสำเร็จ (${caption.length} chars): "${caption}"`);
          return { caption, source: 'deepseek', model };
        }
      } else {
        const errText = await response.text();
        addLog('warn', `DeepSeek API ตอบกลับสถานะ ${response.status}: ${errText.slice(0, 120)} -> สลับไปใช้ Template สำเร็จรูป`);
      }
    } catch (err) {
      addLog('warn', `เรียก DeepSeek ไม่สำเร็จ (${err.message}) -> สลับไปใช้ Template แคปชั่นสำเร็จรูป`);
    }
  } else {
    addLog('info', 'ยังไม่ได้ระบุ DEEPSEEK_API_KEY -> ใช้ Template แคปชั่นสำเร็จรูปอัตโนมัติ');
  }

  // Fallback Template
  const randomHook = FALLBACK_HOOKS[Math.floor(Math.random() * FALLBACK_HOOKS.length)];
  const shortTitle = title.length > 30 ? title.slice(0, 28) + '..' : title;
  const fallbackCaption = `${randomHook} ${shortTitle} ${FALLBACK_HASHTAGS}`.slice(0, 100);

  return {
    caption: fallbackCaption,
    source: 'template',
    model: 'fallback-template',
  };
}
