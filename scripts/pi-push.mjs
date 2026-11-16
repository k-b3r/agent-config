#!/usr/bin/env node
// Push cleaned Pi sessions to Google Drive via rclone. Plain Node, no deps.
// Env: DEVICE (required), PI_SRC, MAX_CHARS (20000), RESULT_CHARS (500),
//      MIN_HOURS (12), QUIET_MIN (60), RCLONE_REMOTE (gdrive:agent-work/pi).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync, closeSync, openSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/g,
  /\bBearer\s+[\w.~+/-]{10,}=*/g,
  /\bsk-[\w-]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
];
const KEY_VALUE = /(\b\w*(?:token|secret|api_?key|_key|password|passwd)\w*\s*[=:]\s*)(?!\[REDACTED\])[^\s"',;]+/gi;

export function maskSecrets(s) {
  let out = s;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out.replace(KEY_VALUE, "$1[REDACTED]");
}

const mapStrings = (v, fn) =>
  typeof v === "string" ? fn(v)
  : Array.isArray(v) ? v.map((x) => mapStrings(x, fn))
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, fn)]))
  : v;

export function shorten(value, max) {
  return mapStrings(value, (s) => {
    if (s.length <= max) return s;
    const chars = [...s];
    if (chars.length <= max) return s;
    return chars.slice(0, max).join("") + `…[truncated ${chars.length - max}]`;
  });
}

const KEEP_ROLES = new Set(["user", "assistant", "toolResult", "bashExecution"]);

function cleanBlocks(content) {
  if (!Array.isArray(content)) return content;
  return content.map((b) => {
    if (b?.type === "image") return { type: "image", omitted: true };
    if (b?.type === "thinking") {
      const { thinkingSignature: _s, ...rest } = b;
      return rest;
    }
    return b;
  });
}

// Returns the cleaned line, or null to drop it. Unparsable lines pass through.
export function cleanLine(line, { maxChars, resultChars }) {
  let o;
  try {
    o = JSON.parse(line);
  } catch {
    return line;
  }
  if (!o || typeof o !== "object") return line;
  if (o.type === "session") return line;
  if (o.type !== "message" || !KEEP_ROLES.has(o.message?.role)) return null;
  const m = { ...o.message };
  delete m.details;
  if (m.content !== undefined) m.content = cleanBlocks(m.content);
  const limit = m.role === "toolResult" || m.role === "bashExecution" ? resultChars : maxChars;
  return JSON.stringify(shorten(mapStrings({ ...o, message: m }, maskSecrets), limit));
}

export function cleanJsonl(text, opts) {
  const out = [];
  for (const l of text.split("\n")) {
    if (l.trim() === "") out.push(l);
    else {
      const c = cleanLine(l, opts);
      if (c !== null) out.push(c);
    }
  }
  return out.join("\n");
}

export function shouldPublish({ stamp, newest, now, minHours, quietMin }) {
  if (newest == null) return false;
  if (now - newest < quietMin * 60_000) return false; // session still active
  if (stamp != null && now - stamp < minHours * 3600_000) return false;
  return stamp == null || newest > stamp;
}

export function resolveSrc(env, home) {
  if (env.PI_SRC) return env.PI_SRC;
  if (env.PI_CODING_AGENT_SESSION_DIR) return env.PI_CODING_AGENT_SESSION_DIR;
  if (env.PI_CODING_AGENT_DIR) return join(env.PI_CODING_AGENT_DIR, "sessions");
  return join(home, ".pi", "agent", "sessions");
}

function listJsonl(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listJsonl(p));
    else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

export function stage(src, files, dest, opts) {
  for (const f of files) {
    const target = join(dest, relative(src, f));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, cleanJsonl(readFileSync(f, "utf8"), opts));
    const { atime, mtime } = statSync(f);
    utimesSync(target, atime, mtime); // keep mtime so rclone skips unchanged files
  }
}

export function main(env = process.env) {
  const start = Date.now();
  const device = env.DEVICE;
  if (!device) return fail("DEVICE is required");
  const src = resolveSrc(env, homedir());
  if (!existsSync(src)) return fail(`sessions dir not found: ${src}`);

  const num = (k, d) => (env[k] !== undefined ? Number(env[k]) : d);
  const opts = { maxChars: num("MAX_CHARS", 20000), resultChars: num("RESULT_CHARS", 500) };
  const stampPath = join(homedir(), ".local", "state", "pi-push.stamp");
  const files = listJsonl(src);
  const newest = files.length ? Math.max(...files.map((f) => statSync(f).mtimeMs)) : null;
  const stamp = existsSync(stampPath) ? statSync(stampPath).mtimeMs : null;
  if (!shouldPublish({ stamp, newest, now: start, minHours: num("MIN_HOURS", 12), quietMin: num("QUIET_MIN", 60) })) {
    console.log("pi-push: nothing to do");
    return 0;
  }

  const dir = mkdtempSync(join(tmpdir(), "pi-push-"));
  try {
    stage(src, files, dir, opts);
    const remote = `${env.RCLONE_REMOTE ?? "gdrive:agent-work/pi"}/${device}`;
    const args = ["copy", dir, remote, ...(env.DRY_RUN ? ["--dry-run", "-v"] : [])];
    const r = spawnSync("rclone", args, { stdio: "inherit" });
    if (r.status !== 0) return fail(`rclone failed (${r.status ?? r.error?.message})`);
    if (!env.DRY_RUN) {
      mkdirSync(dirname(stampPath), { recursive: true });
      closeSync(openSync(stampPath, "a"));
      utimesSync(stampPath, new Date(start), new Date(start));
    }
    console.log(`pi-push: ${env.DRY_RUN ? "dry run, would publish" : "published"} ${files.length} files to ${remote}`);
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function fail(msg) {
  console.error(`pi-push: ${msg}`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main());
