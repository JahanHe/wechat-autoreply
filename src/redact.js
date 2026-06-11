const SECRET_PATTERNS = [
  [/(session_token=)[^;\s"']+/gi, "$1***"],
  [/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1***"],
  [/((?:DEEPSEEK_API_KEY|RUNYU_WEB_COOKIE|WECOM_BOT_WEBHOOK_URL|DESKTOP_CONTROL_TOKEN)\s*[=:]\s*)[^\s,;]+/gi, "$1***"],
  [/(qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=)[A-Za-z0-9-]+/gi, "$1***"]
];

export function redactSecrets(value) {
  let text = String(value ?? "");
  for (const [pattern, replacement] of SECRET_PATTERNS) text = text.replace(pattern, replacement);
  return text;
}

export function safeErrorMessage(error) {
  return redactSecrets(error?.message || error || "未知错误");
}
