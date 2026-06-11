import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const userData = await mkdtemp(join(tmpdir(), "xiaodian-ai-kefu-regression-"));
const mainSource = readFileSync(resolve(root, "desktop/main.js"), "utf8");
const mainShellSource = readFileSync(resolve(root, "desktop/main-shell.js"), "utf8");
const contentSource = readFileSync(resolve(root, "extension/content.js"), "utf8");
const serverSource = readFileSync(resolve(root, "server.js"), "utf8");
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
assertControlServerAuth(mainSource);
assertDeepSeekFetch(serverSource);
assertRuleExecutionConfirm(mainShellSource);
assertEnvBackedNotificationMigration(mainSource);
assertDesktopStorageBridge(mainSource, contentSource);
assertRunyuAutoCapture(mainSource);

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
  await testControlServerAuth();
  await testNavigationInformationArchitecture(main);
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
      "判断库5分钟登录监控",
      "手动捕捉Token错误码",
      "Cookie远端强制自检",
      "凭证状态历史追溯",
      "隐藏图片上传控件识别",
      "图片商品卡表情消息识别",
      "媒体消息独立心跳",
      "客服页后台心跳不节流",
      "规则动作独立模块和图片预览",
      "规则库手动激发测试",
      "非文本默认规则命中",
      "AI判断库Trace可视化",
      "本机控制接口Token保护",
      "DeepSeek调用不暴露命令行Key",
      "真实执行规则二次确认",
      "运行目录Webhook配置自动迁移",
      "客服页存储桥不覆盖window.chrome",
      "判断库新Cookie自动验证并关闭登录窗",
      "图标分组导航和Hover说明",
      "日志判断库Thinking和处理步骤",
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
  if (!main.includes("remoteOnly: true")) throw new Error("Cookie 自检没有强制远端查询");
  if (!judgment.includes("const remoteOnly = options.remoteOnly === true")) throw new Error("判断库查询没有实现远端强制模式");
  if (!judgment.includes("请在小店AI客服的判断库页面点击重新登录")) throw new Error("判断库过期提示没有优先引导应用内网页登录");
}

function assertBackgroundHeartbeat(source) {
  const viewBlock = source.slice(source.indexOf("kfView = new BrowserView"), source.indexOf("const wc = kfView.webContents"));
  if (!viewBlock.includes("backgroundThrottling: false")) {
    throw new Error("客服页切换到后台后仍可能被 Electron 节流");
  }
}

function assertEnvBackedNotificationMigration(source) {
  const start = source.indexOf("function applyEnvBackedConfig()");
  const end = source.indexOf("function applyUserDataOverride()", start);
  const block = source.slice(start, end);
  if (!block.includes("process.env.WECOM_BOT_WEBHOOK_URL")) {
    throw new Error("桌面启动没有读取运行目录中的 Webhook 配置");
  }
  if (!block.includes("hadConfiguredWebhook ? Boolean(config.notify?.enabled) : true")) {
    throw new Error("旧配置迁移没有自动启用首次发现的 Webhook，或会覆盖用户主动关闭状态");
  }
}

function assertDesktopStorageBridge(mainSource, contentSource) {
  const preloadSource = readFileSync(resolve(root, "desktop/preload.cjs"), "utf8");
  if (preloadSource.includes('exposeInMainWorld("chrome"')) {
    throw new Error("客服页 preload 仍会覆盖网页已有的 window.chrome");
  }
  if (!preloadSource.includes("...storageBridge") || !contentSource.includes("window.wechatKfDesktop?.storage?.local")) {
    throw new Error("客服页没有通过独立桌面桥读取自动回复配置");
  }
  const captureStart = mainSource.indexOf("async function captureKfPageImage()");
  const captureEnd = mainSource.indexOf("async function postWecomWithRetry", captureStart);
  const captureBlock = mainSource.slice(captureStart, captureEnd);
  if (captureBlock.indexOf("mainWindow.capturePage(kfView.getBounds())") > captureBlock.indexOf("wc.capturePage()")) {
    throw new Error("登录二维码截图没有优先使用已挂载的客服视图");
  }
}

function assertRunyuAutoCapture(source) {
  if (!source.includes('scheduleRunyuCookieInspection(`cookie_${cause || "changed"}`, { autoVerify: true })')) {
    throw new Error("判断库登录后没有自动验证新 Cookie");
  }
  const scheduleStart = source.indexOf("function scheduleRunyuCookieInspection");
  const scheduleEnd = source.indexOf("async function inspectRunyuLoginCookie", scheduleStart);
  const scheduleBlock = source.slice(scheduleStart, scheduleEnd);
  if (!scheduleBlock.includes("options.autoVerify") || !scheduleBlock.includes("captureAndVerifyRunyuCookie(source)")) {
    throw new Error("判断库 Cookie 监控没有接入自动捕捉验证");
  }
  const captureStart = source.indexOf("async function captureAndVerifyRunyuCookie");
  const captureEnd = source.indexOf("async function readRunyuSessionCookie", captureStart);
  const captureBlock = source.slice(captureStart, captureEnd);
  if (!captureBlock.includes("runyuLoginWindow.close()")) {
    throw new Error("判断库验证成功后没有自动关闭登录窗口");
  }
  const inspectStart = source.indexOf("async function inspectRunyuLoginCookie");
  const inspectEnd = source.indexOf("async function captureAndVerifyRunyuCookie", inspectStart);
  const inspectBlock = source.slice(inspectStart, inspectEnd);
  if (!inspectBlock.includes("if (normalized === saved)") || !inspectBlock.includes("正在后台验证") || !inspectBlock.includes("程序会自动验证新凭证")) {
    throw new Error("判断库登录页仍会把已保存 Cookie 误报为待手工捕捉的新凭证");
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

function assertControlServerAuth(source) {
  if (!source.includes("DESKTOP_CONTROL_TOKEN") || !source.includes("isControlRequestAuthorized")) {
    throw new Error("本机控制接口缺少 Token 鉴权");
  }
  if (!source.includes('url.pathname === "/judgments/capture-login"') || !source.includes('captureAndVerifyRunyuCookie("desktop_control")')) {
    throw new Error("本机控制接口缺少判断库 Cookie 捕捉入口");
  }
}

function assertDeepSeekFetch(source) {
  const block = source.slice(source.indexOf("function postDeepSeek"), source.indexOf("function pickReplyFromFile"));
  if (!block.includes("return fetch(")) throw new Error("DeepSeek 调用没有改为原生 fetch");
  if (block.includes("spawn(\"curl\"") || block.includes("Authorization: Bearer ${aiConfig.apiKey}")) {
    throw new Error("DeepSeek API Key 仍可能暴露在 curl 命令参数中");
  }
}

function assertRuleExecutionConfirm(source) {
  if (!source.includes("window.confirm") || !source.includes("确认要对当前客服会话真实执行这条规则吗")) {
    throw new Error("规则真实执行缺少二次确认");
  }
}

async function testControlServerAuth() {
  const health = await fetch("http://127.0.0.1:18897/health").then((response) => response.json());
  if (!health.ok || health.authRequired !== true || health.tokenConfigured !== true) {
    throw new Error(`本机控制接口健康状态异常: ${JSON.stringify(health)}`);
  }
  const actionResponse = await fetch("http://127.0.0.1:18897/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "capture_structure" })
  });
  if (actionResponse.status !== 401) {
    throw new Error(`本机控制接口未拒绝无 Token 动作请求: HTTP ${actionResponse.status}`);
  }
}

async function testNavigationInformationArchitecture(page) {
  const sections = await page.locator(".nav-section").evaluateAll((nodes) => nodes.map((node) => node.textContent.trim()).filter(Boolean));
  for (const expected of ["工作台", "自动回复", "AI 与判断库", "通知与运行", "系统"]) {
    if (!sections.includes(expected)) throw new Error(`导航缺少分组: ${expected}`);
  }
  const icons = await page.locator(".nav-icon").count();
  const buttons = await page.locator("#nav button").count();
  if (icons !== buttons || buttons < 8) throw new Error(`导航图标数量异常: icons=${icons}, buttons=${buttons}`);
  await page.locator("#nav button[data-view='rules']").hover();
  const descVisible = await page.locator("#nav button[data-view='rules'] .nav-desc").isVisible();
  if (!descVisible) throw new Error("导航 Hover 时没有展开说明文字");
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
  let countdown = await page.locator("[data-runyu-countdown]").first().textContent();
  if (!/^0[4-5]:\d{2}$/.test(String(countdown || ""))) {
    countdown = await page.evaluate((deadline) => {
      state.runyuAuth = { ...state.runyuAuth, status: "monitoring", loginWindowOpen: true, deadlineAt: deadline };
      renderJudgments();
      return document.querySelector("[data-runyu-countdown]")?.textContent || "";
    }, deadlineAt);
  }
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

async function testIncomingMediaParser(page, source) {
  const functions = [
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
  await page.getByText("判断库 3 条", { exact: true }).waitFor();
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
        sourceLabel: "判断库补充",
        customer: "会员专区怎么使用",
        reply: "您可以从订单详情进入会员专区",
        latencyMs: 2450,
        processSteps: ["检测消息", "收集上下文", "判断库命中2条", "调用AI接口", "审核通过", "发送文字"],
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
  await page.getByText("判断库 2 条", { exact: true }).waitFor();
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
