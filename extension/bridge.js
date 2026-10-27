// AFFI_PRO Automation Bridge - Content Script for localhost:5173

console.log("[AFFI_PRO Bridge] Content script active on dashboard.");

// Announce bridge availability to web page
window.postMessage({ type: "AFFI_PRO_BRIDGE_AVAILABLE" }, "*");

// Automatically sync cookies as soon as dashboard loads!
chrome.runtime.sendMessage({ type: "AFFI_PRO_EXTRACT_AND_SYNC_COOKIES" }, (res) => {
  if (res && res.cookieString) {
    console.log(`[AFFI_PRO Bridge] Automatically extracted and synced ${res.count} TikTok cookies to backend!`);
    window.postMessage({
      type: "AFFI_PRO_COOKIES_AUTO_SYNCED",
      hasSession: res.hasSession,
      count: res.count
    }, "*");
  }
});

// Listen for requests from the web UI
window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data?.type === "AFFI_PRO_REQUEST_COOKIE_SYNC") {
    chrome.runtime.sendMessage({ type: "AFFI_PRO_EXTRACT_AND_SYNC_COOKIES" }, (res) => {
      window.postMessage({
        type: "AFFI_PRO_COOKIE_SYNC_RESPONSE",
        success: Boolean(res && res.cookieString),
        hasSession: res?.hasSession,
        count: res?.count,
        error: res?.error
      }, "*");
    });
  }

  if (event.data?.type === "AFFI_PRO_REQUEST_BROWSER_SHOWCASE") {
    chrome.runtime.sendMessage({
      type: "AFFI_PRO_BROWSER_FETCH_SHOWCASE",
      offset: event.data.offset || 0,
      count: event.data.count || 6
    }, (res) => {
      window.postMessage({ type: "AFFI_PRO_BROWSER_SHOWCASE_RESPONSE", result: res }, "*");
    });
  }

  if (event.data?.type === "AFFI_PRO_REQUEST_BROWSER_SYNC_ALL") {
    chrome.runtime.sendMessage({ type: "AFFI_PRO_BROWSER_SYNC_ALL" }, (res) => {
      window.postMessage({ type: "AFFI_PRO_BROWSER_SYNC_ALL_RESPONSE", result: res }, "*");
    });
  }

  // ═══ Key: Dashboard says "Start Meta AI job for this product" ═══
  if (event.data?.type === "AFFI_PRO_REQUEST_LAUNCH_META") {
    chrome.runtime.sendMessage({
      type: "AFFI_PRO_START_META_JOB",
      job: event.data.job,
    }, (res) => {
      window.postMessage({ type: "AFFI_PRO_LAUNCH_META_RESPONSE", result: res }, "*");
    });
  }

  // ═══ Key: Dashboard says "Start TikTok posting for this product" ═══
  if (event.data?.type === "AFFI_PRO_REQUEST_LAUNCH_TIKTOK") {
    chrome.runtime.sendMessage({
      type: "AFFI_PRO_LAUNCH_TIKTOK_TAB",
      job: event.data.job,
      dryRun: event.data.dryRun ?? true,
    }, (res) => {
      window.postMessage({ type: "AFFI_PRO_LAUNCH_TIKTOK_RESPONSE", result: res }, "*");
    });
  }
});
