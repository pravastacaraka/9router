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
  if (!enabled()) return false;

  // Dynamic import — @vercel/blob is only needed on Vercel
  const { head, put } = await import("@vercel/blob");

  try {
    const blob = await head(BLOB_PATH);
    if (!blob) {
      console.log("[DB][blob] No existing DB snapshot found — starting fresh");
      return false;
    }

    const response = await fetch(blob.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(DATA_FILE, buffer);
    console.log(`[DB][blob] Restored DB from blob (${blob.size} bytes)`);
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
export async function backupToBlob() {
  if (!enabled()) return;

  const now = Date.now();
  if (now - _lastUpload < MIN_INTERVAL) return;

  try {
    const { put } = await import("@vercel/blob");
    const buffer = fs.readFileSync(DATA_FILE);
    const result = await put(BLOB_PATH, buffer, { access: "private", allowOverwrite: true });
    _lastUpload = Date.now();
    console.log(`[DB][blob] Uploaded ${buffer.length} bytes → ${result.url}`);
  } catch (err) {
    console.warn(`[DB][blob] Backup failed: ${err.message}`);
  }
}
