export function createAppContext() {
  return {
    config: null,
    windows: {
      main: null,
      floating: null,
      runyuLogin: null,
      kfView: null,
      kfViewAttached: false,
      mainMode: "page"
    },
    services: {
      aiServer: null,
      controlServer: null,
      tray: null,
      powerSaveBlockerId: null
    },
    runtime: {
      isQuitting: false,
      aiRestarting: false,
      lastBotHeartbeatAt: 0,
      watchdogTimers: []
    },
    status: {
      bot: null,
      botHistory: [],
      ai: { ok: false, hasKey: false, at: 0, message: "未检查" },
      runyuAuth: null
    },
    jobs: {
      notifyOutboxTimer: null,
      judgmentRefreshTimer: null,
      judgmentDownload: null,
      floatingBoundsTimer: null,
      loginNotificationTimer: null
    }
  };
}

export function snapshotAppContext(context) {
  return {
    configured: Boolean(context?.config),
    mainWindowVisible: visible(context?.windows?.main),
    floatingVisible: visible(context?.windows?.floating),
    kfViewAttached: Boolean(context?.windows?.kfViewAttached),
    mainMode: String(context?.windows?.mainMode || "page"),
    aiServerRunning: Boolean(context?.services?.aiServer),
    controlServerRunning: Boolean(context?.services?.controlServer),
    trayReady: Boolean(context?.services?.tray),
    quitting: Boolean(context?.runtime?.isQuitting),
    watchdogTimerCount: context?.runtime?.watchdogTimers?.length || 0
  };
}

function visible(window) {
  return Boolean(window && !window.isDestroyed?.() && window.isVisible?.());
}
