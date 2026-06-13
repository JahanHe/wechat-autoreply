export const BOT_STATUS_HISTORY_LIMIT = 6;

export const BOT_RUNTIME_STATUSES = {
  starting: status("启动中", "active", "系统"),
  monitoring: status("检测中", "ok", "检测"),
  detecting: status("检测消息", "active", "检测"),
  message_found: status("已检测消息", "active", "检测"),
  image_found: status("收到图片", "active", "检测"),
  emoji_found: status("收到表情", "active", "检测"),
  product_found: status("收到商品", "active", "检测"),
  file_found: status("收到文件", "active", "检测"),
  video_found: status("收到视频", "active", "检测"),
  last_kf: status("客服最后", "ok", "等待"),
  waiting_message: status("等待消息", "ok", "等待"),
  no_message: status("暂无消息", "ok", "等待"),
  paused: status("暂停中", "warn", "控制"),
  matching_rule: status("匹配规则", "active", "匹配"),
  matching_image: status("匹配图片", "active", "匹配"),
  matching_product: status("匹配商品", "active", "匹配"),
  collecting: status("收集上下文", "active", "AI"),
  reading_memory: status("读取记忆", "active", "AI"),
  querying_judgment: status("查询判断库", "active", "AI"),
  api_calling: status("调用API", "active", "AI"),
  async_api: status("异步API", "active", "AI"),
  ai_thinking: status("AI生成中", "active", "AI"),
  ai_returned: status("AI已返回", "active", "AI"),
  waiting_ai: status("等待AI", "warn", "AI"),
  checking_completion: status("检查完成", "active", "AI"),
  completion_partial: status("部分完成", "warn", "AI"),
  retrying: status("补救中", "active", "AI"),
  api_delayed: status("AI延迟", "warn", "AI"),
  waiting_human: status("待人工", "bad", "人工"),
  risky: status("风险拦截", "bad", "审核"),
  need_action: status("需要动作", "warn", "动作"),
  sending_reply: status("正在回复", "active", "发送"),
  sending_text: status("发送文字", "active", "发送"),
  sending_image: status("发送图片", "active", "发送"),
  sending_product: status("发送商品", "active", "发送"),
  sending_order: status("邀请下单", "active", "发送"),
  sending_file: status("发送文件", "active", "发送"),
  sending_material: status("发送素材", "active", "发送"),
  sending_ack: status("发送承接", "active", "发送"),
  sending_fallback: status("补救回复", "active", "发送"),
  text_sent: status("文字已发", "ok", "完成"),
  image_sent: status("图片已发", "ok", "完成"),
  product_sent: status("商品已发", "ok", "完成"),
  order_sent: status("已邀下单", "ok", "完成"),
  file_sent: status("文件已发", "ok", "完成"),
  material_sent: status("素材已发", "ok", "完成"),
  quick_sent: status("快捷已发", "ok", "完成"),
  reply_done: status("回复完成", "ok", "完成"),
  duplicate: status("跳过重复", "warn", "控制"),
  ignored: status("已忽略", "warn", "控制"),
  reply_timeout: status("回复超时", "bad", "异常"),
  reply_failed: status("回复失败", "bad", "异常"),
  need_login: status("待扫码", "warn", "登录"),
  waiting_qr: status("等二维码", "warn", "登录"),
  page_loading: status("页面加载", "active", "页面"),
  script_ready: status("脚本就绪", "ok", "系统"),
  background: status("后台运行", "ok", "系统")
};

export function inferBotStatusCode(raw, extra = {}, options = {}) {
  const text = `${raw || ""} ${extra.detail || ""}`;
  if (options.enabled === false || /暂停/.test(text)) return "paused";
  if (/等待二维码/.test(text)) return "waiting_qr";
  if (/扫码|需要登录/.test(text)) return "need_login";
  if (/脚本已注入|脚本就绪/.test(text)) return "script_ready";
  if (/窗口已隐藏|后台运行/.test(text)) return "background";
  if (/页面.*载|重载/.test(text)) return "page_loading";
  if (/最后一条.*客服|客服最后/.test(text)) return "last_kf";
  if (/无客户消息|暂无消息/.test(text)) return "no_message";
  if (/等待新会话|等待消息|监听中/.test(text)) return "waiting_message";
  if (/匹配.*图片/.test(text)) return "matching_image";
  if (/匹配.*商品/.test(text)) return "matching_product";
  if (/规则/.test(text) && /匹配|执行/.test(text)) return "matching_rule";
  if (/记忆/.test(text)) return "reading_memory";
  if (/上下文/.test(text)) return "collecting";
  if (/判断库.*查询|查询判断/.test(text)) return "querying_judgment";
  if (/异步.*API/.test(text)) return "async_api";
  if (/调用.*API/.test(text)) return "api_calling";
  if (/AI.*请求|AI.*思考|AI.*生成/.test(text)) return "ai_thinking";
  if (/检查完成|完成度/.test(text)) return "checking_completion";
  if (/部分完成/.test(text)) return "completion_partial";
  if (/补救/.test(text)) return "retrying";
  if (/AI延迟|延迟任务/.test(text)) return "api_delayed";
  if (/待人工|人工处理/.test(text)) return "waiting_human";
  if (/风险/.test(text)) return "risky";
  if (/需要动作/.test(text)) return "need_action";
  if (/AI.*返回/.test(text)) return "ai_returned";
  if (/继续等.*AI|等待AI/.test(text)) return "waiting_ai";
  if (/邀请下单/.test(text) && !/已/.test(text)) return "sending_order";
  if (/发送.*商品|商品.*发送中/.test(text)) return "sending_product";
  if (/发送.*图片|图片.*发送中/.test(text)) return "sending_image";
  if (/发送.*文件|文件.*发送中/.test(text)) return "sending_file";
  if (/发送.*素材|素材.*发送中/.test(text)) return "sending_material";
  if (/发送.*承接|承接.*发送中/.test(text)) return "sending_ack";
  if (/发送.*兜底|兜底.*发送中|补救回复/.test(text)) return "sending_fallback";
  if (/发送.*文字|正在回复/.test(text)) return "sending_text";
  if (/图片.*已发送|图片已发/.test(text)) return "image_sent";
  if (/商品.*已发送|商品已发/.test(text)) return "product_sent";
  if (/下单.*已|已邀下单/.test(text)) return "order_sent";
  if (/文件.*已发送|文件已发/.test(text)) return "file_sent";
  if (/素材.*已发送|素材已发/.test(text)) return "material_sent";
  if (/快捷语.*已发送|快捷已发/.test(text)) return "quick_sent";
  if (/文字.*已发送|AI.*已发送|判断库.*已发送|已发送$/.test(text)) return "text_sent";
  if (/重复|跳过/.test(text)) return "duplicate";
  if (/忽略/.test(text)) return "ignored";
  if (/超时/.test(text)) return "reply_timeout";
  if (/失败|异常|未能/.test(text)) return "reply_failed";
  if (/检测|接管中/.test(text)) return "detecting";
  return "monitoring";
}

export function clipStatusLabel(value) {
  const text = String(value || "").replace(/\s+/g, "").trim();
  return Array.from(text || "检测中").slice(0, 6).join("");
}

export function createUiStatusSnapshot(payload = {}) {
  const bot = payload.bot || {};
  const page = payload.page || {};
  return {
    runtime: lamp(bot.label || bot.status || "检测中", bot.tone || "active", bot.detail || ""),
    ai: lamp(payload.ai?.ok && payload.ai?.hasKey !== false ? "API正常" : "API异常", payload.ai?.ok && payload.ai?.hasKey !== false ? "ok" : "bad", payload.ai?.message || ""),
    local: lamp(payload.localServiceOk === false ? "中转异常" : "中转已接", payload.localServiceOk === false ? "bad" : "ok"),
    script: lamp(page.scriptHealthy ? "脚本就绪" : "脚本待定", page.scriptHealthy ? "ok" : "warn"),
    login: lamp(page.authenticated ? "登录正常" : "登录待定", page.authenticated ? "ok" : "warn"),
    botEnabled: payload.enabled !== false,
    updatedAt: Number(payload.now || Date.now())
  };
}

function status(label, tone, category) {
  return { label, tone, category };
}

function lamp(label, tone, detail = "") {
  return { label: clipStatusLabel(label), tone, detail: String(detail || "") };
}
