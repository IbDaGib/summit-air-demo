/**
 * Minimal .env.local loader — no dotenv dependency, and real environment
 * variables always win so CI can inject keys without a file on disk.
 */
import fs from "node:fs";

export function loadEnv(file = ".env.local"): void {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    const value = m[2].trim().replace(/^["']|["']$/g, "");
    if (!value) continue;
    if (process.env[key]) continue;
    process.env[key] = value;
  }
}

export const hasKey = (name: string): boolean => Boolean(process.env[name]?.trim());
