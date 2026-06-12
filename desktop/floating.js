const $ = (selector) => document.querySelector(selector);

const lamps = {
  ai: $("#aiLamp"),
  local: $("#localLamp"),
  script: $("#scriptLamp"),
  login: $("#loginLamp"),
  runtime: $("#runtimeLamp")
};

const texts = {
  liveClock: $("#liveClock"),
  ai: $("#aiText"),
  local: $("#localText"),
  script: $("#scriptText"),
  login: $("#loginText"),
  runtimeLabel: $("#runtimeLabel"),
  runtimeCategory: $("#runtimeCategory"),
  runtimeDetail: $("#runtimeDetail"),
  botMode: $("#botMode"),
  updatedAt: $("#updatedAt")
};

let latestPayload = null;
let latestStatusAt = Date.now();

$("#closeFloat").addEventListener("click", hideFloatingWindow);
$("#openMain").addEventListener("click", () => window.desktopFloat.openMain());
$("#toggleBot").addEventListener("click", async () => render(await window.desktopFloat.toggleEnabled()));

window.desktopFloat.onStatus(render);
window.desktopFloat.getStatus().then(render);
updateLiveTime();
window.setInterval(updateLiveTime, 1000);

async function hideFloatingWindow() {
  await window.desktopFloat.hide();
}

function render(payload) {
  if (!payload) return;
  latestPayload = payload;
  latestStatusAt = Number(payload.bot?.at || payload.now || Date.now());

  const states = buildStates(payload);
  setLamp(lamps.ai, states.ai.tone);
  setLamp(lamps.local, states.local.tone);
  setLamp(lamps.script, states.script.tone);
  setLamp(lamps.login, states.login.tone);
  setLamp(lamps.runtime, states.runtime.tone);

  texts.ai.textContent = states.ai.text;
  texts.local.textContent = states.local.text;
  texts.script.textContent = states.script.text;
  texts.login.textContent = states.login.text;
  texts.runtimeLabel.textContent = states.runtime.label;
  texts.runtimeCategory.textContent = states.runtime.category;
  texts.runtimeDetail.textContent = states.runtime.detail;
  texts.botMode.textContent = payload.enabled ? "Bot 正在接管" : "Bot 已暂停";
  $("#toggleBot").textContent = payload.enabled ? "暂停 Bot" : "开启 Bot";
  $("#toggleBot").classList.toggle("warn", payload.enabled);
}

function updateLiveTime() {
  const now = Date.now();
  texts.liveClock.textContent = formatTime(now);
  const seconds = Math.max(0, Math.floor((now - latestStatusAt) / 1000));
  texts.updatedAt.textContent = seconds < 2 ? "状态刚刚更新" : seconds < 60 ? `状态 ${seconds} 秒前更新` : `状态 ${Math.floor(seconds / 60)} 分钟前更新`;
}

function buildStates(payload) {
  const bot = payload.bot || {};
  const botStatus = String(bot.label || bot.status || "检测中");
  const page = payload.page || {};
  const ai = payload.ai || {};
  const pageUrl = String(page.url || "");
  const needsLogin = ["need_login", "waiting_qr"].includes(String(bot.code || "")) || /redirect_url=%2Fkf/.test(pageUrl);
  const loggedIn = Boolean(page.authenticated) && !needsLogin;
  const scriptReady = Boolean(page.scriptHealthy);
  const scriptWaiting = Boolean(page.loading || (page.ready && !page.authenticated));

  const states = {
    runtime: {
      tone: normalizeTone(bot.tone),
      label: shortStatus(botStatus),
      category: shortStatus(bot.category || "运行"),
      detail: String(bot.detail || botStatus || "等待状态"),
      at: Number(bot.at || payload.now || Date.now())
    },
    ai: ai.ok
      ? { tone: "ok", text: "正常" }
      : ai.hasKey
        ? { tone: "warn", text: "待检查" }
        : { tone: "bad", text: "缺Key" },
    local: payload.now
      ? { tone: "ok", text: "已接入" }
      : { tone: "bad", text: "未连接" },
    script: scriptReady
      ? { tone: "ok", text: "已就绪" }
      : scriptWaiting
        ? { tone: "warn", text: "待注入" }
        : { tone: "bad", text: "已失联" },
    login: loggedIn
      ? { tone: "ok", text: "已登录" }
      : needsLogin
        ? { tone: "warn", text: "待扫码" }
        : { tone: page.ready ? "warn" : "bad", text: page.ready ? "待确认" : "未打开" }
  };

  const tones = Object.values(states).map((item) => item.tone);
  const overallTone = states.runtime.tone === "bad" || tones.includes("bad") ? "bad" : states.runtime.tone === "active" ? "active" : tones.includes("warn") || !payload.enabled ? "warn" : "ok";
  states.overall = {
    tone: overallTone,
    title: states.runtime.label,
    summary: states.runtime.detail
  };
  return states;
}

function setLamp(node, tone) {
  node.className = `lamp ${tone || ""}`.trim();
}

function normalizeTone(value) {
  return ["ok", "warn", "bad", "active"].includes(String(value || "")) ? String(value) : "warn";
}

function shortStatus(value) {
  return Array.from(String(value || "检测中").replace(/\s+/g, "")).slice(0, 6).join("");
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
