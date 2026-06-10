const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mainShell", {
  getStatus() {
    return ipcRenderer.invoke("main-get-status");
  },
  onStatus(callback) {
    ipcRenderer.on("main-status", (_event, payload) => {
      if (typeof callback === "function") callback(payload || {});
    });
  },
  getSettings() {
    return ipcRenderer.invoke("main-get-settings");
  },
  saveSettings(payload) {
    return ipcRenderer.invoke("main-save-settings", payload || {});
  },
  setMode(mode) {
    return ipcRenderer.invoke("main-set-mode", mode || "page");
  },
  openFloating(mode) {
    return ipcRenderer.invoke("main-open-floating", mode || "compact");
  },
  hideFloating() {
    return ipcRenderer.invoke("main-hide-floating");
  },
  toggleEnabled() {
    return ipcRenderer.invoke("main-toggle-enabled");
  },
  reload() {
    return ipcRenderer.invoke("main-reload");
  },
  checkAi() {
    return ipcRenderer.invoke("main-check-ai");
  },
  testWebhook(webhookUrl) {
    return ipcRenderer.invoke("main-test-webhook", webhookUrl || "");
  },
  capturePageStructure() {
    return ipcRenderer.invoke("main-capture-structure");
  },
  runPageAction(action) {
    return ipcRenderer.invoke("main-run-action", action || {});
  },
  chooseImage() {
    return ipcRenderer.invoke("main-choose-image");
  },
  chooseFile(options) {
    return ipcRenderer.invoke("main-choose-file", options || {});
  },
  revealPath(targetPath) {
    return ipcRenderer.invoke("main-reveal-path", targetPath || "");
  },
  getReplyRecords(options) {
    return ipcRenderer.invoke("main-get-reply-records", options || {});
  },
  testAiReply(payload) {
    return ipcRenderer.invoke("main-test-ai-reply", payload || {});
  },
  getJudgmentsStatus() {
    return ipcRenderer.invoke("main-get-judgments-status");
  },
  openRunyuLogin(options) {
    return ipcRenderer.invoke("main-open-runyu-login", options || {});
  },
  clearRunyuLogin() {
    return ipcRenderer.invoke("main-clear-runyu-login");
  },
  onRunyuAuth(callback) {
    ipcRenderer.on("main-runyu-auth", (_event, payload) => {
      if (typeof callback === "function") callback(payload || {});
    });
  },
  testJudgments(payload) {
    return ipcRenderer.invoke("main-test-judgments", payload || {});
  },
  refreshJudgments(payload) {
    return ipcRenderer.invoke("main-refresh-judgments", payload || {});
  },
  startJudgmentsFullDownload(payload) {
    return ipcRenderer.invoke("main-start-judgments-full-download", payload || {});
  },
  getJudgmentsDownloadStatus() {
    return ipcRenderer.invoke("main-get-judgments-download-status");
  }
});
