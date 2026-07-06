const fs = require("fs");
const path = require("path");
const os = require("os");

const APP_NAME = "9router";

function defaultDir() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_NAME);
  }
  const home = os.homedir();
  if (!home || home === "~" || process.env.VERCEL) {
    return path.join("/tmp", APP_NAME);
  }
  return path.join(home, `.${APP_NAME}`);
}

function getDataDir() {
  const configured = process.env.DATA_DIR;
  if (!configured) return defaultDir();
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

const DATA_DIR = getDataDir();
const MITM_DIR = path.join(DATA_DIR, "mitm");

module.exports = { DATA_DIR, MITM_DIR };
