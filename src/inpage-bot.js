(function installWechatKfBot() {
  const DEFAULT_CONFIG = {
    pollMs: 3000,
    dryRun: true,
    fallbackReply: "您好，已收到您的消息，客服会尽快为您处理。",
    rules: [
      {
        name: "物流",
        keywords: ["物流", "快递", "发货", "到哪", "什么时候到"],
        reply: "您好，订单发货后会自动同步物流信息。您也可以发送订单号，我帮您进一步查询。"
      },
      {
        name: "退款",
        keywords: ["退款", "退货", "售后", "退换"],
        reply: "您好，退换货请先在订单页面提交售后申请，并说明原因。我们看到申请后会尽快处理。"
      },
      {
        name: "联系方式",
        keywords: ["微信", "电话", "手机号", "联系方式", "加我"],
        reply: "您好，平台规定不支持在店铺客服里交换外部联系方式，请直接在店铺内咨询或下单。"
      }
    ]
  };

  if (window.__wechatKfBot?.stop) {
    window.__wechatKfBot.stop();
  }

  const state = {
    timer: null,
    config: DEFAULT_CONFIG,
    replied: new Set(JSON.parse(localStorage.getItem("__wechatKfBotReplied") || "[]"))
  };

  function start(config = {}) {
    state.config = {
      ...DEFAULT_CONFIG,
      ...config,
      rules: config.rules || DEFAULT_CONFIG.rules
    };
    stop();
    tick();
    state.timer = window.setInterval(tick, state.config.pollMs);
    log(`started dryRun=${state.config.dryRun}`);
  }

  function stop() {
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
    log("stopped");
  }

  function status() {
    const latest = latestMessage();
    return {
      running: Boolean(state.timer),
      dryRun: state.config.dryRun,
      latest,
      repliedCount: state.replied.size,
      sessions: visibleTexts(".session-item-container")
    };
  }

  function tick() {
    const latest = latestMessage();
    if (!latest || latest.from !== "customer") return;

    const key = `${latest.id || ""}:${latest.text}`;
    if (state.replied.has(key)) return;

    const decision = buildReply(latest.text);
    log(`customer="${clip(latest.text)}" rule=${decision.rule} reply="${decision.reply}"`);

    if (!state.config.dryRun) {
      send(decision.reply);
    }

    state.replied.add(key);
    localStorage.setItem("__wechatKfBotReplied", JSON.stringify(Array.from(state.replied).slice(-500)));
  }

  function latestMessage() {
    const nodes = Array.from(document.querySelectorAll(".text-msg.bg-user, .text-msg.bg-kf"))
      .filter(isVisible);
    const node = nodes.at(-1);
    if (!node) return null;

    const msg = node.closest(".msg");
    return {
      from: node.classList.contains("bg-user") ? "customer" : "kf",
      text: textOf(node),
      id: msg?.id || ""
    };
  }

  function buildReply(message) {
    const text = normalize(message);
    for (const rule of state.config.rules || []) {
      if ((rule.keywords || []).some((keyword) => text.includes(normalize(keyword)))) {
        return { rule: rule.name || "rule", reply: rule.reply };
      }
    }
    return { rule: "fallback", reply: state.config.fallbackReply };
  }

  function send(reply) {
    const textarea = document.querySelector("#input-textarea");
    if (!textarea || !isVisible(textarea)) {
      log("input not found");
      return false;
    }

    textarea.focus();
    textarea.value = reply;
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: reply }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));

    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    });
    textarea.dispatchEvent(enter);
    log("sent");
    return true;
  }

  function visibleTexts(selector) {
    return Array.from(document.querySelectorAll(selector))
      .filter(isVisible)
      .map(textOf);
  }

  function isVisible(node) {
    return Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
  }

  function textOf(node) {
    return String(node.innerText || node.textContent || "").trim();
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function clip(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > 80 ? `${text.slice(0, 80)}...` : text;
  }

  function log(message) {
    console.log(`[wechat-kf-bot] ${message}`);
  }

  window.__wechatKfBot = { start, stop, status, tick };
  log("installed. Run window.__wechatKfBot.start({ dryRun: false }) to send replies.");
})();
