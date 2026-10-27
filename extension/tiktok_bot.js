const POST_JOB_KEY = "adsStoriesTikTokPostJob";
const POST_HISTORY_KEY = "adsStoriesTikTokPostHistory";
const POST_BOT_ID = "ads-stories-tiktok-post-bot";
const POST_BOT_VERSION = "3.6.68";
let cancelled = false;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(getValue, timeout = 60000, interval = 400) {
  const startedAt = Date.now();
  while (!cancelled && Date.now() - startedAt < timeout) {
    const value = getValue();
    if (value) return value;
    await wait(interval);
  }
  return null;
}

function isVisible(element) {
  if (!element) return false;
  const style = getComputedStyle(element);
  const rectangle = element.getBoundingClientRect();
  return style.display !== "none"
    && style.visibility !== "hidden"
    && Number(style.opacity || 1) > 0
    && rectangle.width > 0
    && rectangle.height > 0;
}

function textOf(element) {
  return [
    element?.textContent,
    element?.getAttribute?.("aria-label"),
    element?.getAttribute?.("title"),
    element?.getAttribute?.("placeholder"),
    element?.getAttribute?.("data-e2e"),
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function controlTextValues(element) {
  return [
    element?.innerText,
    element?.textContent,
    element?.getAttribute?.("aria-label"),
    element?.getAttribute?.("title"),
    element?.getAttribute?.("data-e2e"),
  ].filter(Boolean).map((value) => String(value).replace(/\s+/g, " ").trim());
}

function controlHasExactText(element, pattern) {
  return controlTextValues(element).some((value) => pattern.test(value));
}

async function updateJob(patch) {
  const stored = await chrome.storage.local.get(POST_JOB_KEY);
  const current = stored[POST_JOB_KEY] || {};
  const updated = { ...current, ...patch, updatedAt: Date.now() };
  await chrome.storage.local.set({ [POST_JOB_KEY]: updated });
  return updated;
}

function showStatus(message, type = "working", actions = []) {
  let box = document.querySelector(`#${POST_BOT_ID}`);
  if (!box) {
    box = document.createElement("section");
    box.id = POST_BOT_ID;
    document.documentElement.appendChild(box);
  }
  const background = type === "success" ? "#166534" : type === "error" ? "#a92f32" : "#18181b";
  box.style.cssText = `position:fixed;right:18px;top:18px;z-index:2147483647;width:min(380px,calc(100vw - 36px));padding:15px 16px;border-radius:14px;background:${background};color:#fff;box-shadow:0 18px 55px rgba(0,0,0,.35);font:13px/1.55 Tahoma,sans-serif;pointer-events:none`;
  box.replaceChildren();
  const title = document.createElement("b");
  title.textContent = `JarbLand AutoFlow · TikTok BOT · V${POST_BOT_VERSION}`;
  title.style.cssText = "display:block;margin-bottom:5px;font-size:14px";
  const body = document.createElement("div");
  body.textContent = message;
  box.append(title, body);
  if (actions.length) {
    const controls = document.createElement("div");
    controls.style.cssText = "display:flex;gap:8px;margin-top:11px";
    actions.forEach(({ label, onClick }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.style.cssText = "border:0;border-radius:9px;padding:8px 11px;background:#fff;color:#18181b;font:700 11px Tahoma;cursor:pointer;pointer-events:auto";
      button.addEventListener("click", onClick, { once: true });
      controls.appendChild(button);
    });
    box.appendChild(controls);
  }
}

function dataUrlToFile(dataUrl, name, contentType) {
  const binary = atob(String(dataUrl).split(",")[1] || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name || "video.mp4", { type: contentType || "video/mp4" });
}

function findVideoInput() {
  return [...document.querySelectorAll("input[type='file']")].find((input) => {
    const accept = input.accept || "";
    return !input.disabled && (!accept || /video|mp4|webm|quicktime/i.test(accept));
  }) || null;
}

function findControl(pattern, root = document) {
  const candidates = [...root.querySelectorAll("button, [role='button'], [role='menuitem'], [role='option'], label")]
    .filter((element) => isVisible(element)
      && !element.closest(`#${POST_BOT_ID}`)
      && !element.disabled
      && element.getAttribute("aria-disabled") !== "true"
      && pattern.test(textOf(element)));
  if (!candidates.length) return null;
  return candidates.sort((left, right) => textOf(left).length - textOf(right).length)[0];
}

function isTopmostControl(element) {
  if (!element || !isVisible(element)) return false;
  const rectangle = element.getBoundingClientRect();
  const x = Math.max(0, Math.min(window.innerWidth - 1, rectangle.left + rectangle.width / 2));
  const y = Math.max(0, Math.min(window.innerHeight - 1, rectangle.top + rectangle.height / 2));
  const topElement = document.elementFromPoint(x, y);
  return Boolean(topElement
    && (topElement === element || element.contains(topElement) || topElement.contains(element)));
}

function findTopmostDialogControl(pattern) {
  const candidates = [...document.querySelectorAll("button, [role='button']")]
    .filter((element) => isVisible(element)
      && !element.closest(`#${POST_BOT_ID}`)
      && !element.disabled
      && element.getAttribute("aria-disabled") !== "true"
      && element.closest("[role='dialog'], [aria-modal='true']")
      && pattern.test(textOf(element).trim())
      && isTopmostControl(element));
  if (!candidates.length) return null;
  return candidates.sort((left, right) => {
    const leftRectangle = left.getBoundingClientRect();
    const rightRectangle = right.getBoundingClientRect();
    return (rightRectangle.bottom - leftRectangle.bottom)
      || (rightRectangle.right - leftRectangle.right)
      || (textOf(left).length - textOf(right).length);
  })[0];
}

async function clickTikTokControl(control) {
  if (!control) return false;
  control.scrollIntoView({ block: "center", inline: "center" });
  const rectangle = control.getBoundingClientRect();
  const result = await chrome.runtime.sendMessage({
    type: "ads-stories-click-tiktok-control-debugger",
    point: {
      x: Math.round(rectangle.left + rectangle.width / 2),
      y: Math.round(rectangle.top + rectangle.height / 2),
    },
  });
  if (!result?.ok) throw new Error(result?.error || "คลิกปุ่ม TikTok ไม่สำเร็จ");
  return true;
}

async function activateTikTokControl(control, successCheck, timeout = 6000) {
  if (!control) return false;
  try {
    await clickTikTokControl(control);
  } catch {
    // Continue with the page's DOM event handlers below.
  }
  let succeeded = await waitFor(successCheck, Math.min(timeout, 2500), 200);
  if (succeeded) return true;

  if (control.isConnected) {
    control.scrollIntoView({ block: "center", inline: "center" });
    control.focus({ preventScroll: true });
    control.click();
  }
  succeeded = await waitFor(successCheck, Math.min(timeout, 3000), 200);
  if (succeeded) return true;

  if (control.isConnected) {
    control.focus({ preventScroll: true });
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    control.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
  }
  return Boolean(await waitFor(successCheck, timeout, 200));
}

function findContinueEditingControl() {
  const pageText = String(document.body?.innerText || "").replace(/\s+/g, " ");
  const hasResumeNotice = /video (?:you are|you're) editing.{0,80}(?:not been saved|was not saved)|continue editing|แก้ไขต่อหรือไม่|ไม่ได้รับการบันทึก/i.test(pageText);
  if (!hasResumeNotice) return null;
  return findControl(/^(?:continue|continue editing|resume|ดำเนินการต่อ|แก้ไขต่อ)$/i);
}

async function resumeTikTokDraftIfNeeded() {
  const control = findContinueEditingControl();
  if (!control) return false;
  showStatus("TikTok พบวิดีโอร่างเดิม กำลังกดดำเนินการต่ออัตโนมัติ...", "working", [{ label: "■ หยุด BOT", onClick: cancelBot }]);
  await activateTikTokControl(
    control,
    () => !findContinueEditingControl() || videoPreviewIsReady() || nativeVideoEditorIsReady(),
    12000,
  );
  await wait(1200);
  return true;
}

async function uploadVideo(job) {
  let input = findVideoInput();
  if (!input) {
    const uploadControl = findControl(/select video|upload video|select file|upload|choose file|เลือกวิดีโอ|อัปโหลด|เลือกไฟล์/i);
    if (uploadControl) uploadControl.click();
    input = await waitFor(findVideoInput, 90000, 500);
  }
  if (!input) throw new Error("ไม่พบช่องอัปโหลดวิดีโอ กรุณาเข้าระบบ TikTok Studio แล้วลองใหม่");

  if (!job.videoDataUrl) throw new Error("งานโพสต์ไม่มีไฟล์วิดีโอที่เตรียมไว้");
  const uploadResult = await chrome.runtime.sendMessage({
    type: "ads-stories-attach-tiktok-video-main",
    dataUrl: job.videoDataUrl,
    fileName: job.videoName || "video.mp4",
    contentType: job.videoType || "video/mp4",
  });
  if (!uploadResult?.ok) throw new Error(uploadResult?.error || "TikTok Studio ไม่รับไฟล์วิดีโอ");

  // input.files can be non-empty for only a fraction of a second before TikTok
  // rejects a synthetic selection. Never count that transient state as success.
  // Continue only after TikTok exposes a durable preview/editor signal.
  let readySince = 0;
  const accepted = await waitFor(() => {
    const ready = videoPreviewIsReady() || uploadHasCompletedSignal() || nativeVideoEditorIsReady();
    if (!ready) {
      readySince = 0;
      return false;
    }
    if (!readySince) readySince = Date.now();
    return Date.now() - readySince >= 2500;
  }, 25000, 300);
  if (accepted) return true;

  // TikTok occasionally accepts the file but leaves its upload surface on an
  // endless spinner. Do not fall into the 15-minute manual-upload wait. Keep
  // the job, reload the upload page and let TikTok restore the draft instead.
  await recoverStalledVideoProcessing(job);
  return null;
}

function findCaptionEditor() {
  const candidates = [...document.querySelectorAll([
    "textarea[placeholder*='caption' i]",
    "textarea[placeholder*='description' i]",
    "[contenteditable]:not([contenteditable='false'])",
    "[role='textbox']",
    "textarea",
  ].join(","))].filter((element) => isVisible(element) && !element.closest(`#${POST_BOT_ID}`));
  const scored = candidates.map((element) => {
    let score = 0;
    const ownText = textOf(element);
    if (/caption|description|describe|tell viewers|แคปชัน|คำอธิบาย|บรรยาย/i.test(ownText)) score += 100;
    if (element instanceof HTMLTextAreaElement) score += 8;
    if (element.isContentEditable) score += 8;
    const rectangle = element.getBoundingClientRect();
    if (rectangle.width >= 250 && rectangle.height >= 35) score += 5;
    let container = element.parentElement;
    for (let level = 0; container && level < 6; level += 1, container = container.parentElement) {
      const context = textOf(container);
      if (context.length > 12000) break;
      if (/description|caption|คำอธิบาย|แคปชัน/i.test(context)) score += 25;
      if (/\d+\s*\/\s*4000/.test(context)) score += 40;
    }
    return { element, score };
  }).sort((left, right) => right.score - left.score);
  if (scored[0]?.score >= 20) return scored[0].element;
  return candidates.length === 1 ? candidates[0] : null;
}

function editorValue(editor) {
  return String(editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement
    ? editor.value
    : editor.textContent || "").trim();
}

function fillEditor(editor, value) {
  editor.focus();
  if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
    const prototype = editor instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(editor, value);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  if (!document.execCommand("insertText", false, value)) editor.textContent = value;
  editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  editor.dispatchEvent(new Event("change", { bubbles: true }));
}

async function fillTikTokTextControl(control, text) {
  control.scrollIntoView({ block: "center", inline: "center" });
  const rectangle = control.getBoundingClientRect();
  const result = await chrome.runtime.sendMessage({
    type: "ads-stories-fill-tiktok-text-debugger",
    point: {
      x: Math.round(rectangle.left + Math.min(rectangle.width / 2, 220)),
      y: Math.round(rectangle.top + Math.min(rectangle.height / 2, 45)),
    },
    text,
  });
  if (!result?.ok) throw new Error(result?.error || "พิมพ์ข้อความ TikTok ไม่สำเร็จ");
}

async function pressTikTokEnter(control) {
  control.scrollIntoView({ block: "center", inline: "center" });
  const rectangle = control.getBoundingClientRect();
  const result = await chrome.runtime.sendMessage({
    type: "ads-stories-press-tiktok-enter-debugger",
    point: {
      x: Math.round(rectangle.left + Math.min(rectangle.width / 2, 220)),
      y: Math.round(rectangle.top + rectangle.height / 2),
    },
  });
  if (!result?.ok) throw new Error(result?.error || "กด Enter เพื่อค้นหาสินค้าไม่สำเร็จ");
  return true;
}

async function fillCaption(caption) {
  const editor = await waitFor(findCaptionEditor, 8 * 60 * 1000, 600);
  if (!editor) throw new Error("ไม่พบช่องแคปชันหลังอัปโหลดวิดีโอ");
  await fillTikTokTextControl(editor, caption);
  const accepted = await waitFor(() => editorValue(editor).length >= caption.length * 0.8, 15000, 300);
  if (!accepted) throw new Error("TikTok Studio ยังไม่รับข้อความแคปชัน");
  return editor;
}

function pageHasApplicationError() {
  return [...document.querySelectorAll("h1, h2, h3, [role='alert'], button, p, div")].some((element) => {
    if (!isVisible(element) || element.closest(`#${POST_BOT_ID}`)) return false;
    const text = textOf(element);
    return /something went wrong|an error occurred|เกิดข้อผิดพลาด/i.test(text) && text.length < 300;
  });
}

function productLinkWasRejected() {
  return [...document.querySelectorAll("[role='alert'], [role='status'], [class*='toast' i], [class*='Toast'], p, span, div")]
    .some((element) => {
      if (!isVisible(element) || element.closest(`#${POST_BOT_ID}`)) return false;
      const text = textOf(element);
      return text.length < 180 && /couldn['’]?t add product link|cannot add product link|เพิ่มลิงก์สินค้าไม่สำเร็จ/i.test(text);
    });
}

function uploadIsBusy() {
  return [...document.querySelectorAll("[role='progressbar'], progress, span, p, div")].some((element) => {
    if (!isVisible(element) || element.closest(`#${POST_BOT_ID}`)) return false;
    const text = textOf(element);
    return /uploading|processing|preparing|transcoding|กำลังอัปโหลด|กำลังประมวลผล|กำลังเตรียม/i.test(text)
      || /^\s*\d{1,2}%\s*$/.test(text);
  });
}

function videoPreviewIsReady() {
  return [...document.querySelectorAll("video, [data-e2e*='video'], [data-testid*='video']")].some((element) => {
    if (!isVisible(element) || element.closest(`#${POST_BOT_ID}`)) return false;
    if (element instanceof HTMLVideoElement) return element.readyState >= 1 || Boolean(element.currentSrc || element.src);
    const rectangle = element.getBoundingClientRect();
    return rectangle.width >= 120 && rectangle.height >= 120;
  });
}

function uploadHasCompletedSignal() {
  const candidates = [...document.querySelectorAll("[role='status'], [role='alert'], span, p, div")];
  return candidates.some((element) => {
    if (!isVisible(element) || element.closest(`#${POST_BOT_ID}`)) return false;
    const text = textOf(element);
    if (!text || text.length > 180) return false;
    return /^uploaded(?:\s*\([^)]*\))?$/i.test(text)
      || /upload complete|uploaded successfully|upload successful|finished uploading|อัปโหลดแล้ว|อัปโหลดสำเร็จ|อัพโหลดแล้ว|อัพโหลดสำเร็จ/i.test(text)
      || /(?:✓|✔|check).{0,35}(?:mb|gb)/i.test(text);
  });
}

function uploadPageEditorIsReady() {
  return Boolean(findCaptionEditor())
    && [...document.querySelectorAll("button, [role='button'], textarea, [contenteditable]:not([contenteditable='false']), [role='textbox']")]
      .some((element) => isVisible(element) && !element.closest(`#${POST_BOT_ID}`));
}

function nativeVideoEditorIsReady() {
  if (!findCaptionEditor()) return false;
  const pageText = String(document.body?.innerText || "").replace(/\s+/g, " ");
  return /edit cover|cover|add link|location|เลือกหน้าปก|หน้าปก|เพิ่มลิงก์|ตำแหน่งที่ตั้ง/i.test(pageText);
}

function uploadProgressSignature() {
  return [...document.querySelectorAll("[role='progressbar'], progress, [aria-valuenow]")]
    .filter((element) => isVisible(element) && !element.closest(`#${POST_BOT_ID}`))
    .map((element) => [
      element.getAttribute("aria-valuenow") || "",
      element.getAttribute("aria-valuetext") || "",
      textOf(element).slice(0, 80),
    ].join(":"))
    .join("|");
}

async function recoverStalledVideoProcessing(job) {
  const recoveryCount = Number(job.processingRecoveryCount || 0);
  if (recoveryCount >= 2) {
    throw new Error("TikTok Studio ค้างหลังลอง Reload อัตโนมัติแล้ว 2 ครั้ง กรุณาตรวจสอบหน้าเว็บ");
  }
  await updateJob({
    status: "ready",
    processingRecoveryCount: recoveryCount + 1,
    processingRecoveryAt: Date.now(),
    error: "",
  });
  showStatus(`TikTok Studio ไม่มีความคืบหน้า กำลัง Reload และลองอัปโหลดใหม่อัตโนมัติ (${recoveryCount + 1}/2)...`, "working", [{ label: "■ หยุด BOT", onClick: cancelBot }]);
  setTimeout(() => location.reload(), 350);
  return false;
}

async function waitForVideoProcessingComplete(job, timeout = 10 * 60 * 1000) {
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let lastProgressSignature = uploadProgressSignature();
  let lastReadySignal = false;
  let readySince = 0;
  while (!cancelled && Date.now() - startedAt < timeout) {
    if (pageHasApplicationError()) throw new Error("TikTok Studio ขึ้นว่าเกิดข้อผิดพลาด BOT หยุดแล้วและจะไม่กดซ้ำ");
    const readySignal = videoPreviewIsReady() || uploadHasCompletedSignal() || nativeVideoEditorIsReady();
    const editorReady = uploadPageEditorIsReady();
    const busy = uploadIsBusy();
    const progressSignature = uploadProgressSignature();
    if (progressSignature !== lastProgressSignature || readySignal !== lastReadySignal) {
      lastProgressAt = Date.now();
      lastProgressSignature = progressSignature;
      lastReadySignal = readySignal;
    }
    const ready = readySignal && editorReady && !busy;
    if (ready) {
      if (!readySince) readySince = Date.now();
      if (Date.now() - readySince >= 4000) return true;
    } else {
      readySince = 0;
    }
    // A 10-second video should not sit on an unchanged upload/processing UI
    // indefinitely. Preserve the job and retry the page automatically.
    if (Date.now() - lastProgressAt >= 75 * 1000) {
      return recoverStalledVideoProcessing(job);
    }
    await wait(700);
  }
  throw new Error("รอ TikTok ประมวลผลวิดีโอเกิน 10 นาที BOT จึงหยุดก่อนติดสินค้า");
}

async function waitForNativeVideoSelection(timeout = 15 * 60 * 1000) {
  const startedAt = Date.now();
  while (!cancelled && Date.now() - startedAt < timeout) {
    if (pageHasApplicationError()) {
      throw new Error("TikTok Studio เกิดข้อผิดพลาดก่อนเลือกวิดีโอ กรุณาปิดแท็บนี้แล้วเริ่มงานใหม่");
    }
    const input = findVideoInput();
    const selectedNatively = Boolean(input?.files?.length);
    const editorReady = Boolean(findCaptionEditor());
    if (selectedNatively
      || uploadHasCompletedSignal()
      || nativeVideoEditorIsReady()
      || (editorReady && videoPreviewIsReady())) return true;
    await wait(600);
  }
  throw new Error("รอเลือกวิดีโอใน TikTok Studio เกิน 15 นาที กรุณาเริ่มงานใหม่");
}

function visiblePageContains(value) {
  if (!value) return false;
  return [...document.querySelectorAll("body *")].some((element) => {
    if (!isVisible(element) || element.closest(`#${POST_BOT_ID}`)) return false;
    const text = textOf(element);
    return text.includes(value) && text.length < 500;
  });
}

function findProductLinkSection() {
  const labels = [...document.querySelectorAll("h1, h2, h3, h4, label, span, div, p")]
    .filter((element) => isVisible(element)
      && !element.closest(`#${POST_BOT_ID}`)
      && !element.closest("[role='dialog'], [aria-modal='true']")
      && /^(add link|เพิ่มลิงก์)$/i.test(textOf(element)));
  const sections = [];
  for (const label of labels) {
    let section = label.closest("[class*='anchor-entry-container']") || label.parentElement;
    for (let level = 0; section && level < 6; level += 1, section = section.parentElement) {
      if (!sections.includes(section)) sections.push(section);
    }
  }
  const scored = sections.map((section) => {
    const rectangle = section.getBoundingClientRect();
    const controls = [...section.querySelectorAll("button, [role='button']")].filter(isVisible);
    const hasAdd = controls.some((element) => /^(?:\+?\s*add|เพิ่ม)$/i.test(textOf(element)));
    const hasImage = [...section.querySelectorAll("img")].some(isVisible);
    let score = hasAdd ? 100 : 0;
    if (hasImage) score += 35;
    if (rectangle.width >= 220 && rectangle.height >= 40 && rectangle.height <= 360) score += 25;
    if (textOf(section).length < 1000) score += 10;
    score -= Math.max(0, rectangle.height - 360) / 10;
    return { section, score };
  }).sort((left, right) => right.score - left.score || textOf(left.section).length - textOf(right.section).length);
  return scored[0]?.score >= 100 ? scored[0].section : null;
}

function findAddProductButton() {
  const section = findProductLinkSection();
  if (!section) return null;
  const candidates = [...section.querySelectorAll("button, [role='button']")]
    .filter((element) => isVisible(element)
      && !element.disabled
      && element.getAttribute("aria-disabled") !== "true"
      && /^(?:\+?\s*add|เพิ่ม|add product|เพิ่มสินค้า)$/i.test(textOf(element)));
  return candidates.length === 1 ? candidates[0] : null;
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function findProductRowById(productId) {
  const targetId = digitsOnly(productId);
  if (!targetId) return null;
  const matches = [...document.querySelectorAll("tr, li, label, [role='option'], [role='row'], div, span, p")]
    .filter((element) => {
      if (!isVisible(element) || element.closest(`#${POST_BOT_ID}`)) return false;
      const text = textOf(element);
      return text.length > 0 && text.length < 1400 && digitsOnly(text).includes(targetId);
    })
    .sort((left, right) => textOf(left).length - textOf(right).length);

  for (const match of matches) {
    let row = match;
    for (let level = 0; row && level < 8; level += 1, row = row.parentElement) {
      if (!digitsOnly(textOf(row)).includes(targetId) || textOf(row).length >= 1400) continue;
      const roleSelector = row.querySelector("[role='radio']");
      if (roleSelector && isVisible(roleSelector)) return { row, selector: roleSelector };
      const nativeSelector = row.querySelector("input[type='radio'], input[type='checkbox']");
      if (nativeSelector) {
        const visibleLabel = nativeSelector.closest("label") || row.querySelector("label");
        return { row, selector: isVisible(nativeSelector) ? nativeSelector : (visibleLabel || row) };
      }
      if (/^(TR|LI|LABEL)$/.test(row.tagName) || /^(option|row)$/i.test(row.getAttribute("role") || "")) {
        return { row, selector: row };
      }
    }
  }
  return matches[0] ? { row: matches[0], selector: matches[0] } : null;
}

function findProductSearchButton(search) {
  if (!search || !isVisible(search)) return null;
  const dialog = search.closest("[role='dialog'], [aria-modal='true']") || document;
  const searchRectangle = search.getBoundingClientRect();
  const searchCenterY = searchRectangle.top + searchRectangle.height / 2;
  const candidates = [...dialog.querySelectorAll("button, [role='button']")]
    .filter((element) => {
      if (!isVisible(element) || element.disabled || element.getAttribute("aria-disabled") === "true") return false;
      if (element.closest(`#${POST_BOT_ID}`) || !isTopmostControl(element)) return false;
      const rectangle = element.getBoundingClientRect();
      const centerY = rectangle.top + rectangle.height / 2;
      const nearRightEdge = rectangle.left >= searchRectangle.right - 100
        && rectangle.right <= searchRectangle.right + 100;
      return nearRightEdge && Math.abs(centerY - searchCenterY) <= Math.max(32, searchRectangle.height);
    })
    .map((element) => {
      const rectangle = element.getBoundingClientRect();
      const label = textOf(element).toLowerCase();
      let score = 0;
      if (/search|ค้นหา/.test(label)) score += 120;
      if (element.querySelector("svg")) score += 50;
      if (rectangle.width <= 80 && rectangle.height <= 80) score += 30;
      score -= Math.abs(rectangle.right - searchRectangle.right);
      return { element, score };
    })
    .sort((left, right) => right.score - left.score);
  return candidates[0]?.element || null;
}

async function attachProduct(product) {
  if (productAppearsAttached(product)) return true;
  if (pageHasApplicationError()) throw new Error("TikTok Studio ขึ้นว่าเกิดข้อผิดพลาดก่อติดสินค้า");
  const addProduct = await waitFor(() => {
    if (pageHasApplicationError()) throw new Error("TikTok Studio ขึ้นว่าเกิดข้อผิดพลาดขณะรอปุ่มเพิ่มสินค้า");
    return findAddProductButton();
  }, 120000, 600);
  if (!addProduct) throw new Error("ไม่พบปุ่มเพิ่มสินค้าหรือติดลิงก์ใน TikTok Studio");
  await clickTikTokControl(addProduct);
  const dialogOpened = await waitFor(productSelectionDialogIsOpen, 15000, 300);
  if (!dialogOpened) throw new Error("กดปุ่มเพิ่มสินค้าแล้ว แต่หน้าต่างเลือกสินค้าไม่เปิด BOT จึงหยุดก่อน Post");
  if (pageHasApplicationError()) throw new Error("TikTok Studio ขึ้นว่าเกิดข้อผิดพลาดหลังกดเพิ่มสินค้า BOT จะไม่กดต่อ");

  const findProductSearch = () => [...document.querySelectorAll("input")]
    .filter((input) => isVisible(input)
      && !input.closest(`#${POST_BOT_ID}`)
      && /search products?|search items?|ค้นหาสินค้า/i.test(textOf(input)))
    .sort((left, right) => {
      const leftInDialog = left.closest("[role='dialog'], [aria-modal='true']") ? 1 : 0;
      const rightInDialog = right.closest("[role='dialog'], [aria-modal='true']") ? 1 : 0;
      return rightInDialog - leftInDialog;
    })[0] || null;

  let search = await waitFor(findProductSearch, 2500, 250);
  if (!search) {
    const linkTypeNext = await waitFor(
      () => findTopmostDialogControl(/^(next|ถัดไป)$/i),
      15000,
      250,
    );
    if (!linkTypeNext) throw new Error("ไม่พบปุ่มถัดไปในหน้าต่างประเภทลิงก์สินค้า");
    await clickTikTokControl(linkTypeNext);
    search = await waitFor(findProductSearch, 30000, 350);
  }
  if (search) {
    await fillTikTokTextControl(search, product.productId);
    const searchAccepted = await waitFor(() => String(search.value || "").includes(product.productId), 10000, 250);
    if (!searchAccepted) throw new Error("TikTok ไม่รับ Product ID ในช่องค้นหา BOT จึงหยุดก่อน Post");
    showStatus(`ใส่ Product ID ${product.productId} แล้ว กำลังกดแว่นขยายค้นหา...`, "working", [{ label: "■ หยุด BOT", onClick: cancelBot }]);
    const searchButton = await waitFor(() => findProductSearchButton(search), 5000, 250);
    if (searchButton) await clickTikTokControl(searchButton);
    else await pressTikTokEnter(search);
    await wait(1200);
  }
  const productDialog = search?.closest("[role='dialog'], [aria-modal='true']");
  if (!search || (!productDialog && !productSelectionDialogIsOpen())) {
    throw new Error("ไม่พบช่องค้นหาในหน้าต่างเลือกสินค้า TikTok");
  }

  let productMatch = await waitFor(() => findProductRowById(product.productId), 12000, 500);
  if (!productMatch) {
    showStatus("ผลค้นหายังไม่เปลี่ยน กำลังกด Enter ค้นหาอีกครั้ง...", "working", [{ label: "■ หยุด BOT", onClick: cancelBot }]);
    await pressTikTokEnter(search);
    productMatch = await waitFor(() => findProductRowById(product.productId), 48000, 500);
  }
  if (!productMatch) throw new Error(`ไม่พบ Product ID ${product.productId} ในหน้าเลือกสินค้า`);
  await clickTikTokControl(productMatch.selector);
  const productNext = await waitFor(
    () => findTopmostDialogControl(/^(next|ถัดไป)$/i),
    15000,
    250,
  );
  if (!productNext) throw new Error("เลือกสินค้าแล้ว แต่ไม่พบปุ่มถัดไปที่กดได้");
  await clickTikTokControl(productNext);

  const finalAdd = await waitFor(
    () => {
      if (productLinkWasRejected()) throw new Error(`TikTok ปฏิเสธการเพิ่มลิงก์สินค้า Product ID ${product.productId} (Couldn't add product link) BOT หยุดก่อน Post กรุณาตรวจสิทธิ์และสถานะสินค้านี้ใน TikTok Studio`);
      if (!productSelectionDialogIsOpen() && productAppearsAttached(product)) return true;
      return findTopmostDialogControl(/^(add|เพิ่ม)$/i);
    },
    20000,
    300,
  );
  if (finalAdd === true) return true;
  if (!finalAdd) throw new Error("ผ่านหน้ารายการสินค้าแล้ว แต่ไม่พบปุ่มเพิ่มในหน้าตั้งชื่อลิงก์");
  await clickTikTokControl(finalAdd);

  const productDialogClosed = await waitFor(
    () => {
      if (productLinkWasRejected()) throw new Error(`TikTok ปฏิเสธการเพิ่มลิงก์สินค้า Product ID ${product.productId} BOT หยุดก่อน Post`);
      return !productSelectionDialogIsOpen() && productAppearsAttached(product);
    },
    30000,
    500,
  );
  if (!productDialogClosed) return false;
  await wait(900);
  return true;
}

function productSelectionDialogIsOpen() {
  return [...document.querySelectorAll("[role='dialog'], [aria-modal='true']")]
    .some((element) => isVisible(element) && !element.closest(`#${POST_BOT_ID}`));
}

function productAppearsAttached(product) {
  const container = findProductLinkSection();
  if (!container) return false;
  const productName = String(product.name || "").trim();
  const values = [product.productId, productName.slice(0, 10), productName.slice(0, 16)].filter(Boolean);
  const text = textOf(container);
  if (values.some((value) => text.includes(value))) return true;
  const hasProductImage = [...container.querySelectorAll("img")].some((image) => isVisible(image));
  const hasRemoveControl = [...container.querySelectorAll("button, [role='button']")]
    .some((element) => isVisible(element) && /remove|delete|ลบ|เอาออก|×|✕/i.test(textOf(element) || element.getAttribute("aria-label") || ""));
  const residue = text.replace(/add link|เพิ่มลิงก์|^add$|^เพิ่ม$/gi, "").trim();
  if (residue.length >= 4 && (hasProductImage || hasRemoveControl)) return true;

  const label = [...document.querySelectorAll("h1, h2, h3, h4, label, span, div, p")]
    .find((element) => isVisible(element)
      && !element.closest(`#${POST_BOT_ID}`)
      && !element.closest("[role='dialog'], [aria-modal='true']")
      && /^(add link|เพิ่มลิงก์)$/i.test(textOf(element)));
  if (!label || !productName) return false;
  const labelRectangle = label.getBoundingClientRect();
  const namePrefix = productName.slice(0, 10);
  return [...document.querySelectorAll("span, div, p, b")].some((element) => {
    if (!isVisible(element)
      || element.closest(`#${POST_BOT_ID}`)
      || element.closest("[role='dialog'], [aria-modal='true']")) return false;
    const candidateText = textOf(element);
    if (!candidateText.includes(namePrefix) || candidateText.length > 300) return false;
    const rectangle = element.getBoundingClientRect();
    return rectangle.left >= labelRectangle.left - 80
      && rectangle.left <= labelRectangle.left + 760
      && rectangle.top >= labelRectangle.top - 60
      && rectangle.top <= labelRectangle.bottom + 220;
  });
}

function requestManualProductConfirmation(product, timeout) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), timeout);
    showStatus(`BOT หยุดพักแล้ว กรุณากด + Add เลือกสินค้า Product ID ${product.productId} และกด Next ให้หน้าต่างปิด จากนั้นกดปุ่มทำต่อด้านล่าง`, "working", [
      { label: "✓ เลือกสินค้าเสร็จแล้ว — ทำต่อ", onClick: () => finish(true) },
      { label: "■ หยุด BOT", onClick: async () => { await cancelBot(); finish(false); } },
    ]);
  });
}

async function waitForManualProductAttachment(product, timeout = 15 * 60 * 1000) {
  const startedAt = Date.now();
  while (!cancelled && Date.now() - startedAt < timeout) {
    const remaining = timeout - (Date.now() - startedAt);
    const confirmed = await requestManualProductConfirmation(product, remaining);
    if (!confirmed || cancelled) break;
    await wait(700);
    if (productLinkWasRejected()) {
      throw new Error(`TikTok ปฏิเสธการเพิ่มลิงก์สินค้า Product ID ${product.productId} (Couldn't add product link) BOT หยุดก่อน Post กรุณาตรวจสิทธิ์และสถานะสินค้านี้ใน TikTok Studio`);
    }
    if (pageHasApplicationError()) {
      throw new Error("TikTok Studio เกิดข้อผิดพลาดหลังยืนยันสินค้า BOT หยุดแล้วและจะไม่กด Post");
    }
    if (!productSelectionDialogIsOpen() && productAppearsAttached(product)) return true;
    showStatus("ยังไม่พบสินค้าที่ติดไว้ กรุณาเลือกสินค้าและกด Next ให้หน้าต่างปิดก่อน แล้วกดทำต่ออีกครั้ง", "error");
    await wait(900);
  }
  throw new Error(`ยังไม่ยืนยันการติดสินค้า Product ID ${product.productId} BOT จึงหยุดก่อนโพสต์`);
}

function findPostButton() {
  const directSelectors = [
    "#root > div > div > div.css-fsbw52.ep9i2zp0 > div.css-86gjln.edss2sz6 > div > div > div > div > div > div.jsx-1566941760.footer > div > button.Button__root.Button__root--shape-default.Button__root--size-large.Button__root--type-primary",
    "#root .footer button.Button__root--type-primary",
    "#root [class~='footer'] button[class*='Button__root--type-primary']",
    "button[data-e2e='post_video_button']",
    "button[data-e2e*='post'][class*='Button__root--type-primary']",
  ];
  for (const selector of directSelectors) {
    const directButton = document.querySelector(selector);
    if (directButton
      && isVisible(directButton)
      && !directButton.closest(`#${POST_BOT_ID}`)
      && !directButton.disabled
      && directButton.getAttribute("aria-disabled") !== "true"
      && getComputedStyle(directButton).pointerEvents !== "none"
      && controlHasExactText(directButton, /^(post|post now|publish|โพสต์|โพสต์ตอนนี้|เผยแพร่)$/i)) {
      return directButton;
    }
  }

  const candidates = [...document.querySelectorAll("button, [role='button']")]
    .filter((element) => isVisible(element)
      && !element.closest(`#${POST_BOT_ID}`)
      && !element.disabled
      && element.getAttribute("aria-disabled") !== "true"
      && getComputedStyle(element).pointerEvents !== "none"
      && controlHasExactText(element, /^(post|post now|publish|โพสต์|โพสต์ตอนนี้|เผยแพร่)$/i));
  if (!candidates.length) return null;
  const scored = candidates.map((element) => {
    let score = element instanceof HTMLButtonElement ? 20 : 0;
    const rectangle = element.getBoundingClientRect();
    score += Math.min(30, Math.max(0, rectangle.top / 100));
    if (rectangle.top >= window.innerHeight * 0.5) score += 90;
    if (rectangle.width >= 90) score += 15;
    if (rectangle.left < 190) score -= 120;
    const style = getComputedStyle(element);
    if (style.backgroundColor && !/rgba?\(0,\s*0,\s*0(?:,\s*0)?\)|transparent/i.test(style.backgroundColor)) score += 15;
    let container = element.parentElement;
    let hasPostFooterContext = false;
    let hasNavigationContext = false;
    for (let level = 0; container && level < 5; level += 1, container = container.parentElement) {
      const context = textOf(container);
      if (/save draft|discard|บันทึกแบบร่าง|ละทิ้ง/i.test(context)) hasPostFooterContext = true;
      if (/home|analytics|comments|หน้าหลัก|การวิเคราะห์|ความคิดเห็น/i.test(context) && context.length < 800) hasNavigationContext = true;
    }
    if (hasPostFooterContext) score += 140;
    if (hasNavigationContext) score -= 120;
    return { element, score, top: rectangle.top };
  }).sort((left, right) => right.score - left.score || right.top - left.top);
  return scored[0]?.score >= 60 ? scored[0].element : null;
}

function findScheduleSubmitButton() {
  const candidates = [...document.querySelectorAll("button, [role='button']")]
    .filter((element) => isVisible(element)
      && !element.closest(`#${POST_BOT_ID}`)
      && !element.disabled
      && element.getAttribute("aria-disabled") !== "true"
      && getComputedStyle(element).pointerEvents !== "none"
      && controlHasExactText(element, /^(schedule|schedule post|ตั้งเวลา|ตั้งเวลาโพสต์|กำหนดเวลา)$/i));
  if (!candidates.length) return null;
  const scored = candidates.map((element) => {
    const rectangle = element.getBoundingClientRect();
    let score = element instanceof HTMLButtonElement ? 20 : 0;
    score += Math.min(30, Math.max(0, rectangle.top / 100));
    if (rectangle.top >= window.innerHeight * 0.5) score += 90;
    if (rectangle.width >= 90) score += 15;
    if (rectangle.left < 190) score -= 120;
    if (element.closest("[role='radio'],[role='radiogroup'],label")) score -= 150;
    const style = getComputedStyle(element);
    if (style.backgroundColor && !/rgba?\(0,\s*0,\s*0(?:,\s*0)?\)|transparent/i.test(style.backgroundColor)) score += 15;
    let container = element.parentElement;
    for (let level = 0; container && level < 6; level += 1, container = container.parentElement) {
      const context = textOf(container);
      if (/save draft|discard|บันทึกแบบร่าง|ละทิ้ง/i.test(context)) score += 150;
      if (/post time|เวลาโพสต์|เวลาที่โพสต์/i.test(context) && context.length < 600) score -= 80;
    }
    return { element, score, top: rectangle.top };
  }).sort((left, right) => right.score - left.score || right.top - left.top);
  return scored[0]?.score >= 60 ? scored[0].element : null;
}

function findExitConfirmationDialog() {
  return [...document.querySelectorAll("[role='dialog'], [aria-modal='true']")]
    .find((element) => isVisible(element)
      && /are you sure.*leave|sure.*exit|unsaved|continue editing|คุณแน่ใจ.*ออก|ต้องการออก|ไม่ได้รับการบันทึก|แก้ไขต่อหรือไม่/i.test(textOf(element)));
}

function findContentCheckDialog() {
  return [...document.querySelectorAll("[role='dialog'], [aria-modal='true'], [class*='modal' i], [class*='dialog' i], div")]
    .filter((element) => {
      if (!isVisible(element) || element.closest(`#${POST_BOT_ID}`)) return false;
      const text = textOf(element).replace(/\s+/g, " ").trim();
      return text.length < 700
        && /continue to post\?|still checking your video|potential issues|ตรวจสอบวิดีโอ.*โพสต์/i.test(text)
        && [...element.querySelectorAll("button, [role='button']")].some((button) =>
          isVisible(button) && controlHasExactText(button, /^(post now|post|continue|โพสต์ตอนนี้|โพสต์|ดำเนินการต่อ)$/i));
    })
    .sort((left, right) => textOf(left).length - textOf(right).length)[0] || null;
}

function findFinalPublishConfirmationButton(nativeSchedule = false) {
  const contentCheckDialog = findContentCheckDialog();
  if (contentCheckDialog) {
    return [...contentCheckDialog.querySelectorAll("button, [role='button']")]
      .find((button) => isVisible(button)
        && !button.disabled
        && button.getAttribute("aria-disabled") !== "true"
        && controlHasExactText(button, /^(post now|post|continue|โพสต์ตอนนี้|โพสต์|ดำเนินการต่อ)$/i)) || null;
  }
  const buttonPattern = nativeSchedule
    ? /^(?:schedule|schedule post|confirm schedule|post|post now|publish|ตั้งเวลา|ตั้งเวลาโพสต์|ยืนยันตั้งเวลา|โพสต์|โพสต์ตอนนี้|เผยแพร่)$/i
    : /^(?:post|post now|publish|โพสต์|โพสต์ตอนนี้|เผยแพร่)$/i;
  const questionPattern = nativeSchedule
    ? /(?:schedule.*(?:video|post)|confirm.*schedule|post.*video|ตั้งเวลา.*(?:วิดีโอ|โพสต์)|ยืนยัน.*ตั้งเวลา|โพสต์วิดีโอหรือไม่|ต้องการโพสต์)/i
    : /(?:post.*video|confirm.*post|publish.*video|โพสต์วิดีโอหรือไม่|ยืนยัน.*โพสต์|ต้องการโพสต์)/i;

  return [...document.querySelectorAll("button, [role='button']")]
    .filter((element) => {
      if (!isVisible(element)
        || element.closest(`#${POST_BOT_ID}`)
        || element.disabled
        || element.getAttribute("aria-disabled") === "true"
        || getComputedStyle(element).pointerEvents === "none"
        || !controlHasExactText(element, buttonPattern)
        || !isTopmostControl(element)) return false;

      let container = element.closest("[role='dialog'], [aria-modal='true'], [class*='modal'], [class*='dialog']");
      for (let level = 0, current = element.parentElement; !container && current && level < 7; level += 1, current = current.parentElement) {
        const text = textOf(current).replace(/\s+/g, " ").trim();
        if (text.length < 1800 && questionPattern.test(text)) container = current;
      }
      if (!container) return false;
      const context = textOf(container).replace(/\s+/g, " ").trim();
      return context.length < 2200 && questionPattern.test(context);
    })
    .sort((left, right) => right.getBoundingClientRect().right - left.getBoundingClientRect().right)[0] || null;
}

function setNativeInputValue(input, value) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true }));
}

function localScheduleParts(scheduleAt) {
  const localMatch = String(scheduleAt || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (localMatch) {
    const [, yyyy, mm, dd, hh, min] = localMatch;
    return {
      yyyy,
      mm,
      dd,
      hh,
      min,
      date: new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), 0, 0),
    };
  }
  const date = new Date(scheduleAt);
  return {
    yyyy: String(date.getFullYear()),
    mm: String(date.getMonth() + 1).padStart(2, "0"),
    dd: String(date.getDate()).padStart(2, "0"),
    hh: String(date.getHours()).padStart(2, "0"),
    min: String(date.getMinutes()).padStart(2, "0"),
    date,
  };
}

function scheduleSection(scheduleControl) {
  let current = scheduleControl;
  for (let depth = 0; current && depth < 9; depth += 1, current = current.parentElement) {
    const text = textOf(current);
    const hasScheduleFields = current.querySelector?.("input[type='date'], input[type='time'], input[type='datetime-local'], input[readonly], [role='combobox']");
    if (hasScheduleFields && /schedule|post time|เวลาที่โพสต์|ตั้งเวลา|การตั้งค่า/i.test(text)) return current;
    if (/เวลาโพสต์|post time/i.test(text) && /ใครสามารถ|who can view|visibility/i.test(text)) return current;
  }
  return document;
}

function scheduleControlDistance(element, anchor) {
  if (!element || !anchor) return Number.MAX_SAFE_INTEGER;
  const left = element.getBoundingClientRect();
  const right = anchor.getBoundingClientRect();
  return Math.abs(left.top - right.top) + Math.abs(left.left - right.left);
}

function isSchedulePreviewControl(element) {
  if (!element) return true;
  if (element.closest("aside, nav, header, [role='navigation'], [class*='preview'], [class*='Preview'], [class*='phone'], [class*='Phone']")) return true;
  return element.getBoundingClientRect().left > window.innerWidth * 0.8;
}

function scheduleInputs(root = document, anchor = null) {
  const inputs = [...root.querySelectorAll("input")]
    .filter((input) => isVisible(input) && input.type !== "file" && !input.closest(`#${POST_BOT_ID}`) && !isSchedulePreviewControl(input));
  const orderedInputs = [...inputs]
    .sort((left, right) => scheduleControlDistance(left, anchor) - scheduleControlDistance(right, anchor));
  const controls = [...root.querySelectorAll("[role='combobox'], button, [role='button'], [tabindex]")]
    .filter((element) => isVisible(element)
      && !element.closest(`#${POST_BOT_ID}`)
      && !isSchedulePreviewControl(element)
      && !element.disabled
      && element.getAttribute("aria-disabled") !== "true")
    .sort((left, right) => scheduleControlDistance(left, anchor) - scheduleControlDistance(right, anchor));
  const dateInput = orderedInputs.find((input) => input.type === "date" && !input.readOnly);
  const timeInput = orderedInputs.find((input) => input.type === "time" && !input.readOnly);
  const datePattern = /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/;
  const timePattern = /(?:^|\s)\d{1,2}:\d{2}(?:\s|$)/;
  const dateControl = dateInput
    || orderedInputs.find((input) => datePattern.test(`${input.value || ""} ${textOf(input)}`))
    || controls.find((element) => datePattern.test(`${element.value || ""} ${textOf(element)}`));
  const timeControl = timeInput
    || orderedInputs.find((input) => timePattern.test(`${input.value || ""} ${textOf(input)}`))
    || controls.find((element) => timePattern.test(`${element.value || ""} ${textOf(element)}`));
  return {
    dateInput,
    timeInput,
    dateControl,
    timeControl,
    dateTimeInput: inputs.find((input) => input.type === "datetime-local"),
  };
}

function controlMatchesValue(control, values) {
  const text = `${control?.value || ""} ${textOf(control)}`.replace(/\s+/g, " ").trim();
  return values.some((value) => text.includes(value));
}

async function selectCustomScheduleValue(control, values, fallbackDay = "") {
  if (!control) return false;
  if (controlMatchesValue(control, values)) return true;
  await clickTikTokControl(control);
  await wait(500);
  const option = await waitFor(() => {
    const candidates = [...document.querySelectorAll([
      "[role='option']",
      "[role='menuitem']",
      "[role='gridcell']",
      "[data-value]",
      "[data-date]",
      "li",
      "button",
      "[role='button']",
    ].join(","))].filter((element) => isVisible(element)
      && element !== control
      && !control.contains(element)
      && !element.closest(`#${POST_BOT_ID}`)
      && !isSchedulePreviewControl(element)
      && !element.disabled
      && element.getAttribute("aria-disabled") !== "true");
    const exact = candidates.find((element) => {
      const valuesText = [
        element.value,
        textOf(element),
        element.getAttribute("data-value"),
        element.getAttribute("data-date"),
        element.getAttribute("aria-label"),
      ].filter(Boolean).join(" ");
      return values.some((value) => valuesText.includes(value));
    });
    if (exact) return exact;
    if (!fallbackDay) return null;
    return candidates.find((element) => {
      const inCalendar = element.closest("[class*='calendar'], [class*='date-picker'], [role='grid'], [role='dialog']");
      return inCalendar && textOf(element).trim() === String(Number(fallbackDay));
    }) || null;
  }, 8000, 250);
  if (!option) return false;
  return activateTikTokControl(
    option,
    () => controlMatchesValue(control, values) || !option.isConnected || !isVisible(option),
    7000,
  );
}

function pickerNumberText(element) {
  const raw = [
    element?.innerText,
    element?.textContent,
    element?.getAttribute?.("aria-label"),
    element?.getAttribute?.("data-value"),
  ].filter(Boolean).map((value) => String(value).trim()).find((value) => /^\d{1,2}$/.test(value));
  return raw == null ? "" : String(Number(raw)).padStart(2, "0");
}

function findTikTokTimePickerOption(control, targetValue, column) {
  if (!control) return null;
  const controlRectangle = control.getBoundingClientRect();
  const controlMiddle = controlRectangle.left + controlRectangle.width / 2;
  const target = String(Number(targetValue)).padStart(2, "0");
  const candidates = [...document.querySelectorAll([
    `.tiktok-timepicker-option-text.tiktok-timepicker-${column === "hour" ? "left" : "right"}`,
    "[role='option']",
    "[role='menuitem']",
    "[data-value]",
    "li",
    "button",
    "[role='button']",
    "[class*='time' i] span",
    "[class*='time' i] div",
    "[class*='picker' i] span",
    "[class*='picker' i] div",
    "[class*='select' i] span",
    "[class*='select' i] div",
  ].join(","))].filter((element) => {
    if (!isVisible(element)
      || element === control
      || control.contains(element)
      || element.closest(`#${POST_BOT_ID}`)
      || isSchedulePreviewControl(element)
      || element.disabled
      || element.getAttribute("aria-disabled") === "true"
      || pickerNumberText(element) !== target) return false;
    const rectangle = element.getBoundingClientRect();
    const centerX = rectangle.left + rectangle.width / 2;
    const closeToPicker = rectangle.right >= controlRectangle.left - 180
      && rectangle.left <= controlRectangle.right + 180
      && rectangle.bottom >= controlRectangle.top - 420
      && rectangle.top <= controlRectangle.bottom + 520;
    const inPopup = element.closest([
      "[role='listbox']",
      "[role='dialog']",
      "[aria-modal='true']",
      "[class*='picker' i]",
      "[class*='popover' i]",
      "[class*='dropdown' i]",
      ".tiktok-timepicker",
    ].join(","));
    if (!inPopup && !closeToPicker) return false;
    return column === "hour" ? centerX < controlMiddle + 4 : centerX > controlMiddle - 4;
  });
  if (!candidates.length) return null;
  return candidates.sort((left, right) => {
    const leftRectangle = left.getBoundingClientRect();
    const rightRectangle = right.getBoundingClientRect();
    const leftCenterX = leftRectangle.left + leftRectangle.width / 2;
    const rightCenterX = rightRectangle.left + rightRectangle.width / 2;
    const desiredX = column === "hour"
      ? controlRectangle.left + controlRectangle.width * 0.28
      : controlRectangle.left + controlRectangle.width * 0.72;
    const leftScore = Math.abs(leftCenterX - desiredX) + Math.abs(leftRectangle.top - controlRectangle.top) * 0.05 + leftRectangle.width * 0.01;
    const rightScore = Math.abs(rightCenterX - desiredX) + Math.abs(rightRectangle.top - controlRectangle.top) * 0.05 + rightRectangle.width * 0.01;
    return leftScore - rightScore;
  })[0];
}

function timeControlHasHour(control, hour) {
  const value = `${control?.value || ""} ${textOf(control)}`.replace(/\s+/g, " ");
  return new RegExp(`(?:^|\\D)${String(hour).padStart(2, "0")}\\s*:`).test(value);
}

async function selectTikTokTimePicker(control, hour, minute) {
  if (!control) return false;
  const timeIso = `${hour}:${minute}`;
  if (controlMatchesValue(control, [timeIso])) return true;

  await clickTikTokControl(control);
  await wait(450);
  const hourOption = await waitFor(() => findTikTokTimePickerOption(control, hour, "hour"), 8000, 200);
  if (!hourOption) return false;
  const hourSelected = await activateTikTokControl(
    hourOption,
    () => timeControlHasHour(control, hour)
      || hourOption.getAttribute("aria-selected") === "true"
      || /selected|active|checked/i.test(String(hourOption.className)),
    6000,
  );
  if (!hourSelected) return false;

  let minuteOption = await waitFor(() => findTikTokTimePickerOption(control, minute, "minute"), 3500, 200);
  if (!minuteOption) {
    await clickTikTokControl(control);
    await wait(350);
    minuteOption = await waitFor(() => findTikTokTimePickerOption(control, minute, "minute"), 5000, 200);
  }
  if (!minuteOption) return false;
  const minuteSelected = await activateTikTokControl(
    minuteOption,
    () => controlMatchesValue(control, [timeIso])
      || minuteOption.getAttribute("aria-selected") === "true"
      || /selected|active|checked/i.test(String(minuteOption.className)),
    6500,
  );
  if (!minuteSelected) return false;
  await wait(350);
  return controlMatchesValue(control, [timeIso]);
}

async function configureNativeSchedule(scheduleAt) {
  const parts = localScheduleParts(scheduleAt);
  const target = parts.date;
  const delay = target.getTime() - Date.now();
  if (!Number.isFinite(target.getTime())) throw new Error("วันและเวลาที่ตั้งไว้ไม่ถูกต้อง");
  if (delay < 20 * 60 * 1000) throw new Error("กรุณาตั้งเวลาอย่างน้อย 20 นาทีจากเวลาปัจจุบัน");
  if (delay > 10 * 24 * 60 * 60 * 1000) throw new Error("กรุณาตั้งเวลาไม่เกิน 10 วันล่วงหน้า");
  const nativeScheduleRadio = document.querySelector([
    "input[type='radio'][name='postSchedule'][value='schedule']",
    "input[type='radio'][value='schedule']",
  ].join(","));
  const scheduleControl = nativeScheduleRadio
    || findControl(/^(schedule|ตั้งเวลา)$/i)
    || [...document.querySelectorAll("label, [role='radio'], button")].find((element) => isVisible(element) && /schedule|ตั้งเวลา/i.test(textOf(element)));
  if (!scheduleControl) throw new Error("ไม่พบตัวเลือก Schedule ใน TikTok Studio");
  const scheduleIsSelected = () => Boolean(nativeScheduleRadio
    ? nativeScheduleRadio.checked || nativeScheduleRadio.getAttribute("aria-checked") === "true"
    : scheduleControl.getAttribute("aria-checked") === "true");
  const scheduleActivated = scheduleIsSelected()
    || await activateTikTokControl(scheduleControl, scheduleIsSelected, 10000);
  if (!scheduleActivated) throw new Error("กดตัวเลือก Schedule แล้ว แต่ TikTok Studio ยังไม่ยืนยันการเลือก");
  await wait(700);
  const root = scheduleSection(scheduleControl);
  let searchRoot = root;
  let found = await waitFor(() => {
    const value = scheduleInputs(root, scheduleControl);
    return value.dateTimeInput || (value.dateControl && value.timeControl) ? value : null;
  }, 12000, 400);
  if (!found && root !== document) {
    searchRoot = document;
    found = await waitFor(() => {
      const value = scheduleInputs(document, scheduleControl);
      return value.dateTimeInput || (value.dateControl && value.timeControl) ? value : null;
    }, 18000, 400);
  }
  if (!found) throw new Error("พบ Schedule แต่ไม่พบช่องวันหรือเวลาใน TikTok Studio");
  const dateIso = `${parts.yyyy}-${parts.mm}-${parts.dd}`;
  const timeIso = `${parts.hh}:${parts.min}`;
  const hour12 = Number(parts.hh) % 12 || 12;
  const meridiem = Number(parts.hh) >= 12 ? "PM" : "AM";
  const timeValues = [timeIso, `${hour12}:${parts.min} ${meridiem}`, `${String(hour12).padStart(2, "0")}:${parts.min} ${meridiem}`];
  if (found.dateTimeInput) {
    setNativeInputValue(found.dateTimeInput, `${dateIso}T${timeIso}`);
  } else {
    const dateValues = [dateIso, `${parts.dd}/${parts.mm}/${parts.yyyy}`, `${parts.mm}/${parts.dd}/${parts.yyyy}`];
    if (found.dateInput) setNativeInputValue(found.dateInput, dateIso);
    else if (!(await selectCustomScheduleValue(found.dateControl, dateValues, parts.dd))) {
      throw new Error(`เลือกวันที่ ${dateIso} ใน TikTok Studio ไม่สำเร็จ`);
    }
    if (found.timeInput) setNativeInputValue(found.timeInput, timeIso);
    else if (!(await selectTikTokTimePicker(found.timeControl, parts.hh, parts.min))) {
      throw new Error(`เลือกเวลา ${timeIso} ใน TikTok Studio ไม่สำเร็จ`);
    }
  }
  await wait(500);
  const pickerConfirm = [...document.querySelectorAll("button, [role='button']")]
    .filter((element) => isVisible(element)
      && !element.closest(`#${POST_BOT_ID}`)
      && !element.disabled
      && element.getAttribute("aria-disabled") !== "true"
      && (element.closest("[role='dialog'],[aria-modal='true'],[class*='picker'],[class*='popover'],[class*='calendar']")
        || (root !== document && root.contains(element)))
      && controlHasExactText(element, /^(ok|confirm|apply|done|ตกลง|ยืนยัน|เสร็จสิ้น)$/i))
    .sort((left, right) => {
      const leftDialog = left.closest("[role='dialog'],[aria-modal='true'],[class*='picker'],[class*='popover'],[class*='calendar']") ? 1 : 0;
      const rightDialog = right.closest("[role='dialog'],[aria-modal='true'],[class*='picker'],[class*='popover'],[class*='calendar']") ? 1 : 0;
      return rightDialog - leftDialog || right.getBoundingClientRect().top - left.getBoundingClientRect().top;
    })[0];
  if (pickerConfirm) {
    await activateTikTokControl(
      pickerConfirm,
      () => !pickerConfirm.isConnected || !isVisible(pickerConfirm),
      7000,
    );
  }
  await wait(500);
  const verified = scheduleInputs(searchRoot, scheduleControl);
  const dateVerified = verified.dateTimeInput
    ? controlMatchesValue(verified.dateTimeInput, [dateIso])
    : controlMatchesValue(verified.dateControl, [dateIso, `${parts.dd}/${parts.mm}/${parts.yyyy}`, `${parts.mm}/${parts.dd}/${parts.yyyy}`]);
  const timeVerified = verified.dateTimeInput
    ? controlMatchesValue(verified.dateTimeInput, [timeIso])
    : controlMatchesValue(verified.timeControl, timeValues);
  if (!dateVerified || !timeVerified) {
    throw new Error(`TikTok ยังไม่ยืนยันวันเวลา ${dateIso} ${timeIso} — BOT หยุดก่อนกดโพสต์`);
  }
  return target;
}

function findPublishButton(nativeSchedule = false) {
  return nativeSchedule ? (findScheduleSubmitButton() || findPostButton()) : findPostButton();
}

function postSubmissionDetected(job) {
  if (findContentCheckDialog() || findFinalPublishConfirmationButton(Boolean(job.nativeSchedule))) return false;
  if (Date.now() - Number(job.postClickedAt || job.postClickStartedAt || 0) < 10 * 60 * 1000
    && /posts\s*\(created on\)/i.test(document.body.innerText || "")) {
    const caption = String(job.caption || "").replace(/\s+/g, " ").trim();
    const prefix = caption.slice(0, 40);
    const postsText = String(document.body.innerText || "").replace(/\s+/g, " ");
    const listStart = postsText.search(/posts\s*\(created on\)/i);
    if (prefix.length >= 24 && listStart >= 0 && postsText.slice(listStart, listStart + 900).includes(prefix)) return true;
  }
  return [...document.querySelectorAll("[role='alert'], [role='status'], h1, h2, p, span")].some((element) => {
    if (!isVisible(element) || element.closest(`#${POST_BOT_ID}`)) return false;
    const text = textOf(element).replace(/\s+/g, " ").trim();
    if (text.length > 220) return false;
    if (job.nativeSchedule) return /(?:video|post).{0,50}(?:scheduled successfully|has been scheduled)|successfully scheduled|ตั้งเวลา(?:โพสต์)?สำเร็จ/i.test(text);
    return /(?:video|post).{0,50}(?:posted successfully|published successfully|has been posted|has been published)|posted successfully|published successfully|โพสต์สำเร็จ|เผยแพร่สำเร็จ/i.test(text);
  });
}

async function clickFinalPublishConfirmation(job, timeout = 12000) {
  const confirmation = await waitFor(
    () => findFinalPublishConfirmationButton(Boolean(job.nativeSchedule)),
    timeout,
    250,
  );
  if (!confirmation) {
    if (findContentCheckDialog()) {
      throw new Error("TikTok ยังเปิด Continue to post? แต่ BOT ไม่พบปุ่ม Post now จึงยังไม่ถือว่าโพสต์สำเร็จ");
    }
    return false;
  }
  showStatus(job.nativeSchedule
    ? "พบกล่องยืนยัน กำลังกดยืนยันตั้งเวลาโพสต์..."
    : "พบกล่องยืนยัน กำลังกดโพสต์ตอนนี้...", "working", [{ label: "■ หยุด BOT", onClick: cancelBot }]);
  const contentCheckDialog = findContentCheckDialog();
  if (contentCheckDialog) {
    const accepted = await activateTikTokControl(confirmation, () => !findContentCheckDialog(), 10000);
    if (!accepted) throw new Error("TikTok ยังเปิดหน้าต่าง Continue to post? อยู่ BOT จึงไม่แจ้งว่าโพสต์เสร็จ");
  } else {
    await clickTikTokControl(confirmation);
    await wait(1200);
  }
  return true;
}

async function completePostSubmission(job) {
  const submitted = await waitFor(() => postSubmissionDetected(job), 2 * 60 * 1000, 800);
  if (submitted) {
    const completedStatus = job.nativeSchedule ? "scheduled_native" : "posted";
    await updateJob({ status: completedStatus, postedAt: Date.now(), videoDataUrl: "" });
    await finishHistory(job, completedStatus);
    showStatus(job.nativeSchedule ? "ตั้งเวลาใน TikTok Studio สำเร็จแล้ว" : "โพสต์สำเร็จแล้ว BOT ทำงานครบ", "success");
    chrome.runtime.sendMessage({
      type: "AFFI_PRO_POST_COMPLETE",
      jobId: job.queueJobId || job.id,
      success: true
    }).catch(() => {});
    return true;
  }
  await updateJob({ status: "submitted_unconfirmed", error: "TikTok ยังไม่ยืนยันผลโพสต์ กรุณาตรวจใน TikTok Studio ก่อนลองใหม่" });
  showStatus("ยังไม่พบหลักฐานว่า TikTok รับโพสต์หรือการตั้งเวลาแล้ว กรุณาตรวจใน TikTok Studio", "error");
  return false;
}

async function finishHistory(job, status) {
  const stored = await chrome.storage.local.get(POST_HISTORY_KEY);
  const history = Array.isArray(stored[POST_HISTORY_KEY]) ? stored[POST_HISTORY_KEY] : [];
  const summary = {
    id: job.id,
    productId: job.product?.productId,
    productName: job.product?.name,
    videoName: job.videoName,
    videoFingerprint: job.videoFingerprint || "",
    caption: job.caption,
    status,
    postedAt: job.nativeSchedule && job.scheduleAt ? new Date(job.scheduleAt).getTime() : Date.now(),
    completedAt: Date.now(),
  };
  await chrome.storage.local.set({
    [POST_HISTORY_KEY]: [summary, ...history.filter((item) => item.id !== job.id)].slice(0, 50),
  });
}

async function cancelBot() {
  cancelled = true;
  await updateJob({ status: "cancelled", cancelledAt: Date.now(), videoDataUrl: "" });
  showStatus("หยุด BOT แล้ว ระบบจะไม่กด Post", "error");
}

async function runPostAutomation() {
  if (window.top !== window.self) return;
  const currentUrl = new URL(location.href);
  if (currentUrl.pathname === "/tiktokstudio/upload" && currentUrl.searchParams.get("tab") !== "video") {
    currentUrl.searchParams.set("from", "webapp");
    currentUrl.searchParams.set("tab", "video");
    location.replace(currentUrl.href);
    return;
  }
  const stored = await chrome.storage.local.get(POST_JOB_KEY);
  let job = stored[POST_JOB_KEY];

  // Safe fallback via background message (NEVER use page-level fetch to avoid Mixed Content / CORS)
  if (!job || !job.product?.productId || !job.videoDataUrl) {
    showStatus("JarbLand AutoFlow · กำลังซิงค์ข้อมูลโพสต์จากระบบ...", "working");
    const resp = await chrome.runtime.sendMessage({ type: "AFFI_PRO_GET_TIKTOK_JOB" }).catch(() => null);
    if (resp?.ok && resp?.job) {
      job = resp.job;
    }
  }

  if (!job || !job.product?.productId) {
    showStatus("JarbLand AutoFlow · TikTok BOT พร้อมทำงาน (กำลังรอคิวงานจากแดชบอร์ด...)");
    return;
  }
  if (Date.now() - Number(job.createdAt || 0) > 24 * 60 * 60 * 1000) return;
  await resumeTikTokDraftIfNeeded();
  if (["post_clicking", "submitting"].includes(job.status)) {
    try {
      showStatus("กำลังกู้คืนขั้นตอนยืนยันโพสต์ที่ค้างอยู่...", "working", [{ label: "■ หยุด BOT", onClick: cancelBot }]);
      const confirmed = await clickFinalPublishConfirmation(job, 5000);
      job = await updateJob({
        status: "submitting",
        postClickedAt: job.postClickedAt || Date.now(),
        finalConfirmationClicked: confirmed,
      });
      await completePostSubmission(job);
    } catch (error) {
      const reason = `${error?.message || "กู้คืนการยืนยันโพสต์ไม่สำเร็จ"} — อาจส่งไปแล้ว กรุณาตรวจ TikTok Studio ก่อนลองใหม่`;
      await updateJob({ status: "submitted_unconfirmed", error: reason });
      showStatus(reason, "error");
    }
    return;
  }
  if (["posted", "scheduled_native", "submitted_unconfirmed", "cancelled"].includes(job.status)) {
    const message = ["posted", "scheduled_native"].includes(job.status)
      ? "งานนี้ส่งเข้า TikTok สำเร็จแล้ว BOT จะไม่ส่งซ้ำ"
      : "BOT เคยส่งคำสั่ง Post หรือหยุดงานนี้แล้ว จึงไม่กดซ้ำ";
    showStatus(message, ["posted", "scheduled_native"].includes(job.status) ? "success" : "error");
    return;
  }
  if (job.status === "error") {
    showStatus(job.error || "BOT หยุดก่อน Post", "error", [{
      label: "ลองทำต่อ",
      onClick: async () => {
        await updateJob({ status: "ready", error: "" });
        location.reload();
      },
    }]);
    return;
  }

  try {
    if (videoPreviewIsReady() && nativeVideoEditorIsReady()) {
      job = await updateJob({ status: "video_selected", videoSelectedAt: Date.now() });
      showStatus("พบวิดีโอ Preview ที่ TikTok รับไว้แล้ว จึงข้ามการอัปโหลดซ้ำ...", "working", [{ label: "■ หยุด BOT", onClick: cancelBot }]);
    } else if (job.videoDataUrl) {
      job = await updateJob({ status: "uploading_video", error: "", uploadStartedAt: Date.now() });
      showStatus("กำลังอัปโหลดไฟล์วิดีโอที่เตรียมไว้เข้า TikTok Studio...", "working", [{ label: "■ หยุด BOT", onClick: cancelBot }]);
      const uploadedAutomatically = await uploadVideo(job);
      if (uploadedAutomatically === null) return;
      if (!uploadedAutomatically) {
        job = await updateJob({ status: "waiting_user_video", error: "" });
        showStatus("TikTok ไม่รับการแนบไฟล์อัตโนมัติ กรุณากด Select video แล้วเลือกไฟล์เดิม 1 ครั้ง จากนั้น BOT จะทำขั้นตอนที่เหลือต่อเอง", "working", [{ label: "■ หยุด BOT", onClick: cancelBot }]);
        await waitForNativeVideoSelection();
      }
      job = await updateJob({ status: "video_selected", videoSelectedAt: Date.now() });
    } else {
      job = await updateJob({ status: "waiting_user_video", error: "" });
      showStatus("ไม่พบไฟล์ที่เตรียมไว้ กรุณากด Select video แล้วเลือกไฟล์ 1 ครั้ง", "working", [{ label: "■ หยุด BOT", onClick: cancelBot }]);
      await waitForNativeVideoSelection();
    }

    showStatus("TikTok รับวิดีโอแล้ว กำลังรอให้อัปโหลดและประมวลผลเสร็จ โดย BOT จะยังไม่แก้ไขหน้า...", "working", [{ label: "■ หยุด BOT", onClick: cancelBot }]);
    const processingComplete = await waitForVideoProcessingComplete(job);
    if (!processingComplete) return;
    job = await updateJob({ processingRecoveryCount: 0, processingCompletedAt: Date.now() });

    showStatus("วิดีโอพร้อมแล้ว กำลังรอหน้า TikTok คงที่ก่อนใส่แคปชัน...", "working", [{ label: "■ หยุด BOT", onClick: cancelBot }]);
    await wait(8000);
    if (pageHasApplicationError()) throw new Error("TikTok Studio เกิดข้อผิดพลาดหลังประมวลผลวิดีโอ BOT หยุดก่อนแก้ไขแคปชัน");
    await fillCaption(job.caption);
    showStatus("ใส่แคปชันแล้ว กำลังรอให้ TikTok บันทึกข้อความ...", "working", [{ label: "■ หยุด BOT", onClick: cancelBot }]);
    await wait(1500);
    if (pageHasApplicationError()) throw new Error("TikTok Studio เกิดข้อผิดพลาดหลังใส่แคปชัน BOT หยุดก่อนติดสินค้าและก่อน Post");

    job = await updateJob({ status: "attaching_product", productAttachStartedAt: Date.now() });
    showStatus(`กำลังค้นหาและเลือกสินค้า Product ID ${job.product.productId} อัตโนมัติ...`, "working", [{ label: "■ หยุด BOT", onClick: cancelBot }]);
    const productAttached = await attachProduct(job.product);
    if (!productAttached) throw new Error(`ติดสินค้า Product ID ${job.product.productId} อัตโนมัติไม่สำเร็จ BOT หยุดก่อน Post`);
    job = await updateJob({ status: "product_attached", productAttachedAt: Date.now() });
    if (job.nativeSchedule && job.scheduleAt) {
      showStatus("กำลังเลือก Schedule และใส่วันเวลาลงใน TikTok Studio...", "working", [{ label: "หยุด BOT", onClick: cancelBot }]);
      const nativeScheduleAt = await configureNativeSchedule(job.scheduleAt);
      job = await updateJob({ status: "schedule_configured", nativeScheduleAt: nativeScheduleAt.getTime() });
    }
    showStatus(job.nativeSchedule ? "ตั้งวันเวลาแล้ว กำลังตรวจปุ่ม Schedule ด้านล่าง..." : "ติดสินค้าเรียบร้อย กำลังตรวจปุ่ม Post ด้านล่าง...", "working", [{ label: "■ หยุด BOT", onClick: cancelBot }]);

    if (!job.autoPost) {
      await updateJob({ status: "ready_manual", preparedAt: Date.now() });
      showStatus("วิดีโอ แคปชัน และสินค้าพร้อมแล้ว กรุณากด Post เอง (Dry-Run: ปักตะกร้าสำเร็จ)", "success");
      chrome.runtime.sendMessage({
        type: "AFFI_PRO_POST_COMPLETE",
        jobId: job.queueJobId || job.id,
        success: true,
        dryRun: true
      }).catch(() => {});
      return;
    }

    const postButton = await waitFor(() => findPublishButton(Boolean(job.nativeSchedule)), 10 * 60 * 1000, 700);
    if (!postButton) throw new Error(job.nativeSchedule ? "ไม่พบปุ่ม Schedule ขั้นสุดท้ายที่พร้อมใช้งาน BOT จึงยังไม่กด" : "ไม่พบปุ่ม Post ที่พร้อมใช้งาน BOT จึงยังไม่กด");
    job = await updateJob({ status: "post_clicking", postClickStartedAt: Date.now() });
    showStatus(job.nativeSchedule ? "ข้อมูลครบแล้ว กำลังกด Schedule เพียงครั้งเดียว..." : "ข้อมูลครบแล้ว กำลังกด Post เพียงครั้งเดียว...");
    await clickTikTokControl(postButton);
    await wait(1200);
    const exitDialog = findExitConfirmationDialog();
    if (exitDialog) {
      const cancelExit = findControl(/^(cancel|continue|continue editing|ยกเลิก|อยู่ต่อ|ดำเนินการต่อ|แก้ไขต่อ)$/i, exitDialog);
      if (cancelExit) await clickTikTokControl(cancelExit);
      throw new Error("ตรวจพบว่าปุ่มที่กดเปิดหน้าต่างออกจากหน้า BOT ยกเลิกให้แล้วและจะไม่กดซ้ำ");
    }
    const finalConfirmationClicked = await clickFinalPublishConfirmation(job, 12000);
    job = await updateJob({
      status: "submitting",
      postClickedAt: Date.now(),
      postClickDispatchedByBot: true,
      finalConfirmationClicked,
    });
    await completePostSubmission(job);
  } catch (error) {
    if (cancelled) return;
    const possiblySubmitted = ["post_clicking", "submitting"].includes(job.status);
    const reason = `${error?.message || "TikTok Auto Post ทำงานไม่สำเร็จ"}${possiblySubmitted ? " — อาจส่งไปแล้ว กรุณาตรวจ TikTok Studio ก่อนลองใหม่" : ""}`;
    await updateJob({ status: possiblySubmitted ? "submitted_unconfirmed" : "error", error: reason });
    await chrome.runtime.sendMessage({ type: "jarbland-v4-needs-attention", stage: "tiktok", progress: 0, reason }).catch(() => {});
    showStatus(reason, "error", possiblySubmitted ? [] : [{
      label: "ลองทำต่อ",
      onClick: async () => {
        await updateJob({ status: "ready", error: "" });
        location.reload();
      },
    }]);
  }
}

runPostAutomation();

let backgroundAttentionReported = false;
setInterval(() => {
  if (backgroundAttentionReported) return;
  const pageText = String(document.body?.innerText || "");
  if (!/verify it.?s you|captcha|log in|sign in|ยืนยันว่าเป็นคุณ|เข้าสู่ระบบ/i.test(pageText)) return;
  backgroundAttentionReported = true;
  chrome.runtime.sendMessage({ type: "jarbland-v4-needs-attention", stage: "tiktok", progress: 0, reason: "TikTok Studio ต้อง Login / CAPTCHA / Verify it’s you" }).catch(() => {});
}, 2500);
