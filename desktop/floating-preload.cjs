const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopFloat", {
  getStatus() {
    return ipcRenderer.invoke("float-get-status");
  },
  onStatus(callback) {
    if (typeof callback !== "function") return;
    ipcRenderer.on("float-status", (_event, payload) => callback(payload));
  },
  openMain() {
    return ipcRenderer.invoke("float-open-main");
  },
  toggleEnabled() {
    return ipcRenderer.invoke("float-toggle-enabled");
  },
  reload() {
    return ipcRenderer.invoke("float-reload");
  },
  getSettings() {
    return ipcRenderer.invoke("float-get-settings");
  },
  saveSettings(payload) {
    return ipcRenderer.invoke("float-save-settings", payload || {});
  },
  checkAi() {
    return ipcRenderer.invoke("float-check-ai");
  },
  testWebhook(webhookUrl) {
    return ipcRenderer.invoke("float-test-webhook", webhookUrl);
  },
  setMode(mode) {
    return ipcRenderer.invoke("float-set-mode", mode);
  },
  setAlwaysOnTop(value) {
    return ipcRenderer.invoke("float-set-always-on-top", value);
  },
  setPreset(preset) {
    return ipcRenderer.invoke("float-set-preset", preset);
  },
  hide() {
    return ipcRenderer.invoke("float-hide");
  },
  quit() {
    return ipcRenderer.invoke("float-quit");
  },
  chooseImage() {
    return ipcRenderer.invoke("float-choose-image");
  },
  capturePageStructure() {
    return ipcRenderer.invoke("page-capture-structure");
  },
  runPageAction(action) {
    return ipcRenderer.invoke("page-run-action", action || {});
  }
});
