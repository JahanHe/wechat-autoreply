import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

export class ReplyState {
  constructor(pathname) {
    this.pathname = pathname;
    this.data = { replied: {} };
  }

  async load() {
    try {
      this.data = JSON.parse(await readFile(this.pathname, "utf8"));
    } catch {
      this.data = { replied: {} };
    }
  }

  has(message) {
    return Boolean(this.data.replied[this.key(message)]);
  }

  async mark(message, meta = {}) {
    this.data.replied[this.key(message)] = {
      at: new Date().toISOString(),
      ...meta
    };
    await mkdir(dirname(this.pathname), { recursive: true });
    await writeFile(this.pathname, JSON.stringify(this.data, null, 2));
  }

  key(message) {
    return createHash("sha256").update(String(message)).digest("hex").slice(0, 24);
  }
}
