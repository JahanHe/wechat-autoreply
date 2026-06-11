export const DESKTOP_CONFIG_SCHEMA_VERSION = 1;

const SCHEMA = {
  configSchemaVersion: "number",
  kfUrl: "string",
  autoStart: "boolean",
  bot: {
    enabled: "boolean",
    aiEndpoint: "string",
    aiFallback: "boolean",
    quickAckEveryMessage: "boolean",
    imageRepliesEnabled: "boolean",
    autoPasteImages: "boolean",
    panelAutoActionsEnabled: "boolean",
    aiSlowMs: "number",
    fallbackReplyMs: "number",
    noResponseAlertMs: "number",
    maxTextParts: "number",
    maxReplyPartLength: "number",
    rules: "array",
    actionRules: "array",
    imageReplies: "array",
    quickAckReplies: "array",
    fallbackReplies: "array"
  },
  notify: "object",
  judgmentLibrary: "object",
  floatWindow: "object",
  watchdog: "object"
};

export function validateDesktopConfig(config) {
  const errors = [];
  validateNode(config, SCHEMA, "$", errors);
  validateRange(config?.bot?.aiSlowMs, "$.bot.aiSlowMs", 1_000, 120_000, errors);
  validateRange(config?.bot?.fallbackReplyMs, "$.bot.fallbackReplyMs", 5_000, 300_000, errors);
  validateRange(config?.bot?.maxTextParts, "$.bot.maxTextParts", 1, 10, errors);
  validateRange(config?.bot?.maxReplyPartLength, "$.bot.maxReplyPartLength", 50, 2_000, errors);
  return { valid: errors.length === 0, version: DESKTOP_CONFIG_SCHEMA_VERSION, errors };
}

export function repairDesktopConfig(value, defaults) {
  if (Array.isArray(defaults)) return Array.isArray(value) ? clone(value) : clone(defaults);
  if (isPlainObject(defaults)) {
    const input = isPlainObject(value) ? value : {};
    const output = { ...clone(input) };
    for (const [key, fallback] of Object.entries(defaults)) {
      output[key] = repairDesktopConfig(input[key], fallback);
    }
    return output;
  }
  if (value == null || typeof value !== typeof defaults) return defaults;
  return value;
}

function validateNode(value, schema, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(issue(path, "object", actualType(value)));
    return;
  }
  for (const [key, expected] of Object.entries(schema)) {
    if (!(key in value)) continue;
    const next = value[key];
    const nextPath = `${path}.${key}`;
    if (typeof expected === "string") {
      if (!matchesType(next, expected)) errors.push(issue(nextPath, expected, actualType(next)));
    } else {
      validateNode(next, expected, nextPath, errors);
    }
  }
}

function validateRange(value, path, min, max, errors) {
  if (value == null || typeof value !== "number" || !Number.isFinite(value)) return;
  if (value < min || value > max) {
    errors.push({ path, code: "OUT_OF_RANGE", message: `${path} 应在 ${min}-${max} 之间`, value });
  }
}

function matchesType(value, expected) {
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return isPlainObject(value);
  return typeof value === expected && (expected !== "number" || Number.isFinite(value));
}

function issue(path, expected, actual) {
  return { path, code: "INVALID_TYPE", message: `${path} 应为 ${expected}，实际为 ${actual}` };
}

function actualType(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
