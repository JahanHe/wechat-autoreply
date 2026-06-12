import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { buildRuleSearchText, ruleMatchesSearchText } from "../extension/source/rule-matcher.js";

const root = resolve(".");
const expectedModules = ["index.js", "message-types.js", "action-utils.js", "ai-trace.js", "reply-memory.js", "rule-matcher.js"];
for (const file of expectedModules) readFileSync(resolve(root, "extension/source", file), "utf8");
const replies = JSON.parse(readFileSync(resolve(root, "config/replies.json"), "utf8"));

assertLiveRuleMatching(replies.actionRules || []);

const first = buildAndHash();
const second = buildAndHash();
if (first !== second) throw new Error(`扩展构建不稳定：${first} != ${second}`);

const output = readFileSync(resolve(root, "extension/content.js"), "utf8");
for (const marker of ["pendingAiFollowups", "sendImageReply", "product_found", "ai_followup", "知识线路:"]) {
  if (!output.includes(marker)) throw new Error(`扩展构建产物缺少 ${marker}`);
}
console.log(JSON.stringify({ ok: true, modules: expectedModules.length, sha256: first }));

function assertLiveRuleMatching(actionRules) {
  const cases = [
    {
      message: { text: "会员专区怎么使用", type: "text" },
      expectedRule: "会员专区：使用和进群图文",
      expectedAction: "image"
    },
    {
      message: { text: "会员专区包含啥权益呀", type: "text" },
      expectedRule: "会员专区：权益目录图文",
      expectedAction: "image"
    },
    {
      message: { text: "会员专区", contextText: "在吗 给我图片", type: "text" },
      expectedRule: "会员专区：权益目录图文",
      expectedAction: "image"
    },
    {
      message: { text: "[图片] 会员截图", type: "image" },
      expectedRule: "非文本消息：引导文字描述",
      expectedAction: "text"
    },
    {
      message: { text: "请发年度会员商品链接", type: "text" },
      expectedRule: "会员专区：发年度会员商品",
      expectedAction: "product"
    }
  ];

  for (const item of cases) {
    const searchText = buildRuleSearchText(item.message);
    const rule = actionRules.find((candidate) => {
      if (!candidate || candidate.enabled === false || !Array.isArray(candidate.actions) || !candidate.actions.length) return false;
      return ruleMatchesSearchText(candidate, searchText);
    });
    if (rule?.name !== item.expectedRule) {
      throw new Error(`真实会话规则匹配失败: ${item.message.text} -> ${rule?.name || "未命中"}`);
    }
    if (!rule.actions.some((action) => action.type === item.expectedAction)) {
      throw new Error(`真实会话规则动作缺失: ${rule.name} 缺少 ${item.expectedAction}`);
    }
  }
}

function buildAndHash() {
  const result = spawnSync(process.execPath, ["scripts/build-extension.js"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "扩展构建失败");
  return createHash("sha256").update(readFileSync(resolve(root, "extension/content.js"))).digest("hex");
}
