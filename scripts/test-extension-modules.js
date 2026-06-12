import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(".");
const expectedModules = ["index.js", "message-types.js", "action-utils.js", "ai-trace.js", "reply-memory.js"];
for (const file of expectedModules) readFileSync(resolve(root, "extension/source", file), "utf8");

const first = buildAndHash();
const second = buildAndHash();
if (first !== second) throw new Error(`扩展构建不稳定：${first} != ${second}`);

const output = readFileSync(resolve(root, "extension/content.js"), "utf8");
for (const marker of ["pendingAiFollowups", "sendImageReply", "product_found", "ai_followup", "判断线路:"]) {
  if (!output.includes(marker)) throw new Error(`扩展构建产物缺少 ${marker}`);
}
console.log(JSON.stringify({ ok: true, modules: expectedModules.length, sha256: first }));

function buildAndHash() {
  const result = spawnSync(process.execPath, ["scripts/build-extension.js"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "扩展构建失败");
  return createHash("sha256").update(readFileSync(resolve(root, "extension/content.js"))).digest("hex");
}
