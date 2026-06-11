import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requestDeepSeek } from "../src/deepseek-client.js";
import { createKnowledgeIndex } from "../src/knowledge-index.js";
import { scoreText, tokenizeText } from "../src/text-utils.js";

const root = await mkdtemp(join(tmpdir(), "xiaodian-knowledge-"));
try {
  await writeFile(join(root, "member.md"), "# 会员专区\n会员专区包含视频回放、社群和专区问答\n\n## 使用方式\n购买后从订单进入专区", "utf8");
  await writeFile(join(root, "refund.md"), "# 售后\n退款状态以订单页面显示为准", "utf8");

  const index = createKnowledgeIndex({ directory: root });
  const results = index.search("会员专区有什么权益", 4);
  assert(results.length > 0 && results[0].title === "会员专区", "知识库索引未命中会员内容");
  assert(index.status().files === 2, "知识库文件统计错误");
  assert(index.reload("test").reason === "test", "知识库手动刷新失败");
  index.close();

  const tokens = tokenizeText("会员专区怎么使用");
  assert(tokens.includes("会员") && tokens.includes("专区"), "中文分词兼容性错误");
  assert(scoreText("会员专区", "年度会员专区权益") > 0, "相关性评分错误");

  const success = await requestDeepSeek({ model: "test" }, {
    baseUrl: "https://example.test",
    apiKey: "secret-not-logged",
    timeoutMs: 1000,
    fetchImpl: async (_url, init) => {
      assert(init.headers.authorization === "Bearer secret-not-logged", "DeepSeek 鉴权头错误");
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    }
  });
  assert(success.choices[0].message.content === "ok", "DeepSeek 成功响应解析错误");

  await assertRejects(
    () => requestDeepSeek({}, {
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 })
    }),
    "DEEPSEEK_HTTP_ERROR"
  );
  await assertRejects(
    () => requestDeepSeek({}, {
      fetchImpl: async () => new Response("not-json", { status: 200 })
    }),
    "DEEPSEEK_INVALID_JSON"
  );

  console.log(JSON.stringify({ ok: true, knowledgeResults: results.length, tokenCount: tokens.length }));
} finally {
  await rm(root, { recursive: true, force: true });
}

async function assertRejects(fn, code) {
  try {
    await fn();
  } catch (error) {
    assert(error.code === code, `错误码应为 ${code}，实际 ${error.code}`);
    return;
  }
  throw new Error(`预期抛出 ${code}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
