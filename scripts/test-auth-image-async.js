import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const userData = await mkdtemp(join(tmpdir(), "xiaodian-ai-kefu-regression-"));
const mainSource = ["desktop/main.js", "desktop/app-runtime.js"]
  .map((path) => readFileSync(resolve(root, path), "utf8"))
  .join("\n");
const contentSource = ["extension/source/index.js", "extension/content.js"]
  .map((path) => readFileSync(resolve(root, path), "utf8"))
  .join("\n");
const judgmentSource = readFileSync(resolve(root, "src/runyu-judgments.js"), "utf8");
const replies = JSON.parse(readFileSync(resolve(root, "config/replies.json"), "utf8"));
const authScreenshot = "/tmp/xiaodian-ai-kefu-runyu-auth.png";
const rulesScreenshot = "/tmp/xiaodian-ai-kefu-rule-modules.png";
const logsScreenshot = "/tmp/xiaodian-ai-kefu-log-trace.png";

assertAsyncFollowupSource(contentSource);
assertMediaHeartbeat(contentSource);
assertRemoteOnlyAuthCheck(mainSource, judgmentSource);
assertBackgroundHeartbeat(mainSource);
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
  await main.reload();
  await main.waitForLoadState("domcontentloaded");
  await main.waitForTimeout(800);
  await testManualRuleTrigger(main);
  await testRuleActionModules(main);
  await main.screenshot({ path: rulesScreenshot, fullPage: true });
  await testAiTraceUi(main);
  await testLogTrace(main);
  await main.screenshot({ path: logsScreenshot, fullPage: true });
  await testIncomingMediaParser(main, contentSource);

  console.log(JSON.stringify({
    ok: true,
    checks: [
      "外部知识库5分钟配置监控",
      "手动获取凭证错误码",
      "访问凭证远端强制自检",
      "凭证状态历史追溯",
      "隐藏图片上传控件识别",
      "图片商品卡表情消息识别",
      "媒体消息独立心跳",
      "客服页后台心跳不节流",
      "规则动作独立模块和图片预览",
      "规则库手动激发测试",
      "非文本默认规则命中",
      "AI外部知识库Trace可视化",
      "日志外部知识库Thinking和处理步骤",
      "异步AI最终回复不中断",
      "内置图片文件完整"
    ],
    authScreenshot,
    rulesScreenshot,
    logsScreenshot
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

function assertMediaHeartbeat(source) {
  if (!source.includes("heartbeatTimer: null") || !source.includes("startHeartbeat();")) {
    throw new Error("内容脚本缺少独立心跳");
  }
  if (!source.includes("function parseMessageNode(row)")) {
    throw new Error("内容脚本缺少统一消息解析器");
  }
  if (!source.includes("window.__wechatShopKfBotHeartbeatAt = Date.now()")) {
    throw new Error("内容脚本没有暴露可供桌面守护进程核验的心跳时间");
  }
  if (!source.includes("function messageSearchText(message)") || !source.includes("客户发图片")) {
    throw new Error("规则匹配没有把非文本消息类型纳入搜索文本");
  }
}

function assertRemoteOnlyAuthCheck(main, judgment) {
  if (!main.includes("remoteOnly: true")) throw new Error("访问凭证检查没有强制远端查询");
  if (!judgment.includes("const remoteOnly = options.remoteOnly === true")) throw new Error("外部知识库查询没有实现远端强制模式");
}

function assertBackgroundHeartbeat(source) {
  const viewBlock = source.slice(source.indexOf("kfView = new BrowserView"), source.indexOf("const wc = kfView.webContents"));
  if (!viewBlock.includes("backgroundThrottling: false")) {
    throw new Error("客服页切换到后台后仍可能被 Electron 节流");
  }
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
      message: "正在监控配置状态",
      loginWindowOpen: true,
      cookieDetected: false,
      deadlineAt: deadline,
      updatedAt: Date.now()
    };
    renderJudgments();
  }, deadlineAt);

  await page.getByRole("button", { name: "打开网络配置页", exact: true }).waitFor();
  await page.getByRole("button", { name: "获取访问凭证", exact: true }).waitFor();
  await page.getByRole("button", { name: "检查连通性", exact: true }).waitFor();
  await page.getByRole("button", { name: "初始化本地缓存", exact: true }).waitFor();
  let countdown = await page.locator("[data-runyu-countdown]").first().textContent();
  if (!/^0[4-5]:\d{2}$/.test(String(countdown || ""))) {
    countdown = await page.evaluate((deadline) => {
      state.runyuAuth = { ...state.runyuAuth, status: "monitoring", loginWindowOpen: true, deadlineAt: deadline };
      renderJudgments();
      return document.querySelector("[data-runyu-countdown]")?.textContent || "";
    }, deadlineAt);
  }
  if (!/^0[4-5]:\d{2}$/.test(String(countdown || ""))) {
    throw new Error(`配置倒计时异常: ${countdown}`);
  }

  await page.evaluate(() => {
    state.runyuAuth = {
      status: "error",
      message: "外部知识库 API 404",
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
    throw new Error(`手动获取无访问凭证时未返回明确错误码: ${JSON.stringify(result)}`);
  }
  if (!Array.isArray(result.history) || !result.history.some((item) => item.errorCode === "RUNYU_SESSION_TOKEN_NOT_FOUND")) {
    throw new Error("手动获取错误没有写入凭证历史");
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

async function testIncomingMediaParser(page, source) {
  const functions = [
    "function buildMessagePlaceholder(kind, detail = '') { const clean = String(detail || '').replace(/\\s+/g, ' ').trim(); return clean ? `[${kind}] ${clean}` : `[${kind}]`; }",
    extractFunction(source, "parseMessageNode", "inferMessageSide"),
    extractFunction(source, "inferMessageSide", "mediaLabel"),
    extractFunction(source, "mediaLabel", "messagePlaceholder"),
    extractFunction(source, "messagePlaceholder", "stableMessageId"),
    extractFunction(source, "safeClassName", "buildStableSelector"),
    extractFunction(source, "textOf", "labelMatches")
  ].join("\n");
  const result = await page.evaluate((functionSource) => {
    document.body.innerHTML = `
      <div class="msg" id="customer-image"><div class="message-item"><img alt="会员截图"></div></div>
      <div class="msg" id="customer-emoji"><div class="message-item"><img class="emoji-face" alt="表情"></div></div>
      <div class="msg" id="kf-product"><div class="message-item flex justify-end"><div class="product-msg-block">年度会员 365元 商品ID 10000275472384</div></div></div>
    `;
    window.eval(functionSource);
    return Array.from(document.querySelectorAll(".msg")).map((node) => parseMessageNode(node));
  }, functions);
  const [image, emoji, product] = result;
  if (image?.type !== "image" || image?.from !== "customer" || !image.text.includes("会员截图")) {
    throw new Error(`图片消息解析失败: ${JSON.stringify(image)}`);
  }
  if (emoji?.type !== "emoji" || emoji?.from !== "customer") {
    throw new Error(`表情消息解析失败: ${JSON.stringify(emoji)}`);
  }
  if (product?.type !== "product" || product?.from !== "kf" || !product.text.includes("10000275472384")) {
    throw new Error(`商品卡消息解析失败: ${JSON.stringify(product)}`);
  }
}

async function testRuleActionModules(page) {
  await page.evaluate(() => {
    state.view = "rules";
    state.ruleTab = "actionRules";
    renderRules();
  });
  const imageRow = page.locator(".action-row[data-action-type='image']").first();
  await imageRow.waitFor();
  await imageRow.locator(".image-preview img").waitFor();
  const preview = await imageRow.locator(".image-preview img").evaluate((node) => ({
    width: node.naturalWidth,
    height: node.naturalHeight,
    src: node.getAttribute("src") || ""
  }));
  if (!preview.width || !preview.height || !preview.src.startsWith("data:image/")) {
    throw new Error(`图片动作缩略图加载失败: ${JSON.stringify(preview)}`);
  }
  if (await imageRow.locator("[data-action-field='productId']").count()) {
    throw new Error("图片动作仍显示商品字段");
  }
  await imageRow.locator("[data-action-field='type']").selectOption("product");
  const productRow = page.locator(".action-row[data-action-type='product']").first();
  await productRow.waitFor();
  if (!await productRow.locator("[data-action-field='productId']").count()) {
    throw new Error("切换商品动作后没有显示商品码字段");
  }
  if (await productRow.locator(".image-preview").count()) {
    throw new Error("商品动作仍显示图片预览");
  }
}

async function testManualRuleTrigger(page) {
  await page.evaluate(() => {
    state.view = "rules";
    state.ruleTab = "actionRules";
    renderRules();
  });
  await page.getByRole("button", { name: "只测试匹配", exact: true }).click();
  await page.getByText("命中 会员专区：使用和进群图文", { exact: true }).waitFor();
  await page.getByText("图片 config/reply-images/image1.png", { exact: true }).waitFor();

  const mediaResult = await page.evaluate(() => window.mainShell.testRuleTrigger({ message: "[图片] 会员截图", execute: false }));
  if (!mediaResult.matched || mediaResult.ruleName !== "非文本消息：引导文字描述") {
    throw new Error(`非文本消息没有命中默认动作规则: ${JSON.stringify(mediaResult)}`);
  }

  const productResult = await page.evaluate(() => window.mainShell.testRuleTrigger({ message: "请发年度会员商品链接", execute: false }));
  if (!productResult.matched || !productResult.actions?.some((action) => action.type === "product" && action.productId === "10000275472384")) {
    throw new Error(`商品码规则没有命中: ${JSON.stringify(productResult)}`);
  }
}

async function testAiTraceUi(page) {
  await page.evaluate(() => {
    state.view = "api";
    renderApi();
    document.querySelector("#aiTestResult").innerHTML = renderAiTestTrace({
      ok: true,
      latencyMs: 2200,
      trace: {
        model: "deepseek-v4-flash",
        thinking: "enabled",
        reviewEnabled: true,
        reviewApplied: false,
        judgmentQueried: true,
        judgmentUsed: true,
        judgmentCount: 3,
        judgmentFromCache: 2,
        judgmentFromRemote: 1
      }
    });
  });
  await page.getByText("外部知识库 3 条", { exact: true }).waitFor();
  await page.getByText("Thinking 开启", { exact: true }).waitFor();
  await page.getByText("审核通过", { exact: true }).waitFor();
}

async function testLogTrace(page) {
  await page.evaluate(() => {
    state.view = "logs";
    state.records = {
      stats: { sent: 1, failed: 0, timeout: 0 },
      items: [{
        at: Date.now(),
        kind: "sent",
        sourceType: "judgment_ai",
        sourceLabel: "外部知识库补充",
        customer: "会员专区怎么使用",
        reply: "您可以从订单详情进入会员专区",
        latencyMs: 2450,
        processSteps: ["检测消息", "收集上下文", "外部知识库命中2条", "调用AI接口", "审核通过", "发送文字"],
        aiTrace: {
          model: "deepseek-v4-flash",
          thinking: "enabled",
          reviewEnabled: true,
          reviewApplied: false,
          judgmentQueried: true,
          judgmentUsed: true,
          judgmentCount: 2,
          judgmentFromCache: 1,
          judgmentFromRemote: 1
        }
      }]
    };
    renderLogs();
  });
  await page.getByText("外部知识库 2 条", { exact: true }).waitFor();
  await page.getByText("Thinking 开启", { exact: true }).waitFor();
  const steps = await page.locator(".process-chain span").count();
  if (steps !== 6) throw new Error(`日志处理步骤数量异常: ${steps}`);
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
      const actual = await page.title().catch(() => "");
      if (actual === title || (title === "小店AI客服控制台" && actual === "小店AI客服")) return page;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`未找到窗口: ${title}`);
}
