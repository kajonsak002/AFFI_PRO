// AFFI_PRO - Extension Background Service Worker
// Handles the EXACT SAME message flow as the original JarbLand AutoFlow background.js
// Keys: adsStoriesPendingAutomation (Meta AI bot) + adsStoriesTikTokPostJob (TikTok bot)

const CHAT_AUTOMATION_KEY = "adsStoriesPendingAutomation";
const POST_JOB_KEY = "adsStoriesTikTokPostJob";
const CONTENT_QUEUE_KEY = "adsStoriesContentQueue";
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;

let syncDebounceTimer = null;

// ─── Cookie Extraction (keep existing) ───

async function getTikTokCookies() {
  const cookieMap = new Map();
  const urls = [
    "https://shop.tiktok.com", "https://www.tiktok.com",
    "https://seller-th.tiktok.com", "https://web.tiktok.com"
  ];
  for (const url of urls) {
    try {
      const cookies = await chrome.cookies.getAll({ url });
      cookies.forEach((c) => { if (!cookieMap.has(c.name)) cookieMap.set(c.name, c.value); });
    } catch (e) {}
  }
  const domains = [".tiktok.com", "tiktok.com", ".shop.tiktok.com", "shop.tiktok.com"];
  for (const domain of domains) {
    try {
      const cookies = await chrome.cookies.getAll({ domain });
      cookies.forEach((c) => { if (!cookieMap.has(c.name)) cookieMap.set(c.name, c.value); });
    } catch (e) {}
  }
  const cookieString = Array.from(cookieMap.entries()).map(([n, v]) => `${n}=${v}`).join("; ");
  return {
    cookieString,
    count: cookieMap.size,
    hasSession: cookieMap.has("sessionid") || cookieMap.has("sessionid_ss") || cookieMap.has("sid_tt"),
  };
}

async function syncCookiesToBackend(cookieString) {
  try {
    const res = await fetch("http://localhost:3001/api/config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tiktokCookie: cookieString }),
    });
    return await res.json();
  } catch (err) { return { ok: false, error: err.message }; }
}

async function triggerAutoSync() {
  const extracted = await getTikTokCookies();
  if (extracted.cookieString && extracted.count > 0) await syncCookiesToBackend(extracted.cookieString);
  return extracted;
}

chrome.cookies.onChanged.addListener((changeInfo) => {
  if ((changeInfo.cookie?.domain || "").includes("tiktok.com")) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => triggerAutoSync(), 1500);
  }
});

// ─── Tab Management (same as original) ───

function isNormalChatUrl(url) {
  try { return /^(?:www\.)?meta\.ai$/i.test(new URL(String(url || "")).hostname); }
  catch { return false; }
}

async function focusTab(tab) {
  if (!tab?.id) return null;
  const updated = await chrome.tabs.update(tab.id, { active: true });
  if (updated.windowId) await chrome.windows.update(updated.windowId, { focused: true }).catch(() => {});
  return updated;
}

async function keepMetaTabRendering(tab) {
  if (!tab?.id) return tab;
  const win = await chrome.windows.get(tab.windowId).catch(() => null);
  if (win?.state === "minimized") await chrome.windows.update(tab.windowId, { state: "normal" }).catch(() => {});
  return chrome.tabs.update(tab.id, { active: true, autoDiscardable: false }).catch(() => tab);
}

async function openOrReuseChatGptTab(forceReload = false) {
  const tabs = await chrome.tabs.query({ url: ["https://meta.ai/*", "https://www.meta.ai/*"] });
  let tab = tabs.find((t) => isNormalChatUrl(t.url || t.pendingUrl)) || null;
  const url = "https://www.meta.ai/?jarbland-autovideo=1";
  if (!tab) {
    tab = await chrome.tabs.create({ url, active: true });
    if (tab?.windowId) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  } else {
    tab = await chrome.tabs.update(tab.id, { url, active: true });
    if (tab?.windowId) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  }
  tab = await keepMetaTabRendering(tab);
  return tab;
}

async function openOrReuseTikTokTab() {
  const tabs = await chrome.tabs.query({ url: ["https://www.tiktok.com/tiktokstudio/upload*"] });
  let tab = tabs[0] || null;
  const url = "https://www.tiktok.com/tiktokstudio/upload";
  if (!tab) {
    tab = await chrome.tabs.create({ url, active: true });
    if (tab?.windowId) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  } else {
    tab = await chrome.tabs.update(tab.id, { active: true });
    if (tab?.windowId) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  }
  return tab;
}

// ─── MAIN World Script Functions (copied exactly from original) ───

async function attachVideoInMainWorld(dataUrl, fileName, contentType) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const file = new File([blob], fileName || "video.mp4", { type: contentType || blob.type || "video/mp4" });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  const inputs = [...document.querySelectorAll("input[type='file']")].filter((input) => {
    const accept = input.accept || "";
    return !input.disabled && (!accept || /video|mp4|webm|quicktime/i.test(accept));
  });
  if (!inputs.length) return { ok: false, error: "ไม่พบช่องอัปโหลดวิดีโอของ TikTok Studio" };

  for (const input of inputs) {
    const filesSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")?.set;
    if (!filesSetter) continue;
    filesSetter.call(input, transfer.files);
    input.focus();
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    let dropZone = input.parentElement;
    for (let node = input.parentElement, depth = 0; node && depth < 6; node = node.parentElement, depth += 1) {
      const label = String(node.innerText || "").replace(/\s+/g, " ").trim();
      if (/select video|choose video|upload video|เลือกวิดีโอ|อัปโหลดวิดีโอ|ลาก.*วาง/i.test(label)) {
        dropZone = node; break;
      }
    }
    if (dropZone) {
      for (const type of ["dragenter", "dragover", "drop"]) {
        dropZone.dispatchEvent(new DragEvent(type, {
          bubbles: true, cancelable: true, composed: true, dataTransfer: transfer,
        }));
      }
    }
    if (input.files?.length === 1) return { ok: true, name: input.files[0].name, size: input.files[0].size };
  }
  return { ok: false, error: "TikTok Studio ไม่รับไฟล์วิดีโอในช่องอัปโหลด" };
}

async function attachImageInMainWorld(dataUrl, fileName, contentType) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const file = new File([blob], fileName, { type: contentType || blob.type || "image/jpeg" });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  const inputs = [
    document.querySelector("input[type='file'][aria-label='แนบรูปภาพ']"),
    document.querySelector("input[type='file'][aria-label='Attach image']"),
    document.querySelector("input[type='file'][accept='image/*']"),
    ...document.querySelectorAll("input[type='file']"),
  ].filter((input, index, items) => input
    && items.indexOf(input) === index
    && !input.disabled
    && (!input.accept || /image|\*|png|jpe?g|webp/i.test(input.accept)));

  if (!inputs.length) return { ok: false, error: "ไม่พบช่องอัปโหลดรูป" };

  for (const input of inputs) {
    const filesSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")?.set;
    if (!filesSetter) continue;
    filesSetter.call(input, transfer.files);
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    if (input.files?.length) return { ok: true };
  }
  return { ok: false, error: "ไม่ยอมรับไฟล์" };
}

// ─── Helper: Fetch image from URL and convert to dataUrl (Service Worker safe) ───

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function fetchImageAsDataUrl(imageUrl) {
  if (!imageUrl) return { dataUrl: "", contentType: "" };
  if (/^data:image\//i.test(String(imageUrl || ""))) {
    const match = String(imageUrl).match(/^data:(image\/[a-z0-9.+-]+);base64,/i);
    return { dataUrl: String(imageUrl), contentType: match ? match[1] : "image/jpeg" };
  }

  // 1. Try direct fetch
  try {
    const response = await fetch(imageUrl, { cache: "force-cache", credentials: "omit" });
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") || "image/jpeg";
      const base64 = arrayBufferToBase64(buffer);
      return { dataUrl: `data:${contentType};base64,${base64}`, contentType };
    }
  } catch (err) {
    console.warn("[AFFI_PRO] Direct image fetch failed, trying backend proxy...", err);
  }

  // 2. Fallback to backend proxy
  try {
    const proxyUrl = `http://localhost:3001/api/worker/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    const response = await fetch(proxyUrl);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") || "image/jpeg";
      const base64 = arrayBufferToBase64(buffer);
      return { dataUrl: `data:${contentType};base64,${base64}`, contentType };
    }
  } catch (proxyErr) {
    console.error("[AFFI_PRO] Proxy image fetch failed too:", proxyErr);
  }

  return { dataUrl: "", contentType: "" };
}

// ─── Debugger & Automation Claims (Original JarbLand Flow) ───

let chatAutomationClaimChain = Promise.resolve();
const CHAT_AUTOMATION_CLAIM_STALE_MS = 3 * 60 * 1000;

function withChatAutomationClaimLock(task) {
  const run = chatAutomationClaimChain.then(task, task);
  chatAutomationClaimChain = run.catch(() => {});
  return run;
}

async function claimChatAutomation(automationId, tabId) {
  return withChatAutomationClaimLock(async () => {
    const stored = await chrome.storage.local.get(CHAT_AUTOMATION_KEY);
    const pending = stored[CHAT_AUTOMATION_KEY];
    if (!pending) return { ok: false, claimed: false, error: "ไม่พบงาน Meta AI ที่รอดำเนินการ" };
    const pendingId = String(pending.automationId || pending.jobId || `${pending.productId || "job"}-${pending.createdAt || 0}`);
    if (automationId && pendingId !== String(automationId)) {
      return { ok: false, claimed: false, error: "งาน Meta AI เปลี่ยนไปแล้ว" };
    }

    const claimedTabId = Number(pending.processorTabId || 0);
    if (claimedTabId && claimedTabId !== tabId) {
      const claimedTab = await chrome.tabs.get(claimedTabId).catch(() => null);
      const claimAge = Date.now() - Number(pending.processorClaimedAt || 0);
      if (claimedTab && isNormalChatUrl(claimedTab.url || claimedTab.pendingUrl) && claimAge < CHAT_AUTOMATION_CLAIM_STALE_MS) {
        return { ok: true, claimed: false, processorTabId: claimedTabId };
      }
    }

    const updated = {
      ...pending,
      automationId: pendingId,
      processorTabId: tabId,
      processorClaimedAt: Date.now(),
    };
    await chrome.storage.local.set({ [CHAT_AUTOMATION_KEY]: updated });
    return { ok: true, claimed: true, automationId: pendingId, processorTabId: tabId };
  });
}

function debuggerCall(method, ...args) {
  return new Promise((resolve, reject) => {
    method(...args, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result);
    });
  });
}

async function clickFlowControlWithDebugger(tabId, point) {
  const target = { tabId };
  let attached = false;
  try {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) throw new Error("ตำแหน่งปุ่มไม่ถูกต้อง");
    await debuggerCall(chrome.debugger.attach.bind(chrome.debugger), target, "1.3");
    attached = true;
    await debuggerCall(chrome.debugger.sendCommand.bind(chrome.debugger), target, "Page.bringToFront");
    await new Promise((resolve) => setTimeout(resolve, 150));
    await debuggerCall(chrome.debugger.sendCommand.bind(chrome.debugger), target, "Input.dispatchMouseEvent", {
      type: "mouseMoved", x: point.x, y: point.y, pointerType: "mouse",
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await debuggerCall(chrome.debugger.sendCommand.bind(chrome.debugger), target, "Input.dispatchMouseEvent", {
      type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1, pointerType: "mouse",
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
    await debuggerCall(chrome.debugger.sendCommand.bind(chrome.debugger), target, "Input.dispatchMouseEvent", {
      type: "mouseReleased", x: point.x, y: point.y, button: "left", buttons: 0, clickCount: 1, pointerType: "mouse",
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { ok: true };
  } finally {
    if (attached) {
      try { await debuggerCall(chrome.debugger.detach.bind(chrome.debugger), target); } catch {}
    }
  }
}

async function pressTikTokEnterWithDebugger(tabId, point) {
  const target = { tabId };
  let attached = false;
  try {
    await debuggerCall(chrome.debugger.attach.bind(chrome.debugger), target, "1.3");
    attached = true;
    await debuggerCall(chrome.debugger.sendCommand.bind(chrome.debugger), target, "Input.dispatchMouseEvent", {
      type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1,
    });
    await debuggerCall(chrome.debugger.sendCommand.bind(chrome.debugger), target, "Input.dispatchMouseEvent", {
      type: "mouseReleased", x: point.x, y: point.y, button: "left", buttons: 0, clickCount: 1,
    });
    await debuggerCall(chrome.debugger.sendCommand.bind(chrome.debugger), target, "Input.dispatchKeyEvent", {
      type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
    });
    await debuggerCall(chrome.debugger.sendCommand.bind(chrome.debugger), target, "Input.dispatchKeyEvent", {
      type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
    });
    return { ok: true };
  } finally {
    if (attached) {
      try { await debuggerCall(chrome.debugger.detach.bind(chrome.debugger), target); } catch {}
    }
  }
}

async function fillTikTokTextWithDebugger(tabId, point, text) {
  const target = { tabId };
  let attached = false;
  try {
    await debuggerCall(chrome.debugger.attach.bind(chrome.debugger), target, "1.3");
    attached = true;
    await debuggerCall(chrome.debugger.sendCommand.bind(chrome.debugger), target, "Input.dispatchMouseEvent", {
      type: "mouseMoved", x: point.x, y: point.y,
    });
    await debuggerCall(chrome.debugger.sendCommand.bind(chrome.debugger), target, "Input.dispatchMouseEvent", {
      type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1,
    });
    await debuggerCall(chrome.debugger.sendCommand.bind(chrome.debugger), target, "Input.dispatchMouseEvent", {
      type: "mouseReleased", x: point.x, y: point.y, button: "left", buttons: 0, clickCount: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    await debuggerCall(chrome.debugger.sendCommand.bind(chrome.debugger), target, "Input.dispatchKeyEvent", {
      type: "rawKeyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: 2, commands: ["selectAll"],
    });
    await debuggerCall(chrome.debugger.sendCommand.bind(chrome.debugger), target, "Input.dispatchKeyEvent", {
      type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: 2,
    });
    await debuggerCall(chrome.debugger.sendCommand.bind(chrome.debugger), target, "Input.insertText", {
      text: String(text || ""),
    });
    return { ok: true };
  } finally {
    if (attached) {
      try { await debuggerCall(chrome.debugger.detach.bind(chrome.debugger), target); } catch {}
    }
  }
}

// ─── Message Handler ───

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ─── Original: Meta AI bot claims the automation task ───
  if (message?.type === "jarbland-claim-chat-automation") {
    if (!sender.tab?.id) {
      sendResponse({ ok: false, claimed: false, error: "ไม่พบแท็บ Meta AI" });
      return false;
    }
    claimChatAutomation(message.automationId, sender.tab.id)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, claimed: false, error: error?.message || "ล็อกงาน Meta AI ไม่สำเร็จ" }));
    return true;
  }

  // ─── Original: TikTok bot debugger clicks ───
  if (message?.type === "ads-stories-click-tiktok-control-debugger") {
    if (!sender.tab?.id) {
      sendResponse({ ok: false, error: "ไม่พบแท็บ TikTok Studio" });
      return false;
    }
    clickFlowControlWithDebugger(sender.tab.id, message.point)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error?.message || "คลิกปุ่ม TikTok ไม่สำเร็จ" }));
    return true;
  }

  // ─── Original: TikTok bot debugger enter key ───
  if (message?.type === "ads-stories-press-tiktok-enter-debugger") {
    if (!sender.tab?.id) {
      sendResponse({ ok: false, error: "ไม่พบแท็บ TikTok Studio" });
      return false;
    }
    pressTikTokEnterWithDebugger(sender.tab.id, message.point)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error?.message || "กด Enter ไม่สำเร็จ" }));
    return true;
  }

  // ─── Original: TikTok bot debugger text fill ───
  if (message?.type === "ads-stories-fill-tiktok-text-debugger") {
    if (!sender.tab?.id) {
      sendResponse({ ok: false, error: "ไม่พบแท็บ TikTok Studio" });
      return false;
    }
    fillTikTokTextWithDebugger(sender.tab.id, message.point, message.text)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error?.message || "กรอกข้อความไม่สำเร็จ" }));
    return true;
  }

  // ─── Cookie sync (from bridge.js) ───
  if (message.type === "AFFI_PRO_EXTRACT_AND_SYNC_COOKIES") {
    triggerAutoSync().then(sendResponse).catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  // ─── Showcase sync (from bridge.js) ───
  if (message.type === "AFFI_PRO_BROWSER_FETCH_SHOWCASE") {
    (async () => {
      const url = `https://shop.tiktok.com/api/v1/streamer_desktop/showcase_product/list?offset=${message.offset || 0}&count=${message.count || 6}`;
      const res = await fetch(url, { method: "GET", headers: { Accept: "application/json", Referer: "https://shop.tiktok.com/" }, credentials: "include" });
      return { ok: true, data: await res.json() };
    })().then(sendResponse).catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "AFFI_PRO_BROWSER_SYNC_ALL") {
    (async () => {
      let offset = 0, total = Infinity, all = [];
      while (offset < total) {
        const res = await fetch(`https://shop.tiktok.com/api/v1/streamer_desktop/showcase_product/list?offset=${offset}&count=6`, {
          headers: { Accept: "application/json", Referer: "https://shop.tiktok.com/" }, credentials: "include"
        });
        const json = await res.json();
        if (json.code !== 0) break;
        const items = json.data?.products || [];
        if (typeof json.data?.total === "number") total = json.data.total;
        if (!items.length) break;
        all.push(...items);
        offset += items.length;
        if (offset >= total) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      if (all.length > 0) {
        const syncRes = await fetch("http://localhost:3001/api/showcase/sync-batch", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ products: all }),
        });
        return await syncRes.json();
      }
      return { success: true, count: 0 };
    })().then(sendResponse).catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ════════════════════════════════════════════════
  // ORIGINAL FLOW: Meta AI Video Creation
  // ════════════════════════════════════════════════

  // Meta Bot requests current active job (safe against Mixed Content)
  if (message.type === "AFFI_PRO_GET_CURRENT_JOB") {
    (async () => {
      const stored = await chrome.storage.local.get(CHAT_AUTOMATION_KEY);
      const pending = stored[CHAT_AUTOMATION_KEY];
      if (pending && pending.prompt && pending.imageDataUrl) {
        return { ok: true, job: pending };
      }

      const res = await fetch("http://localhost:3001/api/worker/current-job");
      const data = await res.json();
      if (!data.success || !data.job) return { ok: false, error: "ไม่มีงานในคิว" };

      const job = data.job;
      let imgData = { dataUrl: "", contentType: "image/jpeg" };
      if (job.cover_url) {
        imgData = await fetchImageAsDataUrl(job.cover_url);
      }
      let masterPrompt = job.masterPrompt || job.prompt || "";
      if (!masterPrompt) {
        try {
          const pRes = await fetch(`http://localhost:3001/api/worker/prompt/${job.product_id}`);
          masterPrompt = (await pRes.json()).prompt || "";
        } catch (e) {}
      }

      const automationId = `affi-meta-${job.id}-${Date.now()}`;
      const newPending = {
        automationId,
        queueJobId: job.id || "",
        productId: job.product_id,
        productName: job.title || "",
        imageUrl: job.cover_url || "",
        imageDataUrl: imgData.dataUrl,
        imageContentType: imgData.contentType,
        characterReferenceEnabled: false,
        characterImageDataUrl: "",
        characterImageContentType: "",
        characterImageName: "",
        openingHook: "",
        prompt: masterPrompt,
        durationSeconds: 10,
        segmentDurations: [10],
        segmentIndex: 0,
        totalSegments: 1,
        createdAt: Date.now(),
        processing: false,
      };

      await chrome.storage.local.set({ [CHAT_AUTOMATION_KEY]: newPending });
      return { ok: true, job: newPending };
    })().then(sendResponse).catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // TikTok Bot requests current active job (safe against Mixed Content)
  if (message.type === "AFFI_PRO_GET_TIKTOK_JOB") {
    (async () => {
      const stored = await chrome.storage.local.get(POST_JOB_KEY);
      const pending = stored[POST_JOB_KEY];
      if (pending && pending.product?.productId && pending.videoDataUrl) {
        return { ok: true, job: pending };
      }

      const res = await fetch("http://localhost:3001/api/worker/current-job");
      const data = await res.json();
      if (!data.success || !data.job) return { ok: false, error: "ไม่มีงานที่พร้อมโพสต์" };

      const j = data.job;
      let videoDataUrl = "";
      if (j.video_path) {
        const fn = String(j.video_path).split(/[\\/]/).pop();
        try {
          const r = await fetch(`http://localhost:3001/downloads/${fn}`);
          if (r.ok) {
            const buf = await r.arrayBuffer();
            videoDataUrl = `data:video/mp4;base64,${arrayBufferToBase64(buf)}`;
          }
        } catch (e) {}
      }

      const postJob = {
        status: "ready",
        queueJobId: j.id || "",
        caption: j.caption || `${j.title}\nสนใจกดที่ตะกร้าเลย 🛒\n#tiktokป้ายยา #ของดีบอกต่อ`,
        dryRun: true,
        product: {
          productId: j.product_id,
          name: j.title,
          price: j.price || "",
          image: j.cover_url || "",
        },
        videoDataUrl,
        videoName: `clip_${j.product_id}_${Date.now()}.mp4`,
        videoType: "video/mp4",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await chrome.storage.local.set({ [POST_JOB_KEY]: postJob });
      return { ok: true, job: postJob };
    })().then(sendResponse).catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // Dashboard/bridge says "start Meta AI job for this product"
  if (message.type === "AFFI_PRO_START_META_JOB") {
    (async () => {
      const job = message.job;
      if (!job?.product_id) throw new Error("ไม่พบ Product ID");

      // 1. Fetch product image → dataUrl
      let imageData = { dataUrl: "", contentType: "image/jpeg" };
      if (job.cover_url) {
        imageData = await fetchImageAsDataUrl(job.cover_url);
      }
      if (!imageData.dataUrl) throw new Error("ดาวน์โหลดรูปสินค้าไม่สำเร็จ");

      // 2. Get master prompt from backend
      let masterPrompt = job.masterPrompt || "";
      if (!masterPrompt) {
        try {
          const promptRes = await fetch(`http://localhost:3001/api/worker/prompt/${job.product_id}`);
          const promptData = await promptRes.json();
          masterPrompt = promptData.prompt || "";
        } catch (e) {}
      }
      if (!masterPrompt) throw new Error("สร้าง Master Prompt ไม่สำเร็จ");

      // 3. Set pending automation in chrome.storage.local (EXACTLY like create.js does)
      const automationId = `affi-pro-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await chrome.storage.local.set({
        [CHAT_AUTOMATION_KEY]: {
          automationId,
          queueJobId: job.id || "",
          productId: job.product_id,
          productName: job.title || "",
          imageUrl: job.cover_url || "",
          imageDataUrl: imageData.dataUrl,
          imageContentType: imageData.contentType,
          characterReferenceEnabled: false,
          characterImageDataUrl: "",
          characterImageContentType: "",
          characterImageName: "",
          openingHook: "",
          prompt: masterPrompt,
          durationSeconds: 10,
          segmentDurations: [10],
          segmentIndex: 0,
          totalSegments: 1,
          createdAt: Date.now(),
          processing: false,
        },
      });

      // 4. Open Meta AI tab (same as original)
      const tab = await openOrReuseChatGptTab(true);
      return { ok: true, tabId: tab?.id };
    })().then(sendResponse).catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // ─── Original: meta-ai-bot.js sends "jarbland-open-meta-ai-background" ───
  if (message?.type === "jarbland-open-meta-ai-background") {
    (async () => {
      const tab = await openOrReuseChatGptTab(true);
      return { ok: true, tabId: tab?.id };
    })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message }));
    return true;
  }

  // ─── Original: meta-ai-bot.js sends "jarbland-meta-video-ready" when video is created ───
  if (message?.type === "jarbland-meta-video-ready") {
    (async () => {
      const videoUrl = String(message.videoUrl || "");
      if (!videoUrl && !message.videoDataUrl) throw new Error("Meta AI ไม่ส่งไฟล์วิดีโอกลับมา");

      // Extract video data
      let videoDataUrl = "";
      let videoType = "video/mp4";
      if (/^data:video\//i.test(message.videoDataUrl || "")) {
        videoDataUrl = message.videoDataUrl;
      } else if (/^https?:/i.test(videoUrl)) {
        const response = await fetch(videoUrl, { credentials: "omit" });
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          if (buffer.byteLength && buffer.byteLength <= MAX_VIDEO_BYTES) {
            videoType = response.headers.get("content-type") || "video/mp4";
            videoDataUrl = `data:${videoType};base64,${arrayBufferToBase64(buffer)}`;
          }
        }
      }
      if (!videoDataUrl) throw new Error("ดาวน์โหลดไฟล์วิดีโอจาก Meta AI ไม่สำเร็จ");

      // Save video to AFFI_PRO backend
      const uploadRes = await fetch("http://localhost:3001/api/worker/upload-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: message.queueJobId || "",
          filename: `clip_${message.productId || "product"}_${Date.now()}.mp4`,
          videoBase64: videoDataUrl,
        }),
      });
      const uploadResult = await uploadRes.json();
      if (!uploadResult.ok) throw new Error(uploadResult.error || "บันทึกคลิปไม่สำเร็จ");

      // Update content queue for the original bot's tracking
      const stored = await chrome.storage.local.get(CONTENT_QUEUE_KEY);
      const queue = Array.isArray(stored[CONTENT_QUEUE_KEY]) ? stored[CONTENT_QUEUE_KEY] : [];
      const job = queue.find((item) => item.id === message.queueJobId);
      if (job) {
        job.videoUrl = videoUrl;
        job.videoDataUrl = videoDataUrl;
        job.videoStatus = "completed";
        job.videoSaveStatus = "saved";
        job.updatedAt = Date.now();
        await chrome.storage.local.set({ [CONTENT_QUEUE_KEY]: queue });
      }

      // Clean up pending automation
      await chrome.storage.local.remove(CHAT_AUTOMATION_KEY);

      // Prepare TikTok post job
      const pending = await chrome.storage.local.get(CHAT_AUTOMATION_KEY);
      await prepareTikTokPostJob(message.queueJobId, message.productId, message.productName, videoDataUrl, videoType);

      return { ok: true, continue: false, merging: false };
    })().then(sendResponse).catch((error) => {
      console.error("[AFFI_PRO] Video save error:", error);
      sendResponse({ ok: false, error: error?.message });
    });
    return true;
  }

  // ─── Original: tiktok-post-bot.js sends "ads-stories-attach-tiktok-video-main" ───
  if (message?.type === "ads-stories-attach-tiktok-video-main") {
    (async () => {
      if (!sender.tab?.id) throw new Error("ไม่พบแท็บ TikTok Studio");
      const results = await chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        world: "MAIN",
        func: attachVideoInMainWorld,
        args: [message.dataUrl, message.fileName, message.contentType],
      });
      sendResponse(results?.[0]?.result || { ok: false, error: "ไม่ได้รับผลจาก TikTok Studio" });
    })().catch((error) => sendResponse({ ok: false, error: error?.message }));
    return true;
  }

  // ─── Original: tiktok-post-bot.js sends "ads-stories-attach-image-main" ───
  if (message?.type === "ads-stories-attach-image-main") {
    (async () => {
      if (!sender.tab?.id) throw new Error("ไม่พบแท็บ");
      const results = await chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        world: "MAIN",
        func: attachImageInMainWorld,
        args: [message.dataUrl, message.fileName, message.contentType],
      });
      sendResponse(results?.[0]?.result || { ok: false, error: "ไม่ได้รับผล" });
    })().catch((error) => sendResponse({ ok: false, error: error?.message }));
    return true;
  }

  // ─── Original: tiktok-post-bot.js needs-attention ───
  if (message?.type === "jarbland-v4-needs-attention") {
    console.warn("[AFFI_PRO] Needs attention:", message.reason || message.stage);
    sendResponse({ ok: true });
    return true;
  }

  // ─── Original: tiktok-post-bot.js sends "ads-stories-run-post-queue" ───
  if (message?.type === "ads-stories-run-post-queue") {
    console.log("[AFFI_PRO] Post queue trigger:", message.queueJobId);
    sendResponse({ ok: true });
    return true;
  }

  // ─── Dashboard: Start TikTok posting ───
  if (message.type === "AFFI_PRO_START_TIKTOK_POST") {
    (async () => {
      const job = message.job;
      await prepareTikTokPostJob(job.id, job.product_id, job.title, job.videoDataUrl || "", "video/mp4");
      const tab = await openOrReuseTikTokTab();
      return { ok: true, tabId: tab?.id };
    })().then(sendResponse).catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // ─── Bridge: Request launch Meta tab ───
  if (message.type === "AFFI_PRO_LAUNCH_META_TAB") {
    (async () => {
      // Delegate to START_META_JOB which does the full setup
      const job = message.job;
      if (job) {
        // Set up the pending automation and open Meta AI
        const imgData = job.cover_url ? await fetchImageAsDataUrl(job.cover_url) : { dataUrl: "", contentType: "" };
        let masterPrompt = job.masterPrompt || "";
        if (!masterPrompt) {
          try {
            const r = await fetch(`http://localhost:3001/api/worker/prompt/${job.product_id}`);
            masterPrompt = (await r.json()).prompt || "";
          } catch (e) {}
        }

        const automationId = `affi-pro-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await chrome.storage.local.set({
          [CHAT_AUTOMATION_KEY]: {
            automationId,
            queueJobId: job.id || "",
            productId: job.product_id,
            productName: job.title || "",
            imageUrl: job.cover_url || "",
            imageDataUrl: imgData.dataUrl,
            imageContentType: imgData.contentType,
            characterReferenceEnabled: false,
            characterImageDataUrl: "",
            prompt: masterPrompt,
            durationSeconds: 10,
            segmentDurations: [10],
            segmentIndex: 0,
            totalSegments: 1,
            createdAt: Date.now(),
            processing: false,
          },
        });
      }
      const tab = await openOrReuseChatGptTab(true);
      return { ok: true, tabId: tab?.id };
    })().then(sendResponse).catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // ─── Bridge: Request launch TikTok tab ───
  if (message.type === "AFFI_PRO_LAUNCH_TIKTOK_TAB") {
    (async () => {
      const job = message.job;
      if (job) {
        // Get video dataUrl from backend
        let videoDataUrl = "";
        if (job.video_path) {
          const filename = String(job.video_path).split(/[\\/]/).pop();
          try {
            const r = await fetch(`http://localhost:3001/downloads/${filename}`);
            if (r.ok) {
              const buf = await r.arrayBuffer();
              videoDataUrl = `data:video/mp4;base64,${arrayBufferToBase64(buf)}`;
            }
          } catch (e) {}
        }
        await prepareTikTokPostJob(
          job.id, job.product_id, job.title,
          videoDataUrl, "video/mp4",
          job.caption || "", job.cover_url || "", job.price || "",
          message.dryRun ?? true
        );
      }
      const tab = await openOrReuseTikTokTab();
      return { ok: true, tabId: tab?.id };
    })().then(sendResponse).catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

// ─── Prepare TikTok Post Job (sets chrome.storage.local for tiktok-post-bot.js) ───

async function prepareTikTokPostJob(
  jobId, productId, productName, videoDataUrl, videoType,
  caption, productImage, productPrice, dryRun = true
) {
  // Get caption from backend if not provided
  if (!caption && jobId) {
    try {
      const r = await fetch(`http://localhost:3001/api/worker/current-job?jobId=${encodeURIComponent(jobId)}`);
      const data = await r.json();
      if (data.success && data.job) {
        caption = data.job.caption || "";
        productImage = productImage || data.job.cover_url || "";
        productPrice = productPrice || data.job.price || "";
        if (!videoDataUrl && data.job.video_path) {
          const filename = String(data.job.video_path).split(/[\\/]/).pop();
          try {
            const vr = await fetch(`http://localhost:3001/downloads/${filename}`);
            if (vr.ok) {
              const buf = await vr.arrayBuffer();
              videoDataUrl = `data:video/mp4;base64,${arrayBufferToBase64(buf)}`;
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  if (!caption) {
    caption = `${productName || "สินค้าดี"}\nสนใจกดที่ตะกร้าเลย 🛒\n#tiktokป้ายยา #ของดีบอกต่อ #รีวิวของดี`;
  }

  // Set the post job exactly in the format tiktok-post-bot.js expects
  await chrome.storage.local.set({
    [POST_JOB_KEY]: {
      status: "ready",
      queueJobId: jobId || "",
      caption: caption,
      dryRun: dryRun,
      product: {
        productId: productId || "",
        name: productName || "",
        price: productPrice || "",
        image: productImage || "",
      },
      videoDataUrl: videoDataUrl || "",
      videoName: `clip_${productId || "product"}_${Date.now()}.mp4`,
      videoType: videoType || "video/mp4",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });

  console.log(`[AFFI_PRO] TikTok Post Job prepared: product=${productId}, caption=${caption.slice(0, 50)}`);
}

// ─── Auto sync on startup ───

chrome.runtime.onInstalled.addListener(() => {
  console.log("[AFFI_PRO Bridge] Extension installed. Running auto cookie extraction...");
  triggerAutoSync();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[AFFI_PRO Bridge] Browser started. Running auto cookie extraction...");
  triggerAutoSync();
});
