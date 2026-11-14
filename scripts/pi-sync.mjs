#!/usr/bin/env node
// pi-sync: one command for Pi session backup on every device. Plain Node, no deps.
//   pi-sync push            publish this device's cleaned sessions (scripts/pi-push.mjs)
//   pi-sync pull            copy the other devices' Drive folders to ~/pi-sync/<device>/ (archive only, D6)
//   pi-sync run             push, then pull
//   pi-sync schedule [push|run]   install the hourly cron entry (default push); --print shows it only
// Device name: DEVICE env, else ~/.config/pi-push/device. Env: RCLONE_REMOTE (gdrive:agent-work/pi),
// PI_SYNC_DIR (~/pi-sync), PULL_HOURS (24, minimum gap between pulls), FORCE (pull regardless), DRY_RUN.
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { main as push } from "./pi-push.mjs";

const DEVICE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const CRON_MARK = "# pi-sync";

const deviceFile = (home) => join(home, ".config", "pi-push", "device");

export function resolveDevice(env, home) {
  const name = env.DEVICE ?? readOrNull(deviceFile(home))?.trim();
  return name && DEVICE_NAME.test(name) ? name : null;
}

function readOrNull(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

// Folder names come from the remote, so they are checked before they become a local path.
export function otherDevices(listing, self) {
  return listing
    .split("\n")
    .map((l) => l.trim().replace(/\/$/, ""))
    .filter((n) => DEVICE_NAME.test(n) && n !== self);
}

export function shouldPull({ stamp, now, minHours }) {
  return stamp == null || now - stamp >= minHours * 3600_000;
}

export function cronLine({ node, script, mode, home }) {
  const path = `${home}/.local/bin:${dirname(node)}:/usr/local/bin:/usr/bin:/bin`;
  return `0 * * * * PATH=${path} ${node} ${script} ${mode} >> ${home}/pi-sync.log 2>&1 ${CRON_MARK}`;
}

// Replaces our own line, keeps every other entry as it was.
export function mergeCrontab(existing, line) {
  const kept = existing.split("\n").filter((l) => l.trim() !== "" && !l.includes(CRON_MARK));
  return [...kept, line].join("\n") + "\n";
}

const rclone = (args, { capture = false } = {}) =>
  spawnSync("rclone", args, capture ? { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] } : { stdio: "inherit" });

const stampPath = (home) => join(home, ".local", "state", "pi-pull.stamp");

export function pull(env, home, run = rclone) {
  const device = resolveDevice(env, home);
  if (!device) return fail("device name missing: set DEVICE or write ~/.config/pi-push/device");
  const start = Date.now();
  const path = stampPath(home);
  const stamp = existsSync(path) ? statSync(path).mtimeMs : null;
  const minHours = env.PULL_HOURS !== undefined ? Number(env.PULL_HOURS) : 24;
  if (!env.FORCE && !shouldPull({ stamp, now: start, minHours })) {
    console.log("pi-sync pull: nothing to do");
    return 0;
  }
  const base = env.RCLONE_REMOTE ?? "gdrive:agent-work/pi";
  const dest = env.PI_SYNC_DIR ?? join(home, "pi-sync");
  const listing = run(["lsf", "--dirs-only", base], { capture: true });
  if (listing.status !== 0) return fail(`could not list ${base}`);
  const names = otherDevices(listing.stdout, device);
  const failed = [];
  for (const name of names) {
    // copy, never sync: a local mirror is never deleted from because Drive lost a file
    const r = run(["copy", `${base}/${name}`, join(dest, name), ...(env.DRY_RUN ? ["--dry-run", "-v"] : [])]);
    if (r.status !== 0) failed.push(name);
  }
  if (failed.length) return fail(`rclone failed for ${failed.join(", ")}`);
  if (!env.DRY_RUN) {
    mkdirSync(dirname(path), { recursive: true });
    closeSync(openSync(path, "a"));
    utimesSync(path, new Date(start), new Date(start));
  }
  console.log(`pi-sync pull: ${names.length ? `${env.DRY_RUN ? "dry run for" : "pulled"} ${names.join(", ")} into ${dest}` : "no other devices on Drive yet"}`);
  return 0;
}

function schedule(args, env, home) {
  const mode = args.find((a) => a === "push" || a === "run") ?? "push";
  const device = resolveDevice(env, home);
  if (!device) return fail("device name missing: set DEVICE or write ~/.config/pi-push/device");
  const line = cronLine({ node: process.execPath, script: fileURLToPath(import.meta.url), mode, home });
  if (args.includes("--print")) {
    console.log(line);
    return 0;
  }
  // The cron line carries no device name, so make sure the file the runs read exists.
  if (readOrNull(deviceFile(home))?.trim() !== device) {
    mkdirSync(dirname(deviceFile(home)), { recursive: true });
    writeFileSync(deviceFile(home), `${device}\n`);
  }
  const current = spawnSync("crontab", ["-l"], { encoding: "utf8" });
  const existing = current.status === 0 ? current.stdout : ""; // no crontab yet exits 1
  const set = spawnSync("crontab", ["-"], { input: mergeCrontab(existing, line), encoding: "utf8" });
  if (set.status !== 0) return fail(`crontab failed: ${set.stderr?.trim()}`);
  console.log(`pi-sync: scheduled hourly "${mode}" for device ${device}\n  ${line}`);
  return 0;
}

export function main(argv = process.argv.slice(2), env = process.env, home = homedir()) {
  const [cmd, ...rest] = argv;
  const device = resolveDevice(env, home);
  switch (cmd) {
    case "push":
      return device ? push({ ...env, DEVICE: device }) : fail("device name missing: set DEVICE or write ~/.config/pi-push/device");
    case "pull":
      return pull(env, home);
    case "run": {
      const pushed = device ? push({ ...env, DEVICE: device }) : fail("device name missing: set DEVICE or write ~/.config/pi-push/device");
      const pulled = pull(env, home); // a failed push must not skip the pull
      return pushed || pulled;
    }
    case "schedule":
      return schedule(rest, env, home);
    default:
      console.error("usage: pi-sync push | pull | run | schedule [push|run] [--print]");
      return 1;
  }
}

function fail(msg) {
  console.error(`pi-sync: ${msg}`);
  return 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
