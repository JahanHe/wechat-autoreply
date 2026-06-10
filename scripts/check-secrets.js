import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const patterns = [
  {
    name: "DeepSeek/OpenAI style API key",
    regex: /\bsk-[A-Za-z0-9_-]{20,}\b/
  },
  {
    name: "real WeCom webhook URL",
    regex: /qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=[0-9a-fA-F-]{20,}/i
  },
  {
    name: "committed env API assignment",
    regex: /(?:DEEPSEEK_API_KEY|OPENAI_API_KEY)\s*=\s*["']?(?:sk-[A-Za-z0-9_-]{12,})/i
  },
  {
    name: "Runyu session cookie",
    regex: /(?:RUNYU_WEB_COOKIE\s*=\s*["']?)?session_token=[A-Za-z0-9_-]{24,}/i
  }
];

const allowList = [
  "WECOM_BOT_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key"
];

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const hits = [];

for (const file of files) {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  const sanitized = allowList.reduce((content, allowed) => content.replaceAll(allowed, ""), text);
  for (const pattern of patterns) {
    if (pattern.regex.test(sanitized)) {
      hits.push({ file, pattern: pattern.name });
    }
  }
}

if (hits.length) {
  console.error("Secret scan failed. Remove real keys before committing:");
  for (const hit of hits) {
    console.error(`- ${hit.file}: ${hit.pattern}`);
  }
  process.exit(1);
}

console.log(`Secret scan passed (${files.length} tracked files checked).`);
