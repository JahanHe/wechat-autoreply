import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const root = await mkdtemp(join(tmpdir(), "xiaodian-reply-local-only-"));
const cachePath = join(root, "external-sync.json");
await mkdir(join(root, "knowledge-base"), { recursive: true });
await writeFile(join(root, "knowledge-base", "local.md"), "# 会员\n会员专区包含视频回放。\n", "utf8");
await writeFile(cachePath, JSON.stringify({
  version: 1,
  updatedAt: Date.now(),
  records: [{
    cacheKey: "runyu:judgments:test",
    id: "test",
    source: "runyu",
    type: "judgments",
    title: "会员专区权益",
    text: "年度会员可参考社群和专区问答。",
    searchText: "会员 专区 权益 社群 问答",
    fetchedAt: Date.now(),
    firstFetchedAt: Date.now()
  }]
}, null, 2), "utf8");

let externalRequests = 0;
const external = createServer((_req, res) => {
  externalRequests += 1;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ data: [] }));
});
const ai = createServer(async (req, res) => {
  for await (const _chunk of req) {}
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ choices: [{ message: { content: "会员专区包含视频回放和社群问答" } }] }));
});

const externalPort = await listenRandom(external);
const aiPort = await listenRandom(ai);
const appPort = await reservePort();
const child = spawn(process.execPath, ["server.js"], {
  cwd: repo,
  env: {
    ...process.env,
    PORT: String(appPort),
    WECHAT_KF_ROOT: root,
    WECHAT_KF_CONFIG_ROOT: root,
    DEEPSEEK_API_KEY: "test-only",
    DEEPSEEK_BASE_URL: `http://127.0.0.1:${aiPort}`,
    DEEPSEEK_REVIEW: "disabled",
    RUNYU_JUDGMENTS_ENABLED: "enabled",
    RUNYU_JUDGMENTS_USE_CACHE: "enabled",
    RUNYU_JUDGMENTS_USE_REMOTE: "enabled",
    RUNYU_WEB_COOKIE: "session_token=test-only",
    RUNYU_WEB_BASE_URL: `http://127.0.0.1:${externalPort}`,
    RUNYU_JUDGMENTS_CACHE_PATH: cachePath
  },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForHealth(appPort);
  const response = await fetch(`http://127.0.0.1:${appPort}/reply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "会员专区包含什么权益", mode: "deep", includeExternalKnowledge: true })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`reply failed: ${JSON.stringify(data)}`);
  if (externalRequests !== 0) throw new Error(`生产回复访问了外部知识源 ${externalRequests} 次`);
  if (data.trace?.remoteRequestMade !== false) throw new Error("生产 Trace 没有明确标记禁止远端查询");
  if (!data.knowledgeHits?.externalSynced?.length) throw new Error("生产回复没有读取本机外部同步资料");
  console.log(JSON.stringify({ ok: true, externalRequests, trace: data.trace, knowledgeHits: data.knowledgeHits }));
} finally {
  child.kill("SIGTERM");
  await Promise.all([closeServer(external), closeServer(ai)]);
}

function listenRandom(server) {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => resolveListen(server.address().port));
  });
}

async function reservePort() {
  const server = createServer();
  const port = await listenRandom(server);
  await closeServer(server);
  return port;
}

async function waitForHealth(port) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("本机回复中转服务启动超时");
}

function closeServer(server) {
  return new Promise((resolveClose) => server.close(resolveClose));
}
