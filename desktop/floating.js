const $ = (selector) => document.querySelector(selector);

const lamps = {
  ai: $("#aiLamp"),
  local: $("#localLamp"),
  script: $("#scriptLamp"),
  login: $("#loginLamp"),
  mini: $("#miniLamp")
};

const texts = {
  summary: $("#summaryText"),
  ai: $("#aiText"),
  local: $("#localText"),
  script: $("#scriptText"),
  login: $("#loginText"),
  botMode: $("#botMode"),
  updatedAt: $("#updatedAt"),
  miniTitle: $("#miniTitle"),
  miniSubtitle: $("#miniSubtitle")
};

let compact = true;

$("#minimizeFloat").addEventListener("click", () => setMiniMode(true));
$("#expandFloat").addEventListener("click", () => setMiniMode(false));
$("#closeFloat").addEventListener("click", hideFloatingWindow);
$("#closeMiniFloat").addEventListener("click", hideFloatingWindow);

window.desktopFloat.onStatus(render);
window.desktopFloat.getStatus().then(render);

async function setMiniMode(value) {
  compact = !value;
  document.body.classList.toggle("mini", value);
  await window.desktopFloat.setMode(value ? "mini" : "compact");
}

async function hideFloatingWindow() {
  await window.desktopFloat.hide();
}

function render(payload) {
  if (!payload) return;

  const states = buildStates(payload);
  setLamp(lamps.ai, states.ai.tone);
  setLamp(lamps.local, states.local.tone);
  setLamp(lamps.script, states.script.tone);
  setLamp(lamps.login, states.login.tone);
  setLamp(lamps.mini, states.overall.tone);

  texts.summary.textContent = states.overall.summary;
  texts.ai.textContent = states.ai.text;
  texts.local.textContent = states.local.text;
  texts.script.textContent = states.script.text;
  texts.login.textContent = states.login.text;
  texts.botMode.textContent = payload.enabled ? "Bot 接管开启" : "Bot 已暂停";
  texts.updatedAt.textContent = formatTime(payload.now || Date.now());
  texts.miniTitle.textContent = states.overall.title;
  texts.miniSubtitle.textContent = states.overall.summary;

  const mode = payload.floating?.mode || "";
  if (mode === "mini") {
    document.body.classList.add("mini");
    compact = false;
  } else if (!compact) {
    document.body.classList.remove("mini");
    compact = true;
  }
}

function buildStates(payload) {
  const botStatus = String(payload.bot?.status || "等待状态");
  const page = payload.page || {};
  const ai = payload.ai || {};
  const pageUrl = String(page.url || "");
  const pageTitle = String(page.title || "");
  const needsLogin = /需要登录|登录|扫码/.test(botStatus) || /redirect_url=%2Fkf/.test(pageUrl);
  const loggedIn = !needsLogin && /store\.weixin\.qq\.com\/shop\/kf/.test(pageUrl) && pageTitle && pageTitle !== "微信小店";
  const scriptReady = /脚本已注入|接管|窗口已隐藏/.test(botStatus);
  const scriptBad = /失败|异常|未能|无状态/.test(botStatus);

  const states = {
    ai: ai.ok
      ? { tone: "ok", text: "正常" }
      : ai.hasKey
        ? { tone: "warn", text: "待检查" }
        : { tone: "bad", text: "Key 未配置" },
    local: payload.now
      ? { tone: "ok", text: "已接入" }
      : { tone: "bad", text: "未连接" },
    script: scriptReady
      ? { tone: "ok", text: shortText(botStatus) }
      : scriptBad
        ? { tone: "bad", text: shortText(botStatus) }
        : { tone: "warn", text: shortText(botStatus) },
    login: loggedIn
      ? { tone: "ok", text: "已登录" }
      : needsLogin
        ? { tone: "warn", text: "待扫码" }
        : { tone: page.ready ? "warn" : "bad", text: page.ready ? "待确认" : "未打开" }
  };

  const tones = Object.values(states).map((item) => item.tone);
  const overallTone = tones.includes("bad") ? "bad" : tones.includes("warn") || !payload.enabled ? "warn" : "ok";
  states.overall = {
    tone: overallTone,
    title: overallTone === "ok" ? "客服正常" : overallTone === "warn" ? "等待确认" : "需要处理",
    summary: overallTone === "ok"
      ? "AI、本地、脚本、登录均正常"
      : !payload.enabled
        ? "Bot 已暂停"
        : needsLogin
          ? "客服页需要扫码"
          : scriptBad
            ? "脚本状态异常"
            : "有状态待确认"
  };
  return states;
}

function setLamp(node, tone) {
  node.className = `lamp ${tone || ""}`.trim();
}

function shortText(value) {
  const text = String(value || "").trim();
  return text.length > 14 ? `${text.slice(0, 14)}...` : text || "等待状态";
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
