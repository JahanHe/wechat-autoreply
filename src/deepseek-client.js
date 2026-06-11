export class DeepSeekRequestError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "DeepSeekRequestError";
    this.code = options.code || "DEEPSEEK_REQUEST_FAILED";
    this.status = Number(options.status || 0);
  }
}

export async function requestDeepSeek(payload, options = {}) {
  const baseUrl = String(options.baseUrl || "https://api.deepseek.com").replace(/\/+$/, "");
  const apiKey = String(options.apiKey || "");
  const timeoutMs = clampTimeout(options.timeoutMs);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new DeepSeekRequestError("当前运行环境不支持 fetch", { code: "DEEPSEEK_FETCH_UNAVAILABLE" });
  }

  let response;
  try {
    response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload || {}),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const timeout = error?.name === "AbortError" || error?.name === "TimeoutError";
    throw new DeepSeekRequestError(timeout ? "DeepSeek 请求超时" : `DeepSeek 网络错误：${error?.message || error}`, {
      code: timeout ? "DEEPSEEK_TIMEOUT" : "DEEPSEEK_NETWORK_ERROR",
      cause: error
    });
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new DeepSeekRequestError(`DeepSeek 返回非 JSON：${text.slice(0, 200)}`, {
      code: "DEEPSEEK_INVALID_JSON",
      status: response.status,
      cause: error
    });
  }

  if (!response.ok || data?.error) {
    throw new DeepSeekRequestError(
      data?.error?.message || data?.message || `DeepSeek HTTP ${response.status}`,
      { code: "DEEPSEEK_HTTP_ERROR", status: response.status }
    );
  }
  return data;
}

function clampTimeout(value) {
  const number = Math.round(Number(value || 80_000));
  return Math.max(1_000, Math.min(300_000, Number.isFinite(number) ? number : 80_000));
}
