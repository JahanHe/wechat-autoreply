const RULE_TERMS = [
  "会员专区", "年度会员", "月度会员", "咨询俱乐部", "自动续费",
  "商品链接", "商品卡", "商品", "链接", "权益", "进群", "群",
  "使用", "上课", "入口", "课程目录", "目录", "直播回放", "专区问答",
  "专属视频", "社群", "图片", "截图", "图文", "照片", "文件", "视频",
  "表情", "非文本", "付款", "下单", "购买", "买", "退款", "售后",
  "联系方式", "微信", "手机号"
];

const PUNCTUATION_RE = /[\s,，.。!！?？、;；:："“”'‘’()[\]（）【】<>《》{}|｜~～…·_-]+/g;

export function normalizeRuleText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/怎样|如何|咋样|咋/g, "怎么")
    .replace(/啥/g, "什么")
    .replace(/哪儿|哪里/g, "哪")
    .replace(/加入社群|加入群|进社群|加社群|加群/g, "进群")
    .replace(/怎么用/g, "怎么使用")
    .replace(PUNCTUATION_RE, "");
}

export function buildRuleSearchText(message, aliases = {}) {
  const messageObject = message && typeof message === "object" ? message : null;
  const textParts = messageObject
    ? [messageObject.contextText, messageObject.rawText, messageObject.text]
    : [message];
  const type = String(messageObject?.type || inferMessageTypeFromRuleText(textParts.join(" ")) || "text");
  const typeAliases = {
    image: "图片 照片 截图 非文本 客户发图片 收到图片",
    emoji: "表情 图片表情 非文本 客户发表情 收到表情",
    product: "商品 商品卡 商品链接 链接 非文本 客户发商品 收到商品",
    file: "文件 附件 非文本 客户发文件 收到文件",
    video: "视频 非文本 客户发视频 收到视频",
    media: "非文本 媒体消息",
    ...aliases
  };
  return normalizeRuleText([
    ...textParts,
    typeAliases[type] || "",
    type !== "text" ? typeAliases.media : ""
  ].filter(Boolean).join(" "));
}

export function ruleMatchesSearchText(rule = {}, searchText = "") {
  const normalizedSearch = normalizeRuleText(searchText);
  return normalizeKeywordList(rule.keywords).some((keyword) => keywordMatchesSearchText(keyword, normalizedSearch));
}

export function keywordMatchesSearchText(keyword = "", searchText = "") {
  const normalizedKeyword = normalizeRuleText(keyword);
  if (!normalizedKeyword || !searchText) return false;
  if (searchText.includes(normalizedKeyword)) return true;

  const terms = tokenizeKeyword(normalizedKeyword);
  if (terms.length < 2) return false;
  if (!terms.every((term) => searchText.includes(term))) return false;

  const hasTopic = terms.some((term) => /会员专区|年度会员|月度会员|咨询俱乐部|商品|课程/.test(term));
  const hasIntent = terms.some((term) => !/会员专区|年度会员|月度会员|咨询俱乐部/.test(term));
  return hasTopic && hasIntent;
}

export function normalizeKeywordList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function inferMessageTypeFromRuleText(text) {
  const value = String(text || "").trim();
  if (/^\[图片\]/.test(value)) return "image";
  if (/^\[表情\]/.test(value)) return "emoji";
  if (/^\[商品卡\]/.test(value)) return "product";
  if (/^\[文件\]/.test(value)) return "file";
  if (/^\[视频\]/.test(value)) return "video";
  return "";
}

function tokenizeKeyword(normalizedKeyword) {
  const terms = [];
  for (const term of RULE_TERMS) {
    const normalizedTerm = normalizeRuleText(term);
    if (normalizedTerm && normalizedKeyword.includes(normalizedTerm)) terms.push(normalizedTerm);
  }
  return Array.from(new Set(terms)).sort((a, b) => b.length - a.length);
}
