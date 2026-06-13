(() => {
  // extension/source/action-utils.js
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
  function summarizeActionText(actions) {
    return (Array.isArray(actions) ? actions : []).map((action) => String(action?.text || action?.reply || "").trim()).filter(Boolean).join("\n");
  }
  function clip(value, size) {
    return value.length > size ? `${value.slice(0, size)}...` : value;
  }

  // extension/source/ai-trace.js
  function aiProcessSteps(trace = {}, usedJudgmentLibrary = false) {
    const steps = ["检测消息", "收集上下文"];
    if (trace?.judgmentQueried) {
      steps.push(usedJudgmentLibrary ? `同步资料命中${Number(trace.judgmentCount || 0)}条` : "同步资料未命中");
      if (Array.isArray(trace.judgmentTransports) && trace.judgmentTransports.length) {
        steps.push(`知识线路:${trace.judgmentTransports.join("+")}`);
      }
    } else {
      steps.push("未用同步资料");
    }
    steps.push("调用远方AI API");
    steps.push(trace?.thinking === "disabled" ? "Thinking关闭" : "Thinking开启");
    if (trace?.reviewEnabled) steps.push(trace?.reviewApplied ? "审核并改写" : "审核通过");
    steps.push("发送文字");
    return steps;
  }

  // extension/source/message-types.js
  function messagePlaceholder(kind, detail = "") {
    const clean = String(detail || "").replace(/\s+/g, " ").trim();
    return clean ? `[${kind}] ${clean}` : `[${kind}]`;
  }
  function runtimeStatusForIncomingMessage(message) {
    const definitions = {
      image: ["image_found", "收到图片", "已检测到客户发送的图片，正在进入处理流程"],
      emoji: ["emoji_found", "收到表情", "已检测到客户发送的表情，正在进入处理流程"],
      product: ["product_found", "收到商品", "已检测到客户发送的商品卡片，正在读取商品信息"],
      file: ["file_found", "收到文件", "已检测到客户发送的文件，正在进入处理流程"],
      video: ["video_found", "收到视频", "已检测到客户发送的视频，正在进入处理流程"]
    };
    const definition = definitions[message?.type] || ["message_found", "已检测消息", "已检测到客户最新消息"];
    return { code: definition[0], label: definition[1], detail: definition[2] };
  }
  function inferMessageTypeFromText(text) {
    const value = String(text || "").trim();
    if (/^\[图片\]/.test(value)) return "image";
    if (/^\[表情\]/.test(value)) return "emoji";
    if (/^\[商品卡\]/.test(value)) return "product";
    if (/^\[文件\]/.test(value)) return "file";
    if (/^\[视频\]/.test(value)) return "video";
    return "";
  }

  // extension/source/reply-memory.js
  function replySignature(reply) {
    return String(reply || "").trim().toLowerCase().replace(/\s+/g, "").slice(0, 220);
  }

  // extension/source/rule-matcher.js
  var RULE_TERMS = [
    "会员专区",
    "年度会员",
    "月度会员",
    "咨询俱乐部",
    "自动续费",
    "商品链接",
    "商品卡",
    "商品",
    "链接",
    "权益",
    "进群",
    "群",
    "使用",
    "上课",
    "入口",
    "课程目录",
    "目录",
    "直播回放",
    "专区问答",
    "专属视频",
    "社群",
    "图片",
    "截图",
    "图文",
    "照片",
    "文件",
    "视频",
    "表情",
    "非文本",
    "付款",
    "下单",
    "购买",
    "买",
    "退款",
    "售后",
    "联系方式",
    "微信",
    "手机号"
  ];
  var PUNCTUATION_RE = /[\s,，.。!！?？、;；:："“”'‘’()[\]（）【】<>《》{}|｜~～…·_-]+/g;
  function normalizeRuleText(value) {
    return String(value || "").trim().toLowerCase().replace(/怎样|如何|咋样|咋/g, "怎么").replace(/啥/g, "什么").replace(/哪儿|哪里/g, "哪").replace(/加入社群|加入群|进社群|加社群|加群/g, "进群").replace(/怎么用/g, "怎么使用").replace(PUNCTUATION_RE, "");
  }
  function buildRuleSearchText(message, aliases = {}) {
    const messageObject = message && typeof message === "object" ? message : null;
    const textParts = messageObject ? [messageObject.contextText, messageObject.rawText, messageObject.text] : [message];
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
  function ruleMatchesSearchText(rule = {}, searchText = "") {
    const normalizedSearch = normalizeRuleText(searchText);
    return normalizeKeywordList(rule.keywords).some((keyword) => keywordMatchesSearchText(keyword, normalizedSearch));
  }
  function keywordMatchesSearchText(keyword = "", searchText = "") {
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
  function normalizeKeywordList(value) {
    if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
    return String(value || "").split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean);
  }
  function inferMessageTypeFromRuleText(text) {
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

  // extension/source/index.js
  (() => {
    const VERSION = "0.4.5";
    const CONFIG = {
      enabled: true,
      aiFallback: true,
      aiEndpoint: "http://127.0.0.1:8787/reply",
      aiSlowMs: 15e3,
      fallbackReplyMs: 6e4,
      completionCheckEnabled: true,
      maxCustomerVisibleRetries: 2,
      noResponseAlertMs: 9e4,
      noResponseCheckMs: 5e3,
      maxTextParts: 2,
      maxReplyPartLength: 500,
      imageRepliesEnabled: true,
      autoPasteImages: false,
      panelAutoActionsEnabled: false,
      imageReplies: [],
      actionRules: [
        {
          enabled: true,
          name: "会员专区：使用和进群图文",
          keywords: ["会员专区怎么使用", "怎么使用会员专区", "会员专区使用", "怎么进群", "如何进群", "怎么加入社群", "进社群", "进群", "会员进群", "年度会员进群", "前往小程序上课", "上课入口"],
          actions: [
            { type: "text", text: "上课在订单详情页点【前往小程序上课】\n进社群看小程序里的【会员专区使用攻略】" },
            { type: "image", path: "config/reply-images/image1.png" },
            { type: "image", path: "config/reply-images/image2.png" }
          ]
        },
        {
          enabled: true,
          name: "会员专区：权益目录图文",
          keywords: ["会员专区包含什么权益", "会员专区有什么权益", "会员专区包含哪些权益", "会员专区权益", "会员专区有什么", "会员专区有啥", "会员有什么", "会员有啥", "包含什么权益", "有什么权益", "有哪些权益", "权益有哪些", "会员权益", "包含什么内容", "会员专区包含什么", "会员专区图片", "会员专区图文", "会员专区截图", "会员专区详情", "会员专区介绍", "课程目录", "大致目录", "专属视频", "直播回放", "专区问答"],
          actions: [
            { type: "text", text: "目前有专属视频、直播回放、社群和专区问答\n您可以先看课程目录" },
            { type: "image", path: "config/reply-images/image3.jpg" }
          ]
        },
        {
          enabled: true,
          name: "会员专区：发年度会员商品",
          keywords: ["我想买会员专区", "想买会员", "买会员", "会员链接", "年度会员链接", "会员商品", "年度会员商品", "售价365", "会员入口", "商品链接", "发链接", "发商品"],
          actions: [
            { type: "text", text: "年度会员是365元的商品\n我把商品入口发您" },
            { type: "product", productId: "10000275472384", productName: "润宇年度会员商业社群", button: "发商品" }
          ]
        },
        {
          enabled: true,
          name: "会员专区：邀请下单",
          keywords: ["怎么付款", "怎么买", "怎么购买", "怎么下单", "我要下单", "我要付款", "邀请下单", "买这个", "付款入口", "拍这个", "下单链接"],
          actions: [
            { type: "text", text: "我给您选好年度会员\n您点进去就可以下单" },
            { type: "product", productId: "10000275472384", productName: "润宇年度会员商业社群", button: "邀请下单" }
          ]
        }
      ],
      quickAck: "我看一下",
      quickAckReplies: [
        "我看一下",
        "稍等，我看下说明",
        "这个问题我看一下"
      ],
      quickAckEveryMessage: true,
      debounceMs: 350,
      minReplyGapMs: 1500,
      fallbackReply: "这个问题我先看到了\n系统还在处理，您稍等一下",
      fallbackReplies: [
        "这个问题我先看到了\n系统还在处理，您稍等一下",
        "我这边还没拿到准确答案\n您稍等一下",
        "稍等，我尽量给您准确回复"
      ],
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
          keywords: ["联系方式", "加微信", "微信号", "电话多少", "留电话", "留手机号", "发手机号", "手机号多少", "联系润宇", "联系润玉"],
          reply: "平台不支持发送联系方式\n直接在店铺里沟通"
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
      heartbeatTimer: null,
      noResponseTimer: null,
      busy: false,
      lastReplyAt: 0,
      replied: loadReplied(),
      inFlight: /* @__PURE__ */ new Set(),
      pendingAiFollowups: /* @__PURE__ */ new Map(),
      replyTasks: loadReplyTasks(),
      customerMemories: loadCustomerMemories(),
      ruleCandidates: loadRuleCandidates(),
      pendingCustomerMessages: /* @__PURE__ */ new Map(),
      quickRepliesUsed: loadQuickRepliesUsed(),
      waitingRepliesUsed: loadWaitingRepliesUsed(),
      fallbackRepliesUsed: loadFallbackRepliesUsed(),
      sessionReplyMemory: loadSessionReplyMemory(),
      quickAckedSessions: loadQuickAckedSessions(),
      sessionSnapshots: /* @__PURE__ */ new Map(),
      lastHref: location.href,
      routeTimer: null,
      startedOnKf: false,
      settingsLoaded: false,
      lastStatus: "启动中",
      lastStatusMeta: { code: "starting", label: "启动中", detail: "正在启动自动回复脚本" }
    };
    boot();
    function boot() {
      if (window.__wechatShopKfBotInstalled) return;
      window.__wechatShopKfBotInstalled = true;
      watchRoute();
      watchPageResume();
      watchNoResponseTimeout();
      startHeartbeat();
      maybeStartForCurrentRoute("boot");
      log("installed route watcher");
    }
    function startHeartbeat() {
      window.clearInterval(state.heartbeatTimer);
      window.__wechatShopKfBotHeartbeatAt = Date.now();
      state.heartbeatTimer = window.setInterval(() => {
        if (!location.href.includes("/shop/kf")) return;
        window.__wechatShopKfBotHeartbeatAt = Date.now();
        reportStatus(state.lastStatus || (CONFIG.enabled ? "检测中" : "暂停中"), {
          ...state.lastStatusMeta || {},
          heartbeat: true
        });
      }, 1e4);
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
          setStep("page_loading", "页面加载", "当前页面不是微信小店客服页");
        }
        return;
      }
      if (state.startedOnKf) {
        scheduleCheck(reason);
        return;
      }
      state.startedOnKf = true;
      installToolbar();
      setStep("script_ready", "脚本就绪", `自动回复脚本 v${VERSION} 已加载`);
      loadSettings();
      watchSettings();
      syncObserver();
      scheduleCheck(reason);
      log("started on kf page", location.href);
    }
    function getStorageApi() {
      if (window.wechatKfDesktop?.storage?.local) return window.wechatKfDesktop.storage;
      if (typeof chrome !== "undefined" && chrome.storage?.local) return chrome.storage;
      return null;
    }
    function loadSettings() {
      const storage = getStorageApi();
      if (!storage?.local) {
        state.settingsLoaded = true;
        return;
      }
      storage.local.get({ ...CONFIG, configVersion: "" }, (items) => {
        if (items.configVersion !== VERSION) {
          storage.local.set({ configVersion: VERSION });
        }
        Object.assign(CONFIG, items);
        state.settingsLoaded = true;
        setStep(CONFIG.enabled ? "monitoring" : "paused", CONFIG.enabled ? "检测中" : "暂停中", CONFIG.enabled ? "正在监听客户新消息" : "Bot已暂停，不会自动发送回复");
        syncObserver();
        if (CONFIG.enabled) scheduleCheck("settings_loaded");
      });
    }
    function watchSettings() {
      const storage = getStorageApi();
      if (!storage?.onChanged) return;
      storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        for (const [key, change] of Object.entries(changes)) {
          if (key in CONFIG) CONFIG[key] = change.newValue;
        }
        setStep(CONFIG.enabled ? "monitoring" : "paused", CONFIG.enabled ? "检测中" : "暂停中", CONFIG.enabled ? "正在监听客户新消息" : "Bot已暂停，不会自动发送回复");
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
        setStep("paused", "暂停中", "Bot已暂停，不会自动发送回复");
        return;
      }
      window.clearTimeout(state.debounceTimer);
      state.debounceTimer = window.setTimeout(() => checkAndReply(reason), CONFIG.debounceMs);
    }
    async function checkAndReply(reason) {
      if (!CONFIG.enabled) return;
      if (state.busy) return;
      if (!state.settingsLoaded) {
        setStep("loading_settings", "加载配置", "正在读取桌面端规则库和自动回复配置");
        scheduleCheck("settings_pending");
        return;
      }
      state.busy = true;
      setStep("detecting", "检测消息", "正在检查当前会话的最新消息", { takeover: true });
      try {
        await checkAndReplyOnce(reason);
      } catch (error) {
        const message = safeErrorMessage(error);
        warn("check and reply failed", error);
        setStep("reply_failed", "回复失败", `客服页脚本异常：${message}`);
        reportEvent("reply_failed", {
          stage: "content_script",
          sourceType: "script",
          usedRuleLibrary: false,
          usedDirectReply: false,
          usedAi: false,
          reason,
          error: message
        });
      } finally {
        state.busy = false;
        reportStatus(state.lastStatus || "检测中", state.lastStatusMeta || {});
      }
    }
    async function checkAndReplyOnce(reason) {
      const opened = await ensureConversationOpen();
      if (!opened) {
        setStep("waiting_message", "等待消息", "当前没有可处理的客服会话");
        return;
      }
      const latest = latestMessage();
      if (!latest) {
        setStep("no_message", "暂无消息", "当前会话还没有客户消息");
        state.pendingCustomerMessages.clear();
        return;
      }
      if (latest.from !== "customer") {
        const pendingFollowup = Array.from(state.pendingAiFollowups.values()).at(-1);
        if (pendingFollowup) {
          setStep("waiting_ai", "等待AI", `承接语已发送，仍在处理：${pendingFollowup.customer || "客户问题"}`, {
            customer: pendingFollowup.customer || ""
          });
          return;
        }
        setStep("last_kf", "客服最后", "当前会话最后一条消息来自客服");
        state.pendingCustomerMessages.clear();
        return;
      }
      const sessionKey = currentSessionKey();
      const key = messageReplyKey(latest, sessionKey);
      const latestForMatching = enrichMessageWithContext(latest);
      const detectedStatus = runtimeStatusForIncomingMessage(latest);
      setStep(detectedStatus.code, detectedStatus.label, detectedStatus.detail, {
        customer: latest.text,
        messageType: latest.type
      });
      if (state.replied.has(key)) {
        setStep("reply_done", "回复完成", "该条客户消息已经完成回复", { customer: latest.text });
        return;
      }
      if (state.inFlight.has(key)) {
        setStep("sending_reply", "正在回复", "该条客户消息正在处理", { customer: latest.text });
        return;
      }
      const now = Date.now();
      if (now - state.lastReplyAt < CONFIG.minReplyGapMs) return;
      state.inFlight.add(key);
      let responseSent = false;
      let forceApiReply = false;
      let activeTask = createReplyTask(latest, sessionKey, "api_reply");
      setStep("reading_memory", "读取记忆", activeTask.isNewCustomer ? "新客户，正在创建客户记忆" : "老客户，正在读取客户记忆", {
        customer: latest.text,
        messageType: latest.type
      });
      rememberCustomerMessage(activeTask, latest);
      try {
        const actionRule = matchActionRule(latestForMatching);
        if (actionRule) {
          const ruleMode = normalizeRuleMode(actionRule, "final");
          activeTask = updateReplyTask(activeTask, {
            route: "local_action",
            status: ruleMode === "ignore" ? "cancelled" : "rule_sent",
            ruleName: actionRule.name || "",
            ruleMode,
            finalReply: {
              required: ruleMode === "quick_then_api",
              sent: ruleMode !== "quick_then_api",
              text: summarizeActionText(actionRule.actions || []),
              sentAt: null
            }
          });
          if (ruleMode === "ignore") {
            markReplied(key);
            setStep("ignored", "已忽略", `规则 ${actionRule.name || "未命名"} 设置为忽略`, { customer: latest.text });
            reportEvent("reply_sent", taskPayload(activeTask, {
              stage: "ignore",
              sourceType: "ignore",
              usedRuleLibrary: true,
              reason,
              customer: latest.text,
              rule: actionRule.name || "",
              status: "已忽略"
            }));
            completeMemoryTask(activeTask, { result: "solved", reason: "规则模式为 ignore" });
            return;
          }
          setStep("matching_rule", "匹配规则", `已匹配动作规则：${actionRule.name || "未命名"}`, { customer: latest.text });
          const result = await executeActions(actionRule.actions || [], latest.text, actionRule.name || "", sessionKey);
          if (!result.ok) {
            setStep("reply_failed", "回复失败", result.message || "动作规则执行失败", { customer: latest.text });
            activeTask = updateReplyTask(activeTask, { status: "failed" });
            reportEvent("reply_failed", taskPayload(activeTask, { stage: "action_rule", sourceType: "action_rule", usedRuleLibrary: true, reason, customer: latest.text, reply: actionRule.name || "", error: result.message }));
            return;
          }
          responseSent = true;
          if (ruleMode !== "quick_then_api") markReplied(key);
          state.lastReplyAt = Date.now();
          const actionStatus = runtimeStatusForActionResult(result, actionRule.actions || []);
          setStep(actionStatus.code, actionStatus.label, actionStatus.detail, { customer: latest.text, actionType: actionStatus.actionType });
          const sentPayload = taskPayload(activeTask, {
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
          reportReplySent(sentPayload);
          log("action rule executed", { reason, customer: latest.text, actionRule, result });
          activeTask = updateReplyTask(activeTask, {
            status: ruleMode === "quick_then_api" ? "pending_api" : "rule_sent",
            finalReply: {
              required: ruleMode === "quick_then_api",
              sent: ruleMode !== "quick_then_api",
              text: sentPayload.reply || "",
              sentAt: Date.now()
            }
          });
          if (ruleMode === "quick_then_api") {
            rememberCustomerReply(activeTask, sentPayload);
            forceApiReply = true;
          } else {
            await finalizeReplyTask(activeTask, sentPayload, { allowRemediation: ruleMode !== "action_only" });
            return;
          }
        }
        const imageReply = forceApiReply ? null : matchImageReply(latestForMatching);
        if (imageReply) {
          const ruleMode = normalizeRuleMode(imageReply, "final");
          activeTask = updateReplyTask(activeTask, {
            route: "local_action",
            status: "rule_sent",
            ruleName: imageReply.name || "",
            ruleMode,
            finalReply: {
              required: false,
              sent: true,
              text: String(imageReply.caption || ""),
              sentAt: null
            }
          });
          setStep("matching_image", "匹配图片", `已匹配图片规则：${imageReply.name || "未命名"}`, { customer: latest.text });
          const caption = String(imageReply.caption || "我发你图片看下").trim();
          if (caption) setStep("sending_text", "发送文字", "正在发送图片说明文字", { customer: latest.text });
          const captionSent = caption ? await sendReplyParts(caption) : false;
          setStep("sending_image", "发送图片", "正在上传并发送匹配图片", { customer: latest.text, actionType: "image" });
          const imageResult = await requestImageReply(imageReply, latest.text);
          if (!imageResult.sent) {
            setStep("reply_failed", "回复失败", imageResult.message || "图片回复发送失败", { customer: latest.text, actionType: "image" });
            activeTask = updateReplyTask(activeTask, { status: "failed" });
            reportEvent("reply_failed", taskPayload(activeTask, {
              stage: "image_reply",
              sourceType: "image_rule",
              usedRuleLibrary: true,
              reason,
              customer: latest.text,
              reply: caption,
              captionSent,
              error: imageResult.message
            }));
            return;
          }
          responseSent = true;
          markReplied(key);
          state.lastReplyAt = Date.now();
          setStep(imageResult.sent ? "image_sent" : imageResult.pasted ? "monitoring" : "reply_failed", imageResult.sent ? "图片已发" : imageResult.pasted ? "待确认" : "回复失败", imageResult.message || "图片回复处理完成", { customer: latest.text, actionType: "image" });
          const sentPayload = taskPayload(activeTask, {
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
          reportReplySent(sentPayload);
          activeTask = updateReplyTask(activeTask, {
            finalReply: { required: false, sent: true, text: caption, sentAt: Date.now() }
          });
          log("image reply matched", { reason, customer: latest.text, imageReply, imageResult });
          await finalizeReplyTask(activeTask, sentPayload, { allowRemediation: ruleMode !== "action_only" });
          return;
        }
        const panelAction = forceApiReply ? null : matchPanelAction(latest.text);
        if (panelAction) {
          activeTask = updateReplyTask(activeTask, {
            route: "local_action",
            status: "rule_sent",
            ruleName: panelAction.successStatus || panelAction.button || "",
            ruleMode: normalizeRuleMode(panelAction, "final")
          });
          const panelRuntime = runtimeStatusForPanelAction(panelAction);
          setStep(panelRuntime.matchCode, panelRuntime.matchLabel, panelRuntime.matchDetail, { customer: latest.text, actionType: panelRuntime.actionType });
          setStep(panelRuntime.sendCode, panelRuntime.sendLabel, panelRuntime.sendDetail, { customer: latest.text, actionType: panelRuntime.actionType });
          const acted = await performPanelActionWithDesktopFallback(panelAction);
          if (acted) {
            responseSent = true;
            markReplied(key);
            state.lastReplyAt = now;
            setStep(panelRuntime.doneCode, panelRuntime.doneLabel, panelRuntime.doneDetail, { customer: latest.text, actionType: panelRuntime.actionType });
            const sentPayload = taskPayload(activeTask, {
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
            reportReplySent(sentPayload);
            log("panel action sent", { reason, customer: latest.text, action: panelAction });
            await finalizeReplyTask(activeTask, sentPayload, { allowRemediation: activeTask.ruleMode !== "action_only" });
            return;
          }
        }
        const textRule = forceApiReply ? null : matchTextRule(latestForMatching);
        const ruleReply = textRule?.reply || "";
        if (textRule) {
          const ruleMode = normalizeRuleMode(textRule, "final");
          activeTask = updateReplyTask(activeTask, {
            route: "local_rule",
            status: ruleMode === "ignore" ? "cancelled" : "rule_sent",
            ruleName: textRule.name || "",
            ruleMode,
            finalReply: {
              required: ruleMode === "quick_then_api",
              sent: Boolean(ruleReply) && ruleMode !== "quick_then_api",
              text: ruleReply,
              sentAt: null
            }
          });
          if (ruleMode === "ignore" || !String(ruleReply || "").trim()) {
            markReplied(key);
            setStep("ignored", "已忽略", `规则 ${textRule.name || "未命名"} 设置为忽略`, { customer: latest.text });
            const ignoredPayload = taskPayload(activeTask, {
              stage: "ignore",
              sourceType: "ignore",
              usedRuleLibrary: true,
              reason,
              customer: latest.text,
              rule: textRule.name || "",
              status: "已忽略"
            });
            reportReplySent(ignoredPayload);
            completeMemoryTask(activeTask, { result: "solved", reason: "规则模式为 ignore" });
            return;
          }
          setStep("matching_rule", "匹配规则", "已匹配文字回复规则", { customer: latest.text });
          if (hasSessionReply(sessionKey, ruleReply)) {
            setStep("duplicate", "跳过重复", "本会话已经发送过相同话术", { customer: latest.text });
            reportEvent("reply_skipped_duplicate", taskPayload(activeTask, { stage: "rule_duplicate", sourceType: "text_rule", reason, customer: latest.text, reply: ruleReply }));
          } else {
            setStep("sending_text", "发送文字", "正在发送规则库文字回复", { customer: latest.text, actionType: "text" });
            const sent = await sendReplyParts(ruleReply);
            if (!sent) {
              setStep("reply_failed", "回复失败", "规则库文字未能成功发送", { customer: latest.text, actionType: "text" });
              activeTask = updateReplyTask(activeTask, { status: "failed" });
              reportEvent("reply_failed", taskPayload(activeTask, { stage: "rule", sourceType: "text_rule", usedRuleLibrary: true, reason, customer: latest.text, reply: ruleReply }));
              warn("send failed", { reason, latest, reply: ruleReply });
              return;
            }
            responseSent = true;
            if (ruleMode !== "quick_then_api") markReplied(key);
            rememberSessionReply(sessionKey, ruleReply);
            state.lastReplyAt = now;
            setStep("text_sent", "文字已发", "规则库文字回复已发送", { customer: latest.text, actionType: "text" });
            const sentPayload = taskPayload(activeTask, {
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
            reportReplySent(sentPayload);
            log("rule replied", { reason, customer: latest.text, reply: ruleReply });
            activeTask = updateReplyTask(activeTask, {
              status: ruleMode === "quick_then_api" ? "pending_api" : "rule_sent",
              finalReply: {
                required: ruleMode === "quick_then_api",
                sent: ruleMode !== "quick_then_api",
                text: ruleReply,
                sentAt: Date.now()
              }
            });
            if (ruleMode === "quick_then_api") {
              rememberCustomerReply(activeTask, sentPayload);
              forceApiReply = true;
            } else {
              await finalizeReplyTask(activeTask, sentPayload, { allowRemediation: true });
              return;
            }
          }
        }
        let slowReply = "";
        let slowSent = false;
        let slowStarted = false;
        let fallbackReplyText = "";
        let fallbackSent = false;
        let fallbackStarted = false;
        let aiCompleted = false;
        let waitingTimer = null;
        let fallbackTimer = null;
        let slowPromise = null;
        let fallbackPromise = null;
        activeTask = updateReplyTask(activeTask, {
          route: "api_reply",
          status: "pending_api",
          finalReply: { required: true, sent: false, text: "", sentAt: null }
        });
        state.pendingAiFollowups.set(key, {
          key,
          sessionKey,
          taskId: activeTask.taskId,
          customer: latest.text,
          startedAt: Date.now()
        });
        const clearAiTimers = () => {
          if (waitingTimer) window.clearTimeout(waitingTimer);
          if (fallbackTimer) window.clearTimeout(fallbackTimer);
          waitingTimer = null;
          fallbackTimer = null;
        };
        const sendSlowReply = async () => {
          if (!CONFIG.enabled || aiCompleted || fallbackStarted || slowStarted) return false;
          slowStarted = true;
          setStep("sending_ack", "发送承接", "AI API仍在生成，正在准备15秒承接语", { customer: latest.text });
          slowReply = await askQuickReply(latest.text);
          if (!slowReply || aiCompleted || fallbackStarted) return false;
          if (!await ensureSessionActive(sessionKey)) return false;
          const sent = await sendReplyParts(slowReply);
          slowSent = sent;
          if (sent) {
            responseSent = true;
            rememberSessionReply(sessionKey, slowReply);
            state.quickAckedSessions.add(sessionKey);
            persistQuickAckedSessions();
            state.lastReplyAt = Date.now();
            activeTask = updateReplyTask(activeTask, {
              status: "ack_sent",
              ack: { sent: true, text: slowReply, sentAt: Date.now() },
              finalReply: { required: true, sent: false, text: "", sentAt: null }
            });
            setStep("async_api", "异步API", "15秒承接语已发送，继续等待AI API最终回复", { customer: latest.text });
            reportReplySent(taskPayload(activeTask, {
              stage: "quick_ack",
              sourceType: "quick_ack",
              usedRuleLibrary: false,
              usedDirectReply: true,
              usedAi: false,
              reason,
              customer: latest.text,
              status: "15秒承接语已发送",
              reply: slowReply
            }));
            log("slow quick ack sent", { reason, customer: latest.text, reply: slowReply, sessionKey });
            return true;
          }
          setStep("reply_failed", "回复失败", "承接语未能成功发送", { customer: latest.text });
          reportEvent("reply_failed", taskPayload(activeTask, { stage: "quick_ack", sourceType: "quick_ack", usedDirectReply: true, reason, customer: latest.text, reply: slowReply }));
          return false;
        };
        const sendFallbackReply = async (trigger, allowAfterAi = false) => {
          if (!CONFIG.enabled || fallbackStarted || fallbackSent) return false;
          if (aiCompleted && !allowAfterAi) return false;
          fallbackStarted = true;
          setStep("sending_fallback", "补救回复", "正在生成AI API补救回复", { customer: latest.text });
          fallbackReplyText = await askFallbackReply(latest.text);
          if (!fallbackReplyText) {
            fallbackStarted = false;
            return false;
          }
          if (!await ensureSessionActive(sessionKey)) {
            fallbackStarted = false;
            return false;
          }
          const sent = await sendReplyParts(fallbackReplyText);
          fallbackSent = sent;
          if (sent) {
            responseSent = true;
            rememberSessionReply(sessionKey, fallbackReplyText);
            state.lastReplyAt = Date.now();
            setStep("text_sent", "文字已发", "AI API补救回复已发送给当前客户", { customer: latest.text });
            reportReplySent(taskPayload(activeTask, {
              stage: "fallback_reply",
              sourceType: "fallback_reply",
              usedRuleLibrary: false,
              usedDirectReply: true,
              usedAi: false,
              reason,
              customer: latest.text,
              status: "AI API补救回复已发送",
              reply: fallbackReplyText
            }));
            log("fallback sent", { reason, trigger, customer: latest.text, reply: fallbackReplyText });
            return true;
          }
          setStep("reply_failed", "回复失败", "AI API补救回复未能成功发送", { customer: latest.text });
          reportEvent("reply_failed", taskPayload(activeTask, { stage: "fallback_reply", sourceType: "fallback_reply", usedDirectReply: true, reason, customer: latest.text, reply: fallbackReplyText }));
          fallbackStarted = false;
          return false;
        };
        const startSlowReply = () => {
          if (!slowPromise) {
            slowPromise = sendSlowReply().finally(() => {
              slowPromise = null;
            });
          }
          return slowPromise;
        };
        const startFallbackReply = (trigger, allowAfterAi = false) => {
          if (!fallbackPromise) {
            fallbackPromise = sendFallbackReply(trigger, allowAfterAi).finally(() => {
              fallbackPromise = null;
            });
          }
          return fallbackPromise;
        };
        setStep("querying_judgment", "查本机库", "正在检索本机自建资料和外部同步缓存", { customer: latest.text });
        if (shouldSendQuickAck(sessionKey)) {
          waitingTimer = window.setTimeout(() => {
            startSlowReply().catch((error) => warn("slow reply failed", error));
          }, normalizeDelay(CONFIG.aiSlowMs, 15e3));
        } else {
          log("skip 15s quick ack", { reason, customer: latest.text, sessionKey });
        }
        fallbackTimer = window.setTimeout(() => {
          if (aiCompleted) return;
          activeTask = updateReplyTask(activeTask, { status: "delayed" });
          setStep("api_delayed", "AI延迟", "超过60秒仍在等待AI API最终回复", { customer: latest.text });
          reportEvent("reply_delayed", taskPayload(activeTask, {
            stage: "api_delayed",
            sourceType: "api_reply",
            usedAi: true,
            reason,
            customer: latest.text,
            status: "60秒延迟处理"
          }));
        }, normalizeDelay(CONFIG.fallbackReplyMs, 6e4));
        const aiResult = await askLocalAi(latest.text, "deep");
        aiCompleted = true;
        clearAiTimers();
        if (slowPromise) await slowPromise;
        if (fallbackPromise) await fallbackPromise;
        const aiReply = String(aiResult?.reply || aiResult || "").trim();
        const usedJudgmentLibrary = Boolean(aiResult?.judgments?.used);
        const followupStage = usedJudgmentLibrary ? "judgment_ai" : "ai_followup";
        if (!aiReply || slowReply && normalize(aiReply) === normalize(slowReply)) {
          setStep(responseSent ? "waiting_ai" : "reply_failed", responseSent ? "等待AI" : "回复失败", responseSent ? "承接语已发送，但AI API没有可用最终回复" : "AI API没有产生可用回复", { customer: latest.text });
          const remediated = await remediateReplyTask(activeTask, {
            result: "unknown",
            reason: "AI API返回空回复或仅返回承接语",
            nextAction: "api_remediate"
          }, { stage: "ai_empty", sourceType: "ai_followup", usedAi: true, usedJudgmentLibrary });
          if (remediated) markReplied(key);
          return;
        }
        if (hasSessionReply(sessionKey, aiReply)) {
          setStep("duplicate", "跳过重复", "AI API回复与本会话已有回复重复", { customer: latest.text });
          const remediated = await remediateReplyTask(activeTask, {
            result: "partial",
            reason: "AI API回复与本会话已有回复重复",
            nextAction: "api_remediate"
          }, { stage: followupStage, sourceType: followupStage, usedAi: true, usedJudgmentLibrary });
          if (remediated) markReplied(key);
          return;
        }
        setStep("sending_text", "发送文字", usedJudgmentLibrary ? "正在发送外部同步资料增强回复" : "正在发送AI API生成的文字回复", { customer: latest.text, actionType: "text" });
        const sessionReady = await ensureSessionActive(sessionKey);
        const followupSent = sessionReady ? await sendReplyParts(aiReply) : false;
        if (followupSent) {
          responseSent = true;
          markReplied(key);
          rememberSessionReply(sessionKey, aiReply);
          state.lastReplyAt = Date.now();
          activeTask = updateReplyTask(activeTask, {
            status: "api_final_sent",
            finalReply: { required: true, sent: true, text: aiReply, sentAt: Date.now() }
          });
          const sentPayload = taskPayload(activeTask, {
            stage: followupStage,
            sourceType: followupStage,
            usedRuleLibrary: false,
            usedDirectReply: false,
            usedAi: true,
            usedJudgmentLibrary,
            reason,
            customer: latest.text,
            status: usedJudgmentLibrary ? "外部同步资料增强回复已发送" : "AI API回复已发送",
            reply: aiReply,
            latencyMs: aiResult?.latencyMs || null,
            aiTrace: aiResult?.trace || null,
            processSteps: aiProcessSteps(aiResult?.trace, usedJudgmentLibrary)
          });
          reportReplySent(sentPayload);
          await finalizeReplyTask(activeTask, sentPayload, { allowRemediation: true });
        } else {
          activeTask = updateReplyTask(activeTask, { status: "failed" });
          reportEvent(responseSent ? "ai_followup_failed" : "reply_failed", taskPayload(activeTask, { stage: followupStage, sourceType: followupStage, usedAi: true, usedJudgmentLibrary, reason, customer: latest.text, reply: aiReply, error: "AI API最终回复未能发送" }));
        }
        setStep(followupSent ? "text_sent" : "reply_failed", followupSent ? "文字已发" : "回复失败", followupSent ? usedJudgmentLibrary ? "外部同步资料增强回复已发送" : "AI API最终回复已发送" : "AI API最终回复未能发送", { customer: latest.text, actionType: "text" });
        log("ai followup", { sent: followupSent, customer: latest.text, reply: aiReply, judgments: aiResult?.judgments || null });
      } finally {
        state.pendingAiFollowups.delete(key);
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
      const key = messageReplyKey(latest);
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
      setStep("reply_timeout", "回复超时", "客户消息超过提醒时间仍未完成回复", { customer: latest.text });
      reportEvent("reply_timeout", {
        stage: state.inFlight.has(key) ? "in_flight_timeout" : "unhandled_timeout",
        customer: latest.text,
        ageMs: age,
        busy: state.busy,
        enabled: CONFIG.enabled
      });
    }
    function shouldSendQuickAck(sessionKey) {
      if (CONFIG.quickAckEveryMessage) return true;
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
      const lines = textOf(node).split("\n").map((line) => line.trim()).filter(Boolean);
      return lines.find((line) => !/^\d+$/.test(line) && !/^\d{1,2}:\d{2}$/.test(line)) || lines[0] || "";
    }
    function sessionSnapshotText(node) {
      return textOf(node).replace(/\s+/g, " ").trim();
    }
    function latestMessage() {
      return messageNodes().map(parseMessageNode).filter(Boolean).at(-1) || null;
    }
    function messageNodes() {
      const rows = visibleElements(".msg").filter((node) => !node.classList.contains("no-content")).filter((node) => node.querySelector(".message-item, .text-msg, .product-msg-block, img, video, [class*='emoji'], [class*='sticker'], [class*='file']"));
      if (rows.length) return rows;
      return visibleElements(".message-item");
    }
    function parseMessageNode(row) {
      const item = row.matches(".message-item") ? row : row.querySelector(".message-item") || row;
      const textNode = item.querySelector(".text-msg, [class*='text-msg'], [class*='message-text'], [class*='msg-text'], [class*='bubble-text']");
      const productNode = item.querySelector(".product-msg-block, [class*='product-msg'], [class*='product-card']");
      const fileNode = item.querySelector("[class*='file-msg'], [class*='file-card'], [class*='file-item']");
      const videoNode = item.querySelector("video, [class*='video-msg'], [class*='video-card']");
      const emojiNode = item.querySelector("[class*='emoji'], [class*='sticker'], img[alt*='表情'], img[title*='表情']");
      const imageNode = item.querySelector("img, canvas, [class*='image-msg'], [class*='image-message'], [class*='pic-msg']");
      const from = inferMessageSide(item, textNode);
      const rawText = textOf(item) || textOf(row);
      let type = "text";
      let text = textOf(textNode);
      if (productNode) {
        type = "product";
        text = messagePlaceholder2("商品卡", textOf(productNode));
      } else if (fileNode) {
        type = "file";
        text = messagePlaceholder2("文件", mediaLabel(fileNode));
      } else if (videoNode) {
        type = "video";
        text = messagePlaceholder2("视频", mediaLabel(videoNode));
      } else if (emojiNode) {
        type = "emoji";
        text = messagePlaceholder2("表情", mediaLabel(emojiNode));
      } else if (!text && imageNode) {
        type = "image";
        text = messagePlaceholder2("图片", mediaLabel(imageNode));
      } else if (!text && rawText) {
        text = cleanMessageText(rawText);
      }
      if (!text) return null;
      return {
        from,
        type,
        id: row.id || row.getAttribute("data-msgid") || row.getAttribute("data-id") || stableMessageId(row, text, from),
        text,
        rawText: rawText && rawText !== text ? rawText : ""
      };
    }
    function cleanMessageText(value) {
      return String(value || "").replace(/^(?:星期[一二三四五六日天]|今天|昨天)?\s*\d{1,2}:\d{2}\s*/g, "").replace(/^樱桃老师\s*/g, "").replace(/\s+/g, " ").trim();
    }
    function inferMessageSide(item, textNode) {
      if (textNode?.classList.contains("bg-user")) return "customer";
      if (textNode?.classList.contains("bg-kf")) return "kf";
      const classes = `${safeClassName(item)} ${safeClassName(item.parentElement)}`;
      return /(?:^|\s)(?:justify-end|is-self|from-kf|msg-kf|right)(?:\s|$)/i.test(classes) ? "kf" : "customer";
    }
    function mediaLabel(node) {
      const values = [
        node?.getAttribute?.("alt"),
        node?.getAttribute?.("title"),
        node?.getAttribute?.("aria-label"),
        node?.getAttribute?.("data-name"),
        textOf(node)
      ].map((value) => String(value || "").trim()).filter(Boolean);
      return values.find((value) => !/^(图片|image|表情|emoji)$/i.test(value)) || "";
    }
    function messagePlaceholder2(kind, detail = "") {
      return messagePlaceholder(kind, detail);
    }
    function stableMessageId(row, text, from) {
      const index = messageNodes().indexOf(row);
      return `${from}-${index}-${simpleHash(text)}`;
    }
    function simpleHash(value) {
      let hash = 0;
      for (const char of String(value || "")) hash = (hash << 5) - hash + char.charCodeAt(0) | 0;
      return Math.abs(hash).toString(36);
    }
    function currentSessionKey() {
      const card = visibleElements(".session-list-card, .session-item-container").filter(isLeftSession).sort((a, b) => Number(isCurrentSession(b)) - Number(isCurrentSession(a))).map((node) => textOf(node)).find(Boolean);
      if (!card) return `url:${location.href}`;
      const lines = card.split("\n").map((line) => line.trim()).filter(Boolean);
      const nickname = lines.find((line) => !/^\d+$/.test(line) && !/^\d{1,2}:\d{2}$/.test(line));
      return `session:${nickname || lines.join("|")}`;
    }
    async function ensureSessionActive(sessionKey) {
      if (!sessionKey || sessionKey.startsWith("url:") || currentSessionKey() === sessionKey) return true;
      const identity = sessionKey.replace(/^session:/, "");
      const target = visibleElements(".session-list-card, .session-item-container").filter(isLeftSession).find((node) => sessionIdentity(node) === identity);
      if (!target) return false;
      target.click();
      await sleep(700);
      return currentSessionKey() === sessionKey && visible(document.querySelector("#input-textarea"));
    }
    function messageReplyKey(message, sessionKey = currentSessionKey()) {
      return `${sessionKey}:${message?.id || ""}:${message?.type || "text"}:${message?.text || ""}`;
    }
    function customerIdForSession(sessionKey) {
      return `customer_${simpleHash(String(sessionKey || currentSessionKey()))}`;
    }
    function createReplyTask(message, sessionKey, route = "api_reply", rule = null) {
      const messageId = String(message?.id || simpleHash(`${message?.type || "text"}:${message?.text || ""}`));
      const customerId = customerIdForSession(sessionKey);
      const existing = Array.from(state.replyTasks.values()).find((item) => {
        return item.sessionKey === sessionKey && item.messageId === messageId && !["completed", "cancelled", "merged"].includes(item.status);
      });
      if (existing) return existing;
      const memory = getCustomerMemory(customerId, sessionKey);
      const now = Date.now();
      const task = {
        taskId: `task_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        customerId,
        sessionKey,
        messageId,
        messageType: String(message?.type || "text"),
        customerText: String(message?.text || ""),
        route,
        status: "created",
        ruleName: String(rule?.name || ""),
        ruleMode: normalizeRuleMode(rule),
        isNewCustomer: memory.isNewCustomer,
        customerVisibleRetryCount: 0,
        maxCustomerVisibleRetries: normalizeRetryLimit(),
        ack: { sent: false, text: "", sentAt: null },
        finalReply: { required: route === "api_reply", sent: false, text: "", sentAt: null },
        completion: { checked: false, result: "unknown", reason: "", nextAction: "" },
        createdAt: now,
        updatedAt: now
      };
      state.replyTasks.set(task.taskId, task);
      persistReplyTasks();
      reportTask(task);
      return task;
    }
    function updateReplyTask(task, patch = {}) {
      if (!task) return null;
      const next = {
        ...task,
        ...patch,
        ack: { ...task.ack || {}, ...patch.ack || {} },
        finalReply: { ...task.finalReply || {}, ...patch.finalReply || {} },
        completion: { ...task.completion || {}, ...patch.completion || {} },
        updatedAt: Date.now()
      };
      state.replyTasks.set(next.taskId, next);
      persistReplyTasks();
      reportTask(next);
      return next;
    }
    function reportTask(task) {
      reportEvent("reply_task_updated", exportTask(task));
    }
    function exportTask(task = {}) {
      return {
        taskId: task.taskId,
        customerId: task.customerId,
        sessionKey: task.sessionKey,
        messageId: task.messageId,
        messageType: task.messageType,
        customerText: clip2(task.customerText, 180),
        route: task.route,
        status: task.status,
        ruleName: task.ruleName || "",
        ruleMode: task.ruleMode || "",
        isNewCustomer: task.isNewCustomer === true,
        customerVisibleRetryCount: Number(task.customerVisibleRetryCount || 0),
        maxCustomerVisibleRetries: Number(task.maxCustomerVisibleRetries || normalizeRetryLimit()),
        ack: task.ack || {},
        finalReply: task.finalReply || {},
        completion: task.completion || {},
        createdAt: task.createdAt || 0,
        updatedAt: task.updatedAt || Date.now()
      };
    }
    function normalizeRuleMode(rule, fallback = "final") {
      const mode = String(rule?.mode || fallback || "final").trim();
      if (["final", "quick_then_api", "action_only", "ignore"].includes(mode)) return mode;
      const text = String(rule?.reply || rule?.name || "").trim();
      if (!text && Array.isArray(rule?.actions) && rule.actions.some((action) => action?.type === "ignore")) return "ignore";
      if (/^(谢谢|感谢|好的谢谢|明白了|知道了|ok|OK)$/.test(text)) return "ignore";
      return "final";
    }
    function normalizeRetryLimit() {
      const value = Number(CONFIG.maxCustomerVisibleRetries);
      return Number.isFinite(value) ? Math.max(0, Math.min(5, Math.floor(value))) : 2;
    }
    function getCustomerMemory(customerId, sessionKey) {
      const key = String(customerId || customerIdForSession(sessionKey));
      const existing = state.customerMemories[key];
      if (existing) {
        return { ...existing, isNewCustomer: false };
      }
      const memory = {
        customerId: key,
        sessionKey,
        isNewCustomer: true,
        firstSeenAt: Date.now(),
        lastSeenAt: Date.now(),
        recentCustomerMessages: [],
        recentKfReplies: [],
        sentRules: [],
        sentActions: [],
        unfinishedTasks: [],
        completionResults: [],
        solvedTopics: [],
        candidateSources: []
      };
      state.customerMemories[key] = memory;
      persistCustomerMemories();
      reportCustomerMemory(memory);
      return memory;
    }
    function rememberCustomerMessage(task, message) {
      const memory = getCustomerMemory(task.customerId, task.sessionKey);
      memory.isNewCustomer = false;
      memory.lastSeenAt = Date.now();
      memory.recentCustomerMessages = [
        ...Array.isArray(memory.recentCustomerMessages) ? memory.recentCustomerMessages : [],
        {
          messageId: task.messageId,
          type: String(message?.type || task.messageType || "text"),
          text: clip2(String(message?.text || task.customerText || ""), 240),
          at: Date.now()
        }
      ].slice(-20);
      if (!memory.unfinishedTasks.includes(task.taskId)) memory.unfinishedTasks.push(task.taskId);
      memory.unfinishedTasks = memory.unfinishedTasks.slice(-20);
      persistCustomerMemories();
      reportCustomerMemory(memory);
    }
    function rememberCustomerReply(task, payload = {}) {
      if (!task) return;
      const memory = getCustomerMemory(task.customerId, task.sessionKey);
      const reply = String(payload.reply || "").trim();
      if (reply) {
        memory.recentKfReplies = [
          ...Array.isArray(memory.recentKfReplies) ? memory.recentKfReplies : [],
          {
            taskId: task.taskId,
            sourceType: payload.sourceType || payload.stage || task.route || "",
            text: clip2(reply, 240),
            at: Date.now()
          }
        ].slice(-20);
      }
      if (payload.rule || task.ruleName) {
        const rule = String(payload.rule || task.ruleName);
        memory.sentRules = uniqueTail([...memory.sentRules || [], rule], 40);
      }
      for (const action of Array.isArray(payload.actions) ? payload.actions : []) {
        memory.sentActions = uniqueTail([...memory.sentActions || [], `${action.type || "action"}:${action.productId || action.path || action.button || ""}`], 60);
      }
      persistCustomerMemories();
      reportCustomerMemory(memory);
    }
    function completeMemoryTask(task, completion = {}) {
      const memory = getCustomerMemory(task.customerId, task.sessionKey);
      memory.unfinishedTasks = (memory.unfinishedTasks || []).filter((id) => id !== task.taskId);
      memory.completionResults = [
        ...memory.completionResults || [],
        {
          taskId: task.taskId,
          result: completion.result || task.completion?.result || "unknown",
          reason: clip2(completion.reason || task.completion?.reason || "", 160),
          at: Date.now()
        }
      ].slice(-40);
      if ((completion.result || task.completion?.result) === "solved") {
        memory.solvedTopics = uniqueTail([...memory.solvedTopics || [], clip2(task.customerText, 80)], 40);
      }
      persistCustomerMemories();
      reportCustomerMemory(memory);
    }
    function reportCustomerMemory(memory) {
      reportEvent("customer_memory_updated", {
        ...memory,
        recentCustomerMessages: (memory.recentCustomerMessages || []).slice(-8),
        recentKfReplies: (memory.recentKfReplies || []).slice(-8)
      });
    }
    function uniqueTail(items, limit) {
      return Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean))).slice(-limit);
    }
    function taskPayload(task, extra = {}) {
      return {
        taskId: task?.taskId || "",
        customerId: task?.customerId || "",
        sessionKey: task?.sessionKey || "",
        isNewCustomer: task?.isNewCustomer === true,
        route: task?.route || "",
        ruleMode: task?.ruleMode || "",
        ackSent: task?.ack?.sent === true,
        finalReplySent: task?.finalReply?.sent === true,
        completionResult: task?.completion?.result || "",
        completionReason: task?.completion?.reason || "",
        remediationCount: Number(task?.customerVisibleRetryCount || 0),
        ...extra
      };
    }
    function enrichMessageWithContext(message) {
      if (!message) return message;
      return {
        ...message,
        contextText: recentCustomerContext(message)
      };
    }
    function recentCustomerContext(latest, limit = 4) {
      const messages = messageNodes().map(parseMessageNode).filter((message) => message && message.from === "customer").slice(-limit);
      if (!messages.length) return String(latest?.text || "");
      const hasLatest = messages.some((message) => message.id === latest?.id);
      const selected = hasLatest ? messages : [...messages.slice(-(limit - 1)), latest].filter(Boolean);
      return selected.map((message) => message.text).filter(Boolean).join(" ");
    }
    function matchRuleReply(message) {
      return matchTextRule(message)?.reply || "";
    }
    function matchTextRule(message) {
      const text = messageSearchText(message);
      const rules = Array.isArray(CONFIG.rules) && CONFIG.rules.length > 0 ? CONFIG.rules : DEFAULT_RULES;
      for (const rule of rules) {
        if (!rule) continue;
        if (rule.enabled === false) continue;
        if (ruleMatchesSearchText(rule, text)) {
          return {
            ...rule,
            reply: String(rule.reply || ""),
            mode: normalizeRuleMode(rule)
          };
        }
      }
      return null;
    }
    function matchActionRule(message) {
      const rules = Array.isArray(CONFIG.actionRules) ? CONFIG.actionRules : [];
      const text = messageSearchText(message);
      return rules.find((rule) => {
        if (!rule || rule.enabled === false || !Array.isArray(rule.actions) || rule.actions.length === 0) return false;
        return ruleMatchesSearchText(rule, text);
      }) || null;
    }
    async function executeActions(actions, customerText, ruleName = "", sessionKey = currentSessionKey()) {
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
          const text = String(action.text || action.reply || "").trim();
          if (!text) continue;
          if (hasSessionReply(sessionKey, text)) {
            result.skippedDuplicateText = true;
            continue;
          }
          setStep("sending_text", "发送文字", "正在执行动作规则中的文字回复", { customer: customerText, actionType: type });
          const sent = await sendReplyParts(text);
          result.sentText = result.sentText || sent;
          if (sent) rememberSessionReply(sessionKey, text);
          if (!sent) return { ...result, message: "text action failed" };
        } else if (type === "ignore" || type === "noop") {
          result.ignored = true;
        } else if (type === "image") {
          setStep("sending_image", "发送图片", "正在执行动作规则中的图片回复", { customer: customerText, actionType: type });
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
          setStep("sending_file", "发送文件", "正在执行动作规则中的文件回复", { customer: customerText, actionType: type });
          const fileResult = await requestPageAction({
            ...action,
            type: "file",
            name: action.name || ruleName,
            customer: customerText
          });
          result.sentFile = result.sentFile || Boolean(fileResult.ok || fileResult.sent);
          if (!fileResult.ok && !fileResult.sent) return { ...result, message: fileResult.message || "file action failed" };
        } else if (type === "product") {
          const inviteOrder = /邀请下单/.test(String(action.button || ""));
          setStep(inviteOrder ? "sending_order" : "sending_product", inviteOrder ? "邀请下单" : "发送商品", inviteOrder ? "正在选择商品并邀请客户下单" : "正在选择并发送商品卡片", { customer: customerText, actionType: type });
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
          setStep("sending_material", "发送素材", "正在从素材库选择并发送内容", { customer: customerText, actionType: type });
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
          setStep("sending_text", "发送文字", "正在选择并发送快捷语", { customer: customerText, actionType: type });
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
      result.ok = result.sentText || result.sentImage || result.sentFile || result.sentProduct || result.sentMaterial || result.sentQuickReply || result.clicked || result.captured || result.ignored || result.skippedDuplicateText;
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
      if (result.skippedDuplicateText) return "重复话术已跳过";
      if (result.ignored) return "已忽略";
      return "动作已发送";
    }
    function runtimeStatusForActionResult(result, actions = []) {
      const product = (Array.isArray(actions) ? actions : []).find((action) => String(action?.type || "") === "product");
      if (product && /邀请下单/.test(String(product.button || ""))) {
        return { code: "order_sent", label: "已邀下单", detail: "邀请下单已发送", actionType: "product" };
      }
      if (result.sentImage && result.sentText) return { code: "reply_done", label: "回复完成", detail: "文字和图片均已发送", actionType: "image" };
      if (result.sentImage) return { code: "image_sent", label: "图片已发", detail: "图片回复已发送", actionType: "image" };
      if (result.sentFile) return { code: "file_sent", label: "文件已发", detail: "文件回复已发送", actionType: "file" };
      if (result.sentProduct) return { code: "product_sent", label: "商品已发", detail: "商品卡片已发送", actionType: "product" };
      if (result.sentMaterial) return { code: "material_sent", label: "素材已发", detail: "素材内容已发送", actionType: "material" };
      if (result.sentQuickReply) return { code: "quick_sent", label: "快捷已发", detail: "快捷语已发送", actionType: "quick_reply" };
      if (result.sentText) return { code: "text_sent", label: "文字已发", detail: "文字回复已发送", actionType: "text" };
      if (result.skippedDuplicateText) return { code: "duplicate", label: "跳过重复", detail: "相同话术在当前会话已发送", actionType: "text" };
      if (result.ignored) return { code: "ignored", label: "已忽略", detail: "规则要求忽略本条消息", actionType: "ignore" };
      return { code: "reply_done", label: "回复完成", detail: actionResultStatus(result), actionType: "action" };
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
      const text = messageSearchText(message);
      return CONFIG.imageReplies.find((rule) => {
        if (!rule || rule.enabled === false) return false;
        const path = String(rule.path || rule.imagePath || "").trim();
        if (!path) return false;
        return ruleMatchesSearchText(rule, text);
      }) || null;
    }
    function messageSearchText(message) {
      const messageObject = message && typeof message === "object" ? message : null;
      const text = String(messageObject ? messageObject.text : message || "");
      const type = String(messageObject?.type || inferMessageTypeFromText(text) || "text");
      const aliases = {
        image: "图片 照片 截图 非文本 客户发图片 收到图片",
        emoji: "表情 图片表情 非文本 客户发表情 收到表情",
        product: "商品 商品卡 商品链接 链接 非文本 客户发商品 收到商品",
        file: "文件 附件 非文本 客户发文件 收到文件",
        video: "视频 非文本 客户发视频 收到视频",
        media: "非文本 媒体消息"
      };
      return buildRuleSearchText({
        text,
        rawText: messageObject?.rawText || "",
        contextText: messageObject?.contextText || "",
        type
      }, aliases);
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
      return normalizeKeywordList(value);
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
    function runtimeStatusForPanelAction(action = {}) {
      if (action.tab === "商品" && /邀请下单/.test(String(action.button || ""))) {
        return {
          matchCode: "matching_product",
          matchLabel: "匹配商品",
          matchDetail: "已识别客户下单意图",
          sendCode: "sending_order",
          sendLabel: "邀请下单",
          sendDetail: "正在选择商品并邀请客户下单",
          doneCode: "order_sent",
          doneLabel: "已邀下单",
          doneDetail: "邀请下单已发送",
          actionType: "product"
        };
      }
      if (action.tab === "商品") {
        return {
          matchCode: "matching_product",
          matchLabel: "匹配商品",
          matchDetail: "已识别客户商品咨询意图",
          sendCode: "sending_product",
          sendLabel: "发送商品",
          sendDetail: "正在选择并发送商品卡片",
          doneCode: "product_sent",
          doneLabel: "商品已发",
          doneDetail: "商品卡片已发送",
          actionType: "product"
        };
      }
      return {
        matchCode: "matching_rule",
        matchLabel: "匹配规则",
        matchDetail: "已识别素材发送意图",
        sendCode: "sending_material",
        sendLabel: "发送素材",
        sendDetail: "正在从素材库选择并发送内容",
        doneCode: "material_sent",
        doneLabel: "素材已发",
        doneDetail: "素材内容已发送",
        actionType: "material"
      };
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
      const button = findPanelScopedButton(action) || findRightPanelButton(action.button) || (action.fallbackButton ? findRightPanelButton(action.fallbackButton) : null);
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
      const cards = visibleElements(".product-panel .product-card, .product-card").filter(isRightPanelNode).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      if (!cards.length) return null;
      const terms = matchTerms(action, ["productId", "productName", "query", "match", "name"]);
      const card = findMatchedNode(cards, terms) || cards[0];
      return findButtonInside(card, labels);
    }
    function findMaterialButton(action) {
      const labels = [action.button, action.fallbackButton].map((item) => String(item || "").trim()).filter(Boolean);
      const panel = document.querySelector(".quick-resp-panel") || document.querySelector(".extension-panel") || document;
      const terms = matchTerms(action, ["materialName", "query", "match", "name"]);
      const candidates = visibleElements(".quick-resp-panel .wrap, .quick-resp-panel [class*='item'], .quick-resp-panel [class*='card'], .quick-resp-panel [class*='content']").filter(isRightPanelNode).filter((node) => textOf(node)).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const scope = findMatchedNode(candidates, terms) || panel;
      return findButtonInside(scope, labels);
    }
    function findQuickReplyButton(action) {
      const labels = [action.button, action.fallbackButton].map((item) => String(item || "").trim()).filter(Boolean);
      const panel = document.querySelector(".quick-reply-panel") || document.querySelector(".quick-resp-panel") || document.querySelector(".extension-panel") || document;
      const terms = matchTerms(action, ["quickReply", "query", "match", "name"]);
      const candidates = visibleElements(".quick-reply-panel [class*='item'], .quick-reply-panel [class*='wrap'], .quick-resp-panel [class*='item'], .quick-resp-panel [class*='wrap'], .extension-panel [class*='item'], .extension-panel [class*='wrap']").filter(isRightPanelNode).filter((node) => textOf(node)).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const scope = findMatchedNode(candidates, terms) || panel;
      return findButtonInside(scope, labels) || findClickableText(scope, terms);
    }
    function matchTerms(action, keys) {
      return keys.map((key) => String(action[key] || "").trim()).filter(Boolean).map(normalize);
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
      const buttons = Array.from(scope.querySelectorAll("button,[role='button'],.weui-desktop-btn")).filter(visible).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      for (const label of labels) {
        const matched = buttons.find((node) => labelMatches(textOf(node), label));
        if (matched) return matched;
      }
      return null;
    }
    function findClickableText(scope, terms) {
      if (!scope || !terms.length) return null;
      return Array.from(scope.querySelectorAll("button,[role='button'],a,div,span,li")).filter(visible).filter(isRightPanelNode).find((node) => {
        const text = normalize(textOf(node));
        return terms.some((term) => text.includes(term));
      }) || null;
    }
    async function confirmSendDialog(label) {
      const started = Date.now();
      while (Date.now() - started < 5e3) {
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
      const dialogs = visibleElements(".weui-desktop-dialog, .order-transfer-dialog, .product-detail-drawer, .t-drawer, .t-dialog__ctx, .t-dialog, .file-upload-dialog, [role='dialog']").filter((node) => /发送|取消|邀请下单|发送给微信用户|商品预览|确认|确定/.test(textOf(node)));
      for (const dialog of dialogs) {
        const button = Array.from(dialog.querySelectorAll("button,[role='button'],.weui-desktop-btn")).filter(visible).filter((node) => !node.disabled && node.getAttribute("aria-disabled") !== "true").filter((node) => labelMatches(textOf(node), label)).sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0];
        if (button) return button;
      }
      return null;
    }
    function hasActionDialog() {
      return visibleElements(".weui-desktop-dialog, .order-transfer-dialog, .product-detail-drawer, .t-drawer, .t-dialog__ctx, .t-dialog, .file-upload-dialog, [role='dialog']").some((scope) => {
        return Array.from(scope.querySelectorAll("button,[role='button'],.weui-desktop-btn")).filter(visible).filter((node) => !node.disabled && node.getAttribute("aria-disabled") !== "true").some((node) => ["发送", "邀请下单", "确定", "确认"].some((label) => labelMatches(textOf(node), label)));
      });
    }
    function findRightPanelButton(label) {
      return visibleElements("button").filter((node) => textOf(node) === label).filter(isRightPanelNode).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
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
      return latest !== before && (latest === value || latest === expected || expected && latest.includes(expected.slice(0, 20)));
    }
    async function askLocalAi(message, mode = "normal") {
      if (!CONFIG.aiFallback) return "";
      const startedAt = Date.now();
      try {
        setStep("collecting", "收集上下文", "正在读取最近消息和客服页上下文", { customer: message });
        const sideContext = await collectSidebarContext(message);
        setStep("api_calling", "调用API", "正在通过本机回复中转服务请求远方AI API", { customer: message });
        const request = fetch(CONFIG.aiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            mode,
            context: recentMessages(),
            sideContext
          })
        });
        setStep("ai_thinking", "AI生成中", "AI API正在结合本机知识资料和会话上下文生成回复", { customer: message });
        const response = await request;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const reply = String(data.reply || "").trim();
        setStep(reply ? "ai_returned" : "reply_failed", reply ? "AI已返回" : "回复失败", reply ? "AI API已经生成可发送的回复" : "AI API返回了空回复", { customer: message });
        return {
          reply,
          judgments: data.judgments || null,
          trace: data.trace || null,
          latencyMs: Date.now() - startedAt
        };
      } catch (error) {
        warn("ai fallback failed", error);
        setStep("reply_failed", "回复失败", `AI API请求失败：${String(error?.message || error)}`, { customer: message });
        reportEvent("ai_failed", { message, error: String(error?.message || error) });
        return "";
      }
    }
    async function askQuickReply(message) {
      const configured = pickConfiguredReply("quick", CONFIG.quickAckReplies, CONFIG.quickAck, CONFIG.localQuickReplies);
      if (configured) return configured;
      try {
        setStep("sending_ack", "发送承接", "正在生成15秒承接语", { customer: message });
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
        setStep(text ? "sending_ack" : "reply_failed", text ? "发送承接" : "回复失败", text ? "承接语已经生成，准备发送" : "没有生成可用承接语", { customer: message });
        return text || pickConfiguredReply("quick", [], CONFIG.quickAck, CONFIG.localQuickReplies);
      } catch (error) {
        warn("quick reply failed", error);
        const local = pickLocalQuickReply();
        setStep("sending_ack", "发送承接", "远端承接语不可用，改用本地承接语", { customer: message });
        return local;
      }
    }
    async function askWaitingReply() {
      const configured = pickConfiguredReply("waiting", CONFIG.fallbackReplies, CONFIG.fallbackReply, CONFIG.localWaitingReplies);
      if (configured) return configured;
      try {
        setStep("sending_fallback", "补救回复", "正在生成60秒延迟处理回复", {});
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
        setStep(text ? "sending_fallback" : "reply_failed", text ? "补救回复" : "回复失败", text ? "延迟处理回复已经生成，准备发送" : "没有生成可用延迟处理回复");
        return text || pickLocalWaitingReply();
      } catch (error) {
        warn("waiting reply failed", error);
        return pickLocalWaitingReply();
      }
    }
    async function askFallbackReply(message) {
      const configured = pickConfiguredReply("fallback", CONFIG.fallbackReplies, CONFIG.fallbackReply, CONFIG.localWaitingReplies);
      if (configured) return configured;
      return askWaitingReply(message);
    }
    async function checkReplyCompletion(task, payload = {}) {
      if (!CONFIG.completionCheckEnabled || !task) {
        return { result: "solved", reason: "完成度检查已关闭", nextAction: "" };
      }
      task = updateReplyTask(task, { status: "checking_completion" });
      setStep("checking_completion", "检查完成", "正在检查本次回复是否解决客户问题", { customer: task.customerText });
      try {
        const memory = getCustomerMemory(task.customerId, task.sessionKey);
        const response = await fetch(endpointFor("/completion/check"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskId: task.taskId,
            customerText: task.customerText,
            history: [
              ...(memory.recentCustomerMessages || []).slice(-4).map((item) => ({ from: "customer", text: item.text })),
              ...(memory.recentKfReplies || []).slice(-4).map((item) => ({ from: "kf", text: item.text }))
            ].slice(-8),
            reply: payload.reply || task.finalReply?.text || "",
            actions: payload.actions || [],
            source: payload.sourceType || payload.stage || task.route || ""
          })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return normalizeCompletionResult(data);
      } catch (error) {
        warn("completion check failed", error);
        return {
          result: "unknown",
          reason: `完成度检查失败：${safeErrorMessage(error)}`,
          nextAction: "api_remediate",
          suggestedReply: "",
          suggestedActions: []
        };
      }
    }
    async function finalizeReplyTask(task, payload = {}, options = {}) {
      if (!task) return null;
      rememberCustomerReply(task, payload);
      const completion = await checkReplyCompletion(task, payload);
      task = updateReplyTask(task, {
        status: statusFromCompletion(completion),
        completion: {
          checked: true,
          result: completion.result,
          reason: completion.reason || "",
          nextAction: completion.nextAction || ""
        }
      });
      if (payload.usedAi && ["solved", "partial"].includes(completion.result)) {
        createRuleCandidate(task, payload, completion);
      }
      if (completion.result === "solved") {
        task = updateReplyTask(task, { status: "completed" });
        completeMemoryTask(task, completion);
        return task;
      }
      if (completion.result === "partial" || completion.result === "unknown") {
        if (options.allowRemediation === false) {
          completeMemoryTask(task, completion);
          return task;
        }
        return remediateReplyTask(task, completion, payload);
      }
      if (completion.result === "need_action") {
        task = updateReplyTask(task, { status: "need_action" });
        reportEvent("reply_failed", taskPayload(task, {
          stage: "completion_need_action",
          sourceType: payload.sourceType || task.route,
          usedAi: Boolean(payload.usedAi),
          customer: task.customerText,
          error: completion.reason || "完成度检查认为需要明确动作"
        }));
        return task;
      }
      if (completion.result === "risky") {
        task = updateReplyTask(task, { status: "risky" });
        reportEvent("reply_failed", taskPayload(task, {
          stage: "completion_risky",
          sourceType: payload.sourceType || task.route,
          customer: task.customerText,
          error: completion.reason || "风险回复已拦截"
        }));
        return task;
      }
      task = updateReplyTask(task, { status: "waiting_human" });
      reportEvent("reply_failed", taskPayload(task, {
        stage: "completion_need_human",
        sourceType: payload.sourceType || task.route,
        customer: task.customerText,
        error: completion.reason || "需要人工处理"
      }));
      return task;
    }
    async function remediateReplyTask(task, completion, previousPayload = {}) {
      const retryCount = Number(task.customerVisibleRetryCount || 0);
      const maxRetries = Number(task.maxCustomerVisibleRetries || normalizeRetryLimit());
      if (retryCount >= maxRetries) {
        const next = updateReplyTask(task, { status: "waiting_human" });
        completeMemoryTask(next, { ...completion, result: "need_human", reason: completion.reason || "自动补救次数已达上限" });
        reportEvent("reply_failed", taskPayload(next, {
          stage: "completion_retry_limit",
          sourceType: previousPayload.sourceType || task.route,
          usedAi: Boolean(previousPayload.usedAi),
          customer: task.customerText,
          error: "自动补救次数已达上限，转人工"
        }));
        return next;
      }
      task = updateReplyTask(task, {
        status: "retrying",
        customerVisibleRetryCount: retryCount + 1
      });
      setStep("retrying", "补救中", "正在调用AI API生成补充回复", { customer: task.customerText });
      const prompt = [
        task.customerText,
        completion.reason ? `上一次回复未完成原因：${completion.reason}` : "",
        "请补充一句能直接发给客户的客服回复，不要重复已发话术"
      ].filter(Boolean).join("\n");
      const aiResult = await askLocalAi(prompt, "deep");
      const remedialReply = String(aiResult?.reply || aiResult || completion.suggestedReply || "").trim();
      if (!remedialReply || hasSessionReply(task.sessionKey, remedialReply)) {
        const next = updateReplyTask(task, { status: "waiting_human" });
        completeMemoryTask(next, { ...completion, result: "need_human", reason: completion.reason || "AI API没有生成可用补救回复" });
        reportEvent("reply_failed", taskPayload(next, {
          stage: "api_remediation_empty",
          sourceType: "api_remediation",
          usedAi: true,
          customer: task.customerText,
          error: "AI API没有生成可用补救回复"
        }));
        return next;
      }
      if (!await ensureSessionActive(task.sessionKey)) {
        const next = updateReplyTask(task, { status: "waiting_human" });
        reportEvent("ai_followup_failed", taskPayload(next, {
          stage: "api_remediation",
          sourceType: "api_remediation",
          usedAi: true,
          customer: task.customerText,
          reply: remedialReply,
          error: "当前会话已切换，补救回复未发送"
        }));
        return next;
      }
      const sent = await sendReplyParts(remedialReply);
      if (!sent) {
        const next = updateReplyTask(task, { status: "failed" });
        reportEvent("ai_followup_failed", taskPayload(next, {
          stage: "api_remediation",
          sourceType: "api_remediation",
          usedAi: true,
          customer: task.customerText,
          reply: remedialReply,
          error: "AI API补救回复发送失败"
        }));
        return next;
      }
      rememberSessionReply(task.sessionKey, remedialReply);
      state.lastReplyAt = Date.now();
      task = updateReplyTask(task, {
        status: "api_final_sent",
        finalReply: {
          required: true,
          sent: true,
          text: remedialReply,
          sentAt: Date.now()
        }
      });
      const payload = taskPayload(task, {
        stage: "api_remediation",
        sourceType: "api_remediation",
        usedRuleLibrary: false,
        usedDirectReply: false,
        usedAi: true,
        usedJudgmentLibrary: Boolean(aiResult?.judgments?.used),
        customer: task.customerText,
        status: "AI API补救回复已发送",
        reply: remedialReply,
        latencyMs: aiResult?.latencyMs || null,
        aiTrace: aiResult?.trace || null,
        processSteps: aiProcessSteps(aiResult?.trace, Boolean(aiResult?.judgments?.used))
      });
      reportReplySent(payload);
      return finalizeReplyTask(task, payload, { allowRemediation: task.customerVisibleRetryCount < maxRetries });
    }
    function normalizeCompletionResult(value = {}) {
      const allowed = /* @__PURE__ */ new Set(["solved", "partial", "need_action", "need_human", "risky", "unknown"]);
      const result = allowed.has(String(value.result || "")) ? String(value.result) : "unknown";
      return {
        result,
        reason: String(value.reason || "").trim().slice(0, 240),
        nextAction: String(value.nextAction || "").trim().slice(0, 120),
        suggestedReply: String(value.suggestedReply || "").trim(),
        suggestedActions: Array.isArray(value.suggestedActions) ? value.suggestedActions.slice(0, 5) : []
      };
    }
    function statusFromCompletion(completion = {}) {
      const map = {
        solved: "completed",
        partial: "partial",
        need_action: "need_action",
        need_human: "waiting_human",
        risky: "risky",
        unknown: "partial"
      };
      return map[completion.result] || "partial";
    }
    function createRuleCandidate(task, payload = {}, completion = {}) {
      const answer = String(payload.reply || task.finalReply?.text || "").trim();
      if (!answer || !task.customerText) return;
      const id = `candidate_${simpleHash(`${task.customerText}:${answer}`)}`;
      const existing = state.ruleCandidates[id];
      const candidate = {
        id,
        question: task.customerText,
        answer,
        suggestedKeywords: suggestKeywords(task.customerText),
        suggestedMode: task.ruleMode === "quick_then_api" ? "quick_then_api" : "final",
        suggestedActions: [{ type: "text", text: answer }],
        source: payload.usedJudgmentLibrary ? "judgment_api" : "api_reply",
        count: Number(existing?.count || 0) + 1,
        status: existing?.status || "pending_review",
        completionResult: completion.result || "",
        lastSeenAt: Date.now(),
        updatedAt: Date.now()
      };
      state.ruleCandidates[id] = candidate;
      persistRuleCandidates();
      reportEvent("rule_candidate_created", candidate);
    }
    function suggestKeywords(text) {
      return Array.from(new Set(String(text || "").replace(/[，。！？!?、,.]/g, " ").split(/\s+/).map((item) => item.trim()).filter((item) => item.length >= 2).slice(0, 8)));
    }
    function pickConfiguredReply(kind, listValue, singleValue, fallbackList = []) {
      const list = replyList(listValue);
      const single = String(singleValue || "").trim();
      const fallback = replyList(fallbackList);
      const replies = list.length > 0 ? list : single ? [single] : fallback;
      if (!replies.length) return "";
      const used = kind === "fallback" ? state.fallbackRepliesUsed : kind === "quick" ? state.quickRepliesUsed : state.waitingRepliesUsed;
      const prefix = `config-${kind}-`;
      let available = replies.map((text, index) => ({ id: `${prefix}${index + 1}`, text })).filter((item2) => !used.has(item2.id));
      if (available.length === 0) {
        Array.from(used).forEach((id) => {
          if (String(id).startsWith(prefix)) used.delete(id);
        });
        available = replies.map((text, index) => ({ id: `${prefix}${index + 1}`, text }));
      }
      const item = available[Math.floor(Math.random() * available.length)];
      used.add(item.id);
      if (kind === "fallback") persistFallbackRepliesUsed();
      else if (kind === "quick") persistQuickRepliesUsed();
      else persistWaitingRepliesUsed();
      return item.text;
    }
    function replyList(value) {
      if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
      return String(value || "").split(/\n{2,}|[|｜]/).map((item) => item.trim()).filter(Boolean);
    }
    function pickLocalQuickReply() {
      const ids = CONFIG.localQuickReplies.map((_, index) => `local-${index + 1}`);
      let available = ids.filter((id2) => !state.quickRepliesUsed.has(id2));
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
      let available = ids.filter((id2) => !state.waitingRepliesUsed.has(id2));
      if (available.length === 0) {
        state.waitingRepliesUsed.clear();
        available = ids;
      }
      const id = available[Math.floor(Math.random() * available.length)];
      state.waitingRepliesUsed.add(id);
      persistWaitingRepliesUsed();
      return CONFIG.localWaitingReplies[Number(id.replace("local-waiting-", "")) - 1] || "稍等一下，我还在看";
    }
    function normalizeDelay(value, fallback) {
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0) return fallback;
      return Math.max(1e3, number);
    }
    function endpointFor(path) {
      return CONFIG.aiEndpoint.replace(/\/reply$/, path);
    }
    function recentMessages() {
      return messageNodes().slice(-8).map(parseMessageNode).filter(Boolean).map(({ from, text, type }) => ({ from, text, type })).filter((item) => item.text);
    }
    async function collectSidebarContext(message = "") {
      const labels = shouldCollectProductContext(message) ? ["用户信息", "商品", "快捷语", "素材库"] : ["用户信息", "快捷语", "素材库"];
      const original = currentSidebarTab(labels);
      const sections = [];
      for (const label of labels) {
        const tab = findRightPanelLabel(label);
        if (!tab) continue;
        tab.click();
        await sleep(180);
        const text = rightPanelText();
        if (text) sections.push(`【${label}】
${text}`);
      }
      if (original && original !== currentSidebarTab(labels)) {
        findRightPanelLabel(original)?.click();
        await sleep(80);
      }
      return sections.join("\n\n").slice(0, 5e3);
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
      return visibleElements("button, [role='tab'], li, div, span").filter((node) => textOf(node) === label).filter(isRightPanelNode).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
    }
    function isRightPanelNode(node) {
      return node.getBoundingClientRect().left > window.innerWidth * 0.45;
    }
    function rightPanelText() {
      const seen = /* @__PURE__ */ new Set();
      return visibleElements("button, [role='tab'], div, span, p, li").filter((node) => node.id !== "wechat-kf-bot-status").filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left > window.innerWidth * 0.45 && rect.width > 0 && rect.height > 0;
      }).map((node) => textOf(node)).map((text) => text.replace(/\s+/g, " ").trim()).filter((text) => text && text.length <= 260).filter((text) => {
        if (seen.has(text)) return false;
        seen.add(text);
        return true;
      }).slice(0, 80).join("\n");
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
      const sendButton = visibleElements("button").filter((button) => textOf(button) === "发送").sort((a, b) => b.getBoundingClientRect().y - a.getBoundingClientRect().y)[0];
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
      const rawParts = clean.split(/\n+/).map((part) => part.trim()).filter(Boolean);
      const parts = rawParts.length ? rawParts : [clean];
      const limited = parts.length <= maxParts ? parts : parts.slice(0, maxParts - 1).concat(parts.slice(maxParts - 1).join(" "));
      return limited.slice(0, maxParts).map((part) => maxLength > 0 && part.length > maxLength ? part.slice(0, maxLength) : part).filter(Boolean);
    }
    function cleanOutgoingText(text) {
      return String(text || "").replace(/^收到[，,。\s]*/g, "").replace(/[。．.]+/g, "").replace(/[！？!?；;]+/g, "").replace(/[ \t\f\v]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
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
      document.querySelector("#wechat-kf-bot-status")?.remove();
    }
    function updateToolbar(status, extra = {}) {
      state.lastStatus = status;
      state.lastStatusMeta = { ...extra };
      document.querySelector("#wechat-kf-bot-status")?.remove();
      reportStatus(status, extra);
    }
    function setStep(code, label, detail, extra = {}) {
      updateToolbar(label, {
        ...extra,
        code,
        label,
        detail
      });
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
        const text = String(node.innerText || node.textContent || node.getAttribute("aria-label") || node.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 180);
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
        bodyText: document.body ? document.body.innerText.slice(0, 8e3) : "",
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
    function safeErrorMessage(error) {
      return clip2(String(error?.message || error || "unknown error").replace(/\s+/g, " ").trim(), 160);
    }
    function sleep(ms) {
      return new Promise((resolve) => window.setTimeout(resolve, ms));
    }
    function reportStatus(status, extra = {}) {
      try {
        window.wechatKfDesktop?.reportStatus?.({
          status,
          code: String(extra.code || ""),
          label: String(extra.label || status || ""),
          detail: String(extra.detail || status || ""),
          tone: String(extra.tone || ""),
          category: String(extra.category || ""),
          customer: clip2(String(extra.customer || ""), 80),
          actionType: String(extra.actionType || ""),
          messageType: String(extra.messageType || ""),
          enabled: CONFIG.enabled,
          busy: Boolean(state.busy),
          takeover: Boolean(extra.takeover || CONFIG.enabled && state.busy),
          inFlightCount: state.inFlight.size,
          pendingCount: state.pendingCustomerMessages.size,
          href: location.href,
          title: document.title,
          at: Date.now()
        });
      } catch {
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
      }
    }
    function reportReplySent(payload = {}) {
      reportEvent("reply_sent", payload);
    }
    function clip2(value, size = 80) {
      const text = String(value || "");
      return text.length > size ? `${text.slice(0, size)}...` : text;
    }
    function loadReplied() {
      try {
        return new Set(JSON.parse(sessionStorage.getItem(STATE_KEY) || "[]"));
      } catch {
        return /* @__PURE__ */ new Set();
      }
    }
    function loadQuickRepliesUsed() {
      try {
        return new Set(JSON.parse(localStorage.getItem(`${STATE_KEY}_quick_replies`) || "[]"));
      } catch {
        return /* @__PURE__ */ new Set();
      }
    }
    function loadWaitingRepliesUsed() {
      try {
        return new Set(JSON.parse(localStorage.getItem(`${STATE_KEY}_waiting_replies`) || "[]"));
      } catch {
        return /* @__PURE__ */ new Set();
      }
    }
    function loadFallbackRepliesUsed() {
      try {
        return new Set(JSON.parse(localStorage.getItem(`${STATE_KEY}_fallback_replies`) || "[]"));
      } catch {
        return /* @__PURE__ */ new Set();
      }
    }
    function loadReplyTasks() {
      try {
        const items = JSON.parse(localStorage.getItem(`${STATE_KEY}_reply_tasks`) || "[]");
        return new Map((Array.isArray(items) ? items : []).map((item) => [item.taskId, item]).filter(([id]) => id));
      } catch {
        return /* @__PURE__ */ new Map();
      }
    }
    function loadCustomerMemories() {
      try {
        const value = JSON.parse(localStorage.getItem(`${STATE_KEY}_customer_memories`) || "{}");
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
      } catch {
        return {};
      }
    }
    function loadRuleCandidates() {
      try {
        const value = JSON.parse(localStorage.getItem(`${STATE_KEY}_rule_candidates`) || "{}");
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
      } catch {
        return {};
      }
    }
    function loadSessionReplyMemory() {
      try {
        const value = JSON.parse(localStorage.getItem(`${STATE_KEY}_session_reply_memory`) || "{}");
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
      } catch {
        return {};
      }
    }
    function loadQuickAckedSessions() {
      try {
        return new Set(JSON.parse(localStorage.getItem(`${STATE_KEY}_quick_acked_sessions`) || "[]"));
      } catch {
        return /* @__PURE__ */ new Set();
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
    function persistFallbackRepliesUsed() {
      localStorage.setItem(`${STATE_KEY}_fallback_replies`, JSON.stringify(Array.from(state.fallbackRepliesUsed).slice(-20)));
    }
    function persistReplyTasks() {
      const items = Array.from(state.replyTasks.values()).slice(-500);
      localStorage.setItem(`${STATE_KEY}_reply_tasks`, JSON.stringify(items));
    }
    function persistCustomerMemories() {
      const entries = Object.entries(state.customerMemories).slice(-500);
      localStorage.setItem(`${STATE_KEY}_customer_memories`, JSON.stringify(Object.fromEntries(entries)));
    }
    function persistRuleCandidates() {
      const entries = Object.entries(state.ruleCandidates).slice(-300);
      localStorage.setItem(`${STATE_KEY}_rule_candidates`, JSON.stringify(Object.fromEntries(entries)));
    }
    function hasSessionReply(sessionKey, reply) {
      const signature = replySignature(reply);
      if (!signature) return false;
      const key = String(sessionKey || currentSessionKey());
      return Array.isArray(state.sessionReplyMemory[key]) && state.sessionReplyMemory[key].includes(signature);
    }
    function rememberSessionReply(sessionKey, reply) {
      const signature = replySignature(reply);
      if (!signature) return;
      const key = String(sessionKey || currentSessionKey());
      const items = Array.isArray(state.sessionReplyMemory[key]) ? state.sessionReplyMemory[key] : [];
      if (!items.includes(signature)) items.push(signature);
      state.sessionReplyMemory[key] = items.slice(-60);
      persistSessionReplyMemory();
    }
    function persistSessionReplyMemory() {
      const entries = Object.entries(state.sessionReplyMemory).slice(-120);
      localStorage.setItem(`${STATE_KEY}_session_reply_memory`, JSON.stringify(Object.fromEntries(entries)));
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
})();
