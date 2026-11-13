import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync, gunzipSync } from "node:zlib";
import { shorten, maskSecrets, cleanLine, cleanJsonl, shouldPublish, resolveSrc } from "./pi-push.mjs";

const line = (o) => JSON.stringify(o);
const msg = (message) => line({ type: "message", id: "a", parentId: "b", message });

test("shorten: truncates long strings, keeps short, recurses, unicode-safe", () => {
  assert.equal(shorten("abc", 5), "abc");
  assert.equal(shorten("abcdef", 3), "abc…[truncated 3]");
  assert.deepEqual(shorten({ a: ["xxxx", { b: "yy" }], n: 1, z: null }, 2), {
    a: ["xx…[truncated 2]", { b: "yy" }],
    n: 1,
    z: null,
  });
  assert.equal(shorten("héllo wörld", 5), "héllo…[truncated 6]");
});

test("maskSecrets: masks known patterns, leaves normal text", () => {
  for (const s of [
    "sk-abcdefghijklmnopqrstuvwx",
    "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    "gho_abcdefghijklmnopqrstuvwxyz0123456789",
    "AKIAABCDEFGHIJKLMNOP",
    "Bearer abcdefghijklmnop.qrst",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456",
    "-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----",
  ]) {
    assert.equal(maskSecrets(`x ${s} y`), "x [REDACTED] y", s);
  }
  assert.equal(maskSecrets("API_TOKEN=abc123 rest"), "API_TOKEN=[REDACTED] rest");
  assert.equal(maskSecrets("password: hunter2"), "password: [REDACTED]");
  assert.equal(maskSecrets("hello world, key lime pie"), "hello world, key lime pie");
});

test("cleanLine: mask happens before truncation", () => {
  const secret = "sk-" + "a".repeat(30);
  const out = cleanLine(msg({ role: "user", content: [{ type: "text", text: "x".repeat(8) + secret }] }), { maxChars: 10, resultChars: 5 });
  assert.ok(!out.includes("sk-"));
});

test("cleanLine: session header kept", () => {
  const l = line({ type: "session", id: "s", cwd: "/x" });
  assert.equal(cleanLine(l, { maxChars: 100, resultChars: 10 }), l);
});

test("cleanLine: assistant keeps text/thinking/toolCall, drops signature", () => {
  const l = msg({
    role: "assistant",
    content: [
      { type: "thinking", thinking: "hm", thinkingSignature: "ZZZ" },
      { type: "text", text: "hi" },
      { type: "toolCall", name: "bash", arguments: { command: "ls" } },
    ],
  });
  const o = JSON.parse(cleanLine(l, { maxChars: 100, resultChars: 10 }));
  assert.equal(o.id, "a");
  assert.equal(o.parentId, "b");
  assert.equal(o.message.content.length, 3);
  assert.ok(!JSON.stringify(o).includes("ZZZ"));
});

test("cleanLine: toolResult truncated to resultChars, images omitted, details dropped", () => {
  const l = msg({
    role: "toolResult",
    toolName: "read",
    content: [
      { type: "text", text: "y".repeat(50) },
      { type: "image", data: "B64".repeat(1000), mimeType: "image/png" },
    ],
    details: { huge: "z".repeat(1000) },
  });
  const o = JSON.parse(cleanLine(l, { maxChars: 1000, resultChars: 5 }));
  assert.equal(o.message.content[0].text, "yyyyy…[truncated 45]");
  assert.deepEqual(o.message.content[1], { type: "image", omitted: true });
  assert.equal(o.message.details, undefined);
});

test("cleanLine: bashExecution output truncated to resultChars", () => {
  const o = JSON.parse(cleanLine(msg({ role: "bashExecution", command: "ls", output: "o".repeat(20) }), { maxChars: 1000, resultChars: 4 }));
  assert.equal(o.message.output, "oooo…[truncated 16]");
  assert.equal(o.message.command, "ls");
});

test("cleanLine: drops system, custom, compaction, model_change, thinking_level_change", () => {
  const opts = { maxChars: 100, resultChars: 10 };
  assert.equal(cleanLine(msg({ role: "system", content: "s" }), opts), null);
  for (const type of ["custom", "custom_message", "compaction", "model_change", "thinking_level_change", "usage"]) {
    assert.equal(cleanLine(line({ type }), opts), null, type);
  }
});

test("cleanLine: long user text truncated at maxChars", () => {
  const o = JSON.parse(cleanLine(msg({ role: "user", content: [{ type: "text", text: "u".repeat(30) }] }), { maxChars: 10, resultChars: 5 }));
  assert.equal(o.message.content[0].text, "u".repeat(10) + "…[truncated 20]");
});

test("cleanJsonl: blank and unparsable lines pass through, drops filtered", () => {
  const opts = { maxChars: 100, resultChars: 10 };
  const keep = line({ type: "session", id: "s" });
  const out = cleanJsonl([keep, "", "not json {", msg({ role: "system", content: "x" })].join("\n") + "\n", opts);
  assert.equal(out, [keep, "", "not json {"].join("\n") + "\n");
});

test("cleanJsonl: unicode survives gzip round trip", () => {
  const l = msg({ role: "user", content: [{ type: "text", text: "héllo 日本語 🎉" }] });
  const out = cleanJsonl(l + "\n", { maxChars: 100, resultChars: 10 });
  assert.equal(gunzipSync(gzipSync(out)).toString("utf8"), out);
  assert.ok(out.includes("日本語 🎉"));
});

test("shouldPublish", () => {
  const H = 3600_000;
  const now = 100 * H;
  const base = { now, minHours: 12, quietMin: 60 };
  // active: newest file touched 10 min ago
  assert.equal(shouldPublish({ ...base, stamp: null, newest: now - 10 * 60_000 }), false);
  // no files
  assert.equal(shouldPublish({ ...base, stamp: null, newest: null }), false);
  // no stamp, quiet
  assert.equal(shouldPublish({ ...base, stamp: null, newest: now - 2 * H }), true);
  // stamp fresh (<12h)
  assert.equal(shouldPublish({ ...base, stamp: now - 5 * H, newest: now - 2 * H }), false);
  // stamp old but nothing newer
  assert.equal(shouldPublish({ ...base, stamp: now - 20 * H, newest: now - 30 * H }), false);
  // stamp old and newer file
  assert.equal(shouldPublish({ ...base, stamp: now - 20 * H, newest: now - 2 * H }), true);
});

test("resolveSrc: PI_SRC > session dir > agent dir/sessions > default", () => {
  assert.equal(resolveSrc({ PI_SRC: "/a" }, "/h"), "/a");
  assert.equal(resolveSrc({ PI_CODING_AGENT_SESSION_DIR: "/b" }, "/h"), "/b");
  assert.equal(resolveSrc({ PI_CODING_AGENT_DIR: "/c" }, "/h"), "/c/sessions");
  assert.equal(resolveSrc({}, "/h"), "/h/.pi/agent/sessions");
});

test("cleanJsonl: truncation is per message, not per session", () => {
  const long = (role) => msg({ role, content: [{ type: "text", text: "w".repeat(30) }] });
  const out = cleanJsonl([long("user"), long("assistant"), long("user")].join("\n"), { maxChars: 10, resultChars: 5 });
  const texts = out.split("\n").map((l) => JSON.parse(l).message.content[0].text);
  assert.deepEqual(texts, Array(3).fill("w".repeat(10) + "…[truncated 20]"));
});
