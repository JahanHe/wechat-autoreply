import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createKnowledgeIndex } from "../src/knowledge-index.js";
import { createLocalKnowledgeService } from "../src/local-knowledge.js";
import { searchJudgmentLibrary } from "../src/runyu-judgments.js";

const root = await mkdtemp(join(tmpdir(), "xiaodian-local-knowledge-"));
const knowledgeDir = join(root, "knowledge-base");
const cachePath = join(root, "external-sync.json");
await mkdir(knowledgeDir, { recursive: true });
await writeFile(join(knowledgeDir, "local.md"), "# 会员权益\n年度会员包含社群和视频回放。\n", "utf8");
await writeFile(cachePath, JSON.stringify({
  version: 1,
  updatedAt: Date.now(),
  records: [{
    cacheKey: "runyu:judgments:1",
    id: "1",
    source: "runyu",
    type: "judgments",
    title: "私域引流判断",
    text: "先判断平台规则和用户当前意图。",
    searchText: "私域引流 平台规则 用户意图",
    fetchedAt: Date.now(),
    firstFetchedAt: Date.now()
  }]
}, null, 2), "utf8");

const fileIndex = createKnowledgeIndex({ directory: knowledgeDir });
const service = createLocalKnowledgeService({
  fileIndex,
  externalCachePath: cachePath,
  loadProfile: () => ({
    knowledgeText: "退款支持七天内按平台路径申请。",
    referenceText: "回复要简洁并称呼您。"
  })
});

const local = service.search("会员权益", { includeExternal: false, limit: 10 });
if (!local.local.some((item) => item.origin === "local_file")) throw new Error("本机文件没有进入统一索引");
if (local.externalSynced.length) throw new Error("禁用外部同步资料后仍返回外部结果");

const external = service.search("私域引流", { includeExternal: true, limit: 10 });
if (!external.externalSynced.some((item) => item.source === "runyu")) throw new Error("外部同步资料没有进入本机索引");
if (external.remoteRequestMade !== false) throw new Error("本机检索错误标记为远端请求");

const guarded = await searchJudgmentLibrary("会员", {
  config: {
    enabled: true,
    useCache: true,
    useRemote: true,
    cookie: "session_token=test-only",
    cachePath,
    maxResults: 4
  }
});
if (guarded.remoteRequestMade !== false) throw new Error("默认资料检索仍会访问远端");

const overview = service.overview();
if (overview.externalSynced.records !== 1 || overview.local.files !== 1) throw new Error("知识总览统计错误");

console.log(JSON.stringify({
  ok: true,
  localHits: local.local.length,
  externalHits: external.externalSynced.length,
  overview
}));
