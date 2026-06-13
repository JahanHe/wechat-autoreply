export const MAIN_IPC_CHANNELS = Object.freeze([
  "main-get-status", "main-get-settings", "main-save-settings", "main-set-mode",
  "main-set-sidebar-width", "main-open-floating", "main-hide-floating", "main-toggle-enabled", "main-request-quit", "main-reload",
  "main-check-ai", "main-test-webhook", "main-capture-structure", "main-run-action",
  "main-choose-image", "main-choose-file", "main-reveal-path", "main-get-file-preview",
  "main-get-reply-records", "main-test-ai-reply", "main-test-rule-trigger", "main-test-reply-pipeline",
  "main-get-knowledge-overview", "main-get-knowledge-record", "main-search-local-knowledge",
  "main-get-customer-memories", "main-compress-customer-memory", "main-compress-customer-memories",
  "main-get-judgments-status", "main-open-runyu-login", "main-capture-runyu-cookie",
  "main-verify-runyu-auth", "main-bootstrap-runyu-library", "main-clear-runyu-login",
  "main-test-judgments", "main-refresh-judgments", "main-start-judgments-full-download",
  "main-get-judgments-download-status"
]);

export const FLOAT_IPC_CHANNELS = Object.freeze([
  "float-open-main", "float-open-page", "float-toggle-enabled", "float-reload",
  "float-get-status", "float-get-settings", "float-save-settings", "float-check-ai",
  "float-test-webhook", "float-set-mode", "float-set-always-on-top", "float-set-preset",
  "float-hide", "float-quit", "float-choose-image"
]);

export const PAGE_IPC_CHANNELS = Object.freeze([
  "page-open-floating", "page-capture-structure", "page-save-structure", "page-run-action",
  "bot-image-reply", "desktop-storage-get", "desktop-storage-set"
]);

export function allIpcChannels() {
  return [...MAIN_IPC_CHANNELS, ...FLOAT_IPC_CHANNELS, ...PAGE_IPC_CHANNELS];
}
