const { contextBridge, ipcRenderer } = require("electron");

const storageListeners = new Set();

contextBridge.exposeInMainWorld("chrome", {
  storage: {
    local: {
      get(defaults, callback) {
        ipcRenderer.invoke("desktop-storage-get", normalizeDefaults(defaults)).then((items) => {
          if (typeof callback === "function") callback(items);
        });
      },
      set(items, callback) {
        ipcRenderer.invoke("desktop-storage-set", items || {}).then(() => {
          if (typeof callback === "function") callback();
        });
      }
    },
    onChanged: {
      addListener(listener) {
        if (typeof listener === "function") storageListeners.add(listener);
      },
      removeListener(listener) {
        storageListeners.delete(listener);
      }
    }
  }
});

contextBridge.exposeInMainWorld("wechatKfDesktop", {
  reportStatus(status) {
    ipcRenderer.send("bot-status", status || {});
  },
  reportEvent(event) {
    ipcRenderer.send("bot-event", event || {});
  },
  sendImageReply(payload) {
    return ipcRenderer.invoke("bot-image-reply", payload || {});
  },
  openFloatingWindow(mode) {
    return ipcRenderer.invoke("page-open-floating", mode || "compact");
  },
  capturePageStructure() {
    return ipcRenderer.invoke("page-capture-structure");
  },
  savePageStructure(snapshot) {
    return ipcRenderer.invoke("page-save-structure", snapshot || {});
  },
  runPageAction(action) {
    return ipcRenderer.invoke("page-run-action", action || {});
  }
});

ipcRenderer.on("desktop-config-changed", (_event, changes) => {
  for (const listener of storageListeners) {
    try {
      listener(changes || {}, "local");
    } catch (error) {
      console.error("[desktop-preload] storage listener failed", error);
    }
  }
});

function normalizeDefaults(defaults) {
  if (Array.isArray(defaults)) {
    return Object.fromEntries(defaults.map((key) => [key, undefined]));
  }
  if (typeof defaults === "string") return { [defaults]: undefined };
  return defaults && typeof defaults === "object" ? defaults : {};
}
