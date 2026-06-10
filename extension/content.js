(() => {
  const VERSION = "0.3.3";

  const CONFIG = {
    enabled: true,
    aiFallback: true,
    aiEndpoint: "http://127.0.0.1:8787/reply",
    aiSlowMs: 50000,
    noResponseAlertMs: 90000,
    noResponseCheckMs: 5000,
    maxTextParts: 2,
    maxReplyPartLength: 500,
    imageRepliesEnabled: true,
    autoPasteImages: false,
    panelAutoActionsEnabled: false,
    imageReplies: [],
    actionRules: [],
    quickAck: "在",
    debounceMs: 350,
    minReplyGapMs: 1500,
    fallbackReply: "在\n您说",
    localQuickReplies: [
      "在"
    ],
    localWaitingReplies: [
      "稍等",
      "我看说明",
      "马上"
    ],
    rules: [
      {
        name: "联系方式",
        keywords: ["联系方式", "加微信", "微信号", "电话", "手机号", "联系润宇", "联系润玉"],
        reply: "平台不支持发送联系方式\n直接在店铺里沟通"
      },
      {
        name: "会员专区",
        keywords: ["会员", "年度会员", "会员专区", "商业社群", "社群"],
        reply: "年度会员有视频、回放、社群和专区问答\n售价365元"
      },
      {
        name: "会员退款",
        keywords: ["退款", "退货", "售后", "退换"],
        reply: "7天内支持无理由退款\n订单里选不想要了即可"
      },
      {
        name: "感谢结束",
        keywords: ["谢谢", "感谢", "好的谢谢", "明白了", "知道了", "ok", "OK"],
        reply: ""
      }
    ]
  };
  const DEFAULT_RULES = CONFIG.rules.slice();

  const STATE_KEY = "__wechat_shop_kf_bot_state_v1";
  const state = {
    observer: null,
    debounceTimer: null,
    noResponseTimer: null,
    busy: false,
    lastReplyAt: 0,
    replied: loadReplied(),
    inFlight: new Set(),
    pendingCustomerMessages: new Map(),
    quickRepliesUsed: loadQuickRepliesUsed(),
    waitingRepliesUsed: loadWaitingRepliesUsed(),
    quickAckedSessions: loadQuickAckedSessions(),
    sessionSnapshots: new Map(),
    lastHref: location.href,
    routeTimer: null,
    startedOnKf: false,
    lastStatus: "启动中"
  };

  boot();

  function boot() {
    if (window.__wechatShopKfBotInstalled) return;
    window.__wechatShopKfBotInstalled = true;
    watchRoute();
    watchPageResume();
    watchNoResponseTimeout();
    maybeStartForCurrentRoute("boot");
    log("installed route watcher");
  }

  function watchRoute() {
    state.routeTimer = window.setInterval(() => {
      if (state.lastHref === location.href) return;
      state.lastHref = location.href;
      maybeStartForCurrentRoute("route");
    }, 800);
  }

  function watchPageResume() {
    window.addEventListener("pageshow", () => scheduleCheck("pageshow"));
    window.addEventListener("focus", () => scheduleCheck("focus"));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) scheduleCheck("visible");
    });
  }

  function maybeStartForCurrentRoute(reason) {
    if (!location.href.includes("/shop/kf")) {
      if (state.startedOnKf) {
        updateToolbar("非客服页");
      }
      return;
    }

    if (state.startedOnKf) {
      scheduleCheck(reason);
      return;
    }

    state.startedOnKf = true;
    installToolbar();
    updateToolbar(`已加载 v${VERSION}`);
    loadSettings();
    watchSettings();
    syncObserver();
    scheduleCheck(reason);
    log("started on kf page", location.href);
  }

  function loadSettings() {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    chrome.storage.local.get({ ...CONFIG, configVersion: "" }, (items) => {
      if (items.configVersion !== VERSION) {
        chrome.storage.local.set({ configVersion: VERSION });
      }

      Object.assign(CONFIG, items);
      updateToolbar(CONFIG.enabled ? "监听中" : "已暂停");
      syncObserver();
    });
  }

  function watchSettings() {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      for (const [key, change] of Object.entries(changes)) {
        if (key in CONFIG) CONFIG[key] = change.newValue;
      }
      updateToolbar(CONFIG.enabled ? "监听中" : "已暂停");
      syncObserver();
      if (CONFIG.enabled) scheduleCheck("settings");
    });
  }

  function syncObserver() {
    if (CONFIG.enabled) {
      observe();
    } else {
      stopObserver();
    }
  }

  function observe() {
    state.observer?.disconnect();
    state.observer = new MutationObserver(() => scheduleCheck("mutation"));
    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function stopObserver() {
    state.observer?.disconnect();
    state.observer = null;
    window.clearTimeout(state.debounceTimer);
    state.debounceTimer = null;
    state.busy = false;
  }

  function scheduleCheck(reason) {
    if (!CONFIG.enabled) {
      updateToolbar("已暂停");
      return;
    }
    window.clearTimeout(state.debounceTimer);
    state.debounceTimer = window.setTimeout(() => checkAndReply(reason), CONFIG.debounceMs);
  }

  async function checkAndReply(reason) {
    if (!CONFIG.enabled) return;
    if (state.busy) return;

    state.busy = true;
    updateToolbar("Bot接管中", { takeover: true });
    try {
      await checkAndReplyOnce(reason);
    } finally {
      state.busy = false;
      reportStatus(state.lastStatus || "监听中");
    }
  }

  async function checkAndReplyOnce(reason) {
    const opened = await ensureConversationOpen();
    if (!opened) {
      updateToolbar("等待新会话");
      return;
    }

    const latest = latestMessage();
    if (!latest) {
      updateToolbar("无客户消息");
      state.pendingCustomerMessages.clear();
      return;
    }

    if (latest.from !== "customer") {
      updateToolbar("最后一条是客服");
      state.pendingCustomerMessages.clear();
      return;
    }

    const key = `${latest.id}:${latest.text}`;
    if (state.replied.has(key)) {
      updateToolbar("已发送");
      return;
    }
    if (state.inFlight.has(key)) {
      updateToolbar("处理中");
      return;
    }

    const now = Date.now();
    if (now - state.lastReplyAt < CONFIG.minReplyGapMs) return;

    state.inFlight.add(key);
    let responseSent = false;

    try {
      const actionRule = matchActionRule(latest.text);
      if (actionRule) {
        updateToolbar("执行动作规则");
        const result = await executeActions(actionRule.actions || [], latest.text, actionRule.name || "");
        if (!result.ok) {
          updateToolbar("动作规则失败");
          reportEvent("reply_failed", { stage: "action_rule", sourceType: "action_rule", usedRuleLibrary: true, reason, customer: latest.text, reply: actionRule.name || "", error: result.message });
          return;
        }

        responseSent = true;
        markReplied(key);
        state.lastReplyAt = Date.now();
        updateToolbar(actionResultStatus(result));
        reportReplySent({
          stage: "action_rule",
          sourceType: "action_rule",
          usedRuleLibrary: true,
          usedDirectReply: false,
          usedAi: false,
          reason,
          customer: latest.text,
          rule: actionRule.name || "",
          status: actionResultStatus(result),
          actions: summarizeActions(actionRule.actions || []),
          reply: summarizeActionText(actionRule.actions || [])
        });
        log("action rule executed", { reason, customer: latest.text, actionRule, result });
        return;
      }

      const imageReply = matchImageReply(latest.text);
      if (imageReply) {
        const caption = String(imageReply.caption || "我发你图片看下").trim();
        const captionSent = caption ? await sendReplyParts(caption) : false;
        const imageResult = await requestImageReply(imageReply, latest.text);

        if (!captionSent && !imageResult.ok) {
          updateToolbar("图片回复失败");
          reportEvent("reply_failed", { stage: "image_reply", sourceType: "image_rule", usedRuleLibrary: true, reason, customer: latest.text, reply: caption, error: imageResult.message });
          return;
        }

        responseSent = captionSent || Boolean(imageResult.ok);
        markReplied(key);
        state.lastReplyAt = Date.now();
        updateToolbar(imageResult.sent ? "图片已发送" : imageResult.pasted ? "图片已粘贴" : imageResult.ok ? "图片待发送" : "图片已承接");
        reportReplySent({
          stage: "image_reply",
          sourceType: "image_rule",
          usedRuleLibrary: true,
          usedDirectReply: false,
          usedAi: false,
          reason,
          customer: latest.text,
          rule: imageReply.name || "",
          status: imageResult.sent ? "图片已发送" : "图片待确认",
          actions: [{ type: "image", path: imageReply.path || imageReply.imagePath || "" }],
          reply: caption
        });
        log("image reply matched", { reason, customer: latest.text, imageReply, imageResult });
        return;
      }

      const panelAction = matchPanelAction(latest.text);
      if (panelAction) {
        const acted = await performPanelActionWithDesktopFallback(panelAction);
        if (acted) {
          responseSent = true;
          markReplied(key);
          state.lastReplyAt = now;
          updateToolbar(panelAction.successStatus);
          reportReplySent({
            stage: "panel_action",
            sourceType: "panel_action",
            usedRuleLibrary: true,
            usedDirectReply: false,
            usedAi: false,
            reason,
            customer: latest.text,
            rule: panelAction.successStatus || "",
            status: panelAction.successStatus || "",
            actions: [summarizeAction(panelAction)]
          });
          log("panel action sent", { reason, customer: latest.text, action: panelAction });
          return;
        }
      }

      const ruleReply = matchRuleReply(latest.text);
      if (ruleReply) {
        const sent = await sendReplyParts(ruleReply);
        if (!sent) {
          updateToolbar("发送失败");
          reportEvent("reply_failed", { stage: "rule", sourceType: "text_rule", usedRuleLibrary: true, reason, customer: latest.text, reply: ruleReply });
          warn("send failed", { reason, latest, reply: ruleReply });
          return;
        }

        responseSent = true;
        markReplied(key);
        state.lastReplyAt = now;
        updateToolbar("文字已发送");
        reportReplySent({
          stage: "rule",
          sourceType: "text_rule",
          usedRuleLibrary: true,
          usedDirectReply: false,
          usedAi: false,
          reason,
          customer: latest.text,
          status: "文字已发送",
          reply: ruleReply
        });
        log("rule replied", { reason, customer: latest.text, reply: ruleReply });
        return;
      }

      const sessionKey = currentSessionKey();
      let firstReply = "";
      if (shouldSendQuickAck(sessionKey)) {
        firstReply = await askQuickReply(latest.text);
        const sent = await sendReplyParts(firstReply);
        if (!sent) {
          updateToolbar("发送失败");
          reportEvent("reply_failed", { stage: "quick_ack", sourceType: "quick_ack", usedDirectReply: true, reason, customer: latest.text, reply: firstReply });
          warn("quick ack failed", { reason, latest, reply: firstReply });
          return;
        }

        responseSent = true;
        markReplied(key);
        state.quickAckedSessions.add(sessionKey);
        persistQuickAckedSessions();
        state.lastReplyAt = now;
        updateToolbar("AI 请求中");
        reportReplySent({
          stage: "quick_ack",
          sourceType: "quick_ack",
          usedRuleLibrary: false,
          usedDirectReply: true,
          usedAi: false,
          reason,
          customer: latest.text,
          status: "承接语已发送",
          reply: firstReply
        });
        log("quick ack sent", { reason, customer: latest.text, reply: firstReply, sessionKey });
      } else {
        updateToolbar("AI 请求中");
        log("skip quick ack", { reason, customer: latest.text, sessionKey });
      }

      let waitingSent = false;
      const waitingTimer = window.setTimeout(async () => {
        if (!CONFIG.enabled) return;
        const waitingReply = await askWaitingReply();
        const sent = await sendReplyParts(waitingReply);
        waitingSent = sent;
        if (sent) {
          responseSent = true;
          markReplied(key);
          state.lastReplyAt = Date.now();
          updateToolbar("继续等 AI");
          reportReplySent({
            stage: "waiting_reply",
            sourceType: "waiting_reply",
            usedRuleLibrary: false,
            usedDirectReply: true,
            usedAi: false,
            reason,
            customer: latest.text,
            status: "等待语已发送",
            reply: waitingReply
          });
          return;
        }

        updateToolbar("等待语发送失败");
        reportEvent("reply_failed", { stage: "waiting_reply", sourceType: "waiting_reply", usedDirectReply: true, reason, customer: latest.text, reply: waitingReply });
      }, CONFIG.aiSlowMs);

      const aiReply = await askLocalAi(latest.text, "deep");
      window.clearTimeout(waitingTimer);
      if (!aiReply || (firstReply && normalize(aiReply) === normalize(firstReply))) {
        if (!responseSent) {
          updateToolbar("未能回复");
          reportEvent("reply_failed", { stage: "ai_empty", sourceType: "ai_followup", usedAi: true, reason, customer: latest.text });
          return;
        }

        updateToolbar(waitingSent ? "等待语已发送" : "承接语已发送");
        return;
      }

      const followupSent = await sendReplyParts(aiReply);
      if (followupSent) {
        responseSent = true;
        markReplied(key);
        state.lastReplyAt = Date.now();
        reportReplySent({
          stage: "ai_followup",
          sourceType: "ai_followup",
          usedRuleLibrary: false,
          usedDirectReply: false,
          usedAi: true,
          reason,
          customer: latest.text,
          status: "AI 已发送",
          reply: aiReply
        });
      } else if (!responseSent) {
        reportEvent("reply_failed", { stage: "ai_followup", sourceType: "ai_followup", usedAi: true, reason, customer: latest.text, reply: aiReply });
      } else {
        reportEvent("ai_followup_failed", { reason, customer: latest.text, reply: aiReply });
      }
      updateToolbar(followupSent ? "AI 已发送" : "AI 补充失败");
      log("ai followup", { sent: followupSent, customer: latest.text, reply: aiReply });
    } finally {
      state.inFlight.delete(key);
    }
  }

  function markReplied(key) {
    state.replied.add(key);
    state.pendingCustomerMessages.delete(key);
    persistReplied();
  }

  function watchNoResponseTimeout() {
    if (state.noResponseTimer) return;
    state.noResponseTimer = window.setInterval(inspectNoResponseTimeout, CONFIG.noResponseCheckMs);
  }

  function inspectNoResponseTimeout() {
    if (!CONFIG.enabled || !state.startedOnKf || !location.href.includes("/shop/kf")) return;

    const latest = latestMessage();
    if (!latest) {
      state.pendingCustomerMessages.clear();
      return;
    }

    if (latest.from !== "customer") {
      state.pendingCustomerMessages.clear();
      return;
    }

    const key = `${latest.id}:${latest.text}`;
    if (state.replied.has(key)) {
      state.pendingCustomerMessages.delete(key);
      return;
    }

    const now = Date.now();
    const pending = state.pendingCustomerMessages.get(key) || {
      firstSeenAt: now,
      lastAlertAt: 0,
      text: latest.text,
      id: latest.id
    };

    state.pendingCustomerMessages.set(key, pending);
    const age = now - pending.firstSeenAt;
    const sinceLastAlert = now - pending.lastAlertAt;
    if (age < CONFIG.noResponseAlertMs || sinceLastAlert < CONFIG.noResponseAlertMs) return;

    pending.lastAlertAt = now;
    updateToolbar("客户消息超时未回复");
    reportEvent("reply_timeout", {
      stage: state.inFlight.has(key) ? "in_flight_timeout" : "unhandled_timeout",
      customer: latest.text,
      ageMs: age,
      busy: state.busy,
      enabled: CONFIG.enabled
    });
  }

  function shouldSendQuickAck(sessionKey) {
    if (state.quickAckedSessions.has(sessionKey)) return false;
    return !hasVisibleKfMessage();
  }

  function hasVisibleKfMessage() {
    return visibleElements(".text-msg.bg-kf").some((node) => textOf(node));
  }

  async function ensureConversationOpen() {
    const sessions = visibleElements(".session-item-container, .session-list-card");
    const pending = findPendingSession(sessions);
    if (pending && !isCurrentSession(pending)) {
      pending.click();
      await sleep(700);
      snapshotSessions();
      return visible(document.querySelector("#input-textarea"));
    }

    snapshotSessions(sessions);
    if (visible(document.querySelector("#input-textarea"))) return true;
    if (sessions.length === 0) return false;

    const preferred = sessions.find(isCurrentSession) || sessions[0];
    preferred.click();
    await sleep(600);
    return visible(document.querySelector("#input-textarea"));
  }

  function findPendingSession(sessions = visibleElements(".session-item-container, .session-list-card")) {
    const leftSessions = sessions.filter(isLeftSession);
    const unread = leftSessions.find((node) => !isCurrentSession(node) && sessionLooksUnread(node));
    if (unread) return unread;

    const changed = leftSessions.find((node) => {
      if (isCurrentSession(node)) return false;
      const id = sessionIdentity(node);
      const text = sessionSnapshotText(node);
      const previous = state.sessionSnapshots.get(id);
      return previous && previous !== text;
    });
    return changed || null;
  }

  function snapshotSessions(sessions = visibleElements(".session-item-container, .session-list-card")) {
    for (const session of sessions.filter(isLeftSession)) {
      const id = sessionIdentity(session);
      if (!id) continue;
      state.sessionSnapshots.set(id, sessionSnapshotText(session));
    }
  }

  function isLeftSession(node) {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.left < window.innerWidth * 0.42;
  }

  function isCurrentSession(node) {
    const classes = `${node.className || ""} ${Array.from(node.querySelectorAll("[class]")).map((child) => child.className).join(" ")}`;
    return /\b(current|active|selected)\b/i.test(classes);
  }

  function sessionLooksUnread(node) {
    const text = textOf(node);
    const classes = `${node.className || ""} ${Array.from(node.querySelectorAll("[class]")).map((child) => child.className).join(" ")}`;
    if (/未读|新消息/.test(text)) return true;
    if (/\b(unread|badge|dot|notice|new|red|num|count)\b/i.test(classes)) return true;

    return Array.from(node.querySelectorAll("*")).some((child) => {
      const rect = child.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.width > 28 || rect.height > 28) return false;
      const style = window.getComputedStyle(child);
      return /rgb\(255,\s*0,\s*0\)|rgb\(250,\s*81,\s*81\)|rgb\(245,\s*108,\s*108\)|#f/.test(style.backgroundColor);
    });
  }

  function sessionIdentity(node) {
    const lines = textOf(node)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.find((line) => !/^\d+$/.test(line) && !/^\d{1,2}:\d{2}$/.test(line)) || lines[0] || "";
  }

  function sessionSnapshotText(node) {
    return textOf(node).replace(/\s+/g, " ").trim();
  }

  function latestMessage() {
    const nodes = visibleElements(".text-msg.bg-user, .text-msg.bg-kf");
    const node = nodes.at(-1);
    if (!node) return null;

    return {
      from: node.classList.contains("bg-user") ? "customer" : "kf",
      id: node.closest(".msg")?.id || "",
      text: textOf(node)
    };
  }

  function currentSessionKey() {
    const card = visibleElements(".session-list-card, .session-item-container")
      .filter(isLeftSession)
      .sort((a, b) => Number(isCurrentSession(b)) - Number(isCurrentSession(a)))
      .map((node) => textOf(node))
      .find(Boolean);
    if (!card) return `url:${location.href}`;

    const lines = card
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const nickname = lines.find((line) => !/^\d+$/.test(line) && !/^\d{1,2}:\d{2}$/.test(line));
    return `session:${nickname || lines.join("|")}`;
  }

  function matchRuleReply(message) {
    const text = normalize(message);
    const rules = Array.isArray(CONFIG.rules) && CONFIG.rules.length > 0 ? CONFIG.rules : DEFAULT_RULES;
    for (const rule of rules) {
      if (!rule) continue;
      if (rule.enabled === false) continue;
      const keywords = Array.isArray(rule.keywords) ? rule.keywords : splitKeywords(rule.keywords);
      if (keywords.some((keyword) => text.includes(normalize(keyword)))) {
        return rule.reply;
      }
    }
    return "";
  }

  function matchActionRule(message) {
    const rules = Array.isArray(CONFIG.actionRules) ? CONFIG.actionRules : [];
    const text = normalize(message);
    return rules.find((rule) => {
      if (!rule || rule.enabled === false || !Array.isArray(rule.actions) || rule.actions.length === 0) return false;
      const keywords = Array.isArray(rule.keywords) ? rule.keywords : splitKeywords(rule.keywords);
      return keywords.some((keyword) => keyword && text.includes(normalize(keyword)));
    }) || null;
  }

  async function executeActions(actions, customerText, ruleName = "") {
    const result = {
      ok: false,
      sentText: false,
      sentImage: false,
      sentFile: false,
      sentProduct: false,
      sentMaterial: false,
      sentQuickReply: false,
      clicked: false,
      captured: false,
      ignored: false,
      message: ""
    };

    for (const action of actions) {
      if (!action || action.enabled === false) continue;
      const type = String(action.type || "").trim();

      if (type === "text") {
        const sent = await sendReplyParts(action.text || action.reply || "");
        result.sentText = result.sentText || sent;
        if (!sent) return { ...result, message: "text action failed" };
      } else if (type === "ignore" || type === "noop") {
        result.ignored = true;
      } else if (type === "image") {
        const imageResult = await requestImageReply({
          name: action.name || ruleName,
          path: action.path || action.imagePath || "",
          caption: action.caption || "",
          fromAction: true
        }, customerText);
        if (!imageResult.ok) return { ...result, message: imageResult.message || "image action failed" };
        if (!imageResult.sent) return { ...result, message: imageResult.message || "image not sent" };
        result.sentImage = true;
      } else if (type === "file") {
        const fileResult = await requestPageAction({
          ...action,
          type: "file",
          name: action.name || ruleName,
          customer: customerText
        });
        result.sentFile = result.sentFile || Boolean(fileResult.ok || fileResult.sent);
        if (!fileResult.ok && !fileResult.sent) return { ...result, message: fileResult.message || "file action failed" };
      } else if (type === "product") {
        const acted = await performPanelActionWithDesktopFallback({
          ...action,
          tab: action.tab || "商品",
          button: action.button || "发商品",
          fallbackButton: action.fallbackButton || "邀请下单",
          successStatus: "已发送商品"
        });
        result.sentProduct = result.sentProduct || acted;
        if (!acted) return { ...result, message: "product action failed" };
      } else if (type === "material") {
        const acted = await performPanelActionWithDesktopFallback({
          ...action,
          tab: action.tab || "素材库",
          button: action.button || "发送",
          fallbackButton: action.fallbackButton || "",
          successStatus: "已发送素材"
        });
        result.sentMaterial = result.sentMaterial || acted;
        if (!acted) return { ...result, message: "material action failed" };
      } else if (type === "quick_reply") {
        const acted = await performPanelActionWithDesktopFallback({
          ...action,
          tab: action.tab || "快捷语",
          button: action.button || "发送",
          fallbackButton: action.fallbackButton || "",
          successStatus: "快捷语已发送"
        });
        result.sentQuickReply = result.sentQuickReply || acted;
        if (!acted) return { ...result, message: "quick reply action failed" };
      } else if (type === "tab") {
        const tab = findRightPanelLabel(action.label || action.tab || "");
        if (!tab) return { ...result, message: "tab action failed" };
        tab.click();
        await sleep(Number(action.waitMs || 260));
        result.clicked = true;
      } else if (type === "click") {
        const clicked = await clickByAction(action);
        result.clicked = result.clicked || clicked;
        if (!clicked) return { ...result, message: "click action failed" };
      } else if (type === "capture_structure") {
        await window.wechatKfDesktop?.capturePageStructure?.();
        result.captured = true;
      } else if (type === "wait") {
        await sleep(Number(action.ms || 500));
      }
    }

    result.ok = result.sentText || result.sentImage || result.sentFile || result.sentProduct || result.sentMaterial || result.sentQuickReply || result.clicked || result.captured || result.ignored;
    return result.ok ? result : { ...result, message: "no action executed" };
  }

  function actionResultStatus(result) {
    if (result.sentImage && result.sentText) return "图文动作已发送";
    if (result.sentImage) return "图片已发送";
    if (result.sentFile) return "文件已发送";
    if (result.sentProduct) return "商品动作已发送";
    if (result.sentMaterial) return "素材动作已发送";
    if (result.sentQuickReply) return "快捷语已发送";
    if (result.sentText) return "文字已发送";
    if (result.ignored) return "已忽略";
    return "动作已发送";
  }

  async function clickByAction(action) {
    const selector = String(action.selector || "").trim();
    let node = selector ? document.querySelector(selector) : null;
    if (!node && action.text) {
      const text = String(action.text).trim();
      node = visibleElements("button, [role='button'], a, div, span").find((item) => textOf(item) === text);
    }
    if (!visible(node)) return false;
    node.click();
    await sleep(Number(action.waitMs || 300));
    return true;
  }

  function matchImageReply(message) {
    if (!CONFIG.imageRepliesEnabled || !Array.isArray(CONFIG.imageReplies)) return null;
    const text = normalize(message);
    return CONFIG.imageReplies.find((rule) => {
      if (!rule || rule.enabled === false) return false;
      const path = String(rule.path || rule.imagePath || "").trim();
      if (!path) return false;
      const keywords = Array.isArray(rule.keywords) ? rule.keywords : splitKeywords(rule.keywords);
      return keywords.some((keyword) => keyword && text.includes(normalize(keyword)));
    }) || null;
  }

  async function requestImageReply(imageReply, customer) {
    try {
      if (!window.wechatKfDesktop?.sendImageReply) {
        return { ok: false, copied: false, pasted: false, message: "桌面端不支持图片回复" };
      }
      const result = await window.wechatKfDesktop.sendImageReply({
        name: imageReply.name || "",
        path: imageReply.path || imageReply.imagePath || "",
        caption: imageReply.caption || "",
        fromAction: Boolean(imageReply.fromAction),
        customer
      });
      return result || { ok: false, copied: false, pasted: false, message: "图片回复无结果" };
    } catch (error) {
      warn("image reply failed", error);
      return { ok: false, copied: false, pasted: false, message: String(error?.message || error) };
    }
  }

  async function requestPageAction(action) {
    try {
      if (!window.wechatKfDesktop?.runPageAction) {
        return { ok: false, message: "桌面端不支持页面动作" };
      }
      return await window.wechatKfDesktop.runPageAction(action || {});
    } catch (error) {
      warn("page action failed", error);
      return { ok: false, message: String(error?.message || error) };
    }
  }

  function splitKeywords(value) {
    return String(value || "")
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function matchPanelAction(message) {
    if (!CONFIG.panelAutoActionsEnabled) return null;
    const text = normalize(message);
    if (/(下单|购买|怎么购买|怎么买|在哪里买|哪里买|付款|拍下|拍一下|买课|买这个|想买)/.test(text)) {
      return {
        tab: "商品",
        button: "邀请下单",
        fallbackButton: "发商品",
        successStatus: "已邀请下单"
      };
    }

    if (/(商品|链接|课程链接|商品链接|详情|介绍|价格|多少钱|费用|售价|课程多少钱|哪个课)/.test(text)) {
      return {
        tab: "商品",
        button: "发商品",
        fallbackButton: "邀请下单",
        successStatus: "已发送商品"
      };
    }

    if (/(直播|公开课|预约|开播|回放|素材|资料)/.test(text)) {
      return {
        tab: "素材库",
        button: "发送",
        fallbackButton: "",
        successStatus: "已发送素材"
      };
    }

    return null;
  }

  async function performPanelActionWithDesktopFallback(action) {
    const desktopType = panelActionType(action);
    if (desktopType) {
      const result = await requestPageAction({
        ...action,
        type: desktopType
      });
      if (result?.ok || result?.sent) return true;
      warn("desktop panel action failed, fallback to content click", { action, result });
    }
    return performPanelAction(action);
  }

  function panelActionType(action) {
    if (action.type === "product" || action.tab === "商品") return "product";
    if (action.type === "material" || action.tab === "素材库") return "material";
    if (action.type === "quick_reply" || action.tab === "快捷语") return "quick_reply";
    return "";
  }

  async function performPanelAction(action) {
    const labels = ["用户信息", "商品", "快捷语", "素材库"];
    const original = currentSidebarTab(labels);
    const tab = findRightPanelLabel(action.tab);
    if (!tab) return false;

    tab.click();
    await sleep(Number(action.waitMs || defaultPanelWaitMs(action.tab)));

    const subtab = String(action.subtab || action.category || action.mediaTab || "").trim();
    if (subtab) {
      const node = findRightPanelLabel(subtab);
      if (!node) return false;
      node.click();
      await sleep(Number(action.subtabWaitMs || 260));
    }

    const button = findPanelScopedButton(action) ||
      findRightPanelButton(action.button) ||
      (action.fallbackButton ? findRightPanelButton(action.fallbackButton) : null);
    if (!button) {
      if (original && original !== action.tab) findRightPanelLabel(original)?.click();
      return false;
    }

    const clickedText = textOf(button);
    button.click();
    await sleep(Number(action.afterClickMs || 700));
    if (action.tab === "快捷语") {
      return sendComposerIfFilled(clickedText);
    }
    let confirmed = false;
    if (action.confirm !== false) {
      const defaultConfirmButton = action.button === "邀请下单" ? "邀请下单" : "发送";
      confirmed = await confirmSendDialog(action.confirmButton || defaultConfirmButton);
    }
    const pendingDialog = action.confirm === false ? false : hasActionDialog();
    return action.confirm === false || !pendingDialog;
  }

  function defaultPanelWaitMs(tabLabel) {
    return tabLabel === "商品" ? 1200 : 500;
  }

  function findPanelScopedButton(action) {
    if (action.tab === "商品") {
      return findProductButton(action);
    }
    if (action.tab === "素材库") {
      return findMaterialButton(action);
    }
    if (action.tab === "快捷语") {
      return findQuickReplyButton(action);
    }
    return null;
  }

  function findProductButton(action) {
    const labels = [action.button, action.fallbackButton].map((item) => String(item || "").trim()).filter(Boolean);
    const cards = visibleElements(".product-panel .product-card, .product-card")
      .filter(isRightPanelNode)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    if (!cards.length) return null;

    const terms = matchTerms(action, ["productId", "productName", "query", "match", "name"]);
    const card = findMatchedNode(cards, terms) || cards[0];
    return findButtonInside(card, labels);
  }

  function findMaterialButton(action) {
    const labels = [action.button, action.fallbackButton].map((item) => String(item || "").trim()).filter(Boolean);
    const panel = document.querySelector(".quick-resp-panel") || document.querySelector(".extension-panel") || document;
    const terms = matchTerms(action, ["materialName", "query", "match", "name"]);
    const candidates = visibleElements(".quick-resp-panel .wrap, .quick-resp-panel [class*='item'], .quick-resp-panel [class*='card'], .quick-resp-panel [class*='content']")
      .filter(isRightPanelNode)
      .filter((node) => textOf(node))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const scope = findMatchedNode(candidates, terms) || panel;
    return findButtonInside(scope, labels);
  }

  function findQuickReplyButton(action) {
    const labels = [action.button, action.fallbackButton].map((item) => String(item || "").trim()).filter(Boolean);
    const panel = document.querySelector(".quick-reply-panel") ||
      document.querySelector(".quick-resp-panel") ||
      document.querySelector(".extension-panel") ||
      document;
    const terms = matchTerms(action, ["quickReply", "query", "match", "name"]);
    const candidates = visibleElements(".quick-reply-panel [class*='item'], .quick-reply-panel [class*='wrap'], .quick-resp-panel [class*='item'], .quick-resp-panel [class*='wrap'], .extension-panel [class*='item'], .extension-panel [class*='wrap']")
      .filter(isRightPanelNode)
      .filter((node) => textOf(node))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const scope = findMatchedNode(candidates, terms) || panel;
    return findButtonInside(scope, labels) || findClickableText(scope, terms);
  }

  function matchTerms(action, keys) {
    return keys
      .map((key) => String(action[key] || "").trim())
      .filter(Boolean)
      .map(normalize);
  }

  function findMatchedNode(nodes, terms) {
    if (!terms.length) return null;
    return nodes.find((node) => {
      const text = normalize(textOf(node));
      return terms.every((term) => text.includes(term));
    }) || nodes.find((node) => {
      const text = normalize(textOf(node));
      return terms.some((term) => text.includes(term));
    }) || null;
  }

  function findButtonInside(scope, labels) {
    if (!scope || !labels.length) return null;
    const buttons = Array.from(scope.querySelectorAll("button,[role='button'],.weui-desktop-btn"))
      .filter(visible)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    for (const label of labels) {
      const matched = buttons.find((node) => labelMatches(textOf(node), label));
      if (matched) return matched;
    }
    return null;
  }

  function findClickableText(scope, terms) {
    if (!scope || !terms.length) return null;
    return Array.from(scope.querySelectorAll("button,[role='button'],a,div,span,li"))
      .filter(visible)
      .filter(isRightPanelNode)
      .find((node) => {
        const text = normalize(textOf(node));
        return terms.some((term) => text.includes(term));
      }) || null;
  }

  async function confirmSendDialog(label) {
    const started = Date.now();
    while (Date.now() - started < 5000) {
      const button = findDialogButton(label);
      if (button) {
        button.click();
        await sleep(600);
        return true;
      }
      await sleep(200);
    }
    return false;
  }

  function findDialogButton(label) {
    const dialogs = visibleElements(".weui-desktop-dialog, .order-transfer-dialog, .product-detail-drawer, .t-drawer, .t-dialog__ctx, .t-dialog, .file-upload-dialog, [role='dialog']")
      .filter((node) => /发送|取消|邀请下单|发送给微信用户|商品预览|确认|确定/.test(textOf(node)));
    for (const dialog of dialogs) {
      const button = Array.from(dialog.querySelectorAll("button,[role='button'],.weui-desktop-btn"))
        .filter(visible)
        .filter((node) => !node.disabled && node.getAttribute("aria-disabled") !== "true")
        .filter((node) => labelMatches(textOf(node), label))
        .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0];
      if (button) return button;
    }
    return null;
  }

  function hasActionDialog() {
    return visibleElements(".weui-desktop-dialog, .order-transfer-dialog, .product-detail-drawer, .t-drawer, .t-dialog__ctx, .t-dialog, .file-upload-dialog, [role='dialog']")
      .some((scope) => {
        return Array.from(scope.querySelectorAll("button,[role='button'],.weui-desktop-btn"))
          .filter(visible)
          .filter((node) => !node.disabled && node.getAttribute("aria-disabled") !== "true")
          .some((node) => ["发送", "邀请下单", "确定", "确认"].some((label) => labelMatches(textOf(node), label)));
      });
  }

  function findRightPanelButton(label) {
    return visibleElements("button")
      .filter((node) => textOf(node) === label)
      .filter(isRightPanelNode)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
  }

  async function sendComposerIfFilled(expectedText) {
    const textarea = document.querySelector("#input-textarea");
    if (!visible(textarea)) return false;
    const value = String(textarea.value || textarea.textContent || "").trim();
    const expected = String(expectedText || "").trim();
    if (!value) return false;
    const before = latestKfText();
    pressEnter(textarea);
    await sleep(800);
    const latest = latestKfText();
    return latest !== before && (latest === value || latest === expected || (expected && latest.includes(expected.slice(0, 20))));
  }

  async function askLocalAi(message, mode = "normal") {
    if (!CONFIG.aiFallback) return "";
    try {
      updateToolbar("AI 请求中");
      const response = await fetch(CONFIG.aiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          mode,
          context: recentMessages(),
          sideContext: await collectSidebarContext(message)
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const reply = String(data.reply || "").trim();
      updateToolbar(reply ? "AI 已返回" : "AI 空回复");
      return reply;
    } catch (error) {
      warn("ai fallback failed", error);
      updateToolbar("AI 请求失败");
      reportEvent("ai_failed", { message, error: String(error?.message || error) });
      return "";
    }
  }

  async function askQuickReply(message) {
    try {
      updateToolbar("快速回复请求中");
      const response = await fetch(endpointFor("/quick-reply"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          context: recentMessages(),
          exclude: Array.from(state.quickRepliesUsed)
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.reset) state.quickRepliesUsed.clear();
      if (data.id) state.quickRepliesUsed.add(data.id);
      persistQuickRepliesUsed();
      const text = String(data.text || "").trim();
      updateToolbar(text ? `快速回复 ${data.id || ""}`.trim() : "快速回复空");
      return text || CONFIG.quickAck;
    } catch (error) {
      warn("quick reply failed", error);
      const local = pickLocalQuickReply();
      updateToolbar("快速回复本地兜底");
      return local;
    }
  }

  async function askWaitingReply() {
    try {
      updateToolbar("等待语请求中");
      const response = await fetch(endpointFor("/waiting-reply"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "",
          context: recentMessages(),
          exclude: Array.from(state.waitingRepliesUsed)
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.reset) state.waitingRepliesUsed.clear();
      if (data.id) state.waitingRepliesUsed.add(data.id);
      persistWaitingRepliesUsed();
      const text = String(data.text || "").trim();
      updateToolbar(text ? `等待语 ${data.id || ""}`.trim() : "等待语空");
      return text || pickLocalWaitingReply();
    } catch (error) {
      warn("waiting reply failed", error);
      return pickLocalWaitingReply();
    }
  }

  function pickLocalQuickReply() {
    const ids = CONFIG.localQuickReplies.map((_, index) => `local-${index + 1}`);
    let available = ids.filter((id) => !state.quickRepliesUsed.has(id));
    if (available.length === 0) {
      state.quickRepliesUsed.clear();
      available = ids;
    }

    const id = available[Math.floor(Math.random() * available.length)];
    state.quickRepliesUsed.add(id);
    persistQuickRepliesUsed();
    return CONFIG.localQuickReplies[Number(id.replace("local-", "")) - 1] || CONFIG.quickAck;
  }

  function pickLocalWaitingReply() {
    const ids = CONFIG.localWaitingReplies.map((_, index) => `local-waiting-${index + 1}`);
    let available = ids.filter((id) => !state.waitingRepliesUsed.has(id));
    if (available.length === 0) {
      state.waitingRepliesUsed.clear();
      available = ids;
    }

    const id = available[Math.floor(Math.random() * available.length)];
    state.waitingRepliesUsed.add(id);
    persistWaitingRepliesUsed();
    return CONFIG.localWaitingReplies[Number(id.replace("local-waiting-", "")) - 1] || "稍等一下，我还在看";
  }

  function endpointFor(path) {
    return CONFIG.aiEndpoint.replace(/\/reply$/, path);
  }

  function recentMessages() {
    return visibleElements(".text-msg.bg-user, .text-msg.bg-kf")
      .slice(-8)
      .map((node) => ({
        from: node.classList.contains("bg-user") ? "customer" : "kf",
        text: textOf(node)
      }))
      .filter((item) => item.text);
  }

  async function collectSidebarContext(message = "") {
    const labels = shouldCollectProductContext(message)
      ? ["用户信息", "商品", "快捷语", "素材库"]
      : ["用户信息", "快捷语", "素材库"];
    const original = currentSidebarTab(labels);
    const sections = [];

    for (const label of labels) {
      const tab = findRightPanelLabel(label);
      if (!tab) continue;
      tab.click();
      await sleep(180);

      const text = rightPanelText();
      if (text) sections.push(`【${label}】\n${text}`);
    }

    if (original && original !== currentSidebarTab(labels)) {
      findRightPanelLabel(original)?.click();
      await sleep(80);
    }

    return sections.join("\n\n").slice(0, 5000);
  }

  function shouldCollectProductContext(message) {
    return /(商品|链接|课程链接|商品链接|详情|介绍|价格|多少钱|费用|售价|课程多少钱|哪个课|下单|购买|怎么购买|怎么买)/.test(normalize(message));
  }

  function currentSidebarTab(labels) {
    return labels.find((label) => {
      const node = findRightPanelLabel(label);
      if (!node) return false;
      const style = window.getComputedStyle(node);
      return /active|current|selected/.test(node.className) || Number(style.fontWeight) >= 600;
    }) || "";
  }

  function findRightPanelLabel(label) {
    return visibleElements("button, [role='tab'], li, div, span")
      .filter((node) => textOf(node) === label)
      .filter(isRightPanelNode)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
  }

  function isRightPanelNode(node) {
    return node.getBoundingClientRect().left > window.innerWidth * 0.45;
  }

  function rightPanelText() {
    const seen = new Set();
    return visibleElements("button, [role='tab'], div, span, p, li")
      .filter((node) => node.id !== "wechat-kf-bot-status")
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left > window.innerWidth * 0.45 && rect.width > 0 && rect.height > 0;
      })
      .map((node) => textOf(node))
      .map((text) => text.replace(/\s+/g, " ").trim())
      .filter((text) => text && text.length <= 260)
      .filter((text) => {
        if (seen.has(text)) return false;
        seen.add(text);
        return true;
      })
      .slice(0, 80)
      .join("\n");
  }

  async function sendReply(reply) {
    const outgoing = cleanOutgoingText(reply);
    if (!outgoing) return false;

    const textarea = document.querySelector("#input-textarea");
    if (!visible(textarea)) return false;

    textarea.focus();
    setNativeValue(textarea, outgoing);
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: outgoing }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));

    await sleep(80);
    const before = latestKfText();
    pressEnter(textarea);
    await sleep(500);
    if (latestKfText() === outgoing && before !== outgoing) return true;

    const sendButton = visibleElements("button")
      .filter((button) => textOf(button) === "发送")
      .sort((a, b) => b.getBoundingClientRect().y - a.getBoundingClientRect().y)[0];

    if (!sendButton) return false;
    sendButton.click();
    await sleep(500);
    return latestKfText() === outgoing;
  }

  async function sendReplyParts(reply) {
    const parts = splitReplyParts(reply);
    if (parts.length === 0) return false;

    let sentAny = false;
    for (const part of parts) {
      const sent = await sendReply(part);
      sentAny = sentAny || sent;
      await sleep(650);
    }
    return sentAny;
  }

  function splitReplyParts(reply) {
    const clean = cleanOutgoingText(reply);
    if (!clean) return [];

    const maxParts = Math.max(1, Number(CONFIG.maxTextParts || 2));
    const maxLength = Math.max(0, Number(CONFIG.maxReplyPartLength || 0));
    const rawParts = clean
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const parts = rawParts.length ? rawParts : [clean];
    const limited = parts.length <= maxParts
      ? parts
      : parts.slice(0, maxParts - 1).concat(parts.slice(maxParts - 1).join(" "));

    return limited
      .slice(0, maxParts)
      .map((part) => maxLength > 0 && part.length > maxLength ? part.slice(0, maxLength) : part)
      .filter(Boolean);
  }

  function cleanOutgoingText(text) {
    return String(text || "")
      .replace(/^收到[，,。\s]*/g, "")
      .replace(/[。．.]+/g, "")
      .replace(/[！？!?；;]+/g, "")
      .replace(/[ \t\f\v]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function latestKfText() {
    return textOf(visibleElements(".text-msg.bg-kf").at(-1));
  }

  function pressEnter(target) {
    for (const type of ["keydown", "keypress", "keyup"]) {
      target.dispatchEvent(new KeyboardEvent(type, {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      }));
    }
  }

  function setNativeValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor?.set?.call(element, value);
  }

  function installToolbar() {
    if (document.querySelector("#wechat-kf-bot-status")) return;

    const root = document.createElement("div");
    root.id = "wechat-kf-bot-status";
    root.style.cssText = [
      "position:fixed",
      "right:12px",
      "bottom:12px",
      "z-index:2147483647",
      "background:#111827",
      "color:#fff",
      "font-size:12px",
      "line-height:1.25",
      "padding:8px",
      "border-radius:6px",
      "box-shadow:0 4px 16px rgba(0,0,0,.18)",
      "font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "pointer-events:auto",
      "display:grid",
      "gap:6px"
    ].join(";");

    const label = document.createElement("div");
    label.id = "wechat-kf-bot-status-label";
    label.textContent = "客服Bot：启动中";
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:5px;";
    actions.append(
      toolbarButton("悬浮窗", () => window.wechatKfDesktop?.openFloatingWindow?.("compact")),
      toolbarButton("设置", () => window.wechatKfDesktop?.openFloatingWindow?.("settings")),
      toolbarButton("结构", async () => {
        const result = await captureAndSavePageStructure();
        updateToolbar(result?.ok ? `结构已捕捉 ${result.count || 0}` : `结构失败 ${result?.message || ""}`.trim());
      })
    );
    root.append(label, actions);
    document.documentElement.appendChild(root);
  }

  function updateToolbar(status, extra = {}) {
    state.lastStatus = status;
    const label = document.querySelector("#wechat-kf-bot-status-label");
    if (label) label.textContent = `客服Bot：${status}`;
    reportStatus(status, extra);
  }

  function toolbarButton(text, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.style.cssText = [
      "height:22px",
      "border:1px solid rgba(255,255,255,.35)",
      "border-radius:5px",
      "background:rgba(255,255,255,.12)",
      "color:#fff",
      "font-size:11px",
      "padding:0 6px",
      "cursor:pointer"
    ].join(";");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      Promise.resolve(handler()).catch((error) => warn("toolbar action failed", error));
    });
    return button;
  }

  async function captureAndSavePageStructure() {
    try {
      const snapshot = collectPageStructure();
      if (window.wechatKfDesktop?.savePageStructure) {
        return await window.wechatKfDesktop.savePageStructure(snapshot);
      }
      if (window.wechatKfDesktop?.capturePageStructure) {
        return await window.wechatKfDesktop.capturePageStructure();
      }
      return { ok: false, message: "桌面接口不可用" };
    } catch (error) {
      warn("capture structure failed", error);
      return { ok: false, message: String(error?.message || error).slice(0, 80) };
    }
  }

  function collectPageStructure() {
    const nodeTypes = "button,a,input,textarea,select,[role],img,canvas,svg,[contenteditable='true'],[class],[id]";
    const nodes = Array.from(document.querySelectorAll(nodeTypes)).slice(0, 2200).map((node, index) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const text = String(node.innerText || node.textContent || node.getAttribute("aria-label") || node.getAttribute("title") || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
      return {
        index,
        tag: node.tagName.toLowerCase(),
        id: node.id || "",
        className: safeClassName(node),
        role: node.getAttribute("role") || "",
        type: node.getAttribute("type") || "",
        name: node.getAttribute("name") || "",
        ariaLabel: node.getAttribute("aria-label") || "",
        title: node.getAttribute("title") || "",
        alt: node.getAttribute("alt") || "",
        href: node.getAttribute("href") || "",
        src: node.getAttribute("src") || "",
        text,
        visible: Boolean(rect.width && rect.height && style.visibility !== "hidden" && style.display !== "none"),
        disabled: Boolean(node.disabled || node.getAttribute("aria-disabled") === "true"),
        selector: buildStableSelector(node),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      };
    });

    return {
      href: location.href,
      title: document.title,
      bodyText: document.body ? document.body.innerText.slice(0, 8000) : "",
      hasInput: Boolean(document.querySelector("#input-textarea")),
      hasQrLikeNode: hasQrLikeNode(),
      panels: inferPanels(nodes),
      nodes
    };
  }

  function inferPanels(nodes) {
    return {
      rightPanelButtons: nodes.filter((node) => node.visible && node.rect.x > window.innerWidth * 0.45 && /button|div|span|li/.test(node.tag)).slice(0, 120),
      messageInputs: nodes.filter((node) => node.visible && (/textarea|input/.test(node.tag) || /contenteditable/i.test(node.selector))).slice(0, 20),
      qrCandidates: nodes.filter((node) => node.visible && /img|canvas|svg/.test(node.tag) && node.rect.width >= 80 && node.rect.height >= 80)
    };
  }

  function hasQrLikeNode() {
    const text = document.body ? document.body.innerText : "";
    return Array.from(document.querySelectorAll("img,canvas,svg")).some((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 80) return false;
      const label = `${node.id || ""} ${safeClassName(node)} ${node.getAttribute("alt") || ""} ${node.getAttribute("aria-label") || ""} ${node.getAttribute("src") || ""}`;
      return /qr|qrcode|二维码|scan|login|code/i.test(label) || /扫码|二维码|微信扫一扫/.test(text);
    });
  }

  function safeClassName(node) {
    if (!node) return "";
    if (typeof node.className === "string") return node.className.slice(0, 240);
    if (node.className?.baseVal) return String(node.className.baseVal).slice(0, 240);
    return String(node.getAttribute?.("class") || "").slice(0, 240);
  }

  function buildStableSelector(node) {
    const escape = (value) => {
      if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
      return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    };
    if (node.id) return `#${escape(node.id)}`;
    const parts = [];
    let current = node;
    while (current && current.nodeType === 1 && parts.length < 6) {
      let part = current.tagName.toLowerCase();
      const firstClass = safeClassName(current).split(/\s+/).filter(Boolean)[0];
      if (firstClass) part += `.${escape(firstClass)}`;
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      current = parent;
    }
    return parts.join(" > ");
  }

  function visibleElements(selector) {
    return Array.from(document.querySelectorAll(selector)).filter(visible);
  }

  function visible(node) {
    return Boolean(node && (node.offsetWidth || node.offsetHeight || node.getClientRects().length));
  }

  function textOf(node) {
    return String(node?.innerText || node?.textContent || "").trim();
  }

  function labelMatches(actual, expected) {
    const left = String(actual || "").trim();
    const right = String(expected || "").trim();
    if (!left || !right) return false;
    if (left === right) return true;
    if (right === "发送" && /^发送(?:\(\d+\))?$/.test(left)) return true;
    return false;
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function reportStatus(status, extra = {}) {
    try {
      window.wechatKfDesktop?.reportStatus?.({
        status,
        enabled: CONFIG.enabled,
        busy: Boolean(state.busy),
        takeover: Boolean(extra.takeover || (CONFIG.enabled && state.busy)),
        inFlightCount: state.inFlight.size,
        pendingCount: state.pendingCustomerMessages.size,
        href: location.href,
        title: document.title,
        at: Date.now()
      });
    } catch {
      // Desktop reporting is optional; Chrome extension mode should stay silent.
    }
  }

  function reportEvent(type, payload = {}) {
    try {
      window.wechatKfDesktop?.reportEvent?.({
        type,
        payload,
        href: location.href,
        title: document.title,
        at: Date.now()
      });
    } catch {
      // Desktop reporting is optional; Chrome extension mode should stay silent.
    }
  }

  function reportReplySent(payload = {}) {
    reportEvent("reply_sent", payload);
  }

  function summarizeActions(actions) {
    return (Array.isArray(actions) ? actions : []).map(summarizeAction);
  }

  function summarizeAction(action = {}) {
    return {
      type: String(action.type || action.tab || "action"),
      button: String(action.button || ""),
      productId: String(action.productId || ""),
      productName: String(action.productName || ""),
      path: String(action.path || action.imagePath || action.filePath || ""),
      text: clip(String(action.text || action.reply || ""), 80)
    };
  }

  function clip(value, size = 80) {
    const text = String(value || "");
    return text.length > size ? `${text.slice(0, size)}...` : text;
  }

  function summarizeActionText(actions) {
    return (Array.isArray(actions) ? actions : [])
      .map((action) => String(action?.text || action?.reply || "").trim())
      .filter(Boolean)
      .join("\n");
  }

  function loadReplied() {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(STATE_KEY) || "[]"));
    } catch {
      return new Set();
    }
  }

  function loadQuickRepliesUsed() {
    try {
      return new Set(JSON.parse(localStorage.getItem(`${STATE_KEY}_quick_replies`) || "[]"));
    } catch {
      return new Set();
    }
  }

  function loadWaitingRepliesUsed() {
    try {
      return new Set(JSON.parse(localStorage.getItem(`${STATE_KEY}_waiting_replies`) || "[]"));
    } catch {
      return new Set();
    }
  }

  function loadQuickAckedSessions() {
    try {
      return new Set(JSON.parse(localStorage.getItem(`${STATE_KEY}_quick_acked_sessions`) || "[]"));
    } catch {
      return new Set();
    }
  }

  function persistReplied() {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(Array.from(state.replied).slice(-500)));
  }

  function persistQuickRepliesUsed() {
    localStorage.setItem(`${STATE_KEY}_quick_replies`, JSON.stringify(Array.from(state.quickRepliesUsed).slice(-20)));
  }

  function persistWaitingRepliesUsed() {
    localStorage.setItem(`${STATE_KEY}_waiting_replies`, JSON.stringify(Array.from(state.waitingRepliesUsed).slice(-20)));
  }

  function persistQuickAckedSessions() {
    localStorage.setItem(`${STATE_KEY}_quick_acked_sessions`, JSON.stringify(Array.from(state.quickAckedSessions).slice(-500)));
  }

  function log(message, data) {
    console.log("[wechat-kf-bot]", message, data || "");
  }

  function warn(message, data) {
    console.warn("[wechat-kf-bot]", message, data || "");
  }
})();
