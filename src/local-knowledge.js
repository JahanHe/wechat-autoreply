import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { scoreText, tokenizeText } from "./text-utils.js";

export function createLocalKnowledgeService(options = {}) {
  const fileIndex = options.fileIndex;
  const externalCachePath = options.externalCachePath;
  const loadProfile = options.loadProfile || (() => ({}));
  let externalIndex = null;

  function search(query, searchOptions = {}) {
    const limit = Math.max(1, Number(searchOptions.limit || 6));
    const includeExternal = searchOptions.includeExternal !== false;
    const local = [
      ...(searchOptions.includeFiles === false ? [] : (fileIndex?.search(query, limit) || [])).map((item) => normalizeHit(item, {
        origin: "local_file",
        source: item.source || "knowledge-base",
        type: "document"
      })),
      ...searchProfile(query, loadProfile(), limit)
    ];
    const externalSynced = includeExternal
      ? searchExternalCache(query, getExternalIndex(), limit)
      : [];
    const combined = [...local, ...externalSynced]
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
      .slice(0, limit);
    return {
      results: combined,
      local: combined.filter((item) => item.origin !== "external_sync"),
      externalSynced: combined.filter((item) => item.origin === "external_sync"),
      remoteRequestMade: false
    };
  }

  function overview() {
    const fileStatus = fileIndex?.status?.() || { files: 0, chunks: 0, builtAt: 0 };
    const profile = loadProfile();
    const external = getExternalIndex();
    const sources = [...new Set(external.records.map((item) => item.source).filter(Boolean))];
    const types = [...new Set(external.records.map((item) => item.type).filter(Boolean))];
    return {
      ok: true,
      local: {
        files: Number(fileStatus.files || 0),
        chunks: Number(fileStatus.chunks || 0),
        manualSections: [profile.knowledgeText, profile.referenceText].filter((item) => String(item || "").trim()).length,
        builtAt: Number(fileStatus.builtAt || 0)
      },
      externalSynced: {
        records: external.records.length,
        sources,
        types,
        updatedAt: Number(external.updatedAt || 0),
        lastRefresh: external.lastRefresh || null,
        cacheExists: Boolean(externalCachePath && existsSync(externalCachePath))
      },
      index: {
        totalRecords: Number(fileStatus.chunks || 0)
          + external.records.length
          + [profile.knowledgeText, profile.referenceText].filter((item) => String(item || "").trim()).length,
        remoteRequestMade: false
      }
    };
  }

  function getRecord(id) {
    const target = String(id || "").trim();
    if (!target) return null;
    const external = getExternalIndex().records
      .map((item) => normalizeExternalRecord(item))
      .find((item) => item.id === target || item.cacheKey === target);
    if (external) return external;
    const profile = loadProfile();
    const manual = profileRecords(profile).find((item) => item.id === target);
    if (manual) return manual;
    return (fileIndex?.records?.() || [])
      .map((item) => normalizeHit(item, {
        origin: "local_file",
        source: item.source || "knowledge-base",
        type: "document"
      }))
      .find((item) => item.id === target) || null;
  }

  function getExternalIndex() {
    const mtimeMs = externalCachePath && existsSync(externalCachePath) ? Number(statSync(externalCachePath).mtimeMs || 0) : 0;
    if (!externalIndex || externalIndex.mtimeMs !== mtimeMs) {
      externalIndex = buildExternalIndex(loadExternalCache(externalCachePath), mtimeMs);
    }
    return externalIndex;
  }

  return { search, overview, getRecord };
}

function searchProfile(query, profile = {}, limit = 6) {
  return profileRecords(profile)
    .map((item) => ({ ...item, score: scoreText(query, `${item.title}\n${item.text}`) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function profileRecords(profile = {}) {
  return [
    { id: "manual:knowledge", title: "手动知识", text: String(profile.knowledgeText || "").trim(), type: "manual_knowledge" },
    { id: "manual:reference", title: "参考回复", text: String(profile.referenceText || "").trim(), type: "reference_reply" }
  ]
    .filter((item) => item.text)
    .map((item) => ({ ...item, origin: "manual", source: "assistant-profile", syncedAt: 0, updatedAt: 0 }));
}

function searchExternalCache(query, cache, limit) {
  const tokens = tokenizeText(query);
  const candidateIndexes = new Set();
  for (const token of tokens) {
    for (const index of cache.index.get(token) || []) candidateIndexes.add(index);
  }
  const candidates = candidateIndexes.size
    ? [...candidateIndexes].map((index) => cache.records[index])
    : cache.records;
  return candidates
    .map((item) => ({ ...item, score: scoreText(query, `${item.title}\n${item.text}\n${item.domain || ""}`) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

function buildExternalIndex(cache, mtimeMs = 0) {
  const records = (cache.records || []).map((item) => normalizeExternalRecord(item));
  const index = new Map();
  records.forEach((record, recordIndex) => {
    for (const token of tokenizeText(`${record.title}\n${record.text}\n${record.domain || ""}`, { keepStopWords: true })) {
      const indexes = index.get(token) || new Set();
      indexes.add(recordIndex);
      index.set(token, indexes);
    }
  });
  return { ...cache, records, index, mtimeMs };
}

function normalizeExternalRecord(item = {}) {
  const id = String(item.cacheKey || item.id || hashText(`${item.title || ""}\n${item.text || ""}`));
  return {
    id,
    cacheKey: String(item.cacheKey || id),
    title: String(item.title || item.domain || "外部同步资料"),
    text: String(item.text || item.searchText || ""),
    domain: String(item.domain || ""),
    origin: "external_sync",
    source: String(item.source || "external"),
    type: String(item.type || "document"),
    syncedAt: Number(item.firstFetchedAt || item.fetchedAt || 0),
    updatedAt: Number(item.fetchedAt || 0)
  };
}

function normalizeHit(item = {}, meta = {}) {
  return {
    id: String(item.id || hashText(`${item.source || ""}\n${item.title || ""}\n${item.text || ""}`)),
    title: String(item.title || "本机资料"),
    text: String(item.text || ""),
    score: Number(item.score || 0),
    origin: meta.origin || item.origin || "local_file",
    source: meta.source || item.source || "knowledge-base",
    type: meta.type || item.type || "document",
    syncedAt: Number(item.syncedAt || 0),
    updatedAt: Number(item.updatedAt || 0)
  };
}

function loadExternalCache(path) {
  try {
    if (!path || !existsSync(path)) return { version: 1, updatedAt: 0, records: [], lastRefresh: null };
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return {
      version: Number(parsed?.version || 1),
      updatedAt: Number(parsed?.updatedAt || 0),
      records: Array.isArray(parsed?.records) ? parsed.records : [],
      lastRefresh: parsed?.lastRefresh || null
    };
  } catch {
    return { version: 1, updatedAt: 0, records: [], lastRefresh: null };
  }
}

function hashText(value) {
  return createHash("sha1").update(String(value || "")).digest("hex");
}
