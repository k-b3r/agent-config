import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDevice, otherDevices, shouldPull, cronLine, mergeCrontab, pull, CRON_MARK } from "./pi-sync.mjs";

const home = () => mkdtempSync(join(tmpdir(), "pi-sync-test-"));
const withDevice = (h, name) => {
  mkdirSync(join(h, ".config", "pi-push"), { recursive: true });
  writeFileSync(join(h, ".config", "pi-push", "device"), `${name}\n`);
};
// A fake rclone: answers `lsf` with a listing, records every other call, fails on demand.
const fakeRclone = ({ listing = "", lsfStatus = 0, failFor = [] } = {}) => {
  const calls = [];
  const run = (args, opts) => {
    calls.push(args);
    if (args[0] === "lsf") return { status: lsfStatus, stdout: listing };
    return { status: failFor.some((n) => args[1].endsWith(`/${n}`)) ? 1 : 0 };
  };
  return { run, calls };
};
const quiet = (fn) => {
  const log = console.log, err = console.error;
  console.log = console.error = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.error = err;
  }
};

test("resolveDevice: DEVICE env wins over the file, a bad name is refused", () => {
  const h = home();
  assert.equal(resolveDevice({}, h), null);
  withDevice(h, "pc");
  assert.equal(resolveDevice({}, h), "pc");
  assert.equal(resolveDevice({ DEVICE: "laptop" }, h), "laptop");
  assert.equal(resolveDevice({ DEVICE: "../etc" }, h), null);
  assert.equal(resolveDevice({ DEVICE: "a/b" }, h), null);
  rmSync(h, { recursive: true });
});

test("otherDevices: drops this device and anything that is not a plain folder name", () => {
  assert.deepEqual(otherDevices("laptop/\npc/\nphone/\n", "pc"), ["laptop", "phone"]);
  assert.deepEqual(otherDevices("../escape/\n.hidden/\na b/\n\nok-1/", "pc"), ["ok-1"]);
  assert.deepEqual(otherDevices("", "pc"), []);
});

test("shouldPull: first run, inside and outside the gap", () => {
  const now = 100 * 3600_000;
  assert.equal(shouldPull({ stamp: null, now, minHours: 24 }), true);
  assert.equal(shouldPull({ stamp: now - 23 * 3600_000, now, minHours: 24 }), false);
  assert.equal(shouldPull({ stamp: now - 24 * 3600_000, now, minHours: 24 }), true);
});

test("cronLine: absolute node and script, a PATH that finds rclone, our marker", () => {
  const line = cronLine({ node: "/n/bin/node", script: "/r/pi-sync.mjs", mode: "run", home: "/h" });
  assert.equal(line, `0 * * * * PATH=/h/.local/bin:/n/bin:/usr/local/bin:/usr/bin:/bin /n/bin/node /r/pi-sync.mjs run >> /h/pi-sync.log 2>&1 ${CRON_MARK}`);
});

test("mergeCrontab: replaces only its own line, keeps the rest, no duplicates", () => {
  const mine = (m) => cronLine({ node: "/n", script: "/s", mode: m, home: "/h" });
  const other = "30 2 * * * /usr/bin/backup";
  const once = mergeCrontab(`${other}\n`, mine("push"));
  assert.equal(once, `${other}\n${mine("push")}\n`);
  const twice = mergeCrontab(once, mine("run"));
  assert.equal(twice, `${other}\n${mine("run")}\n`);
  assert.equal(mergeCrontab("", mine("push")), `${mine("push")}\n`);
});

test("pull: copies every other device, never itself, and never uses sync", () => {
  const h = home();
  withDevice(h, "pc");
  const { run, calls } = fakeRclone({ listing: "laptop/\npc/\nphone/\n" });
  assert.equal(quiet(() => pull({ PI_SYNC_DIR: join(h, "mirror") }, h, run)), 0);
  assert.deepEqual(calls.map((c) => c[0]), ["lsf", "copy", "copy"]);
  assert.deepEqual(calls[1].slice(1), ["gdrive:agent-work/pi/laptop", join(h, "mirror", "laptop")]);
  assert.deepEqual(calls[2].slice(1), ["gdrive:agent-work/pi/phone", join(h, "mirror", "phone")]);
  assert.ok(existsSync(join(h, ".local", "state", "pi-pull.stamp")));
  rmSync(h, { recursive: true });
});

test("pull: a fresh stamp skips, FORCE and an old stamp do not", () => {
  const h = home();
  withDevice(h, "pc");
  const stamp = join(h, ".local", "state", "pi-pull.stamp");
  mkdirSync(join(h, ".local", "state"), { recursive: true });
  writeFileSync(stamp, "");
  const first = fakeRclone({ listing: "laptop/\n" });
  assert.equal(quiet(() => pull({}, h, first.run)), 0);
  assert.equal(first.calls.length, 0);
  const forced = fakeRclone({ listing: "laptop/\n" });
  quiet(() => pull({ FORCE: "1" }, h, forced.run));
  assert.equal(forced.calls.length, 2);
  const old = new Date(Date.now() - 25 * 3600_000);
  utimesSync(stamp, old, old);
  const aged = fakeRclone({ listing: "laptop/\n" });
  quiet(() => pull({}, h, aged.run));
  assert.equal(aged.calls.length, 2);
  rmSync(h, { recursive: true });
});

test("pull: a failed copy exits 1 and leaves no stamp, so the next run retries", () => {
  const h = home();
  withDevice(h, "pc");
  const { run } = fakeRclone({ listing: "laptop/\nphone/\n", failFor: ["phone"] });
  assert.equal(quiet(() => pull({}, h, run)), 1);
  assert.equal(existsSync(join(h, ".local", "state", "pi-pull.stamp")), false);
  assert.equal(quiet(() => pull({}, h, fakeRclone({ lsfStatus: 3 }).run)), 1);
  rmSync(h, { recursive: true });
});

test("pull: dry run writes no stamp; no device and no other devices are handled", () => {
  const h = home();
  assert.equal(quiet(() => pull({}, h, fakeRclone().run)), 1);
  withDevice(h, "pc");
  const { run, calls } = fakeRclone({ listing: "laptop/\n" });
  assert.equal(quiet(() => pull({ DRY_RUN: "1" }, h, run)), 0);
  assert.ok(calls[1].includes("--dry-run"));
  assert.equal(existsSync(join(h, ".local", "state", "pi-pull.stamp")), false);
  assert.equal(quiet(() => pull({}, h, fakeRclone({ listing: "pc/\n" }).run)), 0);
  rmSync(h, { recursive: true });
});

// The installed command is a symlink; the direct-run check must see through it.
test("cli: runs through a symlink, prints the cron line, rejects an unknown command", async () => {
  const { spawnSync } = await import("node:child_process");
  const { symlinkSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const h = home();
  withDevice(h, "pc");
  const link = join(h, "pi-sync");
  symlinkSync(fileURLToPath(new URL("./pi-sync.mjs", import.meta.url)), link);
  const run = (...args) => spawnSync(process.execPath, [link, ...args], { env: { HOME: h, PATH: process.env.PATH }, encoding: "utf8" });
  const printed = run("schedule", "run", "--print");
  assert.equal(printed.status, 0);
  assert.match(printed.stdout, /^0 \* \* \* \* PATH=.* .* .*pi-sync\.mjs run >> .*pi-sync\.log 2>&1 # pi-sync\n$/);
  const bad = run("bogus");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /usage: pi-sync/);
  assert.equal(run("push").status, 1 /* no sessions dir in the empty HOME */);
  rmSync(h, { recursive: true });
});
