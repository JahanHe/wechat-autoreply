import { mkdir, copyFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "extension");
const target = resolve(root, "dist/wechat-kf-extension");
const files = ["manifest.json", "content.js", "popup.html", "popup.js", "README.md"];

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const file of files) {
  await copyFile(resolve(source, file), resolve(target, file));
}

console.log(`Extension copied to ${target}`);
