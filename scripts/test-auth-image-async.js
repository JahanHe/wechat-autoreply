import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const userData = await mkdtemp(join(tmpdir(), "xiaodian-ai-kefu-regression-"));
const mainSource = readFileSync(resolve(root, "desktop/main.js"), "utf8");
const contentSource = readFileSync(resolve(root, "extension/content.js"), "utf8");
const judgmentSource = readFileSync(resolve(root, "src/runyu-judgments.js"), "utf8");
const replies = JSON.parse(readFileSync(resolve(root, "config/replies.json"), "utf8"));
const authScreenshot = "/tmp/xiaodian-ai-kefu-runyu-auth.png";

assertAsyncFollowupSource(contentSource);
assertRemoteOnlyAuthCheck(mainSource, judgmentSource);
assertBundledImages(replies);

let app;
try {
  app = await electron.launch({
    args: ["."],
    cwd: root,
    env: {
      ...process.env,
      WECHAT_KF_ALLOW_MULTIPLE: "1",
      WECHAT_KF_DESKTOP_USER_DATA: userData,
      PORT: "18887",
      DESKTOP_CONTROL_PORT: "18897"
    }
  });

  const main = await waitForWindow(app, "小店AI客服控制台");
  await testRunyuAuthUi(main);
  await main.screenshot({ path: authScreenshot });
  await testManualCookieFailure(main);
  await testHiddenImageInput(main, extractFunction(mainSource, "findImageUploadInputScript", "dispatchFileInputChangeScript"));

  console.log(JSON.stringify({
    ok: true,
    checks: [
      "判断库5分钟登录监控",
      "手动捕捉Token错误码",
      "Cookie远端强制自检",
      "凭证状态历史追溯",
      "隐藏图片上传控件识别",
      "异步AI最终回复不中断",
      "内置图片文件完整"
    ],
    authScreenshot
  }, null, 2));
} finally {
  if (app) await app.close().catch(() => {});
}

function assertAsyncFollowupSource(source) {
  if (!source.includes("pendingAiFollowups: new Map()")) {
    throw new Error("缺少独立的异步 AI 任务状态");
  }
  if (source.includes('skippedReason: "fallback_already_sent"')) {
    throw new Error("兜底回复仍会截断最终 AI 回复");
  }
  const slowBlock = source.slice(source.indexOf("const sendSlowReply"), source.indexOf("const sendFallbackReply"));
  if (slowBlock.includes("markReplied(key)")) {
    throw new Error("承接语仍被错误标记为最终回复");
  }
  if (!source.includes('const fallbackOk = fallbackSent || await startFallbackReply("ai_empty", true);') || !source.includes("if (fallbackOk) {\n          markReplied(key);")) {
    throw new Error("AI空结果的终局兜底没有标记消息已处理");
  }
}

function assertRemoteOnlyAuthCheck(main, judgment) {
  if (!main.includes("remoteOnly: true")) throw new Error("Cookie 自检没有强制远端查询");
  if (!judgment.includes("const remoteOnly = options.remoteOnly === true")) throw new Error("判断库查询没有实现远端强制模式");
}

function assertBundledImages(config) {
  const paths = (config.actionRules || [])
    .flatMap((rule) => rule.actions || [])
    .filter((action) => action.type === "image")
    .map((action) => action.path)
    .filter(Boolean);
  if (!paths.length) throw new Error("内置动作规则没有图片动作");
  for (const relativePath of paths) {
    if (!existsSync(resolve(root, relativePath))) {
      throw new Error(`内置图片不存在: ${relativePath}`);
    }
  }
}

async function testRunyuAuthUi(page) {
  await page.waitForTimeout(800);
  const deadlineAt = Date.now() + 5 * 60_000;
  await page.evaluate((deadline) => {
    state.view = "judgments";
    state.runyuAuth = {
      status: "monitoring",
      message: "正在监控登录状态",
      loginWindowOpen: true,
      cookieDetected: false,
      deadlineAt: deadline,
      updatedAt: Date.now()
    };
    renderJudgments();
  }, deadlineAt);

  await page.getByRole("button", { name: "打开登录网页", exact: true }).waitFor();
  await page.getByRole("button", { name: "我已登录，获取凭证", exact: true }).waitFor();
  await page.getByRole("button", { name: "自检 Cookie", exact: true }).waitFor();
  await page.getByRole("button", { name: "初始化引用库", exact: true }).waitFor();
  const countdown = await page.locator("[data-runyu-countdown]").first().textContent();
  if (!/^0[4-5]:\d{2}$/.test(String(countdown || ""))) {
    throw new Error(`登录倒计时异常: ${countdown}`);
  }

  await page.evaluate(() => {
    state.runyuAuth = {
      status: "error",
      message: "判断库 API 404",
      errorCode: "RUNYU_API_404",
      httpStatus: 404,
      errorDetail: "请求地址不可用",
      loginWindowOpen: true,
      cookieDetected: true,
      deadlineAt: Date.now() + 120_000,
      updatedAt: Date.now()
    };
    state.runyuAuth.history = [{
      status: "error",
      message: "请求地址不可用",
      errorCode: "RUNYU_API_404",
      httpStatus: 404,
      at: Date.now()
    }];
    renderJudgments();
  });
  await page.getByText("错误码：RUNYU_API_404", { exact: true }).waitFor();
  await page.getByRole("button", { name: "复制错误信息", exact: true }).waitFor();
  await page.getByText("最近凭证记录（1）", { exact: true }).waitFor();
}

async function testManualCookieFailure(page) {
  const result = await page.evaluate(() => window.mainShell.captureRunyuCookie());
  if (result.status !== "login_required" || result.errorCode !== "RUNYU_SESSION_TOKEN_NOT_FOUND") {
    throw new Error(`手动捕捉无 Cookie 时未返回明确错误码: ${JSON.stringify(result)}`);
  }
  if (!Array.isArray(result.history) || !result.history.some((item) => item.errorCode === "RUNYU_SESSION_TOKEN_NOT_FOUND")) {
    throw new Error("手动捕捉错误没有写入凭证历史");
  }
}

async function testHiddenImageInput(page, functionSource) {
  const result = await page.evaluate((source) => {
    document.body.innerHTML = `
      <div role="dialog"><div>投诉 图片凭证</div><input id="complaint-upload" type="file"></div>
      <div class="chat-page">
        <div class="chat-input"><label title="图片"><input id="collab-file1-v-1" type="file" style="display:none"></label></div>
      </div>
    `;
    const finder = window.eval(`(${source})`);
    return finder();
  }, functionSource);
  if (!result.ok || result.selector !== "#collab-file1-v-1") {
    throw new Error(`隐藏图片上传控件识别失败: ${JSON.stringify(result)}`);
  }
}

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start);
  if (start < 0 || end < 0) throw new Error(`无法提取函数 ${name}`);
  return source.slice(start, end).trim();
}

async function waitForWindow(electronApp, title) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    for (const page of electronApp.windows()) {
      if ((await page.title().catch(() => "")) === title) return page;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`未找到窗口: ${title}`);
}
