import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_BASE_URL = "https://runyuai.zhiduoke.com.cn";
const DEFAULT_SOURCES = ["runyu", "liurun", "xiangshui", "xingxing", "book", "dedao"];
const DEFAULT_SEARCH_TYPES = ["judgments", "quotes", "cases"];
const DEFAULT_REFRESH_KEYWORDS = [
  "会员",
  "退款",
  "课程",
  "订单",
  "发票",
  "社群",
  "视频号",
  "直播",
  "线下课",
  "小店"
];
const TYPE_ACTIONS = {
  judgments: "search_judgments",
  quotes: "search_quotes",
  cases: "search_cases"
};

export function getRunyuJudgmentConfig(env = process.env) {
  const configRoot = resolve(env.WECHAT_KF_CONFIG_ROOT || env.WECHAT_KF_ROOT || ".");
  const cachePath = env.RUNYU_JUDGMENTS_CACHE_PATH
    ? resolve(env.RUNYU_JUDGMENTS_CACHE_PATH)
    : resolve(configRoot, "runyu-judgments-cache.json");
  return {
    enabled: boolEnv(env.RUNYU_JUDGMENTS_ENABLED, false),
    baseUrl: String(env.RUNYU_WEB_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    cookie: normalizeRunyuCookie(env.RUNYU_WEB_COOKIE || ""),
    sources: listEnv(env.RUNYU_JUDGMENTS_SOURCES, DEFAULT_SOURCES),
    searchTypes: listEnv(env.RUNYU_JUDGMENTS_SEARCH_TYPES, DEFAULT_SEARCH_TYPES).filter((type) => TYPE_ACTIONS[type]),
    useCache: boolEnv(env.RUNYU_JUDGMENTS_USE_CACHE, true),
    useRemote: boolEnv(env.RUNYU_JUDGMENTS_USE_REMOTE, true),
    maxResults: intEnv(env.RUNYU_JUDGMENTS_MAX_RESULTS, 4, 1, 20),
    limitPerQuery: intEnv(env.RUNYU_JUDGMENTS_LIMIT_PER_QUERY, 8, 1, 50),
    refreshLimit: intEnv(env.RUNYU_JUDGMENTS_REFRESH_LIMIT, 80, 1, 3000),
    timeoutMs: intEnv(env.RUNYU_JUDGMENTS_TIMEOUT_MS, 12_000, 1000, 60_000),
    refreshKeywords: listEnv(env.RUNYU_JUDGMENTS_REFRESH_KEYWORDS, DEFAULT_REFRESH_KEYWORDS),
    cachePath
  };
}

export function normalizeRunyuCookie(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/session_token=/.test(text)) return text;
  return `session_token=${text}`;
}

export function maskRunyuCookie(value) {
  const cookie = normalizeRunyuCookie(value);
  const token = cookie.replace(/^session_token=/, "");
  if (!token) return "";
  if (token.length <= 10) return "session_token=***";
  return `session_token=${token.slice(0, 6)}...${token.slice(-4)}`;
}

export async function getJudgmentCacheStatus(options = {}) {
  const config = options.config || getRunyuJudgmentConfig(options.env);
  const cache = loadJudgmentCache(config.cachePath);
  return {
    enabled: config.enabled,
    hasCookie: Boolean(config.cookie),
    baseUrl: config.baseUrl,
    sources: config.sources,
    searchTypes: config.searchTypes,
    useCache: config.useCache,
    useRemote: config.useRemote,
    maxResults: config.maxResults,
    refreshKeywords: config.refreshKeywords,
    cachePath: config.cachePath,
    cacheExists: existsSync(config.cachePath),
    records: cache.records.length,
    updatedAt: cache.updatedAt || 0,
    lastRefresh: cache.lastRefresh || null
  };
}

export async function searchJudgmentLibrary(query, options = {}) {
  const config = options.config || getRunyuJudgmentConfig(options.env);
  const keyword = String(query || "").trim();
  if (!config.enabled || !keyword) {
    return { ok: true, enabled: config.enabled, results: [], fromCache: 0, fromRemote: 0 };
  }

  let cache = loadJudgmentCache(config.cachePath);
  const local = config.useCache ? searchCachedJudgments(keyword, cache.records, config.maxResults) : [];
  let remote = [];
  let remoteError = "";

  if (config.useRemote && config.cookie) {
    try {
      remote = await queryJudgmentKeyword(keyword, config, {
        limit: options.limitPerQuery || config.limitPerQuery,
        sources: options.sources || config.sources,
        searchTypes: options.searchTypes || config.searchTypes
      });
      if (remote.length) {
        const merged = mergeCacheRecords(cache, remote, {
          keywords: [keyword],
          sources: options.sources || config.sources,
          searchTypes: options.searchTypes || config.searchTypes,
          reason: "search"
        });
        cache = merged.cache;
        await saveJudgmentCache(config.cachePath, cache);
      }
    } catch (error) {
      remoteError = String(error?.message || error);
    }
  }

  const mergedResults = uniqueRecords([...remote, ...local])
    .map((record) => ({ ...record, score: scoreText(keyword, record.searchText || record.text || record.title || "") }))
    .sort((a, b) => b.score - a.score || Number(b.fetchedAt || 0) - Number(a.fetchedAt || 0))
    .slice(0, options.limit || config.maxResults);

  return {
    ok: !remoteError || mergedResults.length > 0,
    enabled: true,
    hasCookie: Boolean(config.cookie),
    results: mergedResults,
    fromCache: local.length,
    fromRemote: remote.length,
    error: remoteError
  };
}

export async function refreshJudgmentCache(options = {}) {
  const config = options.config || getRunyuJudgmentConfig(options.env);
  if (!config.enabled) return { ok: false, message: "判断库未启用" };
  if (!config.cookie) return { ok: false, message: "缺少 RUNYU_WEB_COOKIE" };

  const keywords = listValue(options.keywords, config.refreshKeywords);
  if (!keywords.length) return { ok: false, message: "缺少刷新关键词" };

  const sources = listValue(options.sources, config.sources);
  const searchTypes = listValue(options.searchTypes, config.searchTypes).filter((type) => TYPE_ACTIONS[type]);
  const limit = intValue(options.limit || config.refreshLimit, 1, 3000, config.refreshLimit);
  const offset = intValue(options.offset || 0, 0, 1_000_000, 0);
  const allRecords = [];
  const errors = [];

  for (const keyword of keywords) {
    for (const source of sources) {
      for (const searchType of searchTypes) {
        try {
          const records = await queryJudgmentKeyword(keyword, config, {
            limit,
            offset,
            sources: [source],
            searchTypes: [searchType]
          });
          allRecords.push(...records);
        } catch (error) {
          errors.push({
            keyword,
            source,
            searchType,
            message: String(error?.message || error)
          });
        }
      }
    }
  }

  const existing = loadJudgmentCache(config.cachePath);
  const merged = mergeCacheRecords(existing, allRecords, {
    keywords,
    sources,
    searchTypes,
    reason: options.reason || "manual_refresh",
    errors
  });
  await saveJudgmentCache(config.cachePath, merged.cache);

  return {
    ok: errors.length === 0 || allRecords.length > 0,
    cachePath: config.cachePath,
    fetched: allRecords.length,
    offset,
    added: merged.added,
    updated: merged.updated,
    unchanged: merged.unchanged,
    total: merged.cache.records.length,
    errors
  };
}

export function formatJudgmentResultsForPrompt(results = []) {
  const items = Array.isArray(results) ? results.filter(Boolean) : [];
  if (!items.length) return "";
  return items
    .slice(0, 6)
    .map((item, index) => {
      const identity = [
        item.source ? `source=${item.source}` : "",
        item.type ? `type=${item.type}` : "",
        item.id ? `id=${item.id}` : "",
        item.domain ? `domain=${item.domain}` : ""
      ].filter(Boolean).join(" ");
      return `${index + 1}. ${identity}\n${clip(item.title || "判断记录", 80)}\n${clip(item.text || item.searchText || "", 420)}`;
    })
    .join("\n\n");
}

async function queryJudgmentKeyword(keyword, config, options = {}) {
  const records = [];
  const sources = listValue(options.sources, config.sources);
  const searchTypes = listValue(options.searchTypes, config.searchTypes).filter((type) => TYPE_ACTIONS[type]);
  const limit = intValue(options.limit || config.limitPerQuery, 1, 3000, config.limitPerQuery);
  const offset = intValue(options.offset || 0, 0, 1_000_000, 0);

  for (const source of sources) {
    for (const type of searchTypes) {
      const action = TYPE_ACTIONS[type];
      const params = type === "judgments"
        ? { keyword, status: "all" }
        : { keyword };
      const data = await queryRunyuJudgments({
        action,
        source,
        params,
        limit,
        offset
      }, config);
      records.push(...extractRecords(data).map((record) => normalizeRecord(record, {
        source,
        type,
        keyword,
        action
      })));
    }
  }

  return records;
}

async function queryRunyuJudgments(body, config) {
  const response = await fetch(`${config.baseUrl}/api/sync/judgments/query`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: config.cookie
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.timeoutMs)
  });
  const text = await response.text();
  const data = parseJson(text);
  if (!response.ok) {
    throw new Error(apiErrorMessage(response.status, data));
  }
  return data;
}

function apiErrorMessage(status, data) {
  const message = data?.message || data?.error || data?.code || JSON.stringify(data || {});
  if (status === 401) return "判断库未登录或 Cookie 已过期";
  if (status === 403) return "当前账号没有判断库查询权限";
  return `判断库 API ${status}: ${message}`;
}

function loadJudgmentCache(path) {
  try {
    if (!existsSync(path)) return emptyCache();
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return {
      ...emptyCache(),
      ...(parsed && typeof parsed === "object" ? parsed : {}),
      records: Array.isArray(parsed?.records) ? parsed.records : []
    };
  } catch {
    return emptyCache();
  }
}

async function saveJudgmentCache(path, cache) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cache, null, 2), "utf8");
}

function emptyCache() {
  return {
    version: 1,
    updatedAt: 0,
    records: [],
    lastRefresh: null
  };
}

function mergeCacheRecords(cache, records, meta = {}) {
  const next = {
    ...emptyCache(),
    ...cache,
    records: Array.isArray(cache.records) ? [...cache.records] : []
  };
  const byKey = new Map(next.records.map((record, index) => [record.cacheKey, { record, index }]).filter(([key]) => key));
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const input of uniqueRecords(records)) {
    const record = normalizeRecord(input, input);
    const current = byKey.get(record.cacheKey);
    if (!current) {
      byKey.set(record.cacheKey, { record, index: next.records.length });
      next.records.push(record);
      added += 1;
      continue;
    }
    if (current.record.hash !== record.hash) {
      next.records[current.index] = {
        ...current.record,
        ...record,
        firstFetchedAt: current.record.firstFetchedAt || current.record.fetchedAt || record.fetchedAt
      };
      updated += 1;
    } else {
      next.records[current.index] = {
        ...current.record,
        fetchedAt: record.fetchedAt,
        keywords: uniqueStrings([...(current.record.keywords || []), ...(record.keywords || [])])
      };
      unchanged += 1;
    }
  }

  next.updatedAt = Date.now();
  next.lastRefresh = {
    at: Date.now(),
    keywords: meta.keywords || [],
    sources: meta.sources || [],
    searchTypes: meta.searchTypes || [],
    reason: meta.reason || "",
    added,
    updated,
    unchanged,
    errors: meta.errors || []
  };

  return { cache: next, added, updated, unchanged };
}

function searchCachedJudgments(query, records, limit) {
  return uniqueRecords(records)
    .map((record) => ({ ...record, score: scoreText(query, record.searchText || record.text || record.title || "") }))
    .filter((record) => record.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.fetchedAt || 0) - Number(a.fetchedAt || 0))
    .slice(0, limit);
}

function normalizeRecord(record, meta = {}) {
  const raw = record?.raw && typeof record.raw === "object" ? record.raw : record;
  const source = String(meta.source || record?.librarySource || record?.source || "").trim();
  const rawSource = String(raw?.source || record?.rawSource || "").trim();
  const type = String(record?.type || meta.type || "").trim();
  const id = String(record?.id || raw?.id || raw?.judgment_id || raw?.quote_id || raw?.case_id || "").trim();
  const domain = String(record?.domain || raw?.domain || raw?.category || raw?.theme || "").trim();
  const title = firstText(record?.title, raw?.title, raw?.name, raw?.domain, raw?.category, raw?.theme, raw?.summary);
  const text = firstText(
    record?.text,
    raw?.content,
    raw?.judgment,
    raw?.quote,
    raw?.case,
    raw?.summary,
    raw?.reason,
    raw?.description,
    raw?.text,
    flattenObject(raw)
  );
  const searchText = `${title}\n${text}\n${domain}\n${flattenObject(raw)}`.trim();
  const hash = sha1(JSON.stringify(raw || record || {}));
  const cacheKey = id ? `${source}:${type}:${id}` : `${source}:${type}:${sha1(searchText || hash)}`;
  const keyword = String(record?.keyword || meta.keyword || "").trim();
  return {
    cacheKey,
    hash,
    id,
    source,
    rawSource,
    type,
    domain,
    title: clip(title || domain || "判断记录", 120),
    text: clip(text || searchText, 1200),
    searchText: clip(searchText, 3000),
    keywords: keyword ? [keyword] : Array.isArray(record?.keywords) ? record.keywords : [],
    fetchedAt: Date.now(),
    firstFetchedAt: Number(record?.firstFetchedAt || record?.fetchedAt || Date.now()),
    raw
  };
}

function extractRecords(data) {
  if (Array.isArray(data)) return data;
  const candidates = [
    data?.records,
    data?.items,
    data?.list,
    data?.rows,
    data?.data,
    data?.data?.records,
    data?.data?.items,
    data?.data?.list,
    data?.data?.rows,
    data?.result,
    data?.result?.records,
    data?.result?.items,
    data?.result?.list,
    data?.result?.rows
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function scoreText(query, value) {
  const tokens = tokenize(query);
  const text = String(value || "").toLowerCase();
  return tokens.reduce((score, token) => score + (text.includes(token) ? token.length : 0), 0);
}

function tokenize(value) {
  const text = String(value || "").toLowerCase();
  const latin = text.match(/[a-z0-9]{2,}/g) || [];
  const chinese = text.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const tokens = [
    ...latin,
    ...chinese.flatMap((part) => {
      const items = [part];
      for (const size of [2, 3, 4]) {
        for (let index = 0; index <= part.length - size; index += 1) {
          items.push(part.slice(index, index + size));
        }
      }
      return items;
    })
  ];
  return uniqueStrings(tokens).filter((token) => !["您好", "你好", "请问", "一下", "可以", "这个"].includes(token));
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function listEnv(value, fallback) {
  return listValue(value, fallback);
}

function listValue(value, fallback = []) {
  if (Array.isArray(value)) return uniqueStrings(value.map((item) => String(item || "").trim()).filter(Boolean));
  const text = String(value || "").trim();
  if (!text) return [...fallback];
  return uniqueStrings(text.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean));
}

function boolEnv(value, fallback) {
  if (value == null || value === "") return fallback;
  return /^(1|true|yes|enabled|on)$/i.test(String(value));
}

function intEnv(value, fallback, min, max) {
  return intValue(value, min, max, fallback);
}

function intValue(value, min, max, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return "";
}

function flattenObject(value) {
  if (!value || typeof value !== "object") return String(value || "");
  return Object.entries(value)
    .filter(([, item]) => item != null && typeof item !== "object")
    .map(([key, item]) => `${key}:${String(item).replace(/\s+/g, " ").trim()}`)
    .join(" ");
}

function uniqueRecords(records) {
  const seen = new Set();
  const out = [];
  for (const record of records || []) {
    const key = record?.cacheKey || sha1(JSON.stringify(record || {}));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(record);
  }
  return out;
}

function uniqueStrings(values) {
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
}

function sha1(value) {
  return createHash("sha1").update(String(value || "")).digest("hex");
}

function clip(value, max) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
