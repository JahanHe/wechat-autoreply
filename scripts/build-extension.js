import { mkdir, copyFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "extension");
const sourceEntry = resolve(source, "source/index.js");
const generatedContent = resolve(source, "content.js");
const target = resolve(root, "dist/wechat-kf-extension");
const files = ["manifest.json", "content.js", "popup.html", "popup.js", "README.md"];

await build({
  entryPoints: [sourceEntry],
  outfile: generatedContent,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome100"],
  charset: "utf8",
  legalComments: "none",
  sourcemap: false,
  minify: false
});

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const file of files) {
  await copyFile(resolve(source, file), resolve(target, file));
}

console.log(`Extension copied to ${target}`);
