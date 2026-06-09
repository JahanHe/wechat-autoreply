import { mkdir, copyFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const source = resolve(root, "extension");
const target = resolve(root, "dist/wechat-kf-extension");
const files = ["manifest.json", "content.js", "popup.html", "popup.js", "README.md"];

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const file of files) {
  await copyFile(resolve(source, file), resolve(target, file));
}

console.log(`Extension copied to ${target}`);
