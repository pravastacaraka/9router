import fs from "node:fs";
import os from "os";
import path from "path";

const APP_NAME = "9router";

function defaultDir() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_NAME);
  }
  const home = os.homedir();
  // Vercel serverless: os.homedir() may return literal "~" (unresolved); treat as unwritable
  if (!home || home === "~" || process.env.VERCEL) {
    return path.join("/tmp", APP_NAME);
  }
  return path.join(home, `.${APP_NAME}`);
}

export function getDataDir() {
  const configured = process.env.DATA_DIR;
  if (!configured) return defaultDir();

  // On Windows, ignore Unix-style absolute paths (e.g. /var/lib/...) that come
  // from a Linux-targeted .env or Docker config — they are not valid here.
  if (process.platform === "win32" && /^\//.test(configured)) {
    console.warn(`[DATA_DIR] '${configured}' is a Unix path on Windows → fallback to default`);
    return defaultDir();
  }
  try {
    fs.mkdirSync(configured, { recursive: true });
    return configured;
  } catch (e) {
    if (e?.code === "EACCES" || e?.code === "EPERM" || e?.code === "ENOENT") {
      const fallback = defaultDir();
      console.warn(`[DATA_DIR] '${configured}' not writable → fallback ${fallback}`);
      return fallback;
    }
    throw e;
  }
}

export const DATA_DIR = getDataDir();
