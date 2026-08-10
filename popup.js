// ===== 网页控制大师 · popup 总开关 =====
const KEY = "nopic_master_switch";
// 预览/调试环境没有 chrome API 时，退化为纯展示（默认开启）
const HAS_CHROME =
  typeof chrome !== "undefined" &&
  chrome.storage &&
  chrome.storage.local &&
  chrome.runtime &&
  chrome.runtime.id;

function $(id) {
  return document.getElementById(id);
}

// 本次 popup 会话中是否拨动过总开关（只有拨动过才显示「刷新当前页」提示）
let touched = false;
let currentOn = true;
let activeTabId = null;
let hintTimer = null;

function render(on) {
  currentOn = on;
  const toggle = $("master-toggle");
  if (toggle.checked !== on) toggle.checked = on;
  $("status-text").textContent = on ? "已开启" : "已关闭";
  $("status-desc").textContent = on
    ? "所有功能正常生效"
    : "所有功能已停用，残留效果刷新页面后彻底消失";
  document.body.classList.toggle("off", !on);
  $("show-panel-btn").disabled = !on;
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

// 总开关
$("master-toggle").addEventListener("change", (e) => {
  if (!HAS_CHROME) return;
  touched = true; // 本次会话拨动过开关 → 显示刷新提示
  // 刷新当前活动标签页的 id，供「页面刷新完成 → 提示自动消失」判断
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
  if (on) {
    // 记下「刚打开总开关」的时间戳：60 秒内打开的页面自动唤出悬浮面板
    chrome.storage.local.set(
      { [KEY]: true, nopic_master_wake_ts: Date.now() },
      () => render(on),
    );
  } else {
    chrome.storage.local.set({ [KEY]: false }, () => render(on));
  }
});

// 关闭状态下刷新当前页，让所有残留效果彻底消失
$("reload-btn").addEventListener("click", () => {
  if (!HAS_CHROME) return;
  // 点过刷新后提示不再需要，立即隐藏
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

// 一键呼出悬浮控制面板（需页面已开启总开关且已注入脚本）
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

// 其它标签页改动了总开关时同步刷新
if (HAS_CHROME) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KEY]) {
      const v = changes[KEY].newValue;
      render(v === undefined ? true : !!v);
    }
  });

  // 记录当前活动标签页；页面刷新完成后「刷新当前页」提示自动消失（已不需要）
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
  if (HAS_CHROME) $("version").textContent = "v" + chrome.runtime.getManifest().version;
} catch (e) {}

// 初始化
if (HAS_CHROME) {
  chrome.storage.local.get([KEY], (items) => {
    const v = items[KEY];
    render(v === undefined ? true : !!v);
  });
} else {
  render(true);
}
