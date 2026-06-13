import { existsSync, readFileSync, readdirSync, watch } from "node:fs";
import { resolve } from "node:path";
import { scoreText, tokenizeText } from "./text-utils.js";

export function createKnowledgeIndex(options = {}) {
  const directory = resolve(options.directory || "knowledge-base");
  const logger = options.logger || console;
  let cache = null;
  let watcher = null;
  let rebuildTimer = null;

  function search(query, limit = 4) {
    const tokens = tokenizeText(query);
    if (!tokens.length) return [];
    const current = ensureCache();
    const candidateIndexes = new Set();
    for (const token of tokens) {
      for (const index of current.index.get(token) || []) candidateIndexes.add(index);
    }
    const candidates = candidateIndexes.size
      ? [...candidateIndexes].map((index) => current.chunks[index])
      : current.chunks;
    return candidates
      .map((chunk) => ({ ...chunk, score: scoreText(tokens, `${chunk.title}\n${chunk.text}`) }))
      .filter((chunk) => chunk.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Number(limit || 4)))
      .map(({ title, text, source, score }) => ({ title, text, source, score }));
  }

  function reload(reason = "manual") {
    cache = buildCache(directory);
    cache.reason = reason;
    return status();
  }

  function status() {
    const current = ensureCache();
    return {
      directory,
      files: current.files,
      chunks: current.chunks.length,
      builtAt: current.builtAt,
      reason: current.reason || "initial",
      watching: Boolean(watcher)
    };
  }

  function records() {
    return ensureCache().chunks.map((chunk) => ({ ...chunk }));
  }

  function startWatching() {
    if (watcher || !existsSync(directory)) return Boolean(watcher);
    try {
      watcher = watch(directory, { persistent: false }, (_event, filename) => {
        if (filename && !String(filename).endsWith(".md")) return;
        clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(() => {
          try {
            reload("filesystem");
          } catch (error) {
            logger.error?.("[knowledge] rebuild failed", error);
            cache = null;
          }
        }, 300);
      });
      watcher.on("error", (error) => {
        logger.error?.("[knowledge] watcher failed; search will rebuild lazily", error);
        watcher?.close();
        watcher = null;
      });
      return true;
    } catch (error) {
      logger.error?.("[knowledge] watcher unavailable; using lazy cache", error);
      watcher = null;
      return false;
    }
  }

  function close() {
    clearTimeout(rebuildTimer);
    watcher?.close();
    watcher = null;
  }

  function ensureCache() {
    if (!cache) cache = buildCache(directory);
    return cache;
  }

  return { search, reload, status, records, startWatching, close };
}

export function buildCache(directory) {
  if (!existsSync(directory)) return { files: 0, chunks: [], index: new Map(), builtAt: Date.now() };
  const files = readdirSync(directory).filter((file) => file.endsWith(".md"));
  const chunks = files.flatMap((file) => splitMarkdown(resolve(directory, file), readFileSync(resolve(directory, file), "utf8")));
  const index = new Map();
  chunks.forEach((chunk, chunkIndex) => {
    for (const token of tokenizeText(`${chunk.title}\n${chunk.text}`, { keepStopWords: true })) {
      const indexes = index.get(token) || new Set();
      indexes.add(chunkIndex);
      index.set(token, indexes);
    }
  });
  return { files: files.length, chunks, index, builtAt: Date.now() };
}

export function splitMarkdown(source, content) {
  const chunks = [];
  let title = "知识库";
  let buffer = [];
  for (const line of String(content || "").split(/\r?\n/)) {
    const match = line.match(/^#{1,3}\s+(.+)$/);
    if (match) {
      flush();
      title = match[1].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return chunks;

  function flush() {
    const text = buffer.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text) chunks.push({ title, text: text.slice(0, 900), source });
    buffer = [];
  }
}
