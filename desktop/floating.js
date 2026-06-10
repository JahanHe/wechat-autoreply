const $ = (selector) => document.querySelector(selector);

const lamps = {
  ai: $("#aiLamp"),
  local: $("#localLamp"),
  script: $("#scriptLamp"),
  login: $("#loginLamp"),
  runtime: $("#runtimeLamp"),
  mini: $("#miniLamp")
};

const texts = {
  summary: $("#summaryText"),
  ai: $("#aiText"),
  local: $("#localText"),
  script: $("#scriptText"),
  login: $("#loginText"),
  runtimeLabel: $("#runtimeLabel"),
  runtimeCategory: $("#runtimeCategory"),
  runtimeDetail: $("#runtimeDetail"),
  statusTrail: $("#statusTrail"),
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
  setLamp(lamps.runtime, states.runtime.tone);
  setLamp(lamps.mini, states.overall.tone);

  texts.summary.textContent = states.overall.summary;
  texts.ai.textContent = states.ai.text;
  texts.local.textContent = states.local.text;
  texts.script.textContent = states.script.text;
  texts.login.textContent = states.login.text;
  texts.runtimeLabel.textContent = states.runtime.label;
  texts.runtimeCategory.textContent = states.runtime.category;
  texts.runtimeDetail.textContent = states.runtime.detail;
  texts.botMode.textContent = payload.enabled ? "Bot开启" : "暂停中";
  texts.updatedAt.textContent = formatTime(states.runtime.at || payload.now || Date.now());
  texts.miniTitle.textContent = states.overall.title;
  texts.miniSubtitle.textContent = states.overall.summary;
  renderTrail(payload.botHistory || []);

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

function renderTrail(history) {
  const items = (Array.isArray(history) ? history : []).slice(-3).reverse();
  texts.statusTrail.replaceChildren(...items.map((item) => {
    const row = document.createElement("div");
    row.className = "trail-item";
    const lamp = document.createElement("i");
    lamp.className = `lamp ${normalizeTone(item.tone)}`;
    const copy = document.createElement("div");
    copy.className = "trail-copy";
    const label = document.createElement("strong");
    label.textContent = shortStatus(item.label || item.status || "检测中");
    const time = document.createElement("span");
    time.textContent = formatTime(item.at || Date.now());
    copy.append(label, time);
    row.append(lamp, copy);
    return row;
  }));
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
