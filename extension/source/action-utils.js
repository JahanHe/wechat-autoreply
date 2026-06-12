export function summarizeActions(actions) {
  return (Array.isArray(actions) ? actions : []).map(summarizeAction);
}

export function summarizeAction(action = {}) {
  return {
    type: String(action.type || action.tab || "action"),
    button: String(action.button || ""),
    productId: String(action.productId || ""),
    productName: String(action.productName || ""),
    path: String(action.path || action.imagePath || action.filePath || ""),
    text: clip(String(action.text || action.reply || ""), 80)
  };
}

export function summarizeActionText(actions) {
  return (Array.isArray(actions) ? actions : [])
    .map((action) => String(action?.text || action?.reply || "").trim())
    .filter(Boolean)
    .join("\n");
}

function clip(value, size) {
  return value.length > size ? `${value.slice(0, size)}...` : value;
}
