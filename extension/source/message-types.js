export function messagePlaceholder(kind, detail = "") {
  const clean = String(detail || "").replace(/\s+/g, " ").trim();
  return clean ? `[${kind}] ${clean}` : `[${kind}]`;
}

export function runtimeStatusForIncomingMessage(message) {
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

export function inferMessageTypeFromText(text) {
  const value = String(text || "").trim();
  if (/^\[图片\]/.test(value)) return "image";
  if (/^\[表情\]/.test(value)) return "emoji";
  if (/^\[商品卡\]/.test(value)) return "product";
  if (/^\[文件\]/.test(value)) return "file";
  if (/^\[视频\]/.test(value)) return "video";
  return "";
}
