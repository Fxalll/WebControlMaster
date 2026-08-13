// ===== 网页控制大师 · popup 总开关（按当前网站生效） =====
const HAS_CHROME =
  typeof chrome !== "undefined" &&
  chrome.storage &&
  chrome.storage.local &&
  chrome.runtime &&
  chrome.runtime.id;

function $(id) {
  return document.getElementById(id);
}

let currentHost = null; // 当前标签页的域名
let touched = false; // 本次会话是否拨动过开关
let currentOn = true;
let activeTabId = null;
let hintTimer = null;

// ===== 显示模式（全局）：完整 / 简洁 / 仅指示灯 =====
const UI_MODE_KEY = "nopic_ui_mode";
const UI_MODE_DESC = {
  full: "悬停指示灯时展开完整菜单（所有功能）",
  simple: "悬停指示灯直接出现「设置」菜单，不再显示一级菜单",
  indicator: "悬停指示灯只展开指示灯本身，任何菜单都不弹出",
};

function renderMode(mode) {
  document.querySelectorAll("#mode-seg .mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  const desc = $("mode-desc");
  if (desc) desc.textContent = UI_MODE_DESC[mode] || UI_MODE_DESC.full;
}

function readUiMode(cb) {
  if (!HAS_CHROME) {
    cb("full");
    return;
  }
  try {
    chrome.storage.local.get(UI_MODE_KEY, (items) => {
      const v = items && items[UI_MODE_KEY];
      cb(v === "simple" || v === "indicator" ? v : "full");
    });
  } catch (e) {
    cb("full");
  }
}

document.querySelectorAll("#mode-seg .mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!HAS_CHROME) return;
    const mode = btn.dataset.mode;
    chrome.storage.local.set({ [UI_MODE_KEY]: mode }, () => renderMode(mode));
  });
});

// ===== 深浅色同步：跟随网页面板的主题开关（nopic_theme_effective） =====
const THEME_KEY = "nopic_theme_effective";

function applyThemeClass(theme) {
  document.body.classList.toggle("light", theme === "light");
}

function readTheme() {
  if (!HAS_CHROME) return;
  try {
    chrome.storage.local.get(THEME_KEY, (items) => {
      applyThemeClass(items && items[THEME_KEY]);
    });
  } catch (e) {}
}

function masterKey() {
  return "nopic_master_switch_domain_" + encodeURIComponent(currentHost);
}
function wakeKey() {
  return "nopic_master_wake_ts_domain_" + encodeURIComponent(currentHost);
}

function render(on) {
  currentOn = on;
  const toggle = $("master-toggle");
  if (toggle.checked !== on) toggle.checked = on;
  $("status-text").textContent = on ? "已开启" : "已关闭";
  $("status-desc").textContent = on
    ? "所有功能正常生效（仅当前网站）"
    : "所有功能已停用（仅当前网站），残留效果刷新页面后彻底消失";
  $("host-label").textContent = currentHost
    ? "当前网站 · " + currentHost
    : "";
  document.body.classList.toggle("off", !on);
  $("show-panel-btn").disabled = !on || !currentHost;
  toggle.disabled = !currentHost;
  // 刷新提示：仅在本次会话拨动过开关时出现；平时让用户自己刷新
  const hint = $("off-hint");
  if (touched) {
    hint.hidden = false;
    hint.classList.toggle("mode-on", on);
    $("hint-text").textContent = on
      ? "已开启 · 刷新当前页可完全恢复面板。"
      : "已关闭 · 刷新当前页让残留效果彻底消失。";
  } else {
    hint.hidden = true;
  }
}

function getActiveTab(cb) {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      cb(tabs && tabs[0]);
    });
  } catch (e) {
    cb(null);
  }
}

// 总开关（只影响当前网站）
$("master-toggle").addEventListener("change", (e) => {
  if (!HAS_CHROME || !currentHost) return;
  touched = true; // 本次会话拨动过开关 → 显示刷新提示
  getActiveTab((tab) => {
    if (tab && tab.id != null) activeTabId = tab.id;
  });
  // 兜底：30 秒内未刷新则自动隐藏提示，避免一直挂着
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    touched = false;
    render(currentOn);
  }, 30000);
  const on = e.target.checked;
  const set = on
    ? { [masterKey()]: true, [wakeKey()]: Date.now() }
    : { [masterKey()]: false };
  chrome.storage.local.set(set, () => render(on));
});

// 刷新当前页，让残留效果彻底消失
$("reload-btn").addEventListener("click", () => {
  if (!HAS_CHROME) return;
  touched = false;
  render(currentOn);
  getActiveTab((tab) => {
    if (tab && tab.id != null) {
      chrome.tabs.reload(tab.id, () => {
        const err = chrome.runtime.lastError;
        if (!err) window.close();
      });
    }
  });
});

// 一键呼出悬浮控制面板（需当前网站已开启且已注入脚本）
$("show-panel-btn").addEventListener("click", () => {
  if (!HAS_CHROME) return;
  getActiveTab((tab) => {
    if (!tab || tab.id == null) return;
    chrome.tabs.sendMessage(
      tab.id,
      { type: "nopic-show-panel" },
      (resp) => {
        if (chrome.runtime.lastError) return; // 页面未注入 / 未开启
        if (resp && resp.ok) window.close();
      },
    );
  });
});

if (HAS_CHROME) {
  // 其它标签页改动了当前网站的总开关时同步刷新
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[UI_MODE_KEY]) {
      const v = changes[UI_MODE_KEY].newValue;
      renderMode(v === "simple" || v === "indicator" ? v : "full");
    }
    if (changes[THEME_KEY]) {
      applyThemeClass(changes[THEME_KEY].newValue);
    }
    if (!currentHost || !changes[masterKey()]) return;
    const v = changes[masterKey()].newValue;
    render(v === undefined ? true : !!v);
  });

  // 当前活动标签页刷新完成后「刷新当前页」提示自动消失
  getActiveTab((tab) => {
    if (tab && tab.id != null) activeTabId = tab.id;
  });
  try {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (
        tabId === activeTabId &&
        changeInfo.status === "complete" &&
        touched
      ) {
        touched = false;
        render(currentOn);
      }
    });
  } catch (e) {}
}

// 版本号
try {
  if (HAS_CHROME)
    $("version").textContent = "v" + chrome.runtime.getManifest().version;
} catch (e) {}

// 初始化：先取当前标签页域名，再读该网站的开关状态
function init() {
  readTheme();
  readUiMode((mode) => renderMode(mode));
  if (!HAS_CHROME) {
    render(true);
    return;
  }
  getActiveTab((tab) => {
    if (!tab || !tab.url) {
      render(true);
      return;
    }
    try {
      currentHost = new URL(tab.url).host;
    } catch (e) {
      currentHost = null;
    }
    if (!currentHost) {
      render(true);
      return;
    }
    chrome.storage.local.get([masterKey()], (items) => {
      const v = items[masterKey()];
      render(v === undefined ? true : !!v);
    });
  });
}
init();
