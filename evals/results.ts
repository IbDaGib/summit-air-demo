/**
 * Run artifacts. A regression should be a diff between two files, not a memory
 * of what the scores were last week — so every run records the git sha, whether
 * the tree was dirty, and a hash of the prompt that produced it.
 */
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { systemPrompt } from "../agent/prompt";
import { TOOL_LIST } from "../agent/tools/schemas";

export const RESULTS_DIR = path.join("evals", "results");

const sha256 = (s: string) => `sha256:${crypto.createHash("sha256").update(s).digest("hex").slice(0, 16)}`;

const git = (args: string): string => {
  try {
    return execSync(`git ${args}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

export interface RunFingerprint {
  gitSha: string;
  dirty: boolean;
  /** Hash of the assembled system prompt — the thing that actually drives the call. */
  promptHash: string;
  /** Hash of the prompt source files, which catches an edit that composes to the same string. */
  promptFilesHash: string;
  toolSchemasHash: string;
}

export function fingerprint(): RunFingerprint {
  const promptDir = path.join("agent", "prompt");
  const files = fs.existsSync(promptDir)
    ? fs
        .readdirSync(promptDir)
        .filter((f) => f.endsWith(".ts"))
        .sort()
        .map((f) => `${f}\n${fs.readFileSync(path.join(promptDir, f), "utf8")}`)
        .join("\n---\n")
    : "";

  return {
    gitSha: git("rev-parse HEAD") || "unknown",
    dirty: git("status --porcelain") !== "",
    promptHash: sha256(systemPrompt()),
    promptFilesHash: sha256(files),
    toolSchemasHash: sha256(JSON.stringify(TOOL_LIST)),
  };
}

export function writeResults(payload: { fingerprint: RunFingerprint; mode: string }, body: unknown): string {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const suffix = payload.mode === "live" ? "" : `-${payload.mode}`;
  const file = path.join(RESULTS_DIR, `${payload.fingerprint.gitSha}${suffix}.json`);
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
  return file;
}
