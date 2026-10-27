const PENDING_KEY = "adsStoriesPendingAutomation";
const CONTENT_QUEUE_KEY = "adsStoriesContentQueue";
const POLL_MS = 800;
const MAX_WAIT_MS = 20 * 60 * 1000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const visible = (element) => {
  if (!element) return false;
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
};

function status(message, kind = "working") {
  let box = document.querySelector("#jarbland-meta-ai-status");
  if (!box) {
    box = document.createElement("div");
    box.id = "jarbland-meta-ai-status";
    Object.assign(box.style, {
      position: "fixed", right: "22px", top: "22px", zIndex: "2147483647",
      maxWidth: "380px", padding: "13px 16px", borderRadius: "16px", color: "#fff",
      font: "700 12px/1.55 'Segoe UI',Tahoma,sans-serif", boxShadow: "0 12px 30px rgba(54,128,173,.22)",
      background: kind === "error" ? "#c96f78" : kind === "success" ? "#4da987" : "#55aee6",
    });
    document.body.appendChild(box);
  }
  box.style.background = kind === "error" ? "#c96f78" : kind === "success" ? "#4da987" : "#55aee6";
  box.textContent = message;
}

function composer() {
  const selector = "textarea, [data-lexical-editor='true'], .ProseMirror[contenteditable='true'], [contenteditable='true'][role='textbox'], div[contenteditable='true']";
  return [...document.querySelectorAll(selector)]
    .filter(visible)
    .find((element) => /ask|message|prompt|meta ai|ถาม|ข้อความ|พรอมต์/i.test([
      element.getAttribute("aria-label"), element.getAttribute("placeholder"), element.getAttribute("data-placeholder"),
    ].filter(Boolean).join(" "))) || [...document.querySelectorAll(selector)].filter(visible).at(-1);
}

function attachmentPreviewCount() {
  const editor = composer();
  const area = editor?.closest("form") || editor?.parentElement?.parentElement?.parentElement;
  if (!area) return 0;
  return [...area.querySelectorAll("img, [data-testid*='attachment' i], [data-testid*='preview' i]")]
    .filter((element) => visible(element) && (element.matches("img") || !element.querySelector("img"))).length;
}

function fileInput() {
  return [...document.querySelectorAll("input[type='file']")].find((input) => !input.disabled && (!input.accept || /image|png|jpe?g|webp|\*/i.test(input.accept)));
}

function dataUrlToFile(dataUrl, name, contentType) {
  const binary = atob(String(dataUrl).split(",")[1] || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: contentType || "image/jpeg" });
}

function mediaDialog() {
  const dialogs = [...document.querySelectorAll("[role='dialog'], [aria-modal='true']")].filter(visible);
  return dialogs.reverse().find((dialog) => /add media and files|upload whatever you want|recent uploads|เพิ่มสื่อ|อัปโหลด/i.test(dialog.innerText || ""))
    || [...document.querySelectorAll("body *")].filter(visible).reverse().find((element) => {
      const text = String(element.innerText || "").replace(/\s+/g, " ").trim();
      return text.startsWith("Add media and files") && text.length < 500;
    });
}

async function closeMediaDialog() {
  const dialog = mediaDialog();
  if (!dialog) return true;
  const controls = [...dialog.querySelectorAll("button, [role='button']")].filter(visible);
  const close = controls.find((control) => /close|dismiss|ปิด|ยกเลิก/i.test(`${control.getAttribute("aria-label") || ""} ${control.getAttribute("title") || ""} ${control.textContent || ""}`))
    || controls.find((control) => /xmark|close/i.test(control.querySelector("svg")?.getAttribute("data-testid") || ""))
    || controls[0];
  if (!close) throw new Error("แนบรูปแล้ว แต่ไม่พบปุ่ม X สำหรับปิดหน้าต่าง Add media and files");
  close.focus();
  close.click();
  for (let i = 0; i < 20; i += 1) {
    await wait(200);
    if (!mediaDialog()) return true;
  }
  throw new Error("ปิดหน้าต่าง Add media and files ไม่สำเร็จ");
}

async function attachProduct(pending) {
  const withCharacter = /^data:image\//i.test(String(pending.characterImageDataUrl || ""));
  if (pending.characterReferenceEnabled && !withCharacter) throw new Error("งานนี้เลือกภาพตัวละครไว้ แต่ข้อมูลภาพไม่ถูกส่งมา จึงหยุดก่อนสร้างวิดีโอ");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")?.set;
  if (!setter) throw new Error("เบราว์เซอร์ไม่อนุญาตให้ BOT แนบรูปสินค้า");
  const attachments = [{ dataUrl: pending.imageDataUrl, name: `PRODUCT-${pending.productId || Date.now()}.jpg`, type: pending.imageContentType }];
  if (withCharacter) attachments.push({ dataUrl: pending.characterImageDataUrl, name: `CHARACTER-REFERENCE-${pending.productId || Date.now()}.jpg`, type: pending.characterImageContentType });
  let previewsAfterProduct = attachmentPreviewCount();
  let productPreviewSeen = false;
  for (const [index, attachment] of attachments.entries()) {
    status(index ? "กำลังอัปโหลดภาพตัวละครอ้างอิงเข้า Meta AI..." : "กำลังอัปโหลดภาพสินค้าเข้า Meta AI...");
    const previewsBefore = attachmentPreviewCount();
    let input = fileInput();
    if (!input) {
      const add = [...document.querySelectorAll("button, [role='button']")].filter(visible).find((button) =>
        /add|attach|upload|photo|image|เพิ่ม|แนบ|อัปโหลด|รูป/i.test(`${button.textContent || ""} ${button.getAttribute("aria-label") || ""}`));
      add?.click();
      for (let i = 0; i < 20 && !input; i += 1) { await wait(250); input = fileInput(); }
    }
    if (!input) throw new Error(`ไม่พบช่องแนบ${index ? "ภาพตัวละคร" : "รูปสินค้า"}ของ Meta AI`);
    const transfer = new DataTransfer();
    transfer.items.add(dataUrlToFile(attachment.dataUrl, attachment.name, attachment.type));
    setter.call(input, transfer.files);
    if (input.files?.length !== 1) throw new Error(`Meta AI ไม่รับ${index ? "ภาพตัวละคร" : "ภาพสินค้า"}`);
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    await wait(1800);
    await closeMediaDialog();
    await wait(400);
    let previewsAfter = attachmentPreviewCount();
    for (let attempt = 0; attempt < (index ? 10 : 4) && previewsAfter <= previewsBefore; attempt += 1) {
      await wait(500);
      previewsAfter = attachmentPreviewCount();
    }
    if (index === 0) {
      productPreviewSeen = previewsAfter > previewsBefore;
      previewsAfterProduct = previewsAfter;
    } else if (productPreviewSeen && previewsAfter <= previewsAfterProduct) {
      throw new Error("Meta AI แสดงภาพสินค้าแล้ว แต่ไม่แสดงภาพตัวละครที่แนบ BOT จึงหยุดก่อนส่ง Prompt");
    }
  }
}

function composerText(element) {
  if (!element) return "";
  return String(element.value ?? element.innerText ?? element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function fillComposer(element, text) {
  element.focus();
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, text);
  } else {
    const selection = getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("insertText", false, text);
    if (!composerText(element)) element.textContent = text;
  }
  element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, composed: true, inputType: "insertText", data: text }));
  element.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: text }));
  element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

function sendButton() {
  // Meta AI's current composer keeps the unlabeled arrow button inside the
  // right-side action group. Prefer that local control before global matches.
  const actionGroups = [...document.querySelectorAll(".ms-auto.flex.items-center.gap-2")].filter(visible);
  for (const group of actionGroups.reverse()) {
    const localButtons = [...group.querySelectorAll("button, [role='button']")]
      .filter((button) => visible(button) && !button.disabled && button.getAttribute("aria-disabled") !== "true");
    const arrow = localButtons.find((button) =>
      /send|submit|ส่ง/i.test(`${button.textContent || ""} ${button.getAttribute("aria-label") || ""}`))
      || localButtons.at(-1);
    if (arrow) return arrow;
  }
  const buttons = [...document.querySelectorAll("button, [role='button']")].filter((button) => visible(button) && !button.disabled);
  return buttons.find((button) => button.tagName === "BUTTON" && button.type === "submit")
    || buttons.find((button) => /^(send|submit|ส่ง)( message| prompt|ข้อความ)?$/i.test(`${button.textContent || ""} ${button.getAttribute("aria-label") || ""}`.replace(/\s+/g, " ").trim()))
    || buttons.find((button) => /send|ส่งข้อความ|submit prompt/i.test(button.getAttribute("aria-label") || ""));
}

async function fillPromptAndVerify(text) {
  const expected = text.replace(/\s+/g, " ").trim().slice(0, 80);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let box = composer();
    for (let i = 0; i < 30 && !box; i += 1) { await wait(250); box = composer(); }
    if (!box) continue;
    fillComposer(box, text);
    await wait(600);
    const live = composer();
    if (composerText(live).includes(expected)) return live;
  }
  throw new Error("แนบรูปแล้ว แต่ Meta AI ไม่รับข้อความ Prompt");
}

async function submitPrompt(box, prompt) {
  let submit = null;
  for (let i = 0; i < 20 && !submit; i += 1) { submit = sendButton(); if (!submit) await wait(250); }
  if (submit) {
    submit.scrollIntoView({ block: "center", inline: "center" });
    submit.focus();
    submit.click();
  }
  else {
    box.focus();
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, composed: true }));
    box.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, composed: true }));
  }
  const marker = prompt.replace(/\s+/g, " ").trim().slice(0, 55);
  for (let i = 0; i < 30; i += 1) {
    await wait(300);
    const liveText = composerText(composer());
    if (!liveText.includes(marker)) return true;
  }
  throw new Error("ใส่ Prompt แล้ว แต่ปุ่มส่งของ Meta AI ยังไม่รับคำสั่ง");
}

function newestVideo(baseline) {
  // Meta may leave a completed video unplayed while its tab is in the background.
  // readyState/duration and viewport visibility must not gate the download.
  return [...document.querySelectorAll("video")].reverse().find((video) => {
    const src = video.currentSrc || video.src || video.querySelector("source")?.src || "";
    return /^(blob:|data:video\/|https?:)/i.test(src) && !baseline.has(src);
  });
}

function sidebarConversationLinks() {
  return [...document.querySelectorAll("a[href]")].filter((link) => {
    if (!visible(link) || link.getBoundingClientRect().left > 360) return false;
    const label = String(link.innerText || link.getAttribute("aria-label") || "").trim();
    if (!label || label.length > 120) return false;
    try {
      const url = new URL(link.href, location.href);
      return url.origin === location.origin && url.pathname !== "/";
    } catch { return false; }
  });
}

function followNewConversation(previousLinks) {
  const previous = new Set(previousLinks || []);
  const fresh = [...new Map(sidebarConversationLinks()
    .filter((link) => !previous.has(link.href) && new URL(link.href).pathname !== location.pathname)
    .map((link) => [link.href, link])).values()];
  if (fresh.length !== 1) return false;
  status("Meta AI เปิดห้องสนทนาใหม่แล้ว กำลังตามไปตรวจวิดีโอ...");
  fresh[0].click();
  return true;
}

function waitForNewVideo(baseline, acceptAfter, conversationLinksBefore = []) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let observer;
    let interval;
    let timeout;
    let followedConversation = false;
    const startedAt = Date.now();
    const finish = (video, error) => {
      if (finished) return;
      finished = true;
      observer?.disconnect();
      clearInterval(interval);
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(video);
    };
    const check = () => {
      if (Date.now() < acceptAfter) return;
      const video = newestVideo(baseline);
      if (video) { finish(video); return; }
      if (/captcha|verify.*you|ยืนยัน.*ตัวตน/i.test(document.body.innerText || "")) {
        finish(null, new Error("Meta AI ต้องยืนยันตัวตน/CAPTCHA"));
        return;
      }
      if (!followedConversation && Date.now() - startedAt > 12000) {
        followedConversation = followNewConversation(conversationLinksBefore);
      }
    };
    observer = new MutationObserver(check);
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "poster"] });
    interval = setInterval(check, 1500);
    timeout = setTimeout(() => finish(null, new Error("รอวิดีโอจาก Meta AI เกิน 20 นาที")), MAX_WAIT_MS);
    check();
  });
}

let activeRun = false;
async function run() {
  if (activeRun) return;
  activeRun = true;
  try {
    status("JarbLand AutoFlow · Meta AI BOT กำลังเริ่มทำงาน...", "working");

    const stored = await chrome.storage.local.get(PENDING_KEY);
    let pending = stored[PENDING_KEY];

    // Safe fallback via background message (NEVER use page-level fetch to avoid Mixed Content / CORS)
    if (!pending || !pending.prompt || !pending.imageDataUrl) {
      status("JarbLand AutoFlow · กำลังซิงค์ข้อมูลสินค้าจากระบบ...", "working");
      const resp = await chrome.runtime.sendMessage({ type: "AFFI_PRO_GET_CURRENT_JOB" }).catch(() => null);
      if (resp?.ok && resp?.job) {
        pending = resp.job;
      }
    }

    if (!pending || !pending.prompt || !pending.imageDataUrl) {
      status("JarbLand AutoFlow · Meta AI BOT พร้อมทำงาน (กำลังรอคิวงานจากแดชบอร์ด...)");
      return;
    }
  if (pending.processing && Date.now() - Number(pending.startedAt || 0) < 9000) {
    setTimeout(run, 9500 - Math.min(9000, Date.now() - Number(pending.startedAt || 0)));
    return;
  }
  if (/log in|sign in|เข้าสู่ระบบ/i.test(document.body.innerText || "") && !composer()) {
    status("กรุณาเข้าสู่ระบบ Meta AI แล้ว BOT จะทำงานต่อ", "error");
    chrome.runtime.sendMessage({ type: "jarbland-v4-needs-attention", stage: "meta", progress: 10, reason: "Meta AI ต้องเข้าสู่ระบบ" }).catch(() => {});
    return;
  }
  const lock = await chrome.runtime.sendMessage({ type: "jarbland-claim-chat-automation", automationId: pending.automationId }).catch(() => null);
  if (!lock?.claimed) return;
  const claim = { ...pending, processing: true, processorTabId: lock.processorTabId || null, startedAt: Date.now(), stage: pending.stage || "starting" };
  await chrome.storage.local.set({ [PENDING_KEY]: claim });
  try {
    if (!['image_attached','prompt_filled','submitted'].includes(claim.stage)) {
      status("1/3 กำลังแนบรูปสินค้าเข้า Meta AI...");
      await attachProduct(claim);
      claim.stage = "image_attached";
      await chrome.storage.local.set({ [PENDING_KEY]: { ...claim, stage: claim.stage } });
    }
    const queueStored = await chrome.storage.local.get(CONTENT_QUEUE_KEY);
    const knownQueueUrls = (Array.isArray(queueStored[CONTENT_QUEUE_KEY]) ? queueStored[CONTENT_QUEUE_KEY] : [])
      .map((item) => item.videoUrl).filter(Boolean);
    const baseline = new Set(Array.isArray(claim.videoBaselineUrls) && claim.stage === "submitted"
      ? claim.videoBaselineUrls
      : [
        ...[...document.querySelectorAll("video")].map((video) => video.currentSrc || video.src).filter(Boolean),
        ...knownQueueUrls,
      ]);
    if (claim.stage !== "submitted") {
      claim.videoBaselineUrls = [...baseline];
      claim.conversationLinksBefore = sidebarConversationLinks().map((link) => link.href);
      await chrome.storage.local.set({ [PENDING_KEY]: { ...claim, videoBaselineUrls: claim.videoBaselineUrls, conversationLinksBefore: claim.conversationLinksBefore } });
      await closeMediaDialog();
      status("2/3 กำลังใส่และตรวจสอบ Prompt สร้างวิดีโอ...");
      const box = await fillPromptAndVerify(claim.prompt);
      claim.stage = "prompt_filled";
      await chrome.storage.local.set({ [PENDING_KEY]: { ...claim, stage: claim.stage } });
      await submitPrompt(box, claim.prompt);
      claim.stage = "submitted";
      await chrome.storage.local.set({ [PENDING_KEY]: { ...claim, stage: claim.stage, submittedAt: Date.now() } });
      status("2/3 ส่ง Prompt แล้ว — Meta AI กำลังสร้างวิดีโอ...");
    }
    const acceptVideoAfter = Math.max(Date.now() + 5000, Number(claim.submittedAt || 0) + 5000);
    const video = await waitForNewVideo(baseline, acceptVideoAfter, claim.conversationLinksBefore);
    const videoUrl = video.currentSrc || video.src || video.querySelector("source")?.src || "";
    let videoDataUrl = "";
    if (/^(blob:|data:video\/)/i.test(videoUrl)) {
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error("อ่านไฟล์วิดีโอชั่วคราวจาก Meta AI ไม่สำเร็จ");
      const blob = await response.blob();
      if (!blob.size || blob.size > 120 * 1024 * 1024) throw new Error("วิดีโอ Meta AI มีขนาดเกิน 120MB");
      videoDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    }
    status("3/3 Meta AI สร้างวิดีโอแล้ว กำลังบันทึก...", "success");
    const result = await chrome.runtime.sendMessage({ type: "jarbland-meta-video-ready", automationId: claim.automationId, queueJobId: claim.queueJobId, productId: claim.productId, productName: claim.productName, videoUrl, videoDataUrl });
    if (!result?.ok) {
      const saveError = new Error(result?.error || "บันทึกวิดีโอไม่สำเร็จ");
      saveError.terminal = Boolean(result?.terminal);
      throw saveError;
    }
    if (result.continue) {
      status("ได้คลิปช่วง 1/2 แล้ว กำลังสั่ง Meta AI สร้างช่วงที่ 2/2...");
      setTimeout(run, 1200);
    } else if (result.merging) {
      status("ได้ครบ 2 คลิปแล้ว กำลังรวมเป็นวิดีโอ 20 วินาทีพร้อมเสียง...");
    } else {
      await chrome.storage.local.remove(PENDING_KEY);
      status("เสร็จแล้ว — บันทึกวิดีโอจาก Meta AI เรียบร้อย", "success");
    }
  } catch (error) {
    if (error?.terminal) await chrome.storage.local.remove(PENDING_KEY);
    else await chrome.storage.local.set({ [PENDING_KEY]: { ...claim, processing: false, error: error?.message || "Meta AI BOT ทำงานไม่สำเร็จ" } });
    status(error?.message || "Meta AI BOT ทำงานไม่สำเร็จ", "error");
    chrome.runtime.sendMessage({ type: "jarbland-v4-needs-attention", stage: "meta", progress: 30, reason: error?.message || "Meta AI BOT ทำงานไม่สำเร็จ" }).catch(() => {});
  }
  } finally {
    activeRun = false;
  }
}

run();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[PENDING_KEY]?.newValue && !changes[PENDING_KEY].newValue.processing) setTimeout(run, 1500);
});

setInterval(() => {
  if (!activeRun) {
    chrome.storage.local.get(PENDING_KEY).then((res) => {
      const p = res[PENDING_KEY];
      if (p && p.prompt && p.imageDataUrl && !p.processing) run();
    }).catch(() => {});
  }
}, 3000);
