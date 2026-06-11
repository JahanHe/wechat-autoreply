import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatJudgmentResultsForPrompt,
  getJudgmentCacheStatus,
  getRunyuJudgmentConfig,
  refreshJudgmentCache,
  searchJudgmentLibrary
} from "./src/runyu-judgments.js";

const ROOT = resolve(process.env.WECHAT_KF_ROOT || ".");
const CONFIG_ROOT = resolve(process.env.WECHAT_KF_CONFIG_ROOT || ROOT);

loadDotEnv(ROOT);
loadDotEnv(CONFIG_ROOT, { override: true });

const PORT = Number(process.env.PORT || 8787);
export const AI_SERVICE_NAME = "xiaodian-ai-service";
export const AI_SERVICE_PROTOCOL = 2;
export const AI_SERVICE_ROUTES = [
  "/health",
  "/reply",
  "/quick-reply",
  "/waiting-reply",
  "/knowledge/search",
  "/judgments/status",
  "/judgments/search",
  "/judgments/refresh"
];
const QUICK_REPLIES_PATH = resolve(ROOT, "config/quick-replies.json");
const WAITING_REPLIES_PATH = resolve(ROOT, "config/waiting-replies.json");
const KNOWLEDGE_DIR = resolve(ROOT, "knowledge-base");
const ASSISTANT_PROFILE_PATH = resolve(CONFIG_ROOT, "assistant-profile.json");
const BUNDLED_ASSISTANT_PROFILE_PATH = resolve(ROOT, "config/assistant-profile.json");

const SYSTEM_PROMPT = `你是微信小店里的真人客服助手，店铺是“润宇创业笔记”，主要处理课程、会员、订单、发票、售后问题。

人设：
1. 你是普通值班客服，只根据已知规则、知识库和客服页可见信息回答。
2. 你没有人工核对、查询记录、确认结果、处理售后的能力。
3. 不要说“我帮您核对”“我确认一下”“我查一下”“我处理一下”。
4. 如果客户明显不耐烦、生气、催促、质疑客服慢，可以简短说“抱歉”。

说话方式：
1. 像真实客服聊天，别像公告、机器人或说明书。
2. 称呼客户用“您”，不要用“你”。
3. 默认承接语只说“在”。
4. 文字回复最多分成两段，也就是最多发送两次文字。
5. 每段可以稍长，但不要废话，不要为了拆短句发送很多次。
6. 不要在句尾加句号。
7. 不要写标题、编号、项目符号或“客服回复：”。
8. 只回答当前问题，不展开讲无关流程。
9. 不要称呼客户名字、昵称、头像名或页面里显示的用户昵称。
10. 不要主动写具体商品名、课程名，除非客户消息或知识库明确提到。
11. 客户只是道谢、明白、OK、结束语时，不再补一句“有问题找我”。

边界：
1. 不编造订单状态、物流节点、退款结果、价格优惠。
2. 严禁引导加微信、打电话、留手机号、换联系方式、私聊、私下交易或离开平台成交。
3. 涉及订单、售后、发票、课程权限时，只能说明平台路径或让客户按页面操作，不承诺代查代处理。
4. 你不能识别客户发来的图片内容，不要引导客户发图片或截图。
5. 可利用客服后台右侧的用户信息、商品、快捷语、素材库文字。
6. 右侧“商品”页可能是商品列表，不等于客户一定咨询这个商品。`;

const SALES_PROMPT = `成交引导：
1. 客户想联系润宇老师、找老师本人、想问答/答疑/咨询，可以推荐“润宇年度会员商业社群”。
2. 推荐点：有专属视频、直播回放、社群和专区问答。
3. 不要承诺一定能私聊、加微信或获得一对一长期陪跑。
4. 如果客户问怎么买、入口、价格、链接，可以让规则发送商品入口或邀请下单。
5. 年度会员已知售价为 365 元，其它价格和优惠以商品页展示为准。
6. 客户还在了解产品时，可以让客户看商品详情或会员专区目录图。
7. 不要把视频号主页说成外部联系方式，不要让客户去加人或私下成交。`;

const REVIEW_PROMPT = `你是客服回复审核员。你要检查草稿是否适合直接发给微信小店客户。

必须改写的情况：
1. 草稿称呼了客户名字、昵称、头像名，或把页面用户信息当成称呼。
2. 草稿主动写了具体商品名、课程名，但客户消息里没有明确提到这个名字。
3. 草稿把右侧商品列表里的商品，当成客户已经确认咨询的商品。
4. 草稿要求客户发图片、截图、加微信、打电话或离开平台。
5. 草稿承诺退款成功、发货时间、物流节点、价格优惠、权限一定开通。
6. 草稿说了“我帮您核对”“我确认一下”“我查一下”“我处理一下”等实际没有能力完成的承诺。
7. 草稿太官方、太 AI、太长、带句号、编号、标题或“收到”。
8. 草稿使用“你”称呼客户，应改成“您”。
9. 客户只是道谢、明白、OK、结束语，草稿仍继续补话。

输出规则：
1. 只输出最终可发送的回复，不要解释审核过程。
2. 不称呼客户。
3. 文字最多两段，可用换行拆成 1-2 段。
4. 不确定时只说明已知路径或让客户说具体问题，不承诺核对、查询或处理。
5. 不要句号。
6. 客户只是道谢、明白、OK、结束语时，输出空字符串。`;

export function createAiServer() {
  return createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    const aiConfig = getAiConfig();
    const judgmentStatus = await getJudgmentCacheStatus();
    json(res, 200, {
      ok: true,
      serviceName: AI_SERVICE_NAME,
      protocolVersion: AI_SERVICE_PROTOCOL,
      routes: AI_SERVICE_ROUTES,
      pid: process.pid,
      model: aiConfig.model,
      baseUrl: aiConfig.baseUrl,
      hasKey: Boolean(aiConfig.apiKey),
      thinking: aiConfig.thinking,
      reasoningEffort: aiConfig.reasoningEffort,
      review: aiConfig.reviewEnabled ? "enabled" : "disabled",
      judgments: judgmentStatus
    });
    return;
  }

  if (req.method === "POST" && req.url === "/quick-reply") {
    try {
      const body = await readJson(req);
      const exclude = Array.isArray(body.exclude) ? body.exclude : [];
      json(res, 200, pickReplyFromFile(QUICK_REPLIES_PATH, "quick", exclude, "我看到了"));
    } catch (error) {
      json(res, 500, { error: "quick_reply_failed", message: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/waiting-reply") {
    try {
      const body = await readJson(req);
      const exclude = Array.isArray(body.exclude) ? body.exclude : [];
      json(res, 200, pickReplyFromFile(WAITING_REPLIES_PATH, "waiting", exclude, "稍等一下，我还在看"));
    } catch (error) {
      json(res, 500, { error: "waiting_reply_failed", message: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/knowledge/search") {
    try {
      const body = await readJson(req);
      const query = String(body.query || "").trim();
      json(res, 200, { results: searchKnowledge(query) });
    } catch (error) {
      json(res, 500, { error: "knowledge_search_failed", message: error.message });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/judgments/status") {
    try {
      json(res, 200, await getJudgmentCacheStatus());
    } catch (error) {
      json(res, 500, { error: "judgment_status_failed", message: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/judgments/search") {
    try {
      const body = await readJson(req);
      const query = String(body.query || body.keyword || "").trim();
      const limit = Number(body.limit || 10);
      json(res, 200, await searchJudgmentLibrary(query, {
        limit,
        remoteOnly: body.remoteOnly === true
      }));
    } catch (error) {
      json(res, 500, { error: "judgment_search_failed", message: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/judgments/refresh") {
    try {
      const body = await readJson(req);
      json(res, 200, await refreshJudgmentCache(body || {}));
    } catch (error) {
      json(res, 500, { error: "judgment_refresh_failed", message: error.message });
    }
    return;
  }

  if (req.method !== "POST" || req.url !== "/reply") {
    json(res, 404, { error: "not_found" });
    return;
  }

  if (!getAiConfig().apiKey) {
    json(res, 500, { error: "missing_deepseek_api_key" });
    return;
  }

  try {
    const body = await readJson(req);
    const message = String(body.message || "").trim();
    const context = Array.isArray(body.context) ? body.context.slice(-8) : [];
    const mode = String(body.mode || "normal");
    const sideContext = String(body.sideContext || "").trim().slice(0, 5000);

    if (!message) {
      json(res, 400, { error: "empty_message" });
      return;
    }

    const result = await askDeepSeek({ message, context, mode, sideContext });
    json(res, 200, result);
  } catch (error) {
    console.error("[ai-server]", error);
    json(res, 500, { error: "reply_failed", message: error.message });
  }
  });
}

export function startAiServer({ port = PORT, host = "127.0.0.1" } = {}) {
  const server = createAiServer();

  return new Promise((resolveStart, rejectStart) => {
    const onError = (error) => {
      server.off("listening", onListening);
      rejectStart(error);
    };
    const onListening = () => {
      server.off("error", onError);
      console.log(`AI reply server listening on http://${host}:${port}`);
      resolveStart(server);
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

if (isDirectRun()) {
  startAiServer().catch((error) => {
    console.error("[ai-server]", error);
    process.exit(1);
  });
}

function getAiConfig() {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    thinking: process.env.DEEPSEEK_THINKING || "enabled",
    reasoningEffort: process.env.DEEPSEEK_REASONING_EFFORT || "medium",
    requestTimeoutMs: Number(process.env.DEEPSEEK_TIMEOUT_MS || 80000),
    reviewEnabled: process.env.DEEPSEEK_REVIEW !== "disabled",
    reviewTimeoutMs: Number(process.env.DEEPSEEK_REVIEW_TIMEOUT_MS || 25000)
  };
}

function defaultAssistantProfile() {
  return {
    systemPrompt: "",
    salesPrompt: "",
    stylePrompt: "",
    soulPrompt: "",
    guardrailsPrompt: "",
    knowledgeText: "",
    referenceText: "",
    reviewPrompt: "",
    knowledgeFilesEnabled: true,
    sidebarContextEnabled: true,
    reviewEnabled: true,
    updatedAt: ""
  };
}

function loadAssistantProfile() {
  const base = defaultAssistantProfile();
  try {
    const path = existsSync(ASSISTANT_PROFILE_PATH) ? ASSISTANT_PROFILE_PATH : BUNDLED_ASSISTANT_PROFILE_PATH;
    if (!existsSync(path)) return base;
    const saved = JSON.parse(readFileSync(path, "utf8"));
    return { ...base, ...(saved && typeof saved === "object" ? saved : {}) };
  } catch (error) {
    console.error("[ai-profile] load failed", error);
    return base;
  }
}

function buildSystemPrompt({ profile, knowledge, sideContext, judgmentContext }) {
  const sections = [
    String(profile.systemPrompt || "").trim() || SYSTEM_PROMPT,
    String(profile.salesPrompt || "").trim() || SALES_PROMPT
  ];

  addPromptSection(sections, "自定义风格", profile.stylePrompt);
  addPromptSection(sections, "灵魂和人设", profile.soulPrompt);
  addPromptSection(sections, "额外边界", profile.guardrailsPrompt);
  addPromptSection(sections, "手动知识库", profile.knowledgeText);
  addPromptSection(sections, "参考库", profile.referenceText);

  if (Array.isArray(knowledge) && knowledge.length > 0) {
    sections.push(`可参考知识库：\n${knowledge.map((item, index) => `${index + 1}. 【${item.title}】${item.text}`).join("\n")}`);
  }

  if (judgmentContext) {
    sections.push(`外部判断库检索结果：\n${judgmentContext}\n\n使用规则：只把这些结果当作判断依据和表达参考，不要透露“判断库/API/检索结果”等后台词。没有直接依据时，保持谨慎，不编造。`);
  }

  if (profile.sidebarContextEnabled !== false && sideContext) {
    sections.push(`客服后台右侧可见信息：\n${sideContext}`);
  }

  return sections.filter(Boolean).join("\n\n");
}

function addPromptSection(sections, title, value) {
  const text = String(value || "").trim();
  if (text) sections.push(`${title}：\n${text}`);
}

async function askDeepSeek({ message, context, mode, sideContext }) {
  const startedAt = Date.now();
  const aiConfig = getAiConfig();
  const profile = loadAssistantProfile();
  const knowledge = profile.knowledgeFilesEnabled === false
    ? []
    : searchKnowledge([message, sideContext, ...context.map((item) => item.text || "")].join("\n"));
  const judgmentSearch = await maybeSearchJudgments({ message, mode });
  const judgmentContext = formatJudgmentResultsForPrompt(judgmentSearch.results);
  const messages = [
    { role: "system", content: buildSystemPrompt({ profile, knowledge, sideContext, judgmentContext }) },
    ...context.map((item) => ({
      role: item.from === "kf" ? "assistant" : "user",
      content: String(item.text || "").slice(0, 500)
    })),
    {
      role: "user",
      content: mode === "deep"
        ? `请先理解客户真实意图，再给出一句可直接发送的客服回复。客户消息：${message}`
        : message
    }
  ];

  const payload = {
      model: aiConfig.model,
      messages,
      thinking: { type: aiConfig.thinking },
      reasoning_effort: aiConfig.reasoningEffort,
      stream: false
    };

  const data = await postDeepSeek(payload, aiConfig.requestTimeoutMs, aiConfig);
  const reply = sanitizeReply(data.choices?.[0]?.message?.content?.trim());
  if (!reply) throw new Error("DeepSeek returned empty reply");

  const reviewed = aiConfig.reviewEnabled && profile.reviewEnabled !== false
    ? await reviewReply({ draft: reply, message, context, sideContext, aiConfig, profile }).catch((error) => {
      console.error("[ai-review]", error);
      return reply;
    })
    : reply;

  return {
    reply: guardReply(reviewed, { message, sideContext }),
    judgments: {
      used: judgmentSearch.results.length > 0,
      count: judgmentSearch.results.length,
      fromCache: judgmentSearch.fromCache || 0,
      fromRemote: judgmentSearch.fromRemote || 0,
      error: judgmentSearch.error || ""
    },
    trace: {
      model: aiConfig.model,
      thinking: aiConfig.thinking,
      reasoningEffort: aiConfig.reasoningEffort,
      reviewEnabled: Boolean(aiConfig.reviewEnabled && profile.reviewEnabled !== false),
      reviewApplied: reviewed !== reply,
      knowledgeCount: knowledge.length,
      judgmentQueried: Boolean(judgmentSearch.queried),
      judgmentUsed: judgmentSearch.results.length > 0,
      judgmentCount: judgmentSearch.results.length,
      judgmentFromCache: judgmentSearch.fromCache || 0,
      judgmentFromRemote: judgmentSearch.fromRemote || 0,
      judgmentError: judgmentSearch.error || "",
      latencyMs: Date.now() - startedAt
    }
  };
}

async function maybeSearchJudgments({ message, mode }) {
  const config = getRunyuJudgmentConfig();
  if (!config.enabled) return { results: [], queried: false, reason: "disabled" };
  if (!shouldUseJudgmentLibrary(message, mode)) return { results: [], queried: false, reason: "not_needed" };
  return await searchJudgmentLibrary(message, { config })
    .then((result) => ({ ...result, queried: true }))
    .catch((error) => ({
      results: [],
      queried: true,
      error: String(error?.message || error)
    }));
}

function shouldUseJudgmentLibrary(message, mode) {
  const text = String(message || "").trim();
  if (!text) return false;
  if (/^(谢谢|感谢|好的|好|嗯|ok|OK|明白|收到|不用了|没事)[呀啊呢吧\s。.!！]*$/.test(text)) return false;
  if (mode === "deep") return true;
  return text.length >= 8 || /怎么|为什么|是否|能不能|值不值|适合|区别|建议|推荐|判断|怎么办|有没有/.test(text);
}

async function reviewReply({ draft, message, context, sideContext, aiConfig, profile }) {
  const payload = {
    model: aiConfig.model,
    messages: [
      { role: "system", content: String(profile.reviewPrompt || "").trim() || REVIEW_PROMPT },
      {
        role: "user",
        content: [
          `客户最新消息：${message}`,
          `最近对话：${JSON.stringify(context.slice(-6))}`,
          `右侧信息：${sideContext || "无"}`,
          `待审核草稿：${draft}`,
          "请审核并输出最终回复"
        ].join("\n\n")
      }
    ],
    thinking: { type: aiConfig.thinking },
    reasoning_effort: "low",
    stream: false
  };

  const data = await postDeepSeek(payload, aiConfig.reviewTimeoutMs, aiConfig);
  const reply = sanitizeReply(data.choices?.[0]?.message?.content?.trim());
  return reply || draft;
}

function postDeepSeek(payload, timeoutMs, aiConfig = getAiConfig()) {
  const requestTimeoutMs = Number(timeoutMs || aiConfig.requestTimeoutMs || 80000);
  return fetch(`${aiConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${aiConfig.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(requestTimeoutMs)
  }).then(async (response) => {
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`DeepSeek returned non-json: ${text.slice(0, 200)}`);
    }
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || data.message || `DeepSeek HTTP ${response.status}`);
    }
    return data;
  });
}

function pickReplyFromFile(path, prefix, exclude = [], fallback) {
  const replies = loadReplies(path, prefix);
  if (replies.length === 0) {
    return { id: "fallback", text: fallback, reset: false };
  }

  const excluded = new Set(exclude.map(String));
  let pool = replies.filter((item) => !excluded.has(item.id));
  let reset = false;

  if (pool.length === 0) {
    pool = replies;
    reset = true;
  }

  const item = pool[Math.floor(Math.random() * pool.length)];
  return { ...item, reset };
}

function loadReplies(path, prefix) {
  try {
    const replies = JSON.parse(readFileSync(path, "utf8"));
    return replies
      .map((text, index) => ({ id: `${prefix}-${index + 1}`, text: String(text || "").trim() }))
      .filter((item) => item.text);
  } catch {
    return [];
  }
}

function searchKnowledge(query, limit = 4) {
  const normalizedQuery = tokenize(query);
  if (normalizedQuery.length === 0) return [];

  return loadKnowledgeChunks()
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(normalizedQuery, chunk)
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ title, text, source, score }) => ({ title, text, source, score }));
}

function loadKnowledgeChunks() {
  if (!existsSync(KNOWLEDGE_DIR)) return [];

  const files = readdirSync(KNOWLEDGE_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => resolve(KNOWLEDGE_DIR, file));

  return files.flatMap((file) => splitMarkdown(file, readFileSync(file, "utf8")));
}

function splitMarkdown(source, content) {
  const chunks = [];
  let title = "知识库";
  let buffer = [];

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^#{1,3}\s+(.+)$/);
    if (match) {
      flush();
      title = match[1].trim();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return chunks;

  function flush() {
    const text = buffer.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text) chunks.push({ title, text: text.slice(0, 900), source });
    buffer = [];
  }
}

function scoreChunk(queryTokens, chunk) {
  const haystack = `${chunk.title}\n${chunk.text}`.toLowerCase();
  return queryTokens.reduce((score, token) => score + (haystack.includes(token) ? token.length : 0), 0);
}

function tokenize(value) {
  const text = String(value || "").toLowerCase();
  const latin = text.match(/[a-z0-9]{2,}/g) || [];
  const chinese = text.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const words = [
    ...latin,
    ...chinese.flatMap((part) => {
      const tokens = [part];
      for (let size of [2, 3, 4]) {
        for (let index = 0; index <= part.length - size; index += 1) {
          tokens.push(part.slice(index, index + size));
        }
      }
      return tokens;
    })
  ];
  return [...new Set(words)].filter((word) => !["您好", "你好", "请问", "一下", "可以"].includes(word));
}

function sanitizeReply(reply) {
  return reply
    .replace(/^["“]|["”]$/g, "")
    .replace(/^收到[，,。\s]*/g, "")
    .replace(/^(客服回复|回复|答复)[:：]\s*/i, "")
    .replace(/^\s*[-*•]\s*/gm, "")
    .replace(/^\s*\d+[.、]\s*/gm, "")
    .replace(/[。．.]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function guardReply(reply, { message, sideContext }) {
  let guarded = sanitizeReply(reply);
  if (hasForbiddenContactIntent(guarded)) {
    return "平台不支持发送联系方式\n直接在店铺里沟通";
  }
  guarded = stripLeadingCustomerName(guarded, sideContext);
  guarded = stripUnmentionedProductNames(guarded, message, sideContext);
  guarded = sanitizeReply(guarded);

  if (!guarded) return "在";
  return guarded;
}

function hasForbiddenContactIntent(text) {
  return /(加.{0,6}微信|微信号|加我|私聊|私信|联系方式|联系我|电话多少|留电话|电话联系|打电话|留手机号|发手机号|手机号多少|打给|致电|私下交易|转账|离开平台)/.test(String(text || ""));
}

function stripLeadingCustomerName(reply, sideContext) {
  const names = extractCustomerNameCandidates(sideContext);
  let text = reply;
  for (const name of names) {
    if (!name) continue;
    text = text.replace(new RegExp(`^${escapeRegExp(name)}[，,\\s：:]+`), "");
  }
  return text;
}

function stripUnmentionedProductNames(reply, message, sideContext) {
  const messageText = String(message || "");
  let text = reply;
  for (const name of extractProductNameCandidates(sideContext)) {
    if (!name || messageText.includes(name)) continue;
    text = text.split(name).join("这个课程");
  }
  return text;
}

function extractCustomerNameCandidates(sideContext) {
  const userSection = sectionText(sideContext, "用户信息");
  const lines = userSection.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const skipped = new Set(["用户信息", "标签", "数据", "来源", "描述", "新客", "粉丝", "邀请"]);
  return lines
    .filter((line) => !skipped.has(line))
    .filter((line) => /^[\u4e00-\u9fffA-Za-z0-9_-]{1,12}$/.test(line))
    .slice(0, 3);
}

function extractProductNameCandidates(sideContext) {
  const productSection = sectionText(sideContext, "商品");
  return productSection
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 4 && line.length <= 60)
    .filter((line) => /(课|课程|会员|社群|直播|专区|训练营|调优|营销|商业)/.test(line))
    .filter((line) => !/^商品\s*\d+/.test(line))
    .filter((line) => !/[¥￥]\d/.test(line))
    .filter((line) => !/已售|库存|上架|预计|小时|发货|邀请下单|发商品|计算到手价/.test(line))
    .slice(0, 20);
}

function sectionText(text, title) {
  const source = String(text || "");
  const match = source.match(new RegExp(`【${escapeRegExp(title)}】\\n([\\s\\S]*?)(?=\\n\\n【|$)`));
  return match?.[1] || "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 64 * 1024) {
        req.destroy();
        reject(new Error("request_too_large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function loadDotEnv(root, options = {}) {
  const path = resolve(root, ".env");
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && (options.override || process.env[key] == null)) process.env[key] = value;
  }
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}
