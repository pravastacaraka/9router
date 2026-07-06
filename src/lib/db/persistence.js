import fs from "node:fs";
import { DATA_FILE } from "./paths.js";

const BLOB_PATH = "9router/data.sqlite";

// Only active when BLOB_READ_WRITE_TOKEN is set (Vercel Blob Storage)
function enabled() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

// Download persisted DB from Vercel Blob into DATA_FILE on cold start.
// Returns true if a previous DB snapshot was restored, false if first deploy.
export async function restoreFromBlob() {
  if (!enabled()) {
    console.log("[DB][blob] Restore skipped — BLOB_READ_WRITE_TOKEN not set");
    return false;
  }

  console.log("[DB][blob] Attempting restore →", DATA_FILE);
  const { get } = await import("@vercel/blob");

  try {
    // Vercel Blob may be eventually consistent — retry with backoff
    let result = null;
    for (let i = 0; i < 3; i++) {
      result = await get(BLOB_PATH, { access: "private" });
      if (result) break;
      if (i < 2) {
        const delay = 500 * (i + 1);
        console.log(`[DB][blob] Blob not found, retrying in ${delay}ms…`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    console.log("[DB][blob] get() result:", result ? `found (${result.blob?.size ?? "?"} bytes)` : "null");
    if (!result) {
      console.log("[DB][blob] No existing DB snapshot found — starting fresh");
      return false;
    }

    const chunks = [];
    for await (const chunk of result.stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    fs.writeFileSync(DATA_FILE, buffer);
    const verifySize = fs.statSync(DATA_FILE).size;
    console.log(`[DB][blob] Restored DB from blob (${buffer.length} → ${verifySize} bytes on disk) [path: ${DATA_FILE}]`);
    return true;
  } catch (err) {
    console.warn(`[DB][blob] Failed to restore: ${err.message} — starting fresh`);
    return false;
  }
}

// Upload current DB to Vercel Blob (fire-and-forget).
// Debounced: at most once per 5s.
let _lastUpload = 0;
const MIN_INTERVAL = 5000;

// Upload current DB to Vercel Blob after mutations.
// Throttled: skips if uploaded within last 5s.
// Accepts optional db adapter to force WAL checkpoint before reading.
export async function backupToBlob(adapter) {
  if (!enabled()) return;

  const now = Date.now();
  if (now - _lastUpload < MIN_INTERVAL) return;

  try {
    // Force WAL flush so readFileSync captures recent writes
    const sizeBefore = fs.existsSync(DATA_FILE) ? fs.statSync(DATA_FILE).size : 0;
    adapter?.checkpoint();
    const sizeAfter = fs.statSync(DATA_FILE).size;
    console.log(`[DB][blob] File size: ${sizeBefore} → ${sizeAfter} after checkpoint`);

    const { put } = await import("@vercel/blob");
    const buffer = fs.readFileSync(DATA_FILE);
    const result = await put(BLOB_PATH, buffer, { access: "private", allowOverwrite: true });
    _lastUpload = Date.now();
    console.log(`[DB][blob] Uploaded ${buffer.length} bytes → ${result.url}`);
  } catch (err) {
    console.warn(`[DB][blob] Backup failed: ${err.message}`);
  }
}
