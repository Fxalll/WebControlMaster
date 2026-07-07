// ===== 新增：功能启动控制器 =====
var _nopicFeaturesReady = false;
var _nopicPendingFeatures = [];
// 添加一个标志，确保启动逻辑只执行一次
var _nopicStartExecuted = false;

function _nopicRunWhenReady(fn) {
  // 如果功能已就绪，立即执行
  if (_nopicFeaturesReady) {
    try {
      fn();
    } catch (e) {}
  } else {
    // 否则加入待执行队列
    _nopicPendingFeatures.push(fn);
    // 如果启动逻辑尚未执行，主动触发一次启动尝试
    if (!_nopicStartExecuted) {
      _tryStartFeatures();
    }
  }
}

function _nopicStartFeatures() {
  // 防止重复执行
  if (_nopicFeaturesReady) return;
  _nopicFeaturesReady = true;
  _nopicStartExecuted = true;
  console.log("[nopic] 主体功能启动");
  // 执行所有待执行的任务
  _nopicPendingFeatures.forEach(function (fn) {
    try {
      fn();
    } catch (e) {}
  });
  _nopicPendingFeatures = [];
}

// 新增：统一的启动尝试函数，解决complete/loading切换问题
function _tryStartFeatures() {
  // 如果已经执行过，则不再重复执行
  if (_nopicStartExecuted) return;

  // 无论当前状态是什么，只要DOM可交互，就尝试启动
  // 使用 'DOMContentLoaded' 或 'readystatechange' 来捕捉更早的时机
  if (document.readyState === "loading") {
    // 如果还在加载中，监听 DOMContentLoaded 事件
    document.addEventListener("DOMContentLoaded", function handler() {
      document.removeEventListener("DOMContentLoaded", handler);
      if (!_nopicStartExecuted) {
        _nopicStartFeatures();
      }
    });
  } else {
    // 如果已经是 'interactive' 或 'complete'，直接启动
    if (!_nopicStartExecuted) {
      _nopicStartFeatures();
    }
  }
}

// 主动调用一次，以确保尽早启动
_tryStartFeatures();

// 备用方案：如果页面加载完成时仍未启动（比如脚本加载很慢），则用load事件兜底
window.addEventListener("load", function () {
  if (!_nopicStartExecuted) {
    _nopicStartFeatures();
  }
});
// ===== 控制器结束 =====

(function () {
  "use strict";

  // ===== 浏览器扩展存储兼容层 =====
  const _nopicStorageCache = {};
  let _nopicStorageReady = false;

  function _initStorage() {
    // 1. 先从 localStorage 同步加载（立即可用）
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("_nopic_ext_")) {
          const realKey = key.slice(11);
          try {
            _nopicStorageCache[realKey] = JSON.parse(localStorage.getItem(key));
          } catch (e) {
            _nopicStorageCache[realKey] = localStorage.getItem(key);
          }
        }
      }
    } catch (e) {}

    // 2. 异步加载 chrome.storage（更高优先级，会覆盖）
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local
    ) {
      chrome.storage.local.get(null, function (items) {
        if (items) {
          Object.keys(items).forEach(function (key) {
            if (key.startsWith("nopic_")) {
              _nopicStorageCache[key] = items[key];
              try {
                localStorage.setItem(
                  "_nopic_ext_" + key,
                  JSON.stringify(items[key]),
                );
              } catch (e) {}
            }
          });
        }
        _nopicStorageReady = true;
      });

      // 监听其他页面的变化
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== "local") return;
        Object.keys(changes).forEach(function (key) {
          if (key.startsWith("nopic_")) {
            const nv = changes[key].newValue;
            _nopicStorageCache[key] = nv;
            try {
              if (nv !== undefined) {
                localStorage.setItem("_nopic_ext_" + key, JSON.stringify(nv));
              } else {
                localStorage.removeItem("_nopic_ext_" + key);
              }
            } catch (e) {}
          }
        });
      });
    } else {
      _nopicStorageReady = true;
    }
  }
  // _initStorage();

  function GM_getValue(name, defaultValue) {
    if (_nopicStorageCache.hasOwnProperty(name)) {
      const v = _nopicStorageCache[name];
      return v !== undefined ? v : defaultValue;
    }
    try {
      const lv = localStorage.getItem("_nopic_ext_" + name);
      if (lv !== null) {
        try {
          const p = JSON.parse(lv);
          _nopicStorageCache[name] = p;
          return p;
        } catch (e) {
          _nopicStorageCache[name] = lv;
          return lv;
        }
      }
    } catch (e) {}
    return defaultValue;
  }

  function GM_setValue(name, value) {
    _nopicStorageCache[name] = value;
    try {
      localStorage.setItem("_nopic_ext_" + name, JSON.stringify(value));
    } catch (e) {}
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local
    ) {
      const item = {};
      item[name] = value;
      try {
        if (chrome.runtime?.id) {
          chrome.storage.local.set(item);
        }
      } catch (e) {}
    }
  }
  // ===== 兼容层结束 =====

  // --- 1. 配置管理 ---
  const defaultConfig = {
    showOutline: true,
    hoverOnly: false,
    hoverShowImg: true,
    autoSnap: true,
    autoHideIdle: true,
    zoomMode: "middle",
    zoomLeaveMode: "button",
    zoomPinMode: false,
    displayTime: false,
    displaySeconds: false,
    displayCount: true,
    displayTotal: false,
    displayPercent: false,
    displayHost: false,
    displayMemory: false,
    displayLoadTime: false,
    displayResCount: false,
    displayMouseDistance: false,
    displayClickCount: false,
    displayScrollDist: false,
    displayReadChars: false,
    displayAdCount: false,
    statsRange: "session",
    disableAnimation: false,
    loadAnimation: false,
  };

  // 记录被永久隐藏的网站列表
  function getPermaHiddenSites() {
    const saved = localStorage.getItem("nopic_perma_hidden_sites");
    return saved ? JSON.parse(saved) : [];
  }
  function setPermaHiddenSites(list) {
    localStorage.setItem("nopic_perma_hidden_sites", JSON.stringify(list));
  }

  // ===== 配置场景（scope）管理 =====
  // scope 取值: "url" | "domain" | "global"
  // scope 本身按 URL 存储（每个 URL 记住自己的 scope 选择），实际配置数据按 scope 对应级别存储
  // 注意：开关状态（enabled）独立存储在URL级别，不受场景切换影响

  function nopicGetUrlKey() {
    return location.origin + location.pathname;
  }
  // 获取 scope 存储的 key
  function nopicGetScopeStorageKey(prefix) {
    return prefix + "_scope_" + encodeURIComponent(nopicGetUrlKey());
  }
  // 根据 scope 获取实际配置的存储 key
  function nopicGetConfigStorageKey(prefix, scope) {
    if (scope === "domain") {
      return prefix + "_domain_" + location.host;
    } else if (scope === "global") {
      return prefix + "_global";
    }
    return prefix + "_" + encodeURIComponent(nopicGetUrlKey());
  }
  // 开关状态独立存储在URL级别（不受场景切换影响）
  function nopicGetToggleKey(prefix) {
    return prefix + "_toggle_" + encodeURIComponent(nopicGetUrlKey());
  }
  function nopicGetToggleState(prefix, defaultEnabled) {
    try {
      const saved = localStorage.getItem(nopicGetToggleKey(prefix));
      if (saved !== null) return saved === "true";
    } catch (e) {}
    return defaultEnabled;
  }
  function nopicSetToggleState(prefix, enabled) {
    try {
      localStorage.setItem(
        nopicGetToggleKey(prefix),
        enabled ? "true" : "false",
      );
    } catch (e) {}
  }
  // 按优先级读取配置（url > domain > global），但不包含开关状态
  // 开关状态从URL级别独立读取
  // 返回 { config, scope } - scope 表示配置来自哪个级别
  function nopicGetConfigByPriority(prefix, defaultConfig, togglePrefix) {
    try {
      // 1. 先尝试 URL 级别
      const urlKey = prefix + "_" + encodeURIComponent(nopicGetUrlKey());
      const urlSaved = localStorage.getItem(urlKey);
      if (urlSaved) {
        const config = JSON.parse(urlSaved);
        // 开关状态从URL级别独立读取
        config.enabled = nopicGetToggleState(
          togglePrefix || prefix,
          defaultConfig.enabled,
        );
        return { config, scope: "url" };
      }
      // 2. 再尝试域名级别
      const domainKey = prefix + "_domain_" + location.host;
      const domainSaved = localStorage.getItem(domainKey);
      if (domainSaved) {
        const config = JSON.parse(domainSaved);
        // 开关状态从URL级别独立读取
        config.enabled = nopicGetToggleState(
          togglePrefix || prefix,
          defaultConfig.enabled,
        );
        return { config, scope: "domain" };
      }
      // 3. 最后尝试全局级别
      const globalKey = prefix + "_global";
      const globalSaved = localStorage.getItem(globalKey);
      if (globalSaved) {
        const config = JSON.parse(globalSaved);
        // 开关状态从URL级别独立读取
        config.enabled = nopicGetToggleState(
          togglePrefix || prefix,
          defaultConfig.enabled,
        );
        return { config, scope: "global" };
      }
    } catch (e) {
      console.warn("nopicGetConfigByPriority error:", e);
    }
    // 没有任何配置，返回默认配置，开关状态也从URL级别读取
    const config = { ...defaultConfig };
    config.enabled = nopicGetToggleState(
      togglePrefix || prefix,
      defaultConfig.enabled,
    );
    return { config, scope: "url" };
  }
  // 读取 scope（当前 URL 的场景选择）
  function nopicGetConfigScope(prefix) {
    try {
      const scope = localStorage.getItem(nopicGetScopeStorageKey(prefix));
      if (scope === "domain" || scope === "global") return scope;
    } catch (e) {}
    return "url";
  }
  // 保存 scope
  function nopicSetConfigScope(prefix, scope) {
    try {
      localStorage.setItem(nopicGetScopeStorageKey(prefix), scope);
    } catch (e) {}
  }

  // ===== 标签伪装配置 =====
  const defaultDisguiseConfig = {
    enabled: true,
    titleMode: "native", // "native" 使用网站原生标题 | "preset" 预设标题 | "custom" 自定义标题
    customTitle: "",
    presetTitle: "", // 预设标题值
    iconMode: "native", // "native" 使用网站原生图标 | "preset" 预设图标 | "custom" 自定义图标
    customIcon: "", // Base64字符串
    presetIcon: "", // 预设图标值
  };

  // 当前配置来源的 scope（用于显示 UI 状态）
  let currentDisguiseScope = "url";
  let currentMaskScope = "url";
  let currentPrivacyLockScope = "url";
  let currentTextReplaceScope = "url";

  // 生效配置缓存（避免 observeTitle 高频调用导致卡顿）
  let _effectiveDisguiseCache = null;

  // 使缓存失效（配置变更时调用）
  function invalidateDisguiseCache() {
    _effectiveDisguiseCache = null;
  }

  // 获取按优先级生效的配置（url > domain > global）
  // 标题组和图标组独立判断：native 穿透，preset/custom 锁定
  function getDisguiseConfig() {
    if (_effectiveDisguiseCache) return _effectiveDisguiseCache;

    const result = { ...defaultDisguiseConfig };
    result.enabled = nopicGetToggleState(
      "nopic_disguise",
      defaultDisguiseConfig.enabled,
    );

    let foundScope = null;

    const levels = [
      () => {
        try {
          const s = localStorage.getItem(
            "nopic_disguise_" + encodeURIComponent(nopicGetUrlKey()),
          );
          return s ? JSON.parse(s) : null;
        } catch (e) {
          return null;
        }
      },
      () => {
        try {
          const s = localStorage.getItem(
            "nopic_disguise_domain_" + location.host,
          );
          return s ? JSON.parse(s) : null;
        } catch (e) {
          return null;
        }
      },
      () => {
        try {
          const s = GM_getValue("nopic_disguise_global", null);
          return s ? (typeof s === "string" ? JSON.parse(s) : { ...s }) : null;
        } catch (e) {
          return null;
        }
      },
    ];

    // 标题组：找第一个 titleMode 非 native 的配置
    for (let i = 0; i < levels.length; i++) {
      const cfg = levels[i]();
      if (!cfg || cfg.titleMode === "native" || cfg.titleMode === undefined)
        continue;
      result.titleMode = cfg.titleMode;
      if (cfg.customTitle !== undefined) result.customTitle = cfg.customTitle;
      if (cfg.presetTitle !== undefined) result.presetTitle = cfg.presetTitle;
      foundScope = ["url", "domain", "global"][i];
      break;
    }

    // 图标组：找第一个 iconMode 非 native 的配置
    for (let i = 0; i < levels.length; i++) {
      const cfg = levels[i]();
      if (!cfg || cfg.iconMode === "native" || cfg.iconMode === undefined)
        continue;
      result.iconMode = cfg.iconMode;
      if (cfg.customIcon !== undefined) result.customIcon = cfg.customIcon;
      if (cfg.presetIcon !== undefined) result.presetIcon = cfg.presetIcon;
      if (!foundScope) foundScope = ["url", "domain", "global"][i];
      break;
    }
    result._effectiveScope = foundScope;

    _effectiveDisguiseCache = result;
    return result;
  }

  // 保存标签伪装配置
  function setDisguiseConfig(cfg) {
    const configToSave = { ...cfg };
    delete configToSave.enabled;
    if (currentDisguiseScope === "global") {
      GM_setValue("nopic_disguise_global", configToSave);
    } else {
      const key = nopicGetConfigStorageKey(
        "nopic_disguise",
        currentDisguiseScope,
      );
      localStorage.setItem(key, JSON.stringify(configToSave));
    }
    invalidateDisguiseCache();
  }

  // 初始化：读取当前编辑 scope 的配置（用于 UI 面板显示，不是生效配置）
  currentDisguiseScope = nopicGetConfigScope("nopic_disguise");
  let disguiseConfig = { ...defaultDisguiseConfig };
  (function initDisguiseConfig() {
    if (currentDisguiseScope === "global") {
      const saved = GM_getValue("nopic_disguise_global", null);
      if (saved)
        disguiseConfig =
          typeof saved === "string" ? JSON.parse(saved) : { ...saved };
    } else {
      const key = nopicGetConfigStorageKey(
        "nopic_disguise",
        currentDisguiseScope,
      );
      const saved = localStorage.getItem(key);
      if (saved) disguiseConfig = JSON.parse(saved);
    }
    disguiseConfig.enabled = nopicGetToggleState(
      "nopic_disguise",
      defaultDisguiseConfig.enabled,
    );
  })();

  let originalTitle = document.title;
  let originalFavicon = null;

  // ===== 页面局部遮罩配置 =====
  const defaultMaskConfig = {
    enabled: true,
    masks: [], // { id, x, y, width, height, color, opacity, positionMode: 'fixed'|'absolute' }
  };

  // 获取当前URL的遮罩配置（按优先级读取）
  function getMaskConfig() {
    // 强制使用当前URL级别
    const urlKey = "nopic_mask_" + encodeURIComponent(nopicGetUrlKey());
    let config;
    try {
      const saved = localStorage.getItem(urlKey);
      config = saved ? JSON.parse(saved) : { ...defaultMaskConfig };
    } catch (e) {
      config = { ...defaultMaskConfig };
    }

    // 【关键修复】独立读取 URL 级别的开关状态，与配置数据分离存储
    config.enabled = nopicGetToggleState(
      "nopic_mask",
      defaultMaskConfig.enabled,
    );

    currentMaskScope = "url";
    return config;
  }

  // 保存遮罩配置（根据用户选择的 scope 保存）
  function setMaskConfig(cfg) {
    const scope = nopicGetConfigScope("nopic_mask");
    const configToSave = { ...cfg };
    delete configToSave.enabled; // enabled 独立存储在 URL 级别
    if (scope === "global") {
      // 全局级别使用 GM_setValue 跨域共享
      GM_setValue("nopic_mask_global", configToSave);
    } else {
      const key = nopicGetConfigStorageKey("nopic_mask", scope);
      localStorage.setItem(key, JSON.stringify(configToSave));
    }
    currentMaskScope = scope;
  }

  let maskConfig = getMaskConfig();
  // 强制重置scope为url，确保每次打开都是仅当前页
  nopicSetConfigScope("nopic_mask", "url");

  // ===== 网页隐私锁配置 =====
  const defaultPrivacyLockConfig = {
    lockMode: "manual", // "blur" 失焦上锁 | "timeout" 超时上锁 | "manual" 手动上锁
    timeoutMinutes: 5,
    unlockMode: "password",
    password: "",
  };

  // 获取按优先级生效的隐私锁配置（url > domain > global）
  function getEffectivePrivacyLock() {
    const levels = [
      {
        scope: "url",
        get: () => {
          try {
            const s = localStorage.getItem(
              "nopic_privacylock_" + encodeURIComponent(nopicGetUrlKey()),
            );
            return s ? JSON.parse(s) : null;
          } catch (e) {
            return null;
          }
        },
      },
      {
        scope: "domain",
        get: () => {
          try {
            const s = localStorage.getItem(
              "nopic_privacylock_domain_" + location.host,
            );
            return s ? JSON.parse(s) : null;
          } catch (e) {
            return null;
          }
        },
      },
      {
        scope: "global",
        get: () => {
          try {
            const s = GM_getValue("nopic_privacylock_global", null);
            return s
              ? typeof s === "string"
                ? JSON.parse(s)
                : { ...s }
              : null;
          } catch (e) {
            return null;
          }
        },
      },
    ];

    // 检查配置是否真正有效（有实际内容）
    // 检查配置是否真正有效（有实际内容）
    function hasValidConfig(cfg) {
      if (!cfg) return false;

      // 如果是无密码 + 手动上锁，视为无效配置（等于没上锁）
      if (
        cfg.lockMode === "manual" &&
        (!cfg.password || cfg.password.length === 0)
      ) {
        return false;
      }

      // 必须至少有一个字段不是默认值
      const hasLockMode = cfg.lockMode && cfg.lockMode !== "manual";
      const hasUnlockMode = cfg.unlockMode && cfg.unlockMode !== "password";
      const hasPassword = cfg.password && cfg.password.length > 0;
      const hasTimeout = cfg.timeoutMinutes && cfg.timeoutMinutes > 0;

      return hasLockMode || hasUnlockMode || hasPassword || hasTimeout;
    }

    // 按优先级查找第一个有效配置
    let effectiveConfig = null;
    let effectiveScope = null;

    for (const level of levels) {
      const cfg = level.get();
      if (hasValidConfig(cfg)) {
        effectiveConfig = cfg;
        effectiveScope = level.scope;
        break;
      }
    }

    // 如果没有找到任何有效配置，返回默认
    if (!effectiveConfig) {
      return { ...defaultPrivacyLockConfig, _effectiveScope: null };
    }

    // 合并默认值，确保所有字段存在
    const result = { ...defaultPrivacyLockConfig };
    if (effectiveConfig.lockMode && effectiveConfig.lockMode !== "manual") {
      result.lockMode = effectiveConfig.lockMode;
    }
    if (effectiveConfig.unlockMode) {
      result.unlockMode = effectiveConfig.unlockMode;
    }
    if (
      effectiveConfig.password !== undefined &&
      effectiveConfig.password !== ""
    ) {
      result.password = effectiveConfig.password;
    }
    if (effectiveConfig.timeoutMinutes) {
      result.timeoutMinutes = effectiveConfig.timeoutMinutes;
    }

    result._effectiveScope = effectiveScope;

    return result;
  }

  // 按 scope 读取/保存隐私锁配置（不包含运行时状态）
  function getPrivacyLockConfigByScope(scope) {
    try {
      if (scope === "global") {
        const saved = GM_getValue("nopic_privacylock_global", null);
        return saved
          ? typeof saved === "string"
            ? JSON.parse(saved)
            : { ...saved }
          : { ...defaultPrivacyLockConfig };
      }
      const key =
        scope === "domain"
          ? "nopic_privacylock_domain_" + location.host
          : "nopic_privacylock_" + encodeURIComponent(nopicGetUrlKey());
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : { ...defaultPrivacyLockConfig };
    } catch (e) {
      return { ...defaultPrivacyLockConfig };
    }
  }

  // ===== 锁屏外观配置 =====
  function getLockAppearanceConfig() {
    try {
      const saved = GM_getValue("nopic_lock_appearance", null);
      if (saved) return typeof saved === "string" ? JSON.parse(saved) : saved;
    } catch (e) {}
    return {
      bgColor: "#1a1a2e",
      textColor: "#ffffff",
      timeFormat: "{时}:{分}",
      customText: "",
    };
  }

  function setLockAppearanceConfig(cfg) {
    GM_setValue("nopic_lock_appearance", cfg);
  }

  // 占位符替换
  function formatLockTime(format, customText) {
    const now = new Date();
    const map = {
      "{年}": now.getFullYear(),
      "{月}": String(now.getMonth() + 1).padStart(2, "0"),
      "{日}": String(now.getDate()).padStart(2, "0"),
      "{周几}": ["日", "一", "二", "三", "四", "五", "六"][now.getDay()],
      "{时}": String(now.getHours()).padStart(2, "0"),
      "{分}": String(now.getMinutes()).padStart(2, "0"),
      "{秒}": String(now.getSeconds()).padStart(2, "0"),
      "{时节}": (() => {
        const m = now.getMonth() + 1;
        if (m >= 3 && m <= 5) return "春";
        if (m >= 6 && m <= 8) return "夏";
        if (m >= 9 && m <= 11) return "秋";
        return "冬";
      })(),
      "{自定义}": customText || "",
    };
    let result = format;
    for (const [key, val] of Object.entries(map)) {
      result = result.replaceAll(key, val);
    }
    return result;
  }

  function setPrivacyLockConfigByScope(scope, cfg) {
    // 保存配置时清除待重置标志（表示密码已修改）
    localStorage.removeItem("nopic_pending_password_reset_" + location.host);
    window._nopicResetAcknowledged = false;

    const configToSave = { ...cfg };
    delete configToSave.isLocked; // 运行时状态不保存

    // 检查是否是默认配置
    const isDefault =
      configToSave.lockMode === "manual" &&
      configToSave.unlockMode === "password" &&
      (!configToSave.password || configToSave.password === "") &&
      (!configToSave.timeoutMinutes || configToSave.timeoutMinutes === 5);

    if (isDefault) {
      // 如果是默认配置，删除存储
      if (scope === "global") {
        GM_setValue("nopic_privacylock_global", null);
      } else {
        const key =
          scope === "domain"
            ? "nopic_privacylock_domain_" + location.host
            : "nopic_privacylock_" + encodeURIComponent(nopicGetUrlKey());
        localStorage.removeItem(key);
      }
    } else {
      // 非默认配置，保存
      if (scope === "global") {
        GM_setValue("nopic_privacylock_global", configToSave);
      } else {
        const key =
          scope === "domain"
            ? "nopic_privacylock_domain_" + location.host
            : "nopic_privacylock_" + encodeURIComponent(nopicGetUrlKey());
        localStorage.setItem(key, JSON.stringify(configToSave));
      }
    }
  }

  // 运行时状态（仅存在内存中）
  let privacyLockRuntime = {
    isLocked: false,
    forgotUnlockTime: null,
  };

  currentPrivacyLockScope = nopicGetConfigScope("nopic_privacylock");

  // 获取当前编辑 scope 的配置（用于 UI 面板显示）
  function getEditingPrivacyLockConfig() {
    return getPrivacyLockConfigByScope(currentPrivacyLockScope);
  }

  // 日志配置
  const defaultPrivacyLogConfig = { logs: [] };
  function getPrivacyLogConfig() {
    const key = "nopic_privacylog_" + location.host;
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : { ...defaultPrivacyLogConfig };
  }
  function setPrivacyLogConfig(cfg) {
    const key = "nopic_privacylog_" + location.host;
    // 截取前50条（最新的在最前面）
    if (cfg.logs.length > 50) cfg.logs = cfg.logs.slice(0, 50);
    localStorage.setItem(key, JSON.stringify(cfg));
  }
  function addPrivacyLog(action, success) {
    const logCfg = getPrivacyLogConfig();
    logCfg.logs.unshift({
      time: new Date().toISOString(),
      action,
      success,
      url: location.href,
    });
    // 保留最新50条
    if (logCfg.logs.length > 50) logCfg.logs = logCfg.logs.slice(0, 50);
    localStorage.setItem(
      "nopic_privacylog_" + location.host,
      JSON.stringify(logCfg),
    );
  }

  // 兼容 updateAllUI 的配置变量（其实现在是独立开关在控制，这里只做个壳子）
  let privacyLockConfig = {
    enabled: nopicGetToggleState("nopic_privacylock", true),
  };

  // ===== 快捷文本配置 =====
  const defaultQuickTextConfig = { enabled: true, items: [] };

  function getQuickTextConfigByScope(scope) {
    try {
      if (scope === "global") {
        const saved = GM_getValue("nopic_quicktext_global", null);
        return saved
          ? typeof saved === "string"
            ? JSON.parse(saved)
            : saved
          : { items: [] };
      }
      const key =
        scope === "domain"
          ? "nopic_quicktext_domain_" + location.host
          : "nopic_quicktext_" + encodeURIComponent(nopicGetUrlKey());
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : { items: [] };
    } catch (e) {
      return { items: [] };
    }
  }

  function setQuickTextConfigByScope(scope, config) {
    const configToSave = { items: config.items || [] };
    if (scope === "global") {
      GM_setValue("nopic_quicktext_global", configToSave);
    } else {
      const key =
        scope === "domain"
          ? "nopic_quicktext_domain_" + location.host
          : "nopic_quicktext_" + encodeURIComponent(nopicGetUrlKey());
      localStorage.setItem(key, JSON.stringify(configToSave));
    }
  }

  function getEffectiveQuickTextItems() {
    const urlItems = getQuickTextConfigByScope("url").items || [];
    const domainItems = getQuickTextConfigByScope("domain").items || [];
    const globalItems = getQuickTextConfigByScope("global").items || [];
    const map = new Map();
    [...globalItems, ...domainItems, ...urlItems].forEach((item) => {
      if (item.shortcut) map.set(item.shortcut, item);
    });
    return Array.from(map.values());
  }

  let quickTextEnabled = nopicGetToggleState("nopic_quicktext", true);
  let isRecordingShortcut = false;
  let recordingTarget = null;

  // ===== 页面监控器配置 =====
  const defaultPageMonitorConfig = {
    enabled: true,
    monitors: [], // { id, selector, selectorType: 'css'|'xpath', checkInterval: 5000, rule: 'textChanged'|'contains'|'notContains'|'greaterThan'|'lessThan'|'equals'|'appears'|'disappears', threshold: '', keyword: '', stopAfterTrigger: false, action: 'notification'|'refresh'|'autoclicker', name: '' }
  };

  // 获取指定作用域的监控配置
  function getPageMonitorConfigByScope(scope) {
    try {
      const key =
        scope === "domain"
          ? "nopic_pagemonitor_domain_" + location.host
          : "nopic_pagemonitor_" + encodeURIComponent(nopicGetUrlKey());
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : { monitors: [] };
    } catch (e) {
      return { monitors: [] };
    }
  }

  // 保存监控配置
  function setPageMonitorConfigByScope(scope, config) {
    const configToSave = { monitors: config.monitors || [] };
    const key =
      scope === "domain"
        ? "nopic_pagemonitor_domain_" + location.host
        : "nopic_pagemonitor_" + encodeURIComponent(nopicGetUrlKey());
    localStorage.setItem(key, JSON.stringify(configToSave));
  }

  // 获取生效的监控规则（按优先级合并）
  function getEffectivePageMonitorMonitors() {
    const domainMonitors = getPageMonitorConfigByScope("domain").monitors || [];
    const urlMonitors = getPageMonitorConfigByScope("url").monitors || [];
    const map = new Map();
    [...domainMonitors, ...urlMonitors].forEach((m) => {
      if (m.id) map.set(m.id, m);
    });
    return Array.from(map.values());
  }

  let pageMonitorEnabled = nopicGetToggleState("nopic_pagemonitor", true);
  let pageMonitorConfig = { monitors: getEffectivePageMonitorMonitors() };
  let pageMonitorIntervals = new Map(); // id -> intervalId
  let pageMonitorLastValues = new Map(); // id -> last known value
  let isPickingElement = false;
  // 页面加载时检查桌面通知权限
  if ("Notification" in window && Notification.permission === "default") {
    // 不主动请求权限，等用户选择桌面通知时再请求
    console.log("桌面通知权限未设置，将在使用时请求");
  }

  // 页面监控器弹窗
  const pageMonitorSubmenu = document.createElement("div");
  pageMonitorSubmenu.id = "nopic-pagemonitor-submenu";
  pageMonitorSubmenu.className = "nopic-submenu";
  pageMonitorSubmenu.innerHTML = `
  <div class="nopic-modal-header">
    <span class="nopic-modal-title">页面监控器</span>
    <div class="nopic-modal-close" id="nopic-pagemonitor-close">×</div>
  </div>
  <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:10px;">
    拾取页面元素并设置监控规则，条件满足时自动执行操作。
  </div>
  <div class="nopic-pm-scope-tabs">
    <div class="nopic-pm-scope-tab active" data-pm-scope="url">仅当前页</div>
    <div class="nopic-pm-scope-tab" data-pm-scope="domain">当前网站</div>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:12px;">
    <div class="nopic-pm-pick-btn" id="nopic-pm-pick-btn">
      开始拾取元素
    </div>
    <div class="nopic-pm-pick-btn" id="nopic-pm-test-btn" style="display:none;">
      <span>▶</span> 测试选择器
    </div>
  </div>
  <div id="nopic-pm-monitors-list" style="max-height:50vh;overflow-y:auto;"></div>
  <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.1);font-size:11px;color:rgba(255,255,255,0.4);line-height:1.5;">
    <div>• 重要提醒：如果规则是元素出现/消失，要把检测间隔填小点，如100毫秒</div>
    <div>• 数字规则会自动尝试解析元素文本为数值</div>
    <div>• 选择"运行自动点击"需先在本页配置自动点击器</div>
  </div>
`;
  document.documentElement.appendChild(pageMonitorSubmenu);
  makeDraggable(pageMonitorSubmenu);

  let currentPageMonitorScope = "url";
  let pageMonitorSubmenuOpen = false;

  function showPageMonitorSubmenu() {
    pageMonitorSubmenuOpen = true;
    showPopupAtTrigger(pageMonitorSubmenu, pageMonitorTrigger);
    renderPageMonitorList();
  }

  function hidePageMonitorSubmenu() {
    pageMonitorSubmenuOpen = false;
    pageMonitorSubmenu.style.transform = "scale(0.92) translateY(-10px)";
    pageMonitorSubmenu.style.opacity = "0";
    pageMonitorSubmenu.classList.remove("active");
    setTimeout(() => {
      pageMonitorSubmenu.style.display = "none";
      pageMonitorSubmenu.style.transform = "";
      pageMonitorSubmenu.style.opacity = "";
    }, 250);
    stopElementPicking();
  }

  // 关闭按钮
  document
    .getElementById("nopic-pagemonitor-close")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      hidePageMonitorSubmenu();
    });

  // 作用域切换
  pageMonitorSubmenu.querySelectorAll("[data-pm-scope]").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      e.stopPropagation();
      currentPageMonitorScope = tab.dataset.pmScope;
      pageMonitorSubmenu
        .querySelectorAll("[data-pm-scope]")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      renderPageMonitorList();
    });
  });

  // 拾取元素按钮
  document
    .getElementById("nopic-pm-pick-btn")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      if (isPickingElement) {
        stopElementPicking();
      } else {
        startElementPicking();
      }
    });

  let pickOverlay = null;
  let pickHighlight = null;
  let pickPreviewEl = null;

  function startElementPicking() {
    isPickingElement = true;
    const btn = document.getElementById("nopic-pm-pick-btn");
    btn.classList.add("picking");
    btn.innerHTML = "<span>✕</span> 取消拾取";

    pickOverlay = document.createElement("div");
    pickOverlay.className = "nopic-pm-pick-overlay";
    pickOverlay.style.pointerEvents = "none";
    document.body.appendChild(pickOverlay);

    pickHighlight = document.createElement("div");
    pickHighlight.className = "nopic-pm-pick-highlight";
    pickHighlight.style.cssText = `
    position: fixed !important;
    z-index: 2147483647;
    background: rgba(96,165,250,0.25);
    border: 2px solid #60a5fa;
    border-radius: 4px;
    pointer-events: none;
    display: none;
    animation: nopic-pm-pulse-border 0.8s ease-in-out infinite;
  `;
    document.body.appendChild(pickHighlight);

    pickPreviewEl = document.createElement("div");
    pickPreviewEl.style.cssText =
      "position:fixed;z-index:2147483647;background:rgba(0,0,0,0.85);color:#fff;font-size:11px;padding:4px 8px;border-radius:4px;pointer-events:none;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:none;";
    document.body.appendChild(pickPreviewEl);

    document.addEventListener("mousemove", onPickMouseMove);
    document.addEventListener("click", onPickClick, true);
    document.addEventListener("keydown", onPickKeyDown);
  }

  function stopElementPicking() {
    isPickingElement = false;
    const btn = document.getElementById("nopic-pm-pick-btn");
    if (btn) {
      btn.classList.remove("picking");
      btn.innerHTML = "开始拾取元素";
    }
    if (pickOverlay) {
      pickOverlay.remove();
      pickOverlay = null;
    }
    if (pickHighlight) {
      pickHighlight.remove();
      pickHighlight = null;
    }
    if (pickPreviewEl) {
      pickPreviewEl.remove();
      pickPreviewEl = null;
    }
    document.removeEventListener("mousemove", onPickMouseMove);
    document.removeEventListener("click", onPickClick, true);
    document.removeEventListener("keydown", onPickKeyDown);
  }

  function onPickMouseMove(e) {
    if (!pickHighlight || !pickPreviewEl) return;

    // 直接从鼠标位置获取元素
    let el = document.elementFromPoint(e.clientX, e.clientY);

    // 如果点到了文本节点，向上查找父元素
    if (el && el.nodeType === Node.TEXT_NODE) {
      el = el.parentElement;
    }

    // 过滤掉脚本UI元素
    if (
      el &&
      (el.closest("#nopic-widget") ||
        el.closest("#nopic-menu") ||
        el.closest("[id^='nopic-']") ||
        el.classList.contains("nopic-pm-pick-overlay") ||
        el.classList.contains("nopic-pm-pick-highlight"))
    ) {
      el = null;
    }

    // 如果没找到，从所有元素中过滤
    if (!el || !el.tagName) {
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      for (const element of elements) {
        if (
          !element.closest("#nopic-widget") &&
          !element.closest("#nopic-menu") &&
          !element.closest("[id^='nopic-']") &&
          !element.classList.contains("nopic-pm-pick-overlay") &&
          !element.classList.contains("nopic-pm-pick-highlight")
        ) {
          el = element;
          break;
        }
      }
    }

    if (!el || !el.tagName) {
      pickHighlight.style.display = "none";
      pickPreviewEl.style.display = "none";
      return;
    }

    const rect = el.getBoundingClientRect();
    // 修复错位：使用 getBoundingClientRect 获取精确位置，不用 scroll 偏移
    pickHighlight.style.display = "block";
    pickHighlight.style.position = "fixed";
    pickHighlight.style.left = rect.left + "px";
    pickHighlight.style.top = rect.top + "px";
    pickHighlight.style.width = rect.width + "px";
    pickHighlight.style.height = rect.height + "px";
    pickHighlight._currentEl = el;

    const text = (el.innerText || el.textContent || el.value || "")
      .trim()
      .substring(0, 50);
    pickPreviewEl.textContent = text || "[" + el.tagName.toLowerCase() + "]";
    pickPreviewEl.style.display = "block";
    pickPreviewEl.style.left =
      Math.min(e.clientX + 15, window.innerWidth - 220) + "px";
    pickPreviewEl.style.top =
      Math.min(e.clientY + 15, window.innerHeight - 50) + "px";
  }

  function onPickClick(e) {
    if (!isPickingElement) return;
    e.preventDefault();
    e.stopPropagation();

    // 直接从点击位置获取元素，确保拿到的是元素节点而不是文本节点
    let el = document.elementFromPoint(e.clientX, e.clientY);

    // 如果点到了文本节点，向上查找最近的可交互元素
    if (el && el.nodeType === Node.TEXT_NODE) {
      el = el.parentElement;
    }

    // 如果还是没找到，从高亮框中获取
    if (!el || !el.tagName) {
      el = pickHighlight?._currentEl;
    }

    // 兜底：从点击位置获取所有元素，过滤掉脚本UI
    if (!el || !el.tagName) {
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      for (const element of elements) {
        if (
          !element.closest("#nopic-widget") &&
          !element.closest("#nopic-menu") &&
          !element.closest("[id^='nopic-']") &&
          !element.classList.contains("nopic-pm-pick-overlay") &&
          !element.classList.contains("nopic-pm-pick-highlight")
        ) {
          el = element;
          break;
        }
      }
    }

    if (!el || !el.tagName) return;

    // 等待拾取高亮消失后再生成选择器，避免干扰
    const selector = generateSelector(el);
    const elementText = (el.innerText || el.textContent || el.value || "")
      .trim()
      .substring(0, 100);

    // 先停止拾取模式
    stopElementPicking();

    const cfg = getPageMonitorConfigByScope(currentPageMonitorScope);
    const newMonitor = {
      id: "pm_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      selector: selector,
      selectorType: "css",
      checkInterval: 100,
      rule: "textChanged",
      threshold: "",
      keyword: "",
      stopAfterTrigger: false,
      action: "notification",
      name:
        (el.innerText || el.textContent || "").trim().substring(0, 50) ||
        el.tagName.toLowerCase() + (el.id ? "#" + el.id : ""),
      lastText: elementText,
      active: false,
    };
    cfg.monitors = cfg.monitors || [];
    cfg.monitors.push(newMonitor);
    setPageMonitorConfigByScope(currentPageMonitorScope, cfg);
    renderPageMonitorList();
  }

  function onPickKeyDown(e) {
    if (e.key === "Escape") stopElementPicking();
  }

  function generateSelector(el) {
    if (!el || !el.tagName) return "";

    // 优先使用id
    if (el.id && !el.id.startsWith("nopic-")) {
      try {
        const escapedId = CSS.escape(el.id);
        const selector = "#" + escapedId;
        if (document.querySelectorAll(selector).length === 1) return selector;
      } catch (e) {}
    }

    // 使用class组合
    if (el.className && typeof el.className === "string") {
      const classes = el.className
        .split(" ")
        .filter((c) => c && !c.startsWith("nopic-") && !c.includes(":"))
        .slice(0, 3);
      if (classes.length > 0) {
        try {
          const classSel = "." + classes.map((c) => CSS.escape(c)).join(".");
          if (document.querySelectorAll(classSel).length === 1) return classSel;
        } catch (e) {}
      }
    }

    // 尝试使用 data-* 属性
    const dataAttrs = [
      "data-testid",
      "data-id",
      "data-qa",
      "data-cy",
      "data-test",
    ];
    for (const attr of dataAttrs) {
      const val = el.getAttribute(attr);
      if (val) {
        try {
          const escapedVal = CSS.escape(val);
          const selector = `[${attr}="${escapedVal}"]`;
          if (document.querySelectorAll(selector).length === 1) return selector;
        } catch (e) {}
      }
    }

    // 尝试使用 name 属性
    const nameVal = el.getAttribute("name");
    if (nameVal) {
      try {
        const escapedName = CSS.escape(nameVal);
        const selector = `[name="${escapedName}"]`;
        if (document.querySelectorAll(selector).length === 1) return selector;
      } catch (e) {}
    }

    // 构建路径 - 使用更精确的 nth-of-type 和 tag 组合
    const path = [];
    let current = el;
    let depth = 0;
    const maxDepth = 8;

    while (current && current !== document.body && depth < maxDepth) {
      let selector = current.tagName.toLowerCase();

      // 如果有id，直接使用id并终止
      if (current.id && !current.id.startsWith("nopic-")) {
        try {
          const escapedId = CSS.escape(current.id);
          path.unshift("#" + escapedId);
          break;
        } catch (e) {}
      }

      // 如果有唯一class组合，使用它并终止
      if (current.className && typeof current.className === "string") {
        const classes = current.className
          .split(" ")
          .filter((c) => c && !c.startsWith("nopic-") && !c.includes(":"))
          .slice(0, 2);
        if (classes.length > 0) {
          try {
            const classSel = "." + classes.map((c) => CSS.escape(c)).join(".");
            const fullSelector =
              path.length > 0 ? classSel + " > " + path.join(" > ") : classSel;
            // 检查这个选择器是否唯一
            const testSelector =
              path.length > 0
                ? selector + classSel + " > " + path.join(" > ")
                : selector + classSel;
            // 简化：只检查当前的class是否唯一
            if (document.querySelectorAll(classSel).length === 1) {
              path.unshift(classSel);
              break;
            }
          } catch (e) {}
        }
      }

      // 计算在同类型兄弟节点中的位置
      const parent = current.parentElement;
      if (parent) {
        const sameTagSiblings = Array.from(parent.children).filter(
          (c) => c.tagName === current.tagName,
        );
        if (sameTagSiblings.length > 1) {
          const index = sameTagSiblings.indexOf(current) + 1;
          selector += ":nth-of-type(" + index + ")";
        }
      }

      path.unshift(selector);
      current = parent;
      depth++;
    }

    // 如果路径为空，返回tagName
    if (path.length === 0) {
      return el.tagName.toLowerCase();
    }

    const fullPath = path.join(" > ");

    // 验证选择器是否有效且唯一
    try {
      const matches = document.querySelectorAll(fullPath);
      if (matches.length === 1 && matches[0] === el) {
        return fullPath;
      }
    } catch (e) {}

    // 如果选择器不唯一，尝试添加更多层级
    // 从当前元素开始向上构建，直到找到唯一选择器
    let tempPath = [];
    let temp = el;
    let tempDepth = 0;

    while (temp && temp !== document.body && tempDepth < 12) {
      let seg = temp.tagName.toLowerCase();

      // 尝试用id
      if (temp.id && !temp.id.startsWith("nopic-")) {
        try {
          const escapedId = CSS.escape(temp.id);
          const testSel = "#" + escapedId + " " + tempPath.join(" ");
          if (document.querySelectorAll(testSel).length === 1) {
            return testSel;
          }
          tempPath.unshift("#" + escapedId);
          break;
        } catch (e) {}
      }

      // 尝试用class
      if (temp.className && typeof temp.className === "string") {
        const classes = temp.className
          .split(" ")
          .filter((c) => c && !c.startsWith("nopic-") && !c.includes(":"))
          .slice(0, 2);
        if (classes.length > 0) {
          try {
            const classSel = "." + classes.map((c) => CSS.escape(c)).join(".");
            const testSel = classSel + " " + tempPath.join(" ");
            if (document.querySelectorAll(testSel).length === 1) {
              return testSel;
            }
            tempPath.unshift(classSel);
          } catch (e) {}
        }
      }

      // 用nth-of-type
      const parent = temp.parentElement;
      if (parent) {
        const sameTagSiblings = Array.from(parent.children).filter(
          (c) => c.tagName === temp.tagName,
        );
        if (sameTagSiblings.length > 1) {
          const index = sameTagSiblings.indexOf(temp) + 1;
          seg += ":nth-of-type(" + index + ")";
        }
      }

      tempPath.unshift(seg);
      temp = parent;
      tempDepth++;
    }

    // 如果路径中有空格分隔（后代选择器），使用它
    if (tempPath.length > 1) {
      const descendantPath = tempPath.join(" ");
      try {
        if (document.querySelectorAll(descendantPath).length === 1) {
          return descendantPath;
        }
      } catch (e) {}
    }

    // 最后兜底：返回完整的后代选择器
    return tempPath.join(" ");
  }

  function renderPageMonitorList() {
    const container = document.getElementById("nopic-pm-monitors-list");
    if (!container) return;
    const cfg = getPageMonitorConfigByScope(currentPageMonitorScope);
    const monitors = cfg.monitors || [];

    if (monitors.length === 0) {
      container.innerHTML =
        '<div style="text-align:center;color:rgba(255,255,255,0.4);padding:20px;font-size:12px;">暂无监控规则，点击"添加"或"拾取"创建</div>';
      return;
    }

    container.innerHTML = "";
    monitors.forEach((monitor, idx) => {
      const item = document.createElement("div");
      item.className = "nopic-pm-monitor-item";
      item.innerHTML = `
      <div class="nopic-pm-monitor-header">
        <span class="nopic-pm-monitor-name">${escapeHtml(monitor.name)} <span style="font-size:10px;color:rgba(255,255,255,0.4);">(${monitor.checkInterval}ms)</span></span>
        <span class="nopic-pm-monitor-status ${monitor.active ? "" : "stopped"}">${monitor.active ? "运行中" : "已停止"}</span>
      </div>
      
      <div class="nopic-pm-row">
        <span class="nopic-pm-label">选择器</span>
        <input type="text" class="nopic-pm-input" value="${escapeHtml(monitor.selector)}" data-pm-id="${monitor.id}" data-pm-field="selector" placeholder="CSS选择器">
      </div>
      <div class="nopic-pm-row">
        <span class="nopic-pm-label">检测间隔</span>
        <input type="number" class="nopic-pm-small-input" value="${monitor.checkInterval}" min="100" step="100" data-pm-id="${monitor.id}" data-pm-field="checkInterval">
        <span style="font-size:10px;color:rgba(255,255,255,0.4);">ms</span>
        <span class="nopic-pm-label" style="width:auto;margin-left:10px;">规则</span>
        <select class="nopic-pm-select" style="width:120px;" data-pm-id="${monitor.id}" data-pm-field="rule">
          <option value="textChanged" ${monitor.rule === "textChanged" ? "selected" : ""}>文本变化</option>
          <option value="contains" ${monitor.rule === "contains" ? "selected" : ""}>包含文字</option>
          <option value="notContains" ${monitor.rule === "notContains" ? "selected" : ""}>不含文字</option>
          <option value="greaterThan" ${monitor.rule === "greaterThan" ? "selected" : ""}>数值大于</option>
          <option value="lessThan" ${monitor.rule === "lessThan" ? "selected" : ""}>数值小于</option>
          <option value="equals" ${monitor.rule === "equals" ? "selected" : ""}>数值等于</option>
          <option value="appears" ${monitor.rule === "appears" ? "selected" : ""}>元素出现</option>
          <option value="disappears" ${monitor.rule === "disappears" ? "selected" : ""}>元素消失</option>
        </select>
      </div>
      <div class="nopic-pm-row" style="display:${["contains", "notContains"].includes(monitor.rule) ? "flex" : "none"};">
        <span class="nopic-pm-label">关键词</span>
        <input type="text" class="nopic-pm-input" value="${escapeHtml(monitor.keyword || "")}" data-pm-id="${monitor.id}" data-pm-field="keyword" placeholder="输入关键词">
      </div>
      <div class="nopic-pm-row" style="display:${["greaterThan", "lessThan", "equals"].includes(monitor.rule) ? "flex" : "none"};">
        <span class="nopic-pm-label">阈值</span>
        <input type="number" class="nopic-pm-input" value="${monitor.threshold || ""}" data-pm-id="${monitor.id}" data-pm-field="threshold" placeholder="输入数值">
      </div>
      <div class="nopic-pm-row">
        <span class="nopic-pm-label">执行操作</span>
        <select class="nopic-pm-select" data-pm-id="${monitor.id}" data-pm-field="action">
          <option value="notification" ${monitor.action === "notification" ? "selected" : ""}>仅弹窗提醒</option>
          <option value="desktop" ${monitor.action === "desktop" ? "selected" : ""}>桌面通知</option>
          <option value="refresh" ${monitor.action === "refresh" ? "selected" : ""}>刷新页面</option>
          <option value="autoclicker" ${monitor.action === "autoclicker" ? "selected" : ""}>运行自动点击</option>
          <option value="script" ${monitor.action === "script" ? "selected" : ""}>运行JS脚本</option>
        </select>
        <div class="nopic-pm-row" style="display:${monitor.action === "script" ? "flex" : "none"};">
  <span class="nopic-pm-label">脚本</span>
  <textarea class="nopic-pm-input" data-pm-id="${monitor.id}" data-pm-field="scriptCode" placeholder="输入要执行的JS代码..." rows="2" style="resize:vertical;font-family:monospace;font-size:11px;">${escapeHtml(monitor.scriptCode || "")}</textarea>
</div>
      </div>
      <div class="nopic-pm-checkbox-row">
        <div class="nopic-pm-checkbox ${monitor.stopAfterTrigger ? "checked" : ""}" data-pm-id="${monitor.id}" data-pm-field="stopAfterTrigger">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <span style="font-size:11px;color:rgba(255,255,255,0.6);">触发后自动停止</span>
      </div>
      <div class="nopic-pm-actions">
        <button class="nopic-pm-btn ${monitor.active ? "danger" : "success"}" data-pm-toggle="${monitor.id}">${monitor.active ? "停止" : "启动"}</button>
        <button class="nopic-pm-btn danger" data-pm-delete="${monitor.id}">删除</button>
      </div>
  ${monitor.active && monitor._configChanged ? '<div style="font-size:10px;color:#fbbf24;margin-top:4px;text-align:center;">⚠️ 修改已保存，需停止再启动才可生效</div>' : ""}
    `;
      container.appendChild(item);
    });

    // 绑定事件 - 使用事件委托方式，确保动态生成的按钮也能响应
    // 先移除旧的委托监听器
    if (container._toggleDelegate) {
      container.removeEventListener("click", container._toggleDelegate);
    }
    if (container._deleteDelegate) {
      container.removeEventListener("click", container._deleteDelegate);
    }

    // 启动/停止按钮委托
    container._toggleDelegate = function (e) {
      const btn = e.target.closest("[data-pm-toggle]");
      if (btn) {
        e.stopPropagation();
        const id = btn.dataset.pmToggle;
        toggleMonitor(id);
      }
    };
    container.addEventListener("click", container._toggleDelegate);

    // 删除按钮委托
    container._deleteDelegate = function (e) {
      const btn = e.target.closest("[data-pm-delete]");
      if (btn) {
        e.stopPropagation();
        const id = btn.dataset.pmDelete;
        deleteMonitor(id);
      }
    };
    container.addEventListener("click", container._deleteDelegate);

    // 其他字段变更事件
    container.querySelectorAll("[data-pm-field]").forEach((input) => {
      input.addEventListener("change", (e) => {
        e.stopPropagation();
        updateMonitorField(
          e.target.dataset.pmId,
          e.target.dataset.pmField,
          e.target.value,
        );
      });
    });

    // 绑定规则切换显示
    container.querySelectorAll("[data-pm-field='rule']").forEach((select) => {
      select.addEventListener("change", (e) => {
        renderPageMonitorList();
      });
    });

    // 绑定复选框
    container
      .querySelectorAll("[data-pm-field='stopAfterTrigger']")
      .forEach((cb) => {
        cb.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = cb.dataset.pmId;
          const cfg = getPageMonitorConfigByScope(currentPageMonitorScope);
          const m = cfg.monitors.find((x) => x.id === id);
          if (m) {
            m.stopAfterTrigger = !m.stopAfterTrigger;
            setPageMonitorConfigByScope(currentPageMonitorScope, cfg);
            renderPageMonitorList();
          }
        });
      });
  }

  function updateMonitorField(id, field, value) {
    const cfg = getPageMonitorConfigByScope(currentPageMonitorScope);
    const m = cfg.monitors.find((x) => x.id === id);
    if (!m) return;
    if (field === "checkInterval" || field === "threshold") {
      value = parseInt(value) || 0;
    }
    m[field] = value;
    // 标记该监控配置已被修改
    m._configChanged = true;
    setPageMonitorConfigByScope(currentPageMonitorScope, cfg);
    // 如果修改了运行中监控的间隔，重启它
    if (m.active && field === "checkInterval") {
      stopMonitor(id);
      startMonitor(id);
      m._configChanged = false; // 重启后清除标记
    }
    renderPageMonitorList();
  }

  function toggleMonitor(id) {
    const cfg = getPageMonitorConfigByScope(currentPageMonitorScope);
    const m = cfg.monitors.find((x) => x.id === id);
    if (!m) return;
    m.active = !m.active;
    // 不管启动还是停止，都清除配置修改标记
    m._configChanged = false;
    setPageMonitorConfigByScope(currentPageMonitorScope, cfg);
    if (m.active) {
      startMonitor(id);
    } else {
      stopMonitor(id);
    }
    renderPageMonitorList();
  }

  function deleteMonitor(id) {
    stopMonitor(id);
    const cfg = getPageMonitorConfigByScope(currentPageMonitorScope);
    cfg.monitors = cfg.monitors.filter((x) => x.id !== id);
    setPageMonitorConfigByScope(currentPageMonitorScope, cfg);
    renderPageMonitorList();
  }

  function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function startAllPageMonitors() {
    const allMonitors = getEffectivePageMonitorMonitors();
    allMonitors.forEach((m) => {
      if (m.active) startMonitor(m.id);
    });
  }

  function stopAllPageMonitors() {
    pageMonitorIntervals.forEach((_, id) => stopMonitor(id));
    pageMonitorIntervals.clear();
    pageMonitorLastValues.clear();
  }

  function startMonitor(monitorId) {
    stopMonitor(monitorId);
    const allMonitors = getEffectivePageMonitorMonitors();
    const monitor = allMonitors.find((m) => m.id === monitorId);
    if (!monitor || !monitor.selector) return;
    const intervalId = setInterval(
      () => {
        checkMonitor(monitor);
      },
      Math.max(100, monitor.checkInterval || 100),
    );
    pageMonitorIntervals.set(monitorId, intervalId);

    // 初始化记录值 - 考虑可见性
    const el = document.querySelector(monitor.selector);
    if (el) {
      // 检查元素是否可见
      function isVisible(element) {
        if (!element || !element.isConnected) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        const style = window.getComputedStyle(element);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.opacity === "0"
        )
          return false;
        return true;
      }
      const visible = isVisible(el);
      if (monitor.rule === "appears" || monitor.rule === "disappears") {
        pageMonitorLastValues.set(monitorId, visible);
        if (visible) {
          pageMonitorLastValues.set(monitorId + "_text", el.textContent.trim());
        }
      } else {
        pageMonitorLastValues.set(monitorId, el.textContent.trim());
      }
    } else {
      if (monitor.rule === "appears" || monitor.rule === "disappears") {
        pageMonitorLastValues.set(monitorId, false);
      } else {
        pageMonitorLastValues.set(monitorId, "");
      }
    }
  }

  function stopMonitor(monitorId) {
    const intervalId = pageMonitorIntervals.get(monitorId);
    if (intervalId) {
      clearInterval(intervalId);
      pageMonitorIntervals.delete(monitorId);
    }
  }

  function checkMonitor(monitor) {
    const el = document.querySelector(monitor.selector);

    // 判断元素是否真正可见（不仅存在，还要可见）
    function isElementVisible(element) {
      if (!element) return false;

      // 检查元素本身是否在DOM中
      if (!element.isConnected) return false;

      // 检查元素尺寸
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;

      // 检查样式
      const style = window.getComputedStyle(element);
      if (style.display === "none") return false;
      if (style.visibility === "hidden") return false;
      if (style.opacity === "0") return false;

      // 检查父元素是否隐藏（递归检查直到body）
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.display === "none") return false;
        if (parentStyle.visibility === "hidden") return false;
        if (parentStyle.opacity === "0") return false;
        parent = parent.parentElement;
      }

      return true;
    }

    // 获取元素文本（只有可见元素才获取文本）
    const currentVisible = isElementVisible(el);
    const currentText = currentVisible && el ? el.textContent.trim() : "";

    // 获取上次记录的值（可能是布尔值或文本）
    const lastValue = pageMonitorLastValues.get(monitor.id);

    let triggered = false;
    let beforeValue = lastValue;
    let afterValue = currentText;

    switch (monitor.rule) {
      case "textChanged":
        // 只有当元素可见且文本变化时才触发
        if (
          currentVisible &&
          lastValue !== undefined &&
          currentText !== lastValue &&
          currentText !== ""
        ) {
          triggered = true;
          beforeValue = lastValue;
          afterValue = currentText;
        }
        break;
      case "contains":
        if (
          currentVisible &&
          currentText &&
          monitor.keyword &&
          currentText.includes(monitor.keyword)
        ) {
          triggered = true;
          beforeValue = lastValue;
          afterValue = currentText;
        }
        break;
      case "notContains":
        if (
          currentVisible &&
          currentText &&
          monitor.keyword &&
          !currentText.includes(monitor.keyword)
        ) {
          triggered = true;
          beforeValue = lastValue;
          afterValue = currentText;
        }
        break;
      case "greaterThan":
      case "lessThan":
      case "equals": {
        if (currentVisible) {
          const num = parseFloat(currentText.replace(/[^\d.-]/g, ""));
          const threshold = parseFloat(monitor.threshold);
          if (!isNaN(num) && !isNaN(threshold)) {
            if (monitor.rule === "greaterThan" && num > threshold) {
              triggered = true;
              beforeValue = lastValue;
              afterValue = currentText;
            }
            if (monitor.rule === "lessThan" && num < threshold) {
              triggered = true;
              beforeValue = lastValue;
              afterValue = currentText;
            }
            if (
              monitor.rule === "equals" &&
              Math.abs(num - threshold) < 0.001
            ) {
              triggered = true;
              beforeValue = lastValue;
              afterValue = currentText;
            }
          }
        }
        break;
      }
      case "appears": {
        const wasVisible = lastValue === true;
        // 从不可见变为可见时触发
        if (!wasVisible && currentVisible) {
          triggered = true;
          beforeValue = "消失/不可见";
          afterValue = "出现/可见 (" + currentText + ")";
        }
        break;
      }
      case "disappears": {
        const wasVisible = lastValue === true;
        // 从可见变为不可见时触发
        if (wasVisible && !currentVisible) {
          triggered = true;
          // 获取之前保存的文本值
          const lastText =
            pageMonitorLastValues.get(monitor.id + "_text") || "未知内容";
          beforeValue = "出现/可见 (" + lastText + ")";
          afterValue = "消失/不可见";
        }
        break;
      }
    }

    // 保存旧值用于弹窗
    const oldValue = pageMonitorLastValues.get(monitor.id);
    // 同时保存文本值，用于disappears时显示
    if (monitor.rule === "appears" || monitor.rule === "disappears") {
      // 对于出现/消失规则，保存可见状态和文本
      pageMonitorLastValues.set(monitor.id, currentVisible);
      // 额外保存文本值，用于弹窗显示
      if (currentVisible) {
        pageMonitorLastValues.set(monitor.id + "_text", currentText);
      }
    } else {
      pageMonitorLastValues.set(monitor.id, currentText);
    }

    if (triggered) {
      executeMonitorAction(monitor, beforeValue, afterValue);
    }
  }

  // 全局变量跟踪当前弹窗
  let currentNotificationToast = null;

  function showElegantNotification(monitor, beforeValue, afterValue) {
    // 如果有旧弹窗，立即移除（让位给新弹窗）
    if (
      window.currentNotificationToast &&
      window.currentNotificationToast.parentNode
    ) {
      window.currentNotificationToast.remove();
      window.currentNotificationToast = null;
    }

    const toast = document.createElement("div");
    toast.className = "nopic-notification-toast";
    toast.style.cssText = `
      position:fixed; top:20px; left:50%; transform:translateX(-50%) translateY(-20px);
      z-index:2147483647; background:rgba(20,20,25,0.92); backdrop-filter:blur(20px);
      border:1px solid rgba(96,165,250,0.3); border-radius:14px;
      padding:16px 28px; box-shadow:0 12px 48px rgba(0,0,0,0.5);
      color:#fff; font-family:-apple-system,BlinkMacSystemFont,sans-serif;
      font-size:13px; min-width:280px; max-width:420px;
      opacity:0; transition:opacity 0.4s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      pointer-events:auto; display:flex; align-items:center; gap:14px;
      max-height:80vh; overflow-y:auto;
  `;

    const beforeDisplay =
      beforeValue !== undefined && beforeValue !== null ? beforeValue : "无";
    const afterDisplay =
      afterValue !== undefined && afterValue !== null ? afterValue : "无";

    toast.innerHTML = `
      <div style="width:36px;height:36px;border-radius:50%;background:rgba(96,165,250,0.2);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🔔</div>
      <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:600;color:#60a5fa;margin-bottom:4px;">${escapeHtml(monitor.name)}</div>
          <div style="color:rgba(255,255,255,0.7);font-size:12px;word-break:break-all;">
            变化前: <span style="color:rgba(255,255,255,0.5);">${escapeHtml(String(beforeDisplay).substring(0, 50))}</span>
          </div>
          <div style="color:rgba(255,255,255,0.7);font-size:12px;word-break:break-all;">
            变化后: <span style="color:#4ade80;">${escapeHtml(String(afterDisplay).substring(0, 50))}</span>
          </div>
          <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px;">规则: ${monitor.rule}</div>
      </div>
      <div class="nopic-notification-close" style="padding:4px 12px;background:rgba(255,255,255,0.08);border-radius:6px;font-size:11px;color:rgba(255,255,255,0.5);cursor:pointer;flex-shrink:0;">✕</div>
  `;

    // 保存当前弹窗引用到全局
    window.currentNotificationToast = toast;

    document.body.appendChild(toast);

    // 绑定关闭按钮事件
    const closeBtn = toast.querySelector(".nopic-notification-close");
    closeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (toast.parentNode) {
        toast.remove();
      }
      if (window.currentNotificationToast === toast) {
        window.currentNotificationToast = null;
      }
    });

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(0)";
    });
  }

  // ===== 桌面通知 =====
  function showDesktopNotification(monitor, beforeValue, afterValue) {
    if (!("Notification" in window)) {
      console.warn("浏览器不支持桌面通知");
      return;
    }

    console.log("当前通知权限:", Notification.permission);

    if (Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        console.log("权限请求结果:", permission);
        if (permission === "granted") {
          sendDesktopNotification(monitor, beforeValue, afterValue);
        } else {
          // 权限被拒绝，弹窗提示
          showPermissionDeniedTip(monitor, beforeValue, afterValue);
        }
      });
    } else if (Notification.permission === "granted") {
      sendDesktopNotification(monitor, beforeValue, afterValue);
    } else {
      // 已拒绝，弹窗提示
      console.warn("桌面通知被拒绝");
      showPermissionDeniedTip(monitor, beforeValue, afterValue);
    }
  }

  // ===== 显示权限拒绝提示 =====
  function showPermissionDeniedTip(monitor, beforeValue, afterValue) {
    // 先显示优雅通知（保证用户能看到监控触发了）
    showElegantNotification(monitor, beforeValue, afterValue);

    // 再显示权限提示
    const tip = document.createElement("div");
    tip.style.cssText = `
    position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
    z-index:2147483647; background:rgba(30,30,35,0.95);
    backdrop-filter:blur(20px); border:1px solid rgba(248,113,113,0.3);
    border-radius:12px; padding:16px 24px;
    color:#fff; font-size:13px; font-family:-apple-system,sans-serif;
    max-width:420px; text-align:center; box-shadow:0 8px 32px rgba(0,0,0,0.4);
    animation: nopic-fadeIn 0.3s ease;
  `;
    tip.innerHTML = `
    <div style="font-size:20px;margin-bottom:8px;">🔔</div>
    <div style="font-weight:600;margin-bottom:4px;color:#f87171;">桌面通知被拒绝</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.6);line-height:1.8;text-align:left;padding:0 4px;">
      <div>📌 <strong>Chrome/Edge：</strong>地址栏左侧锁图标 → 网站设置 → 通知 → 改为"允许"</div>
      <div>📌 <strong>Firefox：</strong>地址栏左侧锁图标 → 权限 → 通知 → 改为"允许"</div>
      <div style="margin-top:6px;font-size:11px;color:rgba(255,255,255,0.4);">💡 修改后刷新页面即可生效</div>
    </div>
    <div style="margin-top:10px;font-size:11px;color:rgba(255,255,255,0.3);cursor:pointer;" id="nopic-tip-close">点击关闭</div>
  `;
    document.body.appendChild(tip);

    tip.querySelector("#nopic-tip-close").addEventListener("click", () => {
      if (tip.parentNode) tip.remove();
    });

    // 8秒后自动关闭
    setTimeout(() => {
      if (tip.parentNode) tip.remove();
    }, 8000);
  }

  function sendDesktopNotification(monitor, beforeValue, afterValue) {
    const beforeDisplay =
      beforeValue !== undefined && beforeValue !== null ? beforeValue : "无";
    const afterDisplay =
      afterValue !== undefined && afterValue !== null ? afterValue : "无";

    const notification = new Notification("🔔 页面监控触发", {
      body: `${monitor.name}\n变化前: ${String(beforeDisplay).substring(0, 50)}\n变化后: ${String(afterDisplay).substring(0, 50)}`,
      icon: "data:image/png;base64,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",
    });

    // 点击通知跳转到页面
    notification.onclick = function () {
      window.focus();
      notification.close();
    };

    // 5秒后自动关闭
    setTimeout(() => {
      notification.close();
    }, 5000);
  }

  function executeMonitorAction(monitor, beforeValue, afterValue) {
    // 获取变化前后的值
    const el = document.querySelector(monitor.selector);
    const currentText = el ? el.textContent.trim() : "";
    const lastValue = pageMonitorLastValues.get(monitor.id);

    // 所有操作都弹出优雅通知，显示变化前后
    showElegantNotification(monitor, beforeValue, afterValue);

    // 执行其他操作
    switch (monitor.action) {
      case "refresh":
        location.reload();
        break;
      case "autoclicker":
        if (
          autoClickerConfig &&
          autoClickerConfig.steps &&
          autoClickerConfig.steps.length > 0
        ) {
          executeAutoClicker();
        }
        break;
      case "script":
        if (monitor.scriptCode) {
          try {
            (0, eval)(monitor.scriptCode);
          } catch (e) {
            console.error("脚本执行错误:", e);
          }
        }
        break;
      case "desktop": // 新增桌面通知
        showDesktopNotification(monitor, beforeValue, afterValue);
        break;
    }

    if (monitor.stopAfterTrigger) {
      const allCfgs = ["url", "domain"];
      for (const scope of allCfgs) {
        const cfg = getPageMonitorConfigByScope(scope);
        const m = cfg.monitors.find((x) => x.id === monitor.id);
        if (m) {
          m.active = false;
          setPageMonitorConfigByScope(scope, cfg);
          break;
        }
      }
      stopMonitor(monitor.id);
      renderPageMonitorList();
    }
  }

  // ===== 自动点击器配置 =====
  // 获取精确匹配开关状态（默认 false）
  function getAutoClickerExactMatch() {
    try {
      return localStorage.getItem("nopic_autoclicker_exactmatch") === "true";
    } catch {
      return false;
    }
  }
  function setAutoClickerExactMatch(enabled) {
    localStorage.setItem(
      "nopic_autoclicker_exactmatch",
      enabled ? "true" : "false",
    );
  }

  // 获取规范化路径：忽略查询参数；根据精确匹配决定是否保留末尾斜杠
  // 获取规范化路径：根据精确匹配决定是否包含查询参数
  function getAutoClickerBasePath() {
    let path = location.pathname;
    // 如果精确匹配关闭，去除末尾斜杠（根路径 '/' 保留）
    if (!getAutoClickerExactMatch()) {
      if (path.length > 1 && path.endsWith("/")) {
        path = path.slice(0, -1);
      }
    }

    // ===== 新增：根据精确匹配决定是否包含查询参数 =====
    if (getAutoClickerExactMatch()) {
      // 精确匹配开启：包含完整 URL（包含查询参数）
      return location.origin + path + location.search;
    } else {
      // 精确匹配关闭：只匹配域名+路径，忽略查询参数
      return location.origin + path;
    }
  }
  const defaultAutoClickerConfig = {
    enabled: true,
    loopCount: 1,
    showNotification: true,
    autoStartOnLoad: true,
    steps: [],
  };

  function getAutoClickerConfig() {
    const basePath = getAutoClickerBasePath();
    const key = "nopic_autoclicker_" + encodeURIComponent(basePath);
    // 尝试读取新 key，如果不存在则尝试旧 key 迁移
    let saved = localStorage.getItem(key);
    if (!saved) {
      const oldKey =
        "nopic_autoclicker_" +
        encodeURIComponent(location.origin + location.pathname);
      saved = localStorage.getItem(oldKey);
      if (saved) {
        localStorage.setItem(key, saved);
        localStorage.removeItem(oldKey);
      }
    }
    if (saved) return JSON.parse(saved);
    return { ...defaultAutoClickerConfig };
  }
  function setAutoClickerConfig(cfg) {
    const basePath = getAutoClickerBasePath();
    const key = "nopic_autoclicker_" + encodeURIComponent(basePath);
    localStorage.setItem(key, JSON.stringify(cfg));
  }
  // 自动点击器安全窗口配置（按网页独立记忆）
  function getAutoClickerSafetyConfig() {
    const key = "nopic_autoclicker_safety_" + location.host;
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : { delay: 3 }; // 默认3秒
  }
  function setAutoClickerSafetyConfig(cfg) {
    const key = "nopic_autoclicker_safety_" + location.host;
    localStorage.setItem(key, JSON.stringify(cfg));
  }
  let autoClickerSafetyConfig = getAutoClickerSafetyConfig();
  let autoClickerConfig = getAutoClickerConfig();
  // ===== 路由变化监听（单页应用支持） =====
  // 路由变化监听 - 使用字符串记录上次路径，防止重复触发
  let _lastAutoClickerBasePath = null;

  function onAutoClickerUrlChange() {
    const newBasePath = getAutoClickerBasePath();

    // 首次调用，直接记录并初始化
    if (_lastAutoClickerBasePath === null) {
      _lastAutoClickerBasePath = newBasePath;
      // 首次加载时，如果自动启动开启，执行
      if (
        autoClickerConfig.autoStartOnLoad &&
        autoClickerConfig.steps.length > 0
      ) {
        setTimeout(executeAutoClicker, 300);
      }
      return;
    }

    // 路径未变化，不做任何事
    if (newBasePath === _lastAutoClickerBasePath) return;

    console.log(
      "[nopic] URL 变化检测到:",
      _lastAutoClickerBasePath,
      "→",
      newBasePath,
    );

    // ===== 关键修复：只更新记录，不做任何配置迁移 =====
    _lastAutoClickerBasePath = newBasePath;

    // 1. 重新加载配置（从新 URL 读取，如果没有就是空配置）
    const newConfig = getAutoClickerConfig();
    autoClickerConfig = newConfig;

    // 2. 如果正在运行，停止
    if (isAutoClickerRunning && autoClickerAbortController) {
      autoClickerAbortController.abort();
      isAutoClickerRunning = false;
      autoClickerAbortController = null;
      hideAutoClickerStatusPanel();
    }

    // 3. 如果弹窗打开，刷新列表（显示新 URL 的配置，应该是空的）
    if (autoClickerSubmenuOpen) {
      updateAutoClickerFlowList();
    }

    // 4. 如果新配置允许自动启动，立即执行
    if (
      autoClickerConfig.autoStartOnLoad &&
      autoClickerConfig.steps.length > 0
    ) {
      console.log("[nopic] 新 URL 有自动点击流程，准备执行");
      setTimeout(executeAutoClicker, 300);
    }
  }

  // 劫持 pushState / replaceState
  // 劫持 pushState / replaceState（使用标志防止递归）
  let _nopicPushStateFlag = false;
  const _origPushState = history.pushState;
  history.pushState = function () {
    if (!_nopicPushStateFlag) {
      _nopicPushStateFlag = true;
      _origPushState.apply(this, arguments);
      // 延迟执行，确保页面已更新
      setTimeout(onAutoClickerUrlChange, 50);
      _nopicPushStateFlag = false;
    } else {
      _origPushState.apply(this, arguments);
    }
  };
  const _origReplaceState = history.replaceState;
  history.replaceState = function () {
    if (!_nopicPushStateFlag) {
      _nopicPushStateFlag = true;
      _origReplaceState.apply(this, arguments);
      setTimeout(onAutoClickerUrlChange, 50);
      _nopicPushStateFlag = false;
    } else {
      _origReplaceState.apply(this, arguments);
    }
  };

  // popstate 和 hashchange 也需要延迟
  window.addEventListener("popstate", function () {
    setTimeout(onAutoClickerUrlChange, 50);
  });
  window.addEventListener("hashchange", function () {
    setTimeout(onAutoClickerUrlChange, 50);
  });

  // 兜底定时器（每 300ms 检查一次，防止劫持失效或 SPA 框架的特殊行为）
  let _nopicUrlCheckTimer = setInterval(function () {
    const current = getAutoClickerBasePath();
    if (_lastAutoClickerBasePath === null) {
      _lastAutoClickerBasePath = current;
      return;
    }
    if (current !== _lastAutoClickerBasePath) {
      // 发现变化，但确保不是同一个页面内的 hash 变化导致的误判
      onAutoClickerUrlChange();
    }
  }, 300);

  // ===== 页面可编辑配置（无记忆）=====
  // 页面可编辑开关状态（有记忆，按域名存储）
  function getPageEditEnabled() {
    try {
      const saved = localStorage.getItem(
        "nopic_pageedit_enabled_" + location.host,
      );
      if (saved !== null) return saved === "true";
    } catch (e) {}
    return true;
  }
  function setPageEditEnabled(enabled) {
    try {
      localStorage.setItem(
        "nopic_pageedit_enabled_" + location.host,
        enabled ? "true" : "false",
      );
    } catch (e) {}
  }
  let pageEditEnabled = getPageEditEnabled();
  let pageEditMode = false; // 控制实际的页面可编辑功能（无记忆）

  // ===== 替换文字配置 =====
  const defaultTextReplaceConfig = {
    rules: [], // { id, from: "原文字", to: "替换文字", caseSensitive: false }
  };

  // 按 scope 获取文字替换配置
  function getTextReplaceConfigByScope(scope) {
    try {
      if (scope === "global") {
        const saved = GM_getValue("nopic_textreplace_global", null);
        return saved
          ? typeof saved === "string"
            ? JSON.parse(saved)
            : { ...saved }
          : { rules: [] };
      }
      const key =
        scope === "domain"
          ? "nopic_textreplace_domain_" + location.host
          : "nopic_textreplace_" + encodeURIComponent(nopicGetUrlKey());
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : { rules: [] };
    } catch (e) {
      return { rules: [] };
    }
  }

  // 按 scope 保存文字替换配置
  function setTextReplaceConfigByScope(scope, config) {
    const configToSave = { rules: config.rules || [] };
    if (scope === "global") {
      GM_setValue("nopic_textreplace_global", configToSave);
    } else {
      const key =
        scope === "domain"
          ? "nopic_textreplace_domain_" + location.host
          : "nopic_textreplace_" + encodeURIComponent(nopicGetUrlKey());
      localStorage.setItem(key, JSON.stringify(configToSave));
    }
  }

  // 获取生效的文字替换规则（按优先级合并：global -> domain -> url，后面的覆盖前面的）
  function getEffectiveTextReplaceRules() {
    const globalRules = getTextReplaceConfigByScope("global").rules || [];
    const domainRules = getTextReplaceConfigByScope("domain").rules || [];
    const urlRules = getTextReplaceConfigByScope("url").rules || [];

    const map = new Map();
    // 按优先级从低到高，后面的覆盖前面的
    [...globalRules, ...domainRules, ...urlRules].forEach((rule) => {
      if (rule.from) map.set(rule.from, rule);
    });
    return Array.from(map.values());
  }

  // 获取当前编辑 scope 的文字替换配置（用于 UI 面板显示）
  function getTextReplaceConfig() {
    const scope = nopicGetConfigScope("nopic_textreplace");
    const config = getTextReplaceConfigByScope(scope);
    currentTextReplaceScope = scope;
    return config;
  }

  // 保存文字替换配置（根据用户选择的 scope 保存）
  function setTextReplaceConfig(cfg) {
    const scope = nopicGetConfigScope("nopic_textreplace");
    setTextReplaceConfigByScope(scope, cfg);
    currentTextReplaceScope = scope;
  }

  let textReplaceConfig = getTextReplaceConfig();

  // 阅兵模式过滤配置（按网页独立记忆）
  const defaultParadeConfig = {
    enabled: true, // 阅兵模式按钮是否显示
  };
  function getParadeFilterConfig() {
    const key = "nopic_parade_filter_" + location.host;
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
    return { minW: 1, minH: 1, maxW: 9999, maxH: 9999, enabled: false };
  }
  function getParadeConfig() {
    const key = "nopic_parade_config_" + location.host;
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
    return { ...defaultParadeConfig };
  }
  function setParadeConfig(cfg) {
    localStorage.setItem(
      "nopic_parade_config_" + location.host,
      JSON.stringify(cfg),
    );
  }
  let paradeConfig = getParadeConfig();
  function setParadeFilterConfig(cfg) {
    localStorage.setItem(
      "nopic_parade_filter_" + location.host,
      JSON.stringify(cfg),
    );
  }
  let paradeFilter = getParadeFilterConfig();

  function getLocalConfig(key) {
    const val = localStorage.getItem("nopic_local_" + key);
    return val !== null ? JSON.parse(val) : defaultConfig[key];
  }
  function setLocalConfig(key, value) {
    localStorage.setItem("nopic_local_" + key, JSON.stringify(value));
  }

  function getGlobalConfig(key) {
    const settings = GM_getValue("nopic_global_settings", {});
    return settings[key] !== undefined ? settings[key] : defaultConfig[key];
  }
  function setGlobalConfig(key, value) {
    const settings = GM_getValue("nopic_global_settings", {});
    settings[key] = value;
    GM_setValue("nopic_global_settings", settings);
  }

  let showOutlineConfig = getLocalConfig("showOutline");
  let hoverOnlyConfig = getLocalConfig("hoverOnly");
  let hoverShowImgConfig = getLocalConfig("hoverShowImg");
  let autoSnapConfig = getLocalConfig("autoSnap");
  let autoHideIdleConfig = getLocalConfig("autoHideIdle");
  let zoomModeConfig = getLocalConfig("zoomMode");
  let zoomLeaveModeConfig = getLocalConfig("zoomLeaveMode");
  let zoomPinModeConfig = getLocalConfig("zoomPinMode");
  let disableAnimationConfig = getLocalConfig("disableAnimation");
  let loadAnimationConfig =
    getGlobalConfig("loadAnimation") !== undefined
      ? getGlobalConfig("loadAnimation")
      : defaultConfig.loadAnimation;
  let statsRangeConfig = getGlobalConfig("statsRange");

  let configs = {
    time: getGlobalConfig("displayTime"),
    seconds: getGlobalConfig("displaySeconds"),
    count: getGlobalConfig("displayCount"),
    total: getGlobalConfig("displayTotal"),
    percent: getGlobalConfig("displayPercent"),
    host: getGlobalConfig("displayHost"),
    memory: getGlobalConfig("displayMemory"),
    loadTime: getGlobalConfig("displayLoadTime"),
    resCount: getGlobalConfig("displayResCount"),
    mouseDistance: getGlobalConfig("displayMouseDistance"),
    clickCount: getGlobalConfig("displayClickCount"),
    scrollDist: getGlobalConfig("displayScrollDist"),
    readChars: getGlobalConfig("displayReadChars"),
    adCount: getGlobalConfig("displayAdCount"),
  };

  let isUISelfHidden = false;
  let isSleeping = false;
  let sleepTimer = null;
  let sleepBgTimer = null;
  let lastHiddenCount = -1;
  let glowTimer = null;

  // === 阅兵模式 ===
  let isParadeMode = false;
  let paradeOverlay = null;
  let paradeHeader = null;
  let paradeClones = new Map(); // el -> { clone, originalRect, targetPos }
  let paradeDragState = {
    isDragging: false,
    wasDragged: false,
    startX: 0,
    startY: 0,
    startScreenLeft: 0,
    startScreenTop: 0,
    currentEl: null,
  };
  let paradeSavedBodyOverflow = "";
  let paradeSavedHtmlOverflow = "";
  let paradeZIndexCounter = 10;
  let paradeMenuItem = null;

  window.imgHidenSet = null;
  let imageControls = new Map();
  let imageOutlines = new Map();
  let imageZoomControls = new Map();

  let hoverZoomTimers = new Map();
  let imageTimers = new Map();
  let lastGlobalMouseX = 0,
    lastGlobalMouseY = 0;

  // 拖拽状态变量
  let isDraggingClone = false;
  let wasDragged = false;
  let dragStartX = 0,
    dragStartY = 0,
    dragStartLeft = 0,
    dragStartTop = 0;
  let draggedCloneEl = null; // 当前正在拖动的克隆图对应的原始元素

  // 钉图模式：记录每个放大元素的克隆信息
  let zoomedClones = new Map(); // el -> { clone, controls, wrapper }
  let pinZIndexCounter = 10;

  // --- 2. 样式定义 ---
  let spinnerTimer = null;
  const debounceTriggerSpinner = () => {
    clearTimeout(spinnerTimer);
    spinnerTimer = setTimeout(() => {
      triggerSpinner();
    }, 100);
  };

  // --- 3. 跳出式放大核心逻辑 ---
  let zoomContainer = document.createElement("div");
  zoomContainer.id = "nopic-zoom-container";
  document.documentElement.appendChild(zoomContainer);

  let zoomCooldown = false;

  function startCountdownIndicator(el) {
    removeCountdownIndicator(el, true);
    const outline = imageOutlines.get(el);
    if (outline) outline.style.display = "none";

    let box = document.createElement("div");
    box.className = "nopic-countdown-box";
    document.documentElement.appendChild(box);
    imageTimers.set(el, box);

    function updatePos(e) {
      if (!box.parentNode) return;
      box.style.left = e.clientX - 12 + "px";
      box.style.top = e.clientY - 12 + "px";
    }
    el._nopicMoveHandler = updatePos;
    document.addEventListener("mousemove", updatePos);
    updatePos({ clientX: lastGlobalMouseX, clientY: lastGlobalMouseY });

    requestAnimationFrame(() => {
      box.classList.add("counting");
    });
  }

  function removeCountdownIndicator(el, immediate) {
    const box = imageTimers.get(el);
    const outline = imageOutlines.get(el);
    if (outline) outline.style.display = "";
    if (el._nopicMoveHandler) {
      document.removeEventListener("mousemove", el._nopicMoveHandler);
      delete el._nopicMoveHandler;
    }
    if (box) {
      if (immediate) {
        box.remove();
      } else {
        box.style.opacity = "0";
        box.addEventListener("transitionend", function handler() {
          box.removeEventListener("transitionend", handler);
          if (box.parentNode) box.remove();
        });
        setTimeout(() => {
          if (box.parentNode) box.remove();
        }, 300);
      }
      imageTimers.delete(el);
    }
  }

  function startHoverZoomTimer(el) {
    if (document.querySelector(".nopic-clone") && !zoomPinModeConfig) return;
    cancelHoverZoomTimer(el, true);
    if (zoomCooldown || el._isZoomed) return;
    const isHidden = el.dataset.isHidden === "true";
    const shouldZoom = hoverShowImgConfig || (!hoverShowImgConfig && !isHidden);
    if (!shouldZoom) return;

    const timerId = setTimeout(() => {
      hoverZoomTimers.delete(el);
      startCountdownIndicator(el);
      const animTimer = setTimeout(() => {
        removeCountdownIndicator(el, true);
        if (el.isHovering && !el._isZoomed && !zoomCooldown) {
          zoomIn(el, imageControls.get(el), imageZoomControls.get(el), true);
        }
        hoverZoomTimers.delete(el);
      }, 1000);
      hoverZoomTimers.set(el, animTimer);
    }, 1000);

    hoverZoomTimers.set(el, timerId);
  }

  function restartHoverZoomTimer(el) {
    if (document.querySelector(".nopic-clone") && !zoomPinModeConfig) return;
    if (zoomCooldown || el._isZoomed) return;
    const isHidden = el.dataset.isHidden === "true";
    const shouldZoom = hoverShowImgConfig || (!hoverShowImgConfig && !isHidden);
    if (!shouldZoom) return;

    clearTimeout(hoverZoomTimers.get(el));

    const box = imageTimers.get(el);
    if (box) {
      box.classList.remove("counting");
      void box.offsetWidth;
      box.classList.add("counting");
    } else {
      startCountdownIndicator(el);
    }

    const animTimer = setTimeout(() => {
      removeCountdownIndicator(el, true);
      if (el.isHovering && !el._isZoomed && !zoomCooldown) {
        zoomIn(el, imageControls.get(el), imageZoomControls.get(el), true);
      }
      hoverZoomTimers.delete(el);
    }, 1000);
    hoverZoomTimers.set(el, animTimer);
  }

  function cancelHoverZoomTimer(el, immediate) {
    const timerId = hoverZoomTimers.get(el);
    if (timerId) {
      clearTimeout(timerId);
      hoverZoomTimers.delete(el);
    }
    removeCountdownIndicator(el, immediate || false);
  }

  function getCloneAtPoint(x, y) {
    const clones = Array.from(zoomContainer.querySelectorAll(".nopic-clone"));
    // 按 z-index 从高到低排序，确保先找到最上层的
    clones.sort((a, b) => {
      const za = parseInt(window.getComputedStyle(a).zIndex) || 0;
      const zb = parseInt(window.getComputedStyle(b).zIndex) || 0;
      return zb - za;
    });
    for (const clone of clones) {
      const rect = clone.getBoundingClientRect();
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      ) {
        return clone;
      }
    }
    return null;
  }

  // 根据克隆图找到对应的原始元素
  function getElByClone(clone) {
    for (const [el, info] of zoomedClones) {
      if (info.clone === clone) return el;
    }
    return null;
  }

  // ==============================
  // 阅兵模式
  // ==============================

  function getParadeCloneAtPoint(x, y) {
    if (!paradeOverlay) return null;
    const clones = Array.from(
      paradeOverlay.querySelectorAll(".nopic-parade-clone"),
    );
    clones.sort((a, b) => {
      const wa = a.parentElement;
      const wb = b.parentElement;
      const za = wa ? parseInt(wa.style.zIndex) || 0 : 0;
      const zb = wb ? parseInt(wb.style.zIndex) || 0 : 0;
      return zb - za;
    });
    for (const clone of clones) {
      const r = clone.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)
        return clone;
    }
    return null;
  }

  function getParadeElByClone(clone) {
    for (const [el, info] of paradeClones) {
      if (info.clone === clone) return el;
    }
    return null;
  }

  function enterParadeMode() {
    if (isParadeMode) {
      exitParadeMode();
      return;
    }
    paradeZIndexCounter = 10;

    // 先关闭所有已有的钉图/放大
    imageControls.forEach((btn, el) => {
      if (el._isZoomed) zoomOut(el);
    });

    const imageData = [];

    const allImages = document.querySelectorAll(
      'img:not(.nopic-clone):not(.nopic-parade-clone), svg:not(.nopic-clone):not(.nopic-parade-clone), .nopic-has-bg:not(.nopic-clone):not(.nopic-parade-clone), [style*="background-image"]:not(.nopic-clone):not(.nopic-parade-clone)',
    );
    allImages.forEach((el) => {
      if (!el.isConnected) return;
      if (el.id === "nopic-about-img" || el.closest("#nopic-about-modal"))
        return;

      // 添加和 imgHiden() 一致的过滤逻辑
      const bg = window.getComputedStyle(el).backgroundImage;
      const isTarget =
        el.tagName === "IMG" ||
        el.tagName === "SVG" ||
        (bg && bg !== "none" && bg.includes("url"));
      if (!isTarget) return;

      const rect = el.getBoundingClientRect();
      const hasText =
        (el.tagName === "DIV" || el.tagName === "SPAN") &&
        el.innerText.trim().length > 0;

      // 使用 imgHiden() 一致的过滤条件：width > 15 && height > 15 && !hasText
      if (rect.width > 15 && rect.height > 15 && !hasText) {
        if (paradeFilter.enabled) {
          const naturalW = Math.round(rect.width) || el.offsetWidth;
          const naturalH = Math.round(rect.height) || el.offsetHeight;
          if (
            naturalW < paradeFilter.minW ||
            naturalW > paradeFilter.maxW ||
            naturalH < paradeFilter.minH ||
            naturalH > paradeFilter.maxH
          )
            return;
        }
        const wasHidden = el.dataset.isHidden === "true";
        imageData.push({ el, wasHidden });
      }
    });
    if (imageData.length === 0) return;

    isParadeMode = true;
    const paradeBtn = document.querySelector('[data-action="paradeMode"]');
    if (paradeBtn) {
      const span = paradeBtn.querySelector("span");
      if (span) span.textContent = "退出阅兵";
      else paradeBtn.textContent = "退出阅兵";
    }

    // 阻止页面滚动
    paradeSavedBodyOverflow = document.body.style.overflow;
    paradeSavedHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    // 【第一步】取消所有图片隐藏状态，虚线消失
    imageData.forEach(({ el, wasHidden }) => {
      el._paradeWasHidden = wasHidden; // 记录原状态
      if (wasHidden) {
        el.classList.remove("nopic-hidden");
        el.dataset.isHidden = "false";
        const outline = imageOutlines.get(el);
        if (outline) outline.style.display = "none";
        const btn = imageControls.get(el);
        if (btn) btn.innerText = "隐";
      }
    });

    // 等待显现动画完成（0.5s）
    setTimeout(() => {
      if (!isParadeMode) return; // 防御性检查

      // 【第二步】收集最新位置并创建克隆图
      const layoutData = [];
      imageData.forEach(({ el }) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          layoutData.push({
            el,
            rect: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            },
          });
        }
      });
      if (layoutData.length === 0) {
        exitParadeMode();
        return;
      }

      // ---- 计算网格布局 ----
      const GAP = 28;
      const HEADER_H = 48;
      const SIDE_PAD = 28;
      const TOP_PAD = HEADER_H + 20;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxRowW = vw - SIDE_PAD * 2;

      const TEMP_H = 200;
      let tempRows = 0,
        tempRowW = 0;
      layoutData.forEach(({ rect }) => {
        const w = TEMP_H * (rect.width / rect.height);
        if (tempRowW + GAP + w > maxRowW && tempRowW > 0) {
          tempRows++;
          tempRowW = w + GAP;
        } else {
          tempRowW += w + (tempRowW > 0 ? GAP : 0);
        }
      });
      if (tempRowW > 0) tempRows++;

      const availH = vh - TOP_PAD - 20;
      const UNI_H = Math.min(
        280,
        Math.max(
          80,
          Math.floor(
            (availH - Math.max(0, tempRows - 1) * GAP) / Math.max(1, tempRows),
          ),
        ),
      );

      const rows = [];
      let curRow = [];
      let curRowW = 0;
      layoutData.forEach(({ el, rect }) => {
        const tw = UNI_H * (rect.width / rect.height);
        if (curRow.length > 0 && curRowW + GAP + tw > maxRowW) {
          rows.push([...curRow]);
          curRow = [];
          curRowW = 0;
        }
        curRow.push({ el, rect, tw, th: UNI_H });
        curRowW += tw + (curRow.length > 1 ? GAP : 0);
      });
      if (curRow.length > 0) rows.push(curRow);

      let curY = TOP_PAD;
      const positions = new Map();
      rows.forEach((row) => {
        const totalW = row.reduce(
          (s, it, i) => s + it.tw + (i > 0 ? GAP : 0),
          0,
        );
        let curX = Math.max(SIDE_PAD, (vw - totalW) / 2);
        row.forEach((it) => {
          positions.set(it.el, {
            left: curX,
            top: curY,
            width: it.tw,
            height: it.th,
          });
          curX += it.tw + GAP;
        });
        curY += UNI_H + GAP;
      });
      const totalH = curY + 36;

      // ---- 创建遮罩层 ----
      paradeOverlay = document.createElement("div");
      paradeOverlay.id = "nopic-parade-overlay";
      const content = document.createElement("div");
      content.className = "nopic-parade-content";
      content.style.height = totalH + "px";

      // ---- 创建顶部状态栏 ----
      paradeHeader = document.createElement("div");
      paradeHeader.id = "nopic-parade-header";
      const titleSpan = document.createElement("span");
      titleSpan.className = "nopic-parade-title";
      titleSpan.innerHTML =
        "阅兵模式 · 共 <strong>" +
        imageData.length +
        "</strong> 张图片" +
        (paradeFilter.enabled
          ? ' <span style="color:#60a5fa;font-size:11px;">(已过滤)</span>'
          : "");

      const closeBtn = document.createElement("div");
      closeBtn.className = "nopic-parade-close-btn";
      closeBtn.innerHTML = "✕";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        exitParadeMode();
      });
      paradeHeader.appendChild(titleSpan);
      paradeHeader.appendChild(closeBtn);

      // ---- 创建克隆图（初始位置=原图屏幕位置） ----
      layoutData.forEach(({ el, rect }) => {
        const tp = positions.get(el);
        el._paradeSavedVisibility = el.style.visibility;
        el.style.visibility = "hidden";
        el._isParadeZoomed = true;

        // 创建包装器，用于承载克隆图和尺寸标签
        const wrapper = document.createElement("div");
        wrapper.style.position = "absolute";
        wrapper.style.left = rect.left + "px";
        wrapper.style.top = rect.top + "px";
        wrapper.style.width = rect.width + "px";
        wrapper.style.height = rect.height + "px";
        wrapper.style.zIndex = String(++paradeZIndexCounter);
        wrapper.style.transition = "none";

        const clone = el.cloneNode(true);
        clone.id = "";
        clone.classList.remove(
          "nopic-hidden",
          "nopic-has-bg",
          "nopic-outline-box",
          "nopic-float-btn",
        );
        clone.classList.add("nopic-parade-clone");
        clone.style.setProperty("display", "block", "important");
        clone.style.setProperty("visibility", "visible", "important");
        clone.style.setProperty("opacity", "1", "important");
        clone.style.setProperty("filter", "none", "important");
        clone.style.setProperty("border", "none", "important");

        clone.style.left = "0";
        clone.style.top = "0";
        clone.style.width = "100%";
        clone.style.height = "100%";
        clone.style.filter = "drop-shadow(0 8px 24px rgba(0,0,0,0.5))";
        clone.style.boxShadow = "none";
        clone.style.setProperty("z-index", "1", "important");

        // 尺寸标签 - 显示图片在页面的渲染尺寸
        const sizeLabel = document.createElement("div");
        sizeLabel.className = "nopic-parade-size-label";
        sizeLabel.textContent =
          Math.round(rect.width) + "×" + Math.round(rect.height);

        wrapper.appendChild(clone);
        wrapper.appendChild(sizeLabel);
        content.appendChild(wrapper);

        // 保存 wrapper 引用，方便后续动画操作
        paradeClones.set(el, {
          clone,
          wrapper,
          originalRect: rect,
          targetPos: tp,
          sizeLabel,
        });
      });

      paradeOverlay.appendChild(content);
      document.documentElement.appendChild(paradeOverlay);
      document.documentElement.appendChild(paradeHeader);

      // ---- 激活遮罩 + 飞入动画 ----
      requestAnimationFrame(() => {
        paradeOverlay.classList.add("active");
        paradeHeader.classList.add("active");
        requestAnimationFrame(() => {
          // 使用与退出动画一致的平滑标准缓动，时间延长至 0.6s
          const ez = "cubic-bezier(0.4, 0, 0.2, 1)";
          paradeClones.forEach(
            ({ clone, wrapper, targetPos: tp, sizeLabel }) => {
              wrapper.style.transition =
                "left 0.6s " +
                ez +
                ", top 0.6s " +
                ez +
                ", width 0.6s " +
                ez +
                ", height 0.6s " +
                ez;
              wrapper.style.left = tp.left + "px";
              wrapper.style.top = tp.top + "px";
              wrapper.style.width = tp.width + "px";
              wrapper.style.height = tp.height + "px";
              clone.style.filter = "drop-shadow(0 8px 24px rgba(0,0,0,0.5))";
              clone.style.boxShadow = "none";
            },
          );
        });
      });

      // ---- 阅兵模式交互事件 ----
      paradeOverlay.addEventListener("click", (e) => {
        if (paradeDragState.wasDragged) {
          paradeDragState.wasDragged = false;
          return;
        }
        if (
          e.target === paradeOverlay ||
          e.target.classList.contains("nopic-parade-content")
        ) {
          exitParadeMode();
        }
      });

      paradeOverlay.addEventListener(
        "mousedown",
        (e) => {
          if (e.button !== 1) return;
          const clone = getParadeCloneAtPoint(e.clientX, e.clientY);
          if (clone) {
            e.preventDefault();
            e.stopPropagation();
            const el = getParadeElByClone(clone);
            if (el) paradeZoomOutSingle(el);
          }
        },
        true,
      );
      paradeOverlay.addEventListener(
        "auxclick",
        (e) => {
          if (e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
          }
        },
        true,
      );

      paradeOverlay.addEventListener(
        "wheel",
        (e) => {
          const clone = getParadeCloneAtPoint(e.clientX, e.clientY);
          if (!clone) return;
          e.preventDefault();
          e.stopPropagation();

          // 找到 clone 所在的 wrapper
          const wrapper = clone.parentElement;
          if (!wrapper) return;

          wrapper.style.zIndex = String(++paradeZIndexCounter);

          const rect = clone.getBoundingClientRect();
          const step = e.deltaY < 0 ? 1.1 : 0.9;
          const nw = rect.width * step;
          const nh = rect.height * step;

          const scrollLeft = paradeOverlay.scrollLeft;
          const scrollTop = paradeOverlay.scrollTop;
          const centerX = rect.left + rect.width / 2 + scrollLeft;
          const centerY = rect.top + rect.height / 2 + scrollTop;

          const newLeft = centerX - nw / 2;
          const newTop = centerY - nh / 2;

          wrapper.style.transition = "none";
          wrapper.style.left = newLeft + "px";
          wrapper.style.top = newTop + "px";
          wrapper.style.width = nw + "px";
          wrapper.style.height = nh + "px";
        },
        { passive: false },
      );

      paradeOverlay.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        const clone = getParadeCloneAtPoint(e.clientX, e.clientY);
        if (!clone) return;
        e.preventDefault();

        const wrapper = clone.parentElement;
        if (wrapper) wrapper.style.zIndex = String(++paradeZIndexCounter);

        paradeDragState.isDragging = true;
        paradeDragState.wasDragged = false;
        paradeDragState.startX = e.clientX;
        paradeDragState.startY = e.clientY;
        paradeDragState.startScreenLeft =
          parseFloat(wrapper.style.left) - paradeOverlay.scrollLeft;
        paradeDragState.startScreenTop =
          parseFloat(wrapper.style.top) - paradeOverlay.scrollTop;
        paradeDragState.currentEl = getParadeElByClone(clone);
        clone.style.setProperty("transition", "none", "important");
        clone.style.cursor = "grabbing";
      });

      document.addEventListener("mousemove", paradeDragMoveHandler);
      document.addEventListener("mouseup", paradeDragUpHandler);
    }, 100); // 等待图片显现动画完成
  }

  // 拖拽移动处理函数（独立定义，方便注销）
  function paradeDragMoveHandler(e) {
    if (!paradeDragState.isDragging || !paradeDragState.currentEl) return;
    const info = paradeClones.get(paradeDragState.currentEl);
    if (!info) return;
    const wrapper = info.wrapper;
    const dx = e.clientX - paradeDragState.startX;
    const dy = e.clientY - paradeDragState.startY;

    // 拖动时禁用过渡，确保跟手
    wrapper.style.transition = "none";

    wrapper.style.left =
      paradeDragState.startScreenLeft + dx + paradeOverlay.scrollLeft + "px";
    wrapper.style.top =
      paradeDragState.startScreenTop + dy + paradeOverlay.scrollTop + "px";
    if (Math.hypot(dx, dy) > 3) paradeDragState.wasDragged = true;
  }

  function paradeDragUpHandler(e) {
    if (!paradeDragState.isDragging) return;
    const info = paradeClones.get(paradeDragState.currentEl);
    if (info && info.clone) info.clone.style.cursor = "grab";
    paradeDragState.isDragging = false;
    paradeDragState.currentEl = null;
  }

  // ===== 退出阅兵模式 =====
  function exitParadeMode() {
    if (!isParadeMode) return;
    isParadeMode = false;
    const paradeBtn = document.querySelector('[data-action="paradeMode"]');
    if (paradeBtn) {
      const span = paradeBtn.querySelector("span");
      if (span) span.textContent = "开启阅兵";
      else paradeBtn.textContent = "开启阅兵";
    }

    // 注销拖拽监听
    document.removeEventListener("mousemove", paradeDragMoveHandler);
    document.removeEventListener("mouseup", paradeDragUpHandler);

    const scrollLeft = paradeOverlay.scrollLeft;
    const scrollTop = paradeOverlay.scrollTop;

    // 第一步：克隆图飞回原位
    paradeClones.forEach(
      (
        { clone, wrapper, originalRect: rect, targetPos: tp, sizeLabel },
        el,
      ) => {
        if (!el.isConnected) {
          wrapper.remove();
          return;
        }

        const curRect = el.getBoundingClientRect();
        const flyLeft = curRect.left + scrollLeft;
        const flyTop = curRect.top + scrollTop;

        const ez = "cubic-bezier(0.25, 0.1, 0.25, 1)";
        wrapper.style.transition =
          "left 0.55s " +
          ez +
          ", top 0.55s " +
          ez +
          ", width 0.55s " +
          ez +
          ", height 0.55s " +
          ez;
        wrapper.style.left = flyLeft + "px";
        wrapper.style.top = flyTop + "px";
        wrapper.style.width = curRect.width + "px";
        wrapper.style.height = curRect.height + "px";
        clone.style.filter = "none";
        clone.style.boxShadow = "none";
        clone.style.pointerEvents = "none";
      },
    );

    // 第二步：等飞回动画彻底结束后(550ms)，再淡出遮罩
    setTimeout(() => {
      if (paradeOverlay) paradeOverlay.classList.remove("active");
      if (paradeHeader) paradeHeader.classList.remove("active");

      // 第三步：等遮罩淡出后(300ms)，清理DOM并恢复原图状态
      setTimeout(() => {
        paradeClones.forEach(({ wrapper }, el) => {
          if (el.isConnected) {
            el.style.visibility =
              el._paradeSavedVisibility !== undefined
                ? el._paradeSavedVisibility
                : "";
            delete el._paradeSavedVisibility;
            delete el._isParadeZoomed;

            if (el._paradeWasHidden) {
              el.classList.add("nopic-hidden");
              el.dataset.isHidden = "true";
              const outline = imageOutlines.get(el);
              if (outline) outline.style.display = "";
              const btn = imageControls.get(el);
              if (btn) btn.innerText = "显";
              delete el._paradeWasHidden;
              syncElementPosition(el);
            }
          }
          if (wrapper && wrapper.parentNode) wrapper.remove();
        });
        paradeClones.clear();

        if (paradeOverlay && paradeOverlay.parentNode) paradeOverlay.remove();
        paradeOverlay = null;
        if (paradeHeader && paradeHeader.parentNode) paradeHeader.remove();
        paradeHeader = null;

        // 恢复页面滚动
        document.body.style.overflow = paradeSavedBodyOverflow;
        document.documentElement.style.overflow = paradeSavedHtmlOverflow;
      }, 300); // 遮罩淡出时间
    }, 550); // 飞回动画时间
    updateAllUI();
  }

  // ===== 单图飞回原位（阅兵模式下中键点击） =====
  function paradeZoomOutSingle(el) {
    const info = paradeClones.get(el);
    if (!info) return;
    const { clone, originalRect: rect, targetPos: tp } = info;

    if (!el.isConnected) {
      clone.remove();
      paradeClones.delete(el);
      delete el._isParadeZoomed;
      if (paradeClones.size === 0) exitParadeMode();
      return;
    }

    const curRect = el.getBoundingClientRect();
    const scrollLeft = paradeOverlay.scrollLeft;
    const scrollTop = paradeOverlay.scrollTop;
    const flyLeft = curRect.left + scrollLeft;
    const flyTop = curRect.top + scrollTop;

    const ez = "cubic-bezier(0.25, 0.1, 0.25, 1)"; // 更平滑的减速曲线
    clone.style.setProperty(
      "transition",
      "left 0.45s " +
        ez +
        ", top 0.45s " +
        ez +
        ", width 0.45s " +
        ez +
        ", height 0.45s " +
        ez +
        ", box-shadow 0.45s " +
        ez,
      "important",
    );

    clone.style.left = flyLeft + "px";
    clone.style.top = flyTop + "px";
    clone.style.width = curRect.width + "px";
    clone.style.height = curRect.height + "px";
    clone.style.filter = "none";
    clone.style.boxShadow = "none";
    clone.style.pointerEvents = "none";

    setTimeout(() => {
      const info = paradeClones.get(el);
      if (info && info.wrapper && info.wrapper.parentNode)
        info.wrapper.remove();
      paradeClones.delete(el);

      // 恢复原图可见
      el.style.visibility =
        el._paradeSavedVisibility !== undefined
          ? el._paradeSavedVisibility
          : "";
      delete el._paradeSavedVisibility;
      delete el._isParadeZoomed;

      // 还原原来隐藏的状态
      if (el._paradeWasHidden) {
        el.classList.add("nopic-hidden");
        el.dataset.isHidden = "true";
        const outline = imageOutlines.get(el);
        if (outline) outline.style.display = "";
        const btn = imageControls.get(el);
        if (btn) btn.innerText = "显";
        delete el._paradeWasHidden;
        syncElementPosition(el);
      }

      if (paradeClones.size === 0) exitParadeMode();
    }, 500); // 延长清理时间，确保动画完成
  }

  function zoomIn(el, btn, zoomBtn, fromHover) {
    if (el._isZoomed || zoomCooldown) return;
    if (isParadeMode) return; // 确保有这行
    cancelHoverZoomTimer(el, true);
    el._isZoomed = true;

    const outline = imageOutlines.get(el);
    if (outline) outline.style.display = "none";

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      el._isZoomed = false;
      return;
    }

    el._savedVisibility = el.style.visibility;
    el.style.visibility = "hidden";

    // zoomIn 函数中，创建 clone 后添加（第 1295-1315 行附近）
    let clone = el.cloneNode(true);
    clone.id = "";
    clone.classList.remove(
      "nopic-hidden",
      "nopic-has-bg",
      "nopic-outline-box",
      "nopic-float-btn",
    );
    clone.classList.add("nopic-clone");

    // ★★★ 添加阅兵模式的样式覆盖 ★★★
    clone.style.setProperty("display", "block", "important");
    clone.style.setProperty("visibility", "visible", "important");
    clone.style.setProperty("opacity", "1", "important");
    clone.style.setProperty("filter", "none", "important");
    clone.style.setProperty("border", "none", "important");
    clone.style.setProperty("max-width", "none", "important");
    clone.style.setProperty("max-height", "none", "important");
    clone.style.setProperty("min-width", "0", "important");
    clone.style.setProperty("min-height", "0", "important");
    // 如果是 img，还要重置 object-fit
    if (clone.tagName === "IMG") {
      clone.style.setProperty("object-fit", "fill", "important");
    }

    clone.style.left = rect.left + "px";
    clone.style.top = rect.top + "px";
    clone.style.width = rect.width + "px";
    clone.style.height = rect.height + "px";
    clone.style.filter = "drop-shadow(0 15px 30px rgba(0,0,0,0.6))";
    clone.style.boxShadow = "none";

    const vw = window.innerWidth * 0.9;
    const vh = window.innerHeight * 0.9;
    const targetScale = Math.min(vw / rect.width, vh / rect.height, 5);
    const targetWidth = rect.width * targetScale;
    const targetHeight = rect.height * targetScale;
    const targetLeft = (window.innerWidth - targetWidth) / 2;
    const targetTop = (window.innerHeight - targetHeight) / 2;

    // 钉图模式：不清空容器，支持多图共存
    if (!zoomPinModeConfig) {
      zoomContainer.innerHTML = "";
      zoomContainer.classList.add("active");
    }

    zoomContainer.appendChild(clone);

    // 钉图模式：添加独立关闭按钮
    let closeBtn = null;
    if (zoomPinModeConfig) {
      closeBtn = document.createElement("div");
      closeBtn.className = "nopic-pin-close-btn";
      closeBtn.innerHTML = "×";
      closeBtn.style.transition = "none";
      closeBtn.style.left = "auto";
      closeBtn.style.top = "-10px";
      closeBtn.style.right = "-10px";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        zoomOut(el);
      });
      clone.appendChild(closeBtn); // 塞进 clone 里，跟着走
    } else {
      // 聚焦模式：顶部控制栏
      let showCloseBtn =
        !fromHover || (fromHover && zoomLeaveModeConfig === "button");
      if (showCloseBtn) {
        let controlPanel = document.createElement("div");
        controlPanel.className = "nopic-zoom-controls";
        let closeBtn2 = document.createElement("div");
        closeBtn2.className = "nopic-float-btn";
        closeBtn2.innerHTML = "×";
        closeBtn2.style.fontSize = "20px";
        closeBtn2.addEventListener("click", (e) => {
          e.stopPropagation();
          zoomOut(el);
        });
        controlPanel.appendChild(closeBtn2);
        zoomContainer.appendChild(controlPanel);
      }
    }

    // 记录克隆信息
    zoomedClones.set(el, { clone: clone, closeBtn: closeBtn });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const easing = "cubic-bezier(0.16, 1, 0.3, 1)";
        clone.style.setProperty(
          "transition",
          "left 0.45s " +
            easing +
            ", top 0.45s " +
            easing +
            ", width 0.45s " +
            easing +
            ", height 0.45s " +
            easing +
            ", box-shadow 0.45s " +
            easing,
          "important",
        );

        clone.style.left = targetLeft + "px";
        clone.style.top = targetTop + "px";
        clone.style.width = targetWidth + "px";
        clone.style.height = targetHeight + "px";
        clone.style.filter = "drop-shadow(0 15px 30px rgba(0,0,0,0.6))";
        clone.style.boxShadow = "none";
      });
    });
  }

  function zoomOut(el) {
    if (!el._isZoomed) return;
    el._isZoomed = false;

    const info = zoomedClones.get(el);
    const clone = info ? info.clone : null;
    const closeBtn = info ? info.closeBtn : null;

    if (clone && el.isConnected) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        // === 原有逻辑：原位置还在，飞回原位（一字未动） ===
        const easing = "cubic-bezier(0.4, 0, 0.2, 1)";
        clone.style.setProperty(
          "transition",
          "left 0.35s " +
            easing +
            ", top 0.35s " +
            easing +
            ", width 0.35s " +
            easing +
            ", height 0.35s " +
            easing +
            ", box-shadow 0.35s " +
            easing +
            ", opacity 0.25s ease",
          "important",
        );
        clone.style.left = rect.left + "px";
        clone.style.top = rect.top + "px";
        clone.style.width = rect.width + "px";
        clone.style.height = rect.height + "px";
        clone.style.opacity = "0";
        clone.style.filter = "none";
        clone.style.boxShadow = "none";
      } else {
        // === 新增逻辑：原图位置无效，原地高斯模糊+透明度降低 ===
        const easing = "cubic-bezier(0.4, 0, 0.2, 1)";
        clone.style.setProperty(
          "transition",
          "filter 0.4s " + easing + ", opacity 0.4s " + easing,
          "important",
        );
        clone.style.setProperty("filter", "blur(20px)", "important");
        clone.style.setProperty("opacity", "0", "important");
      }
    } else if (clone) {
      // === 新增逻辑：原图已不在文档流，原地高斯模糊+透明度降低 ===
      const easing = "cubic-bezier(0.4, 0, 0.2, 1)";
      clone.style.setProperty(
        "transition",
        "filter 0.4s " + easing + ", opacity 0.4s " + easing,
        "important",
      );
      clone.style.setProperty("filter", "blur(20px)", "important");
      clone.style.setProperty("opacity", "0", "important");
    }

    if (!zoomPinModeConfig) {
      zoomContainer.classList.remove("active");
    }
    zoomCooldown = true;
    setTimeout(() => {
      zoomCooldown = false;
    }, 300);

    setTimeout(() => {
      if (el._savedVisibility !== undefined)
        el.style.visibility = el._savedVisibility;
      delete el._savedVisibility;
      const outline = imageOutlines.get(el);
      if (outline) outline.style.display = "";

      if (clone && clone.parentNode) clone.remove();
      zoomedClones.delete(el);

      // 非钉图模式下，彻底清空容器内残留的控制面板等DOM，防止幽灵点击
      if (!zoomPinModeConfig) {
        zoomContainer.innerHTML = "";
      }
    }, 450);
  }

  // 滚轮缩放 - 钉图模式下精准定位到鼠标下的图
  zoomContainer.addEventListener(
    "wheel",
    (e) => {
      let clone = getCloneAtPoint(e.clientX, e.clientY);

      // 非钉图模式（聚焦模式）：只要有放大图，滚轮在容器任何位置都有效，作用于当前唯一图
      if (!clone && !zoomPinModeConfig) {
        const clones = zoomContainer.querySelectorAll(".nopic-clone");
        if (clones.length > 0) clone = clones[clones.length - 1];
      }

      if (!clone) {
        // 钉图模式下且鼠标不在任何图上，不拦截，让页面滚动
        if (zoomPinModeConfig) return;
        // 聚焦模式下没有图也不处理
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      clone.style.zIndex = ++pinZIndexCounter;

      const rect = clone.getBoundingClientRect();
      const scaleStep = e.deltaY < 0 ? 1.1 : 0.9;
      let newWidth = rect.width * scaleStep;
      let newHeight = rect.height * scaleStep;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const newLeft = centerX - newWidth / 2;
      const newTop = centerY - newHeight / 2;

      clone.style.setProperty("transition", "none", "important");
      clone.style.left = newLeft + "px";
      clone.style.top = newTop + "px";
      clone.style.width = newWidth + "px";
      clone.style.height = newHeight + "px";
    },
    { passive: false },
  );

  // 拖动逻辑 - 支持多图独立拖动
  zoomContainer.addEventListener("mousedown", (e) => {
    const clone = getCloneAtPoint(e.clientX, e.clientY);
    if (!clone || e.button !== 0) return;
    e.preventDefault();
    clone.style.zIndex = ++pinZIndexCounter;
    isDraggingClone = true;
    wasDragged = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartLeft = parseFloat(clone.style.left);
    dragStartTop = parseFloat(clone.style.top);
    draggedCloneEl = getElByClone(clone);
    clone.style.setProperty("transition", "none", "important");
    clone.style.cursor = "grabbing !important";
    zoomContainer.style.cursor = "grabbing";
  });

  document.addEventListener("mouseup", (e) => {
    if (!isDraggingClone) return;
    isDraggingClone = false;
    const clone = draggedCloneEl
      ? zoomedClones.get(draggedCloneEl)?.clone
      : null;
    if (clone) clone.style.cursor = "grab !important";
    zoomContainer.style.cursor = "";
    if (Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) > 3)
      wasDragged = true;
    draggedCloneEl = null;
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDraggingClone || !draggedCloneEl) return;
    const info = zoomedClones.get(draggedCloneEl);
    if (!info || !info.clone) return;
    const clone = info.clone;
    const newLeft = dragStartLeft + e.clientX - dragStartX;
    const newTop = dragStartTop + e.clientY - dragStartY;
    clone.style.left = newLeft + "px";
    clone.style.top = newTop + "px";
  });

  // 鼠标移出检测 - 仅聚焦模式且"离开图片"选项时生效
  zoomContainer.addEventListener("mousemove", (e) => {
    if (isDraggingClone) return;
    if (
      zoomModeConfig === "hover" &&
      zoomLeaveModeConfig === "leave" &&
      !zoomPinModeConfig
    ) {
      if (zoomCooldown) return;
      const clone = zoomContainer.querySelector(".nopic-clone");
      if (clone) {
        const rect = clone.getBoundingClientRect();
        const margin = 5;
        const isOutside =
          e.clientX < rect.left - margin ||
          e.clientX > rect.right + margin ||
          e.clientY < rect.top - margin ||
          e.clientY > rect.bottom + margin;
        if (isOutside) {
          imageControls.forEach((btn, el) => {
            if (el._isZoomed) zoomOut(el);
          });
        }
      }
    }
  });

  zoomContainer.addEventListener("click", (e) => {
    if (wasDragged) {
      wasDragged = false;
      e.stopPropagation();
      return;
    }
    // 点击放大图片本身也能关闭（钉图模式和聚焦模式都支持）
    const clickedClone = e.target.closest(".nopic-clone");
    if (clickedClone) {
      const el = getElByClone(clickedClone);
      if (el && el._isZoomed) {
        zoomOut(el);
        e.stopPropagation();
        return;
      }
    }
    // 聚焦模式下点击空白区关闭
    if (e.target === zoomContainer && !zoomPinModeConfig) {
      zoomedClones.forEach((info, el) => {
        if (el._isZoomed) zoomOut(el);
      });
    }
  });

  // --- 4. 图片控制逻辑 ---
  const syncElementPosition = (el) => {
    const btn = imageControls.get(el),
      outline = imageOutlines.get(el),
      zoomBtn = imageZoomControls.get(el);
    if (!el || !el.isConnected) {
      btn?.remove();
      outline?.remove();
      zoomBtn?.remove();
      imageControls.delete(el);
      imageOutlines.delete(el);
      imageZoomControls.delete(el);
      cancelHoverZoomTimer(el, true);
      return;
    }
    let top = el.offsetTop,
      left = el.offsetLeft;
    const width = el.offsetWidth,
      height = el.offsetHeight;
    if (outline && outline.parentElement) {
      const parent = outline.parentElement,
        imgRect = el.getBoundingClientRect(),
        parentRect = parent.getBoundingClientRect();
      const pStyle = window.getComputedStyle(parent);
      top =
        imgRect.top -
        parentRect.top +
        parent.scrollTop -
        (parseFloat(pStyle.borderTopWidth) || 0);
      left =
        imgRect.left -
        parentRect.left +
        parent.scrollLeft -
        (parseFloat(pStyle.borderLeftWidth) || 0);
    }
    if (width <= 0 || height <= 0) {
      if (btn) btn.style.display = "none";
      if (outline) outline.style.display = "none";
      if (zoomBtn) zoomBtn.style.display = "none";
      return;
    } else {
      if (btn) btn.style.display = "flex";
      if (outline) outline.style.display = "block";
      if (zoomBtn) zoomBtn.style.display = "flex";
    }

    // 计算悬停状态（需要在前面定义，供后面使用）
    const effectiveHover = !!(el.isHovering || el._btnHovering);

    if (btn) {
      // 【修改】始终隐藏"显/隐"按钮，只通过悬停控制显示（由 syncElementPosition 末尾统一控制）
      btn.style.left = left + 6 + "px";
      btn.style.top = top + 6 + "px";
    }
    if (zoomBtn) {
      const btnWidth = parseFloat(btn.style.width) || 30;
      zoomBtn.style.left = left + 6 + btnWidth + 4 + "px";
      zoomBtn.style.top = top + 6 + "px";
    }
    if (outline) {
      outline.style.left = left + "px";
      outline.style.top = top + "px";
      outline.style.width = width + "px";
      outline.style.height = height + "px";
      const isHidden = el.dataset.isHidden === "true";
      if (isHidden) {
        hoverShowImgConfig && el.isHovering
          ? el.classList.remove("nopic-hidden")
          : !el.classList.contains("nopic-hidden") &&
            el.classList.add("nopic-hidden");
      } else {
        el.classList.remove("nopic-hidden");
      }
      let shouldBeVisible =
        isHidden && showOutlineConfig && (!hoverOnlyConfig || effectiveHover);
      if (hoverShowImgConfig && effectiveHover) shouldBeVisible = false;
      outline.classList.toggle("nopic-outline-active", !!shouldBeVisible);
      // ★★★ 核心修改：按钮和放大按钮只在使用悬停显示时显示 ★★★
      const showBtn = !!effectiveHover && !hoverShowImgConfig;
      btn.classList.toggle("nopic-btn-active", showBtn);
      // 控制显隐按钮的显示/隐藏
      btn.style.opacity = showBtn ? "1" : "0";
      btn.style.pointerEvents = showBtn ? "auto" : "none";
      if (zoomBtn) {
        zoomBtn.style.opacity = showZoomBtn ? "1" : "0";
        zoomBtn.style.pointerEvents = showZoomBtn ? "auto" : "none";
      }
    }
  };

  document.addEventListener("mousemove", (e) => {
    lastGlobalMouseX = e.clientX;
    lastGlobalMouseY = e.clientY;
    if (window.imgHidenSet === null) return;
    // ★【修改1】阅兵模式下屏蔽原页面hover逻辑
    if (isParadeMode) return;
    // 钉图模式下，鼠标在克隆图上时不触发原图hover逻辑
    if (getCloneAtPoint(e.clientX, e.clientY)) return;
    if (document.querySelector(".nopic-clone") && !zoomPinModeConfig) return;
    imageControls.forEach((btn, el) => {
      if (el._isZoomed) return;
      const rect = el.getBoundingClientRect();
      const wasHovering = el.isHovering;
      const margin = 10;
      let isInsideImage =
        e.clientX >= rect.left - margin &&
        e.clientX <= rect.right + margin &&
        e.clientY >= rect.top - margin &&
        e.clientY <= rect.bottom + margin;
      let isInsideBtnArea = false;
      if (!isInsideImage) {
        // 只有"关闭悬停显图 + 点击放大"时，才扩大可触碰区域到"放"按钮
        const expandHitArea = zoomModeConfig === "click" && !hoverShowImgConfig;
        const hitAreaWidth = expandHitArea ? 104 : 4;
        isInsideBtnArea =
          e.clientX >= rect.left + 4 &&
          e.clientX <= rect.left + hitAreaWidth &&
          e.clientY >= rect.top + 4 &&
          e.clientY <= rect.top + hitAreaWidth;
      }
      const isInside = isInsideImage || isInsideBtnArea;

      if (zoomModeConfig === "hover") {
        if (isInside) {
          if (!wasHovering) {
            el.isHovering = true;
            startHoverZoomTimer(el);
          } else {
            if (imageTimers.has(el)) {
              restartHoverZoomTimer(el);
            } else if (hoverZoomTimers.has(el)) {
              startHoverZoomTimer(el);
            }
          }
          syncElementPosition(el);
        } else if (!isInside && wasHovering) {
          el.isHovering = false;
          cancelHoverZoomTimer(el, false);
          syncElementPosition(el);
        }
      } else {
        if (isInside !== wasHovering) {
          el.isHovering = isInside;
          syncElementPosition(el);
        }
      }
    });
  });

  // 中键 mousedown：处理放大/关闭
  document.addEventListener(
    "mousedown",
    (e) => {
      if (e.button !== 1) return;
      const isRedLight = window.imgHidenSet === null;

      // 红灯状态下，hover和click逻辑上等同于middle
      let effectiveZoomMode = zoomModeConfig;
      if (
        isRedLight &&
        (zoomModeConfig === "hover" || zoomModeConfig === "click")
      ) {
        effectiveZoomMode = "middle";
      }

      // 红灯状态下，如果有效模式是关，直接返回（保留原生中键行为，如打开链接）
      if (isRedLight && effectiveZoomMode === "off") return;

      // ★【修改2】阅兵模式下的中键由遮罩层事件处理，此处不干预
      if (isParadeMode) return;

      const clone = getCloneAtPoint(e.clientX, e.clientY);
      if (clone) {
        e.preventDefault();
        e.stopPropagation();
        const el = getElByClone(clone);
        if (el && el._isZoomed) zoomOut(el);
        return;
      }

      let targetEl = null;
      if (isRedLight) {
        // 红灯状态：动态遍历查找目标图片（因为此时 imageControls 被清空了）
        const allEls = document.querySelectorAll(
          'img, svg, .nopic-has-bg, [style*="background-image"]',
        );
        for (const el of allEls) {
          if (
            el._isZoomed ||
            el.classList.contains("nopic-clone") ||
            el.classList.contains("nopic-parade-clone")
          )
            continue;
          const rect = el.getBoundingClientRect();
          const margin = 10;
          if (
            e.clientX >= rect.left - margin &&
            e.clientX <= rect.right + margin &&
            e.clientY >= rect.top - margin &&
            e.clientY <= rect.bottom + margin
          ) {
            const bg = window.getComputedStyle(el).backgroundImage;
            const isTarget =
              el.tagName === "IMG" ||
              el.tagName === "SVG" ||
              (bg && bg !== "none" && bg.includes("url"));
            const hasText =
              (el.tagName === "DIV" || el.tagName === "SPAN") &&
              el.innerText.trim().length > 0;
            if (isTarget && rect.width > 15 && rect.height > 15 && !hasText) {
              targetEl = el;
              break;
            }
          }
        }
      } else {
        // 绿灯状态：从控件记录中查找
        imageControls.forEach((btn, el) => {
          if (el._isZoomed) return;
          const rect = el.getBoundingClientRect();
          const margin = 10;
          if (
            e.clientX >= rect.left - margin &&
            e.clientX <= rect.right + margin &&
            e.clientY >= rect.top - margin &&
            e.clientY <= rect.bottom + margin
          ) {
            targetEl = el;
          }
        });
      }

      if (targetEl && effectiveZoomMode === "middle") {
        e.preventDefault();
        e.stopPropagation();
        // 红灯状态允许直接放大；绿灯状态按原逻辑判断
        const isHidden = targetEl.dataset.isHidden === "true";
        const shouldZoom =
          isRedLight ||
          hoverShowImgConfig ||
          (!hoverShowImgConfig && !isHidden);
        if (shouldZoom && !targetEl._isZoomed && !zoomCooldown) {
          const btn = imageControls.get(targetEl);
          const zoomBtn = imageZoomControls.get(targetEl);
          zoomIn(targetEl, btn, zoomBtn, false);
        }
        return;
      }

      if (!zoomPinModeConfig && document.querySelector(".nopic-clone")) {
        e.preventDefault();
        e.stopPropagation();
        imageControls.forEach((btn, el) => {
          if (el._isZoomed) zoomOut(el);
        });
      }
    },
    true,
  );

  // 中键 auxclick：兜底阻止默认行为
  document.addEventListener(
    "auxclick",
    (e) => {
      if (e.button !== 1) return;
      const isRedLight = window.imgHidenSet === null;

      // 红灯状态下，hover和click逻辑上等同于middle
      let effectiveZoomMode = zoomModeConfig;
      if (
        isRedLight &&
        (zoomModeConfig === "hover" || zoomModeConfig === "click")
      ) {
        effectiveZoomMode = "middle";
      }

      const clone = getCloneAtPoint(e.clientX, e.clientY);
      if (clone) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      let hitImage = false;
      if (isRedLight) {
        // 红灯状态：动态遍历查找目标图片
        const allEls = document.querySelectorAll(
          'img, svg, .nopic-has-bg, [style*="background-image"]',
        );
        for (const el of allEls) {
          if (
            el.classList.contains("nopic-clone") ||
            el.classList.contains("nopic-parade-clone")
          )
            continue;
          const rect = el.getBoundingClientRect();
          const margin = 10;
          if (
            e.clientX >= rect.left - margin &&
            e.clientX <= rect.right + margin &&
            e.clientY >= rect.top - margin &&
            e.clientY <= rect.bottom + margin
          ) {
            const bg = window.getComputedStyle(el).backgroundImage;
            const isTarget =
              el.tagName === "IMG" ||
              el.tagName === "SVG" ||
              (bg && bg !== "none" && bg.includes("url"));
            const hasText =
              (el.tagName === "DIV" || el.tagName === "SPAN") &&
              el.innerText.trim().length > 0;
            if (isTarget && rect.width > 15 && rect.height > 15 && !hasText) {
              hitImage = true;
              break;
            }
          }
        }
      } else {
        imageControls.forEach((btn, el) => {
          const rect = el.getBoundingClientRect();
          const margin = 10;
          if (
            e.clientX >= rect.left - margin &&
            e.clientX <= rect.right + margin &&
            e.clientY >= rect.top - margin &&
            e.clientY <= rect.bottom + margin
          ) {
            hitImage = true;
          }
        });
      }

      // 红灯状态下且有效模式为中键，也需阻止超链接新标签页打开
      if (
        hitImage &&
        (window.imgHidenSet !== null ||
          (isRedLight && effectiveZoomMode === "middle"))
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );

  let createControlButton = function (el) {
    if (imageControls.has(el)) return;
    // 跳过赞助二维码和关于弹窗内的图片
    if (el.id === "nopic-about-img" || el.closest("#nopic-about-modal")) return;
    let imgStyle = window.getComputedStyle(el),
      parent;
    if (imgStyle.position !== "absolute" && imgStyle.position !== "fixed")
      parent = el.parentElement || document.body;
    else parent = el.offsetParent || document.body;
    if (window.getComputedStyle(parent).position === "static")
      parent.style.position = "relative";
    const rect = el.getBoundingClientRect(),
      baseSize = Math.max(
        20,
        Math.min(32, Math.min(rect.width, rect.height) * 0.4),
      );
    let imgZ = imgStyle.zIndex,
      targetZ = imgZ !== "auto" && !isNaN(imgZ) ? parseInt(imgZ) : 1;

    let outline = document.createElement("div");
    outline.className = "nopic-outline-box";
    outline.style.zIndex = targetZ;
    parent.appendChild(outline);
    imageOutlines.set(el, outline);

    let button = document.createElement("div");
    button.className = "nopic-float-btn";
    button.innerText = "显";
    button.style.width = baseSize * 1.2 + "px";
    button.style.height = baseSize + "px";
    button.style.fontSize = Math.max(11, baseSize * 0.5) + "px";
    button.style.zIndex = targetZ + 1;
    button.addEventListener("mouseenter", () => {
      el._btnHovering = true;
      syncElementPosition(el);
    });
    button.addEventListener("mouseleave", () => {
      el._btnHovering = false;
      const rect = el.getBoundingClientRect();
      const inImg =
        lastGlobalMouseX >= rect.left - 10 &&
        lastGlobalMouseX <= rect.right + 10 &&
        lastGlobalMouseY >= rect.top - 10 &&
        lastGlobalMouseY <= rect.bottom + 10;
      const inBtnArea =
        lastGlobalMouseX >= rect.left + 4 &&
        lastGlobalMouseX <= rect.left + 104 &&
        lastGlobalMouseY >= rect.top + 4 &&
        lastGlobalMouseY <= rect.top + 40;
      if (!inImg && !inBtnArea) {
        el.isHovering = false;
        if (zoomModeConfig === "hover") cancelHoverZoomTimer(el, false);
      }
      syncElementPosition(el);
    });
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const isCurrentlyHidden = el.dataset.isHidden === "true";
      el.dataset.isHidden = isCurrentlyHidden ? "false" : "true";
      button.innerText = isCurrentlyHidden ? "隐" : "显";
      syncElementPosition(el);
      if (!isCurrentlyHidden && zoomModeConfig === "hover") {
        const rect = el.getBoundingClientRect();
        if (
          lastGlobalMouseX >= rect.left &&
          lastGlobalMouseX <= rect.right &&
          lastGlobalMouseY >= rect.top &&
          lastGlobalMouseY <= rect.bottom
        ) {
          startHoverZoomTimer(el);
        }
      }
    });
    parent.appendChild(button);
    imageControls.set(el, button);

    // 只有在【点击放大】或【悬停放大且开启悬停显图】时才生成"放"按钮
    if (
      zoomModeConfig === "click" ||
      (zoomModeConfig === "hover" && hoverShowImgConfig)
    ) {
      let zoomBtn = document.createElement("div");
      zoomBtn.className = "nopic-float-btn";
      zoomBtn.innerText = "放";
      zoomBtn.style.width = baseSize * 1.2 + "px";
      zoomBtn.style.height = baseSize + "px";
      zoomBtn.style.fontSize = Math.max(11, baseSize * 0.5) + "px";
      zoomBtn.style.zIndex = targetZ + 1;
      zoomBtn.addEventListener("mouseenter", () => {
        el._btnHovering = true;
        syncElementPosition(el);
      });
      zoomBtn.addEventListener("mouseleave", () => {
        el._btnHovering = false;
        const rect = el.getBoundingClientRect();
        const inImg =
          lastGlobalMouseX >= rect.left - 10 &&
          lastGlobalMouseX <= rect.right + 10 &&
          lastGlobalMouseY >= rect.top - 10 &&
          lastGlobalMouseY <= rect.bottom + 10;
        const inBtnArea =
          lastGlobalMouseX >= rect.left + 4 &&
          lastGlobalMouseX <= rect.left + 104 &&
          lastGlobalMouseY >= rect.top + 4 &&
          lastGlobalMouseY <= rect.top + 40;
        if (!inImg && !inBtnArea) {
          el.isHovering = false;
        }
        syncElementPosition(el);
      });
      zoomBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!el._isZoomed) {
          if (el.dataset.isHidden === "true") {
            el.dataset.isHidden = "false";
            button.innerText = "隐";
            el.classList.remove("nopic-hidden");
            syncElementPosition(el);
          }
          zoomIn(el, button, zoomBtn);
        } else {
          zoomOut(el);
        }
      });
      parent.appendChild(zoomBtn);
      imageZoomControls.set(el, zoomBtn);
    }

    el.dataset.isHidden = "true";
    if (window.getComputedStyle(el).backgroundImage !== "none")
      el.classList.add("nopic-has-bg");
    el.classList.add("nopic-hidden");
    syncElementPosition(el);
    debounceTriggerSpinner();
  };

  let imgHiden = function () {
    // ===== 新增：如果被手动关闭，直接返回 =====
    if (window._nopicManuallyClosed) {
      console.log("[nopic] 图片隐藏功能已被手动关闭，跳过启动");
      return;
    }
    // 新增：根据配置切换动画禁用类
    if (disableAnimationConfig) {
      document.body.classList.add("nopic-animation-disabled");
    } else {
      document.body.classList.remove("nopic-animation-disabled");
    }
    imageControls.forEach((btn, el) => {
      if (!el.isConnected) {
        btn?.remove();
        imageOutlines.get(el)?.remove();
        imageZoomControls.get(el)?.remove();
        imageControls.delete(el);
        imageOutlines.delete(el);
        imageZoomControls.delete(el);
        cancelHoverZoomTimer(el, true);
      } else {
        syncElementPosition(el);
      }
    });
    // ★【修改3】排除阅兵克隆图，防止被重复控制
    document
      .querySelectorAll(
        'img:not(.nopic-clone):not(.nopic-parade-clone), svg:not(.nopic-clone):not(.nopic-parade-clone), .nopic-has-bg:not(.nopic-clone):not(.nopic-parade-clone), [style*="background-image"]:not(.nopic-clone):not(.nopic-parade-clone)',
      )
      .forEach((el) => {
        // 跳过赞助二维码和关于弹窗内的图片
        if (el.id === "nopic-about-img" || el.closest("#nopic-about-modal"))
          return;
        const bg = window.getComputedStyle(el).backgroundImage,
          isTarget =
            el.tagName === "IMG" ||
            el.tagName === "SVG" ||
            (bg && bg !== "none" && bg.includes("url"));
        if (isTarget) {
          const rect = el.getBoundingClientRect();
          const hasText =
            (el.tagName === "DIV" || el.tagName === "SPAN") &&
            el.innerText.trim().length > 0;
          if (
            rect.width > 15 &&
            rect.height > 15 &&
            !hasText &&
            !imageControls.has(el)
          )
            createControlButton(el);
        }
      });
  };

  function imgShown() {
    // ===== 新增：彻底停止图片隐藏功能 =====
    // 1. 清除所有定时器
    if (window.imgHidenSet) {
      clearInterval(window.imgHidenSet);
      window.imgHidenSet = null;
    }

    // 2. 标记功能已关闭，防止任何启动逻辑重新触发
    window._nopicManuallyClosed = true;

    // 3. 停止所有悬停定时器
    hoverZoomTimers.forEach((timerId, el) => clearTimeout(timerId));
    hoverZoomTimers.clear();
    imageTimers.forEach((svg, el) => {
      if (svg.parentNode) svg.remove();
    });
    imageTimers.clear();

    // 4. 清理所有图片控制元素
    imageControls.forEach((btn, el) => {
      if (disableAnimationConfig) {
        el.style.setProperty("transition", "none", "important");
      } else {
        el.style.removeProperty("transition");
      }
      el.classList.remove("nopic-hidden");
      el.dataset.isHidden = "false";
      btn.remove();
      if (el._isZoomed) zoomOut(el);
      const zoomBtn = imageZoomControls.get(el);
      if (zoomBtn) zoomBtn.remove();
    });
    imageOutlines.forEach((otl) => otl.remove());
    imageControls.clear();
    imageOutlines.clear();
    imageZoomControls.clear();
    document.body.classList.remove("nopic-animation-disabled");

    // 5. 阅兵模式退出
    if (isParadeMode) exitParadeMode();

    // 6. 强制更新UI状态
    updateLampState();
    updateAllUI();
    updateContent();

    console.log("[nopic] 图片隐藏功能已彻底关闭");
  }

  const triggerImmediateCheck = () => {
    if (window.imgHidenSet !== null) {
      setTimeout(imgHiden, 50);
      setTimeout(imgHiden, 300);
    }
  };
  window.addEventListener("popstate", triggerImmediateCheck);
  history.pushState = (function () {
    const o = history.pushState;
    return function () {
      o.apply(this, arguments);
      triggerImmediateCheck();
    };
  })();
  history.replaceState = (function () {
    const o = history.replaceState;
    return function () {
      o.apply(this, arguments);
      triggerImmediateCheck();
    };
  })();
  document.addEventListener(
    "load",
    (e) => {
      if (
        window.imgHidenSet !== null &&
        (e.target.tagName === "IMG" || e.target.tagName === "SVG")
      )
        imgHiden();
    },
    true,
  );

  // --- 4.5 加载动画引擎 ---
  function initLoadAnimation() {
    if (!loadAnimationConfig) return;

    // 标记是否已初始化
    let isInitialized = false;
    // 动画是否激活
    let animationActive = true;
    // 待显示元素队列
    let pendingRows = [];
    // 当前显示索引
    let currentRowIndex = 0;
    // 是否正在处理队列
    let isProcessing = false;
    // 所有元素的集合（用于检查是否全部显示）
    let allElements = [];

    // 核心：隐藏单个元素
    function hideElement(el) {
      if (!el || el.dataset.nopicAnimated === "true") return;

      // 强制隐藏，无任何可见内容
      el.style.opacity = "0";
      el.style.transform = "translateY(20px)";
      el.style.transition = "none";
      el.style.pointerEvents = "none"; // 防止交互
      el.dataset.nopicAnimated = "true";
      el.dataset.nopicShown = "false";
    }

    // 核心：显示单个元素（带动画）
    function showElementWithAnimation(el) {
      if (!el || el.dataset.nopicShown === "true") return;

      // 先强制确保完全隐藏，再触发显示动画
      el.style.transition = "none";
      el.style.opacity = "0";
      el.style.transform = "translateY(20px)";
      el.style.pointerEvents = "none";

      // 强制回流，确保上面的样式生效
      void el.offsetHeight;

      // 然后设置过渡并显示
      el.style.transition = `opacity 0.6s cubic-bezier(0.23, 1, 0.32, 1), transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)`;
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
      el.style.pointerEvents = ""; // 恢复交互
      el.dataset.nopicShown = "true";

      setTimeout(() => {
        el.style.transition = "";
        el.style.transform = "";
        el.style.pointerEvents = "";
      }, 700);
    }

    // 核心：直接显示元素（无动画）
    function showElementDirectly(el) {
      if (!el || el.dataset.nopicShown === "true") return;

      // 强制隐藏再直接显示，无动画
      el.style.transition = "none";
      el.style.opacity = "0";
      el.style.transform = "translateY(20px)";
      el.style.pointerEvents = "none";

      void el.offsetHeight; // 强制回流

      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
      el.style.pointerEvents = "";
      el.dataset.nopicShown = "true";

      setTimeout(() => {
        el.style.transition = "";
        el.style.transform = "";
        el.style.pointerEvents = "";
      }, 50);
    }

    // 判断元素是否在视窗内
    function isElementInViewport(el) {
      const rect = el.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const windowWidth = window.innerWidth;

      // 稍微放宽判断，提前处理即将出现的元素
      return (
        rect.bottom >= -200 &&
        rect.top <= windowHeight + 200 &&
        rect.right >= -200 &&
        rect.left <= windowWidth + 200
      );
    }

    // 判断元素是否需要动画（所有元素都需要，但会根据视窗决定动画还是直接显示）
    function shouldAnimateElement(el) {
      // 跳过脚本UI
      if (
        el.closest &&
        (el.closest("#nopic-widget") ||
          el.closest("#nopic-menu") ||
          el.closest("[id^='nopic-']") ||
          el.closest("#nopic-zoom-container") ||
          el.closest("#nopic-parade-overlay"))
      )
        return false;

      if (el.dataset.nopicAnimated === "true") return false;

      // 检查是否有文本内容
      let hasText = false;
      for (const child of el.childNodes) {
        if (
          child.nodeType === Node.TEXT_NODE &&
          child.textContent.trim().length > 0
        ) {
          hasText = true;
          break;
        }
      }
      if (!hasText) return false;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;

      return true;
    }

    // 收集所有需要动画的元素
    function collectAllElements() {
      if (!document.body) return [];

      const allEls = document.body.getElementsByTagName("*");
      const toAnimate = [];

      for (const el of allEls) {
        if (shouldAnimateElement(el)) {
          toAnimate.push(el);
        }
      }

      // 按从上到下排序
      toAnimate.sort(
        (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
      );
      return toAnimate;
    }

    // 检查视窗内的元素是否都已显示
    function areViewportElementsShown() {
      // 获取所有在视窗内的元素
      const viewportElements = allElements.filter((el) => {
        return isElementInViewport(el) && el.dataset.nopicShown === "false";
      });

      // 如果视窗内没有未显示的元素，返回true
      return viewportElements.length === 0;
    }

    // 按行分组：同一行的元素同时出现
    function groupElementsByRow(elements) {
      if (elements.length === 0) return [];

      // 按 top 坐标排序，然后按 left 坐标排序
      const sorted = [...elements].sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        // 先按垂直位置排序（top 小的在前）
        if (Math.abs(rectA.top - rectB.top) > 10) {
          return rectA.top - rectB.top;
        }
        // 同一行按水平位置排序（left 小的在前）
        return rectA.left - rectB.left;
      });

      const rows = [];
      let currentRow = [];
      let currentRowTop = -Infinity;
      const ROW_THRESHOLD = 20; // 20px 内的算同一行

      for (const el of sorted) {
        const rect = el.getBoundingClientRect();
        const top = rect.top;

        // 如果当前元素和当前行的第一个元素在同一行
        if (
          currentRow.length === 0 ||
          Math.abs(top - currentRowTop) <= ROW_THRESHOLD
        ) {
          if (currentRow.length === 0) currentRowTop = top;
          currentRow.push(el);
        } else {
          // 新行开始，先按 left 排序当前行
          currentRow.sort((a, b) => {
            return (
              a.getBoundingClientRect().left - b.getBoundingClientRect().left
            );
          });
          rows.push([...currentRow]);
          currentRow = [el];
          currentRowTop = top;
        }
      }

      // 处理最后一行，也按 left 排序
      if (currentRow.length > 0) {
        currentRow.sort((a, b) => {
          return (
            a.getBoundingClientRect().left - b.getBoundingClientRect().left
          );
        });
        rows.push([...currentRow]);
      }

      return rows;
    }

    // 处理所有元素
    function processAllElements() {
      if (!document.body) return;

      allElements = collectAllElements();

      if (allElements.length === 0) {
        console.log("没有找到需要动画的元素");
        return;
      }

      console.log("找到元素数量:", allElements.length);

      // 先全部隐藏
      allElements.forEach((el) => hideElement(el));

      // 强制回流
      void document.body.offsetHeight;

      // 按行分组
      const rows = groupElementsByRow(allElements);
      console.log("分组为", rows.length, "行");

      // ★★★ 核心：所有行并行显示，不排队 ★★★
      rows.forEach((row, rowIndex) => {
        setTimeout(() => {
          if (!animationActive) return;
          // 同一行内的元素逐个显示，每个间隔30ms
          row.forEach((el, colIndex) => {
            setTimeout(() => {
              if (!animationActive) return;
              if (el.dataset.nopicShown === "false") {
                showElementWithAnimation(el);
              }
            }, colIndex * 30);
          });
        }, rowIndex * 100); // 每行延迟100ms启动，但所有行并行
      });

      isProcessing = true;
      pendingRows = rows;

      // ★★★ 唯一的 MutationObserver：监听动态添加的新元素 ★★★
      // 如果已存在observer，先断开
      if (window.__nopicAnimationObserver) {
        window.__nopicAnimationObserver.disconnect();
      }

      const observer = new MutationObserver((mutations) => {
        if (!animationActive) return;

        const newElements = [];
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;

            // 跳过脚本UI元素
            if (
              node.id === "nopic-widget" ||
              node.id === "nopic-menu" ||
              (node.closest &&
                (node.closest("#nopic-widget") ||
                  node.closest("#nopic-menu") ||
                  node.closest("[id^='nopic-']") ||
                  node.closest("#nopic-zoom-container") ||
                  node.closest("#nopic-parade-overlay")))
            ) {
              continue;
            }

            // 检查元素本身
            if (shouldAnimateElement(node)) {
              newElements.push(node);
            }

            // 检查子元素
            const children = node.getElementsByTagName
              ? node.getElementsByTagName("*")
              : [];
            for (const child of children) {
              if (shouldAnimateElement(child)) {
                newElements.push(child);
              }
            }
          }
        }

        if (newElements.length > 0) {
          console.log("检测到新元素:", newElements.length);

          // 新元素按位置排序
          newElements.sort(
            (a, b) =>
              a.getBoundingClientRect().top - b.getBoundingClientRect().top,
          );

          // 隐藏新元素
          newElements.forEach((el) => hideElement(el));

          // 添加到总集合
          allElements = allElements.concat(newElements);

          // ★★★ 新元素立即并行显示 ★★★
          const newRows = groupElementsByRow(newElements);
          newRows.forEach((row, rowIndex) => {
            setTimeout(() => {
              if (!animationActive) return;
              row.forEach((el, colIndex) => {
                setTimeout(() => {
                  if (!animationActive) return;
                  if (el.dataset.nopicShown === "false") {
                    showElementWithAnimation(el);
                  }
                }, colIndex * 20);
              });
            }, rowIndex * 50);
          });
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      window.__nopicAnimationObserver = observer;
    }

    // 初始化函数
    function initialize() {
      if (isInitialized) return;
      isInitialized = true;

      console.log("开始初始化加载动画");

      // 处理所有元素（processAllElements 内部会创建唯一的 MutationObserver）
      processAllElements();

      // 滚动监听 - 处理滚动时新出现的元素
      window.addEventListener(
        "scroll",
        function () {
          if (!animationActive) return;

          const remaining = allElements.filter(
            (el) => el.dataset.nopicShown === "false",
          );
          if (remaining.length === 0) return;

          const visibleRemaining = remaining.filter((el) => {
            const rect = el.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            const windowWidth = window.innerWidth;
            return (
              rect.bottom >= -200 &&
              rect.top <= windowHeight + 200 &&
              rect.right >= -200 &&
              rect.left <= windowWidth + 200
            );
          });

          if (visibleRemaining.length > 0) {
            console.log("滚动时发现新元素:", visibleRemaining.length);
            const newRows = groupElementsByRow(visibleRemaining);
            // 所有行并行显示
            newRows.forEach((row, rowIndex) => {
              setTimeout(() => {
                if (!animationActive) return;
                row.forEach((el, colIndex) => {
                  setTimeout(() => {
                    if (!animationActive) return;
                    if (el.dataset.nopicShown === "false") {
                      showElementWithAnimation(el);
                    }
                  }, colIndex * 20);
                });
              }, rowIndex * 50);
            });
          }
        },
        { passive: true },
      );
    }

    // 等待DOM完全加载
    function waitForDomAndInitialize() {
      if (document.body) {
        // 使用多次 requestAnimationFrame 确保布局完成
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            initialize();
          });
        });
      } else {
        const bodyObserver = new MutationObserver(() => {
          if (document.body) {
            bodyObserver.disconnect();
            waitForDomAndInitialize();
          }
        });
        bodyObserver.observe(document.documentElement, { childList: true });
      }
    }

    // 启动
    waitForDomAndInitialize();

    // 窗口滚动时重新检查视窗元素
    window.addEventListener("scroll", function () {
      if (animationActive && !isProcessing) {
        // 如果有未显示的元素在视窗内，继续处理
        const remaining = allElements.filter(
          (el) => el.dataset.nopicShown === "false",
        );
        if (remaining.length > 0) {
          pendingRows = groupElementsByRow(remaining);
          currentRowIndex = 0;
          isProcessing = true;
          processNextRow();
        }
      }
    });
  }

  // ===== 新增：加载动画立即执行 =====
  if (typeof initLoadAnimation === "function") {
    setTimeout(initLoadAnimation, 0);
  }

  // --- 5. 数据统计引擎 ---
  const PX_TO_METER = 3779.5275590551;
  let sessionData = { mouse: 0, click: 0, scroll: 0, read: 0 };
  let globalData = {
    today: { mouse: 0, click: 0, scroll: 0, read: 0 },
  };
  let pendingDeltas = { mouse: 0, click: 0, scroll: 0, read: 0 };
  let lastMouseX = null,
    lastMouseY = null,
    lastScrollTop = 0,
    adCount = 0,
    charDensity = 0;

  function loadGlobalStats() {
    try {
      const saved = GM_getValue("nopic_global_stats_v1");
      if (saved && saved.data) {
        const now = new Date();
        const lastDate = new Date(saved.lastUpdate);
        globalData = saved.data;
        if (!isSameDay(now, lastDate)) {
          globalData.today = { mouse: 0, click: 0, scroll: 0, read: 0 };
        }
      }
    } catch (e) {
      console.error("Load stats error", e);
    }
  }
  function saveGlobalStats() {
    const stored = GM_getValue("nopic_global_stats_v1");
    const now = new Date();
    let latestData =
      stored && stored.data
        ? stored.data
        : {
            today: { mouse: 0, click: 0, scroll: 0, read: 0 },
          };

    // 检查是否是同一天，如果不是则清空today数据
    if (stored && stored.lastUpdate) {
      const lastDate = new Date(stored.lastUpdate);
      if (!isSameDay(now, lastDate)) {
        latestData.today = { mouse: 0, click: 0, scroll: 0, read: 0 };
      }
    }

    ["mouse", "click", "scroll", "read"].forEach((key) => {
      if (pendingDeltas[key] > 0) {
        latestData.today[key] =
          (latestData.today[key] || 0) + pendingDeltas[key];
      }
    });
    pendingDeltas = { mouse: 0, click: 0, scroll: 0, read: 0 };
    globalData = latestData;
    GM_setValue("nopic_global_stats_v1", {
      lastUpdate: Date.now(),
      data: latestData,
    });
  }
  function isSameDay(d1, d2) {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }
  loadGlobalStats();

  function updateStat(key, value) {
    sessionData[key] = (sessionData[key] || 0) + value;
    pendingDeltas[key] = (pendingDeltas[key] || 0) + value;
    globalData.today[key] = (globalData.today[key] || 0) + value;
  }
  function updateCharDensity() {
    // 防止 document.body 为 null 时报错
    if (!document.body) return;
    const scrollH = document.documentElement.scrollHeight;
    if (scrollH < 100) return;
    charDensity = document.body.innerText.replace(/\s/g, "").length / scrollH;
  }
  document.addEventListener("mousemove", (e) => {
    if (lastMouseX !== undefined)
      updateStat(
        "mouse",
        Math.hypot(e.clientX - lastMouseX, e.clientY - lastMouseY),
      );
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    if (Math.random() < 0.05) saveGlobalStats();
  });

  document.addEventListener("click", (e) => {
    if (
      e.target.closest("#nopic-widget") ||
      e.target.closest("#nopic-menu") ||
      e.target.closest("#nopic-zoom-container")
    )
      return;
    updateStat("click", 1);
    saveGlobalStats();
  });

  document.addEventListener("scroll", () => {
    const st = window.scrollY;
    const delta = Math.abs(st - lastScrollTop);
    if (delta < 2000) {
      updateStat("scroll", delta);
      updateStat("read", delta * charDensity);
    }
    lastScrollTop = st;
    saveGlobalStats();
  });
  setInterval(updateCharDensity, 2000);
  updateCharDensity();
  function estimateAds() {
    if (!configs.adCount) return;
    let count = 0;
    const iframes = document.querySelectorAll("iframe");
    const keywords = [
      "ad",
      "adv",
      "promo",
      "banner",
      "google_ads",
      "doubleclick",
      "ecma",
      "ssp",
    ];
    iframes.forEach((f) => {
      const src = f.src || "",
        id = f.id || "",
        cls = f.className || "";
      if (
        keywords.some(
          (k) => src.includes(k) || id.includes(k) || cls.includes(k),
        )
      )
        count++;
    });
    document
      .querySelectorAll('img[src*="ad"], img[class*="ad"]')
      .forEach((el) => {
        if (el.offsetWidth > 1) count++;
      });
    adCount = count;
  }
  setInterval(estimateAds, 3000);

  // --- 6. 仪表盘 UI ---
  const widget = document.createElement("div");
  widget.id = "nopic-widget";
  const lamp = document.createElement("div");
  lamp.id = "nopic-lamp";
  const contentDiv = document.createElement("div");
  contentDiv.id = "nopic-content";
  widget.appendChild(lamp);
  widget.appendChild(contentDiv);

  const menu = document.createElement("div");
  menu.id = "nopic-menu";
  menu.innerHTML = `
    <div class="nopic-ext-buttons-row nopic-three-cols-row">
  <!-- 第一列：页面工具 -->
  <div class="nopic-col nopic-col-1">
    <div class="nopic-col-title">页面工具</div>
    <div class="nopic-menu-item nopic-ext-btn nopic-ext-btn-parade" data-action="paradeMode" id="nopic-parade-menu-entry">
      <div class="nopic-app-icon">
        <svg viewBox="0 0 24 24" fill="white" stroke="none">
          <rect x="2" y="2" width="8" height="8" rx="1" fill="white"/>
          <rect x="14" y="2" width="8" height="8" rx="1" fill="white"/>
          <rect x="2" y="14" width="8" height="8" rx="1" fill="white"/>
          <rect x="14" y="14" width="8" height="8" rx="1" fill="white"/>
          <path d="M2 2l8 8M14 2l8 8M2 14l8 8M14 14l8 8" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
        </svg>
      </div>
      <span class="nopic-app-label">图片阅兵</span>
    </div>
        <div style="display:flex;gap:4px;width:100%;flex:none;height:56px;">
      <div class="nopic-menu-item nopic-ext-btn" data-submenu="textreplace" id="nopic-textreplace-menu-entry" style="flex:1;min-width:0;height:56px;padding:4px 2px !important;">
        <div class="nopic-app-icon" style="width:20px;height:20px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;">
            <path d="M4 7h16M4 12h10M4 17h6"/>
            <path d="M18 12v8M15 17l3 3 3-3"/>
          </svg>
        </div>
        <span class="nopic-app-label">换词</span>
      </div>
      <div class="nopic-menu-item nopic-ext-btn" data-submenu="quicktext" id="nopic-quicktext-menu-entry" style="flex:1;min-width:0;height:56px;padding:4px 2px !important;">
        <div class="nopic-app-icon" style="width:20px;height:20px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </div>
        <span class="nopic-app-label">快捷</span>
      </div>
    </div>
    <div class="nopic-menu-item nopic-ext-btn" data-submenu="pageedit" id="nopic-pageedit-menu-entry">
      <div class="nopic-app-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
      </div>
      <span class="nopic-app-label">页面编辑</span>
    </div>
  </div>
  <!-- 第二列：隐私工具 -->
  <div class="nopic-col nopic-col-2">
    <div class="nopic-col-title">隐私工具</div>
    <div class="nopic-menu-item nopic-ext-btn" data-submenu="privacylock" id="nopic-privacylock-menu-entry">
      <div class="nopic-app-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <span class="nopic-app-label">隐私锁</span>
    </div>
    <div class="nopic-menu-item nopic-ext-btn" data-submenu="mask" id="nopic-mask-menu-entry">
      <div class="nopic-app-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
        </svg>
      </div>
      <span class="nopic-app-label">局部遮罩</span>
    </div>
    <div class="nopic-menu-item nopic-ext-btn" data-submenu="tabdisguise" id="nopic-tabdisguise-menu-entry">
      <div class="nopic-app-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
          <line x1="16" y1="21" x2="16" y2="7"/>
          <line x1="8" y1="21" x2="8" y2="7"/>
          <line x1="2" y1="11" x2="22" y2="11"/>
        </svg>
      </div>
      <span class="nopic-app-label">标签伪装</span>
    </div>
  </div>
  <!-- 第三列：快捷自动化 -->
  <div class="nopic-col nopic-col-3">
    <div class="nopic-col-title">自动化</div>
   
    <div class="nopic-menu-item nopic-ext-btn" data-submenu="autoclicker" id="nopic-autoclicker-menu-entry">
      <div class="nopic-app-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>
      <span class="nopic-app-label">自动点击</span>
    </div>
    <div class="nopic-menu-item nopic-ext-btn" data-submenu="pagemonitor" id="nopic-pagemonitor-menu-entry">
      <div class="nopic-app-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </div>
      <span class="nopic-app-label">页面监控</span>
    </div>
        <div class="nopic-menu-item nopic-ext-btn" data-submenu="datacollect" id="nopic-datacollect-menu-entry">
      <div class="nopic-app-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="3" y1="15" x2="21" y2="15"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
          <line x1="15" y1="3" x2="15" y2="21"/>
        </svg>
      </div>
      <span class="nopic-app-label">数据采集</span>
    </div>
  </div>
</div>
    <div class="nopic-menu-separator" id="nopic-ext-separator"></div>
    <div class="nopic-menu-item nopic-submenu-trigger" data-submenu="disguise" style="justify-content:space-between;"><span>拓展</span></div>
    <div class="nopic-menu-item nopic-submenu-trigger" data-submenu="settings" style="justify-content:space-between;"><span>设置</span></div>
    <div class="nopic-menu-item" data-action="about">关于</div>
    <div class="nopic-menu-item nopic-hide-item" data-action="hide" style="margin-top:4px;">隐藏面板 (Alt+H)</div>
    <div class="nopic-menu-item nopic-hide-item" data-action="permaHide" style="margin-top:2px;color:#f87171;">永久隐藏此站</div>
  `;

  const settingsSubmenu = document.createElement("div");
  settingsSubmenu.id = "nopic-settings-submenu";
  settingsSubmenu.className = "nopic-submenu";
  settingsSubmenu.innerHTML = `
    <div class="nopic-menu-item" data-submenu-trigger="displayContent" style="justify-content:space-between;"><span>显示内容</span><span style="font-size:14px;opacity:0.6;">›</span></div>
    <div class="nopic-menu-separator">界面设置</div>
    <div class="nopic-menu-item"><span>自动贴边</span><div class="nopic-switch" data-key="autoSnap"></div></div>
    <div class="nopic-menu-item"><span>自动休眠</span><div class="nopic-switch" data-key="autoHideIdle"></div></div>
    <div class="nopic-menu-separator">加载动画</div>
    <div class="nopic-menu-item"><span>全页动画特效</span><div class="nopic-switch" data-key="loadAnimation"></div></div>
    <div class="nopic-menu-separator">图片控制</div>
    <div class="nopic-menu-item"><span>虚线辅助</span><div class="nopic-switch" data-key="outline"></div></div>
    <div class="nopic-menu-item"><span>仅悬停显示</span><div class="nopic-switch" data-key="hoverOnly"></div></div>
    <div class="nopic-menu-item"><span>悬停显图</span><div class="nopic-switch" data-key="hoverShowImg"></div></div>
    <div class="nopic-menu-item"><span>禁用动画</span><div class="nopic-switch" data-key="disableAnimation"></div></div>
    <div class="nopic-menu-separator">图片放大</div>
    <div class="nopic-menu-item" style="flex-direction: column; align-items: stretch;">
        <span style="margin-bottom: 4px;">放大图片方式</span>
        <div class="nopic-range-container" style="margin:0; padding:2px;">
            <div class="nopic-range-switcher">
                <div class="nopic-range-btn" data-zoom="off">关</div>
                <div class="nopic-range-btn" data-zoom="hover">悬停</div>
                <div class="nopic-range-btn" data-zoom="middle">中键</div>
                <div class="nopic-range-btn" data-zoom="click">点击</div>
            </div>
        </div>
    </div>
    <div class="nopic-menu-item" id="nopic-leave-options" style="flex-direction: column; align-items: stretch;">
        <span style="margin-bottom: 4px;">还原图片方式</span>
        <div class="nopic-range-container" style="margin:0; padding:2px;">
            <div class="nopic-range-switcher">
                <div class="nopic-range-btn" data-leave="leave">离开图片</div>
                <div class="nopic-range-btn" data-leave="button">仅靠按钮</div>
            </div>
        </div>
    </div>
    <div class="nopic-menu-item"><span>钉图模式</span><div class="nopic-switch" data-key="zoomPinMode"></div></div>
    <div class="nopic-menu-separator">图片阅兵</div>
    <div class="nopic-menu-item" id="nopic-parade-filter-row" style="flex-direction:column;align-items:stretch;padding:8px 10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:11px;color:rgba(255,255,255,0.7);">过滤尺寸</span>
        <div class="nopic-switch" id="nopic-parade-filter-toggle"></div>
      </div>
      <div id="nopic-parade-filter-inputs" style="display:none;gap:6px;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:10px;color:rgba(255,255,255,0.5);">最小宽</span>
          <input id="nopic-pf-minW" type="number" min="1" max="9999" style="width:60px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#fff;font-size:11px;padding:2px 6px;text-align:right;">
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:10px;color:rgba(255,255,255,0.5);">最小高</span>
          <input id="nopic-pf-minH" type="number" min="1" max="9999" style="width:60px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#fff;font-size:11px;padding:2px 6px;text-align:right;">
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:10px;color:rgba(255,255,255,0.5);">最大宽</span>
          <input id="nopic-pf-maxW" type="number" min="1" max="9999" style="width:60px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#fff;font-size:11px;padding:2px 6px;text-align:right;">
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:10px;color:rgba(255,255,255,0.5);">最大高</span>
          <input id="nopic-pf-maxH" type="number" min="1" max="9999" style="width:60px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#fff;font-size:11px;padding:2px 6px;text-align:right;">
        </div>
      </div>
    </div>
  `;

  const displaySubmenu = document.createElement("div");
  displaySubmenu.id = "nopic-display-submenu";
  displaySubmenu.className = "nopic-submenu";
  displaySubmenu.innerHTML = `
    <div class="nopic-menu-separator">基础</div>
    <div class="nopic-submenu-item" data-key="displayTime"><div class="nopic-checkbox">...</div>时间</div>
    <div class="nopic-submenu-item" data-key="displaySeconds"><div class="nopic-checkbox">...</div>秒</div>
    <div class="nopic-submenu-item" data-key="displayHost"><div class="nopic-checkbox">...</div>域名</div>
    <div class="nopic-menu-separator">图片统计</div>
    <div class="nopic-submenu-item" data-key="displayCount"><div class="nopic-checkbox">...</div>隐藏数量</div>
    <div class="nopic-submenu-item" data-key="displayTotal"><div class="nopic-checkbox">...</div>图片总数</div>
    <div class="nopic-submenu-item" data-key="displayPercent"><div class="nopic-checkbox">...</div>隐藏占比</div>
    <div class="nopic-submenu-item" data-key="displayAdCount"><div class="nopic-checkbox">...</div>疑似广告</div>
    <div class="nopic-menu-separator">性能监控</div>
    <div class="nopic-submenu-item" data-key="displayMemory"><div class="nopic-checkbox">...</div>内存占用</div>
    <div class="nopic-submenu-item" data-key="displayLoadTime"><div class="nopic-checkbox">...</div>加载耗时</div>
    <div class="nopic-submenu-item" data-key="displayResCount"><div class="nopic-checkbox">...</div>资源请求数</div>
    <div class="nopic-menu-separator">用户行为</div>
    <div class="nopic-range-container">
        <div class="nopic-range-switcher">
            <div class="nopic-range-btn" data-range="session">本次</div><div class="nopic-range-btn" data-range="today">今日</div>
        </div>
    </div>
    <div class="nopic-submenu-item" data-key="displayMouseDistance"><div class="nopic-checkbox">...</div>鼠标距离</div>
    <div class="nopic-submenu-item" data-key="displayClickCount"><div class="nopic-checkbox">...</div>点击次数</div>
    <div class="nopic-submenu-item" data-key="displayScrollDist"><div class="nopic-checkbox">...</div>滚动距离</div>
    <div class="nopic-submenu-item" data-key="displayReadChars"><div class="nopic-checkbox">...</div>阅读字数</div>
  `;
  displaySubmenu
    .querySelectorAll(".nopic-checkbox")
    .forEach(
      (c) =>
        (c.innerHTML =
          '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>'),
    );

  // ===== 拓展功能二级菜单 =====
  const disguiseSubmenu = document.createElement("div");
  disguiseSubmenu.id = "nopic-disguise-submenu";
  disguiseSubmenu.className = "nopic-submenu";
  disguiseSubmenu.innerHTML = `
    <div class="nopic-menu-separator">页面工具</div>
    <div class="nopic-menu-item" style="justify-content:space-between;">
      <span>图片阅兵</span>
      <div class="nopic-switch" id="nopic-parade-toggle"></div>
    </div>
    <div class="nopic-menu-item" style="justify-content:space-between;">
      <span>网页文字替换</span>
      <div class="nopic-switch" id="nopic-replace-toggle"></div>
    </div>
        <div class="nopic-menu-item" style="justify-content:space-between;">
      <span>快捷文本</span>
      <div class="nopic-switch" id="nopic-quicktext-toggle"></div>
    </div>
    <div class="nopic-menu-item" style="justify-content:space-between;">
      <span>页面可编辑</span>
      <div class="nopic-switch" id="nopic-pageedit-toggle"></div>
    </div>
    <div class="nopic-menu-separator">隐私工具</div>
    <div class="nopic-menu-item" style="justify-content:space-between;">
      <span>页面局部遮罩</span>
      <div class="nopic-switch" id="nopic-mask-toggle"></div>
    </div>
    <div class="nopic-menu-item" style="justify-content:space-between;">
      <span>标签页伪装</span>
      <div class="nopic-switch" id="nopic-disguise-toggle"></div>
    </div>
    <div class="nopic-menu-item" style="justify-content:space-between;">
      <span>网页隐私锁</span>
      <div class="nopic-switch" id="nopic-privacylock-toggle"></div>
    </div>
    <div class="nopic-menu-separator">快捷自动化</div>
    <div class="nopic-menu-item" style="justify-content:space-between;">
      <span>自动点击器</span>
      <div class="nopic-switch" id="nopic-autoclicker-toggle"></div>
    </div>
        <div class="nopic-menu-item" style="justify-content:space-between;">
      <span>页面监控器</span>
      <div class="nopic-switch" id="nopic-pagemonitor-toggle"></div>
    </div>
        <div class="nopic-menu-item" style="justify-content:space-between;">
      <span>数据采集</span>
      <div class="nopic-switch" id="nopic-datacollect-toggle"></div>
    </div>
  `;

  // ===== 标签伪装设置弹窗 =====
  const tabDisguiseSubmenu = document.createElement("div");
  tabDisguiseSubmenu.id = "nopic-tabdisguise-submenu";
  tabDisguiseSubmenu.className = "nopic-submenu";
  tabDisguiseSubmenu.innerHTML = `
  <div class="nopic-modal-header">
    <span class="nopic-modal-title">标签伪装</span>
    <div class="nopic-modal-close" id="nopic-tabdisguise-close">×</div>
  </div>
  <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:6px;">会将生效的配置进行高亮，未高亮时点击编辑按钮可以进行修改。有些网站如AI网站可能由于网站限制，标题无法有效修改。</div>

  <!-- 三列列表视图（默认显示） -->
  <div id="nopic-disguise-list-view" style="display:flex;flex-direction:column;gap:4px;flex:1;max-height:55vh;overflow-y:auto;">
    <div style="display:flex;gap:10px;">
      <div style="flex:1;background:rgba(0,0,0,0.15);border-radius:8px;padding:8px;display:flex;flex-direction:column;min-height:auto;">
        <div id="nopic-disguise-list-url" style="display:flex;flex-direction:column;gap:6px;flex:1;"></div>
      </div>
      <div style="flex:1;background:rgba(0,0,0,0.15);border-radius:8px;padding:8px;display:flex;flex-direction:column;min-height:auto;">
        <div id="nopic-disguise-list-domain" style="display:flex;flex-direction:column;gap:6px;flex:1;"></div>
      </div>
      <div style="flex:1;background:rgba(0,0,0,0.15);border-radius:8px;padding:8px;display:flex;flex-direction:column;min-height:auto;">
        <div id="nopic-disguise-list-global" style="display:flex;flex-direction:column;gap:6px;flex:1;"></div>
      </div>
    </div>
  </div>

  <!-- 编辑视图（点击编辑后显示） -->
  <div id="nopic-disguise-edit-view" style="display:none;flex-direction:column;gap:4px;flex:1;max-height:55vh;overflow-y:auto;">
    <div style="display:flex;gap:8px;margin-bottom:4px;">
      <button class="nopic-disguise-btn" id="nopic-disguise-back-btn" style="font-size:11px;">← 返回列表</button>
    </div>
    <div class="nopic-disguise-section">
      <div class="nopic-disguise-section-title">标题设置</div>
      <div class="nopic-radio-row" data-title-mode="native">
        <div class="nopic-radio"></div>
        <span>使用网站原生标题</span>
      </div>
      <div class="nopic-radio-row" data-title-mode="preset">
        <div class="nopic-radio"></div>
        <span>预设标题</span>
      </div>
      <div class="nopic-preset-row" id="nopic-preset-title-row" style="display:none;">
        <div class="nopic-custom-select" id="nopic-preset-title-select">
          <div class="nopic-custom-select-header">选择预设标题</div>
          <div class="nopic-custom-select-dropdown">
            <div class="nopic-custom-select-option" data-value="内部资料查阅平台">内部资料查阅平台</div>
            <div class="nopic-custom-select-option" data-value="WPS Office文档">WPS Office文档</div>
            <div class="nopic-custom-select-option" data-value="Microsoft Office">Microsoft Office</div>
            <div class="nopic-custom-select-option" data-value="在线学习平台">在线学习平台</div>
            <div class="nopic-custom-select-option" data-value="项目管理系统">项目管理系统</div>
            <div class="nopic-custom-select-option" data-value="企业邮箱">企业邮箱</div>
            <div class="nopic-custom-select-option" data-value="财务报表系统">财务报表系统</div>
            <div class="nopic-custom-select-option" data-value="人事管理系统">人事管理系统</div>
          </div>
        </div>
      </div>
      <div class="nopic-radio-row" data-title-mode="custom">
        <div class="nopic-radio"></div>
        <span>自定义标题</span>
      </div>
     <input type="text" class="nopic-disguise-input" id="nopic-custom-title-input" placeholder="输入自定义标题" style="color:white;display:none;box-sizing:border-box;width:100%;min-width:0;max-width:100%;">
    </div>
    <div class="nopic-disguise-section">
      <div class="nopic-disguise-section-title">图标设置</div>
      <div class="nopic-radio-row" data-icon-mode="native">
        <div class="nopic-radio"></div>
        <span>使用网站原生图标</span>
      </div>
      <div class="nopic-radio-row" data-icon-mode="preset">
        <div class="nopic-radio"></div>
        <span>预设图标</span>
      </div>
      <div class="nopic-preset-row" id="nopic-preset-icon-row" style="display:none;">
        <div class="nopic-custom-select" id="nopic-preset-icon-select">
          <div class="nopic-custom-select-header">选择预设图标</div>
          <div class="nopic-custom-select-dropdown">
            <div class="nopic-custom-select-option" data-value="wps">WPS Office</div>
            <div class="nopic-custom-select-option" data-value="office">Microsoft Office</div>
            <div class="nopic-custom-select-option" data-value="word">Microsoft Word</div>
            <div class="nopic-custom-select-option" data-value="excel">Microsoft Excel</div>
            <div class="nopic-custom-select-option" data-value="ppt">Microsoft PowerPoint</div>
            <div class="nopic-custom-select-option" data-value="pdf">PDF文档</div>
            <div class="nopic-custom-select-option" data-value="folder">文件夹</div>
            <div class="nopic-custom-select-option" data-value="mail">邮件</div>
            <div class="nopic-custom-select-option" data-value="learn">学习平台</div>
          </div>
        </div>
      </div>
      <div class="nopic-radio-row" data-icon-mode="custom">
        <div class="nopic-radio"></div>
        <span>自定义图标</span>
      </div>
      <div class="nopic-icon-upload-area" id="nopic-custom-icon-area" style="display:none;">
        <div class="nopic-icon-preview" id="nopic-icon-preview">
          <img id="nopic-icon-preview-img" style="display:none;">
        </div>
        <button class="nopic-icon-upload-btn" id="nopic-icon-upload-btn">上传图标</button>
        <button class="nopic-disguise-btn danger" id="nopic-clear-icon-btn">清空</button>
      </div>
      <input type="file" id="nopic-icon-file-input" accept="image/png,image/jpeg,image/webp" style="display:none;">
    </div>
    <div class="nopic-disguise-actions">
      <button class="nopic-disguise-btn" id="nopic-disguise-reset-btn">重置</button>
    </div>
  </div>
`;
  // ===== 遮罩设置弹窗 =====
  const maskSubmenu = document.createElement("div");
  maskSubmenu.id = "nopic-mask-submenu";
  maskSubmenu.className = "nopic-submenu";
  maskSubmenu.innerHTML = `
    <div class="nopic-modal-header">
      <span class="nopic-modal-title">遮罩设置</span>
      <div class="nopic-modal-close" id="nopic-mask-close">×</div>
    </div>
    <div class="nopic-privacy-select-row nopic-scope-row">
<div class="nopic-privacy-select-btn" data-scope="url">仅当前页</div>
<div class="nopic-privacy-select-btn" data-scope="domain">当前网站</div>
<div class="nopic-privacy-select-btn" data-scope="global">全局通用</div>
    </div>
    <div class="nopic-mask-section">
      <div class="nopic-mask-section-title">遮罩样式</div>
      <div class="nopic-mask-color-row">
        <input type="color" class="nopic-mask-color-picker" id="nopic-mask-color" value="#000000">
        <span style="font-size:11px;color:rgba(255,255,255,0.7);">遮罩颜色</span>
      </div>
      <div class="nopic-mask-opacity-row">
        <span class="nopic-mask-opacity-label">透明度</span>
        <input type="range" class="nopic-mask-opacity-slider" id="nopic-mask-opacity" min="10" max="100" value="100">
        <span class="nopic-mask-opacity-value" id="nopic-mask-opacity-val">100%</span>
      </div>
      <div class="nopic-mask-opacity-row">
        <span class="nopic-mask-opacity-label">圆角</span>
        <input type="range" class="nopic-mask-opacity-slider" id="nopic-mask-radius" min="0" max="50" value="8">
        <span class="nopic-mask-opacity-value" id="nopic-mask-radius-val">8px</span>
      </div>

    </div>
    <div class="nopic-mask-section">
      <div class="nopic-mask-section-title">位置模式</div>
      <div class="nopic-mask-position-row">
        <div class="nopic-mask-position-btn" data-position="fixed">固定在屏幕</div>
        <div class="nopic-mask-position-btn active" data-position="absolute">跟随页面</div>
      </div>
    </div>
    <div class="nopic-mask-actions" style="display:flex;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);">
  <button class="nopic-mask-btn primary" id="nopic-mask-draw-btn" style="flex:1;padding:6px 0;text-align:center;border-radius:4px;font-size:12px;cursor:pointer;">开始绘制</button>
  <span class="nopic-privacy-link danger" id="nopic-mask-clear-btn" style="flex:1;padding:6px 0;text-align:center;border-radius:4px;font-size:12px;cursor:pointer;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);">清除当前层级</span>
</div>
    <div class="nopic-mask-section" id="nopic-mask-list-section" style="display:none;">
      <div class="nopic-mask-section-title">已绘制遮罩</div>
      <div class="nopic-mask-list-container">
        <div class="nopic-mask-list-column">
          <div class="nopic-mask-list-column-title">仅当前页</div>
          <div class="nopic-mask-list" id="nopic-mask-list-url"></div>
        </div>
        <div class="nopic-mask-list-column">
          <div class="nopic-mask-list-column-title">当前网站</div>
          <div class="nopic-mask-list" id="nopic-mask-list-domain"></div>
        </div>
        <div class="nopic-mask-list-column">
          <div class="nopic-mask-list-column-title">全局通用</div>
          <div class="nopic-mask-list" id="nopic-mask-list-global"></div>
        </div>
      </div>
    </div>
  `;
  // ===== 隐私锁设置子菜单 =====
  const privacyLockSubmenu = document.createElement("div");
  privacyLockSubmenu.id = "nopic-privacylock-submenu";
  privacyLockSubmenu.className = "nopic-modal-popup";
  privacyLockSubmenu.style.minWidth = "620px";
  privacyLockSubmenu.style.maxWidth = "720px";
  privacyLockSubmenu.innerHTML = `
    <div class="nopic-modal-header">
  <span class="nopic-modal-title">隐私锁</span>
  <div class="nopic-modal-close" id="nopic-privacylock-close">×</div>
</div>
<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-bottom:8px;">注意，本功能防君子不防小人，只是轻量化防偷窥的手段。如有重要防护，仍需要通过电脑锁屏来实现。</div>
<!-- 锁屏外观设置 -->
<div style="display:flex;gap:12px;margin-bottom:10px;padding:8px;background:rgba(0,0,0,0.2);border-radius:8px;flex-wrap:wrap;align-items:center;">
  <div style="display:flex;align-items:center;gap:4px;">
    <span style="font-size:10px;color:rgba(255,255,255,0.5);">背景色</span>
    <input type="color" id="nopic-lock-bg-color" value="#1a1a2e" style="width:28px;height:28px;border:none;border-radius:4px;cursor:pointer;padding:0;">
  </div>
  <div style="display:flex;align-items:center;gap:4px;">
    <span style="font-size:10px;color:rgba(255,255,255,0.5);">文字色</span>
    <input type="color" id="nopic-lock-text-color" value="#ffffff" style="width:28px;height:28px;border:none;border-radius:4px;cursor:pointer;padding:0;">
  </div>
  <div style="display:flex;align-items:center;gap:4px;flex:1;min-width:180px;">
    <span style="font-size:10px;color:rgba(255,255,255,0.5);white-space:nowrap;">时间格式</span>
    <input type="text" id="nopic-lock-time-format" value="{时}:{分}" placeholder="{时}:{分}" style="flex:1;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#fff;font-size:11px;padding:4px 8px;min-width:80px;">
  </div>
  <div style="display:flex;align-items:center;gap:4px;">
    <span style="font-size:10px;color:rgba(255,255,255,0.5);">自定义</span>
    <input type="text" id="nopic-lock-custom-text" placeholder="自定义文字" style="width:80px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#fff;font-size:11px;padding:4px 8px;">
  </div>
  <button id="nopic-lock-format-help" style="padding:2px 8px;background:rgba(96,165,250,0.2);border:1px solid rgba(96,165,250,0.3);border-radius:4px;color:#60a5fa;font-size:10px;cursor:pointer;">占位符说明</button>
</div>
<div class="nopic-pl-three-cols" style="display:flex;gap:8px;max-height:55vh;overflow-y:auto;">
  <div class="nopic-pl-col" style="flex:1;background:rgba(0,0,0,0.15);border-radius:8px;padding:8px;display:flex;flex-direction:column;min-height:180px;">
    <div id="nopic-pl-list-url" style="display:flex;flex-direction:column;gap:6px;flex:1;"></div>
  </div>
  <div class="nopic-pl-col" style="flex:1;background:rgba(0,0,0,0.15);border-radius:8px;padding:8px;display:flex;flex-direction:column;min-height:180px;">
    <div id="nopic-pl-list-domain" style="display:flex;flex-direction:column;gap:6px;flex:1;"></div>
  </div>
  <div class="nopic-pl-col" style="flex:1;background:rgba(0,0,0,0.15);border-radius:8px;padding:8px;display:flex;flex-direction:column;min-height:180px;">
    <div id="nopic-pl-list-global" style="display:flex;flex-direction:column;gap:6px;flex:1;"></div>
  </div>
</div>
<div style="margin-top:10px;display:flex;gap:6px;justify-content:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:10px;">
  <button class="nopic-privacy-btn primary" id="nopic-privacy-lock-now-btn" style="flex:1;padding:6px 0;font-size:12px;border-radius:4px;">立即上锁</button>
  <span class="nopic-privacy-link" id="nopic-privacy-log-btn" style="font-size:12px;padding:6px 12px;">日志</span>
</span>
</div>
<div style="margin-top:6px;display:flex;align-items:center;gap:8px;justify-content:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;">
  <div class="nopic-switch on" id="nopic-privacy-skip-toggle" style="cursor:pointer;"></div>
  <span style="font-size:11px;color:rgba(255,255,255,0.6);">所有网站忘记密码可跳过解锁（跳过行为将被记录）</span>
</div>
  `;

  // ===== 数据采集弹窗 =====
  const dataCollectSubmenu = document.createElement("div");
  dataCollectSubmenu.id = "nopic-datacollect-submenu";
  dataCollectSubmenu.className = "nopic-modal-popup";
  dataCollectSubmenu.style.minWidth = "820px";
  dataCollectSubmenu.style.maxWidth = "940px";
  dataCollectSubmenu.style.maxHeight = "85vh";
  dataCollectSubmenu.style.display = "none";
  dataCollectSubmenu.style.flexDirection = "column";
  dataCollectSubmenu.innerHTML = `
  <div class="nopic-modal-header">
    <span class="nopic-modal-title">数据采集</span>
    <div class="nopic-modal-close" id="nopic-datacollect-close">×</div>
  </div>

  <!-- 工具栏 - 加上 class="nopic-dc-toolbar" -->
  <div class="nopic-dc-toolbar">
    <button class="nopic-dc-btn primary" id="nopic-dc-pick-btn">开始选取元素</button>
    <button class="nopic-dc-btn success" id="nopic-dc-start-btn">▶ 启动抓取</button>
    <button class="nopic-dc-btn danger" id="nopic-dc-stop-btn" style="display:none;">⏹ 停止</button>
    <button class="nopic-dc-btn danger-outline" id="nopic-dc-clear-btn">清空</button>
    <span style="flex:1;"></span>
    <button class="nopic-dc-btn export-btn" id="nopic-dc-export-btn">导出</button>
  </div>

  <!-- 表格容器 -->
  <div id="nopic-dc-table-wrap">
    <table id="nopic-dc-table">
      <thead id="nopic-dc-thead"></thead>
      <tbody id="nopic-dc-tbody"></tbody>
    </table>
  </div>

  <!-- 状态栏 - 加上 class="nopic-dc-status-bar" -->
  <div class="nopic-dc-status-bar">
    <span id="nopic-dc-row-count">数据: 0</span>
    <span id="nopic-dc-col-count">字段: 0</span>
  </div>
`;
  document.documentElement.appendChild(dataCollectSubmenu);
  makeDraggable(dataCollectSubmenu);

  // ===== 数据采集动画 keyframes（临时span遮罩：闪烁 + 飞向弹窗）=====
  if (!document.getElementById("nopic-dc-anim-style")) {
    var _dcAnimStyle = document.createElement("style");
    _dcAnimStyle.id = "nopic-dc-anim-style";
    _dcAnimStyle.textContent = `
.nopic-dc-anim-overlay{
  position:fixed;z-index:2147483639;pointer-events:none;
  background:rgba(96,165,250,0.30);border:2px solid #60a5fa;border-radius:4px;
  box-sizing:border-box;will-change:transform,opacity;
}
@keyframes nopic-dc-flash{
  0%,100%{background:rgba(96,165,250,0.25);box-shadow:0 0 0 0 rgba(96,165,250,0);}
  50%{background:rgba(96,165,250,0.55);box-shadow:0 0 14px 3px rgba(96,165,250,0.75);}
}
@keyframes nopic-dc-fly{
  0%{opacity:0.9;transform:translate(0,0) scale(1);}
  100%{opacity:0;transform:translate(var(--fx,0), var(--fy,0)) scale(0.15);}
}
.nopic-dc-row:hover .nopic-dc-rownum-text{display:none;}
.nopic-dc-row:hover .nopic-dc-row-del{display:inline-block !important;}
`;
    document.documentElement.appendChild(_dcAnimStyle);
  }

  // ===== 自动点击器设置弹窗 =====
  const autoClickerSubmenu = document.createElement("div");
  autoClickerSubmenu.id = "nopic-autoclicker-submenu";
  autoClickerSubmenu.className = "nopic-submenu";
  autoClickerSubmenu.innerHTML = `
    <div class="nopic-modal-header">
      <span class="nopic-modal-title">自动点击器</span>
      <div class="nopic-modal-close" id="nopic-autoclicker-close">×</div>
    </div>
    <div class="nopic-textreplace-section">
      <div class="nopic-textreplace-section-title">执行流程（从上到下顺序执行）</div>
      <div id="nopic-autoclicker-flow-list" style="max-height:200px;overflow-y:auto;padding-right:4px;"></div>
<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
  <div class="nopic-textreplace-add-btn" id="nopic-autoclicker-add-delay" style="flex:1;min-width:80px;">+ 延时</div>
  <div class="nopic-textreplace-add-btn" id="nopic-autoclicker-add-wait" style="flex:1;min-width:80px;">+ 智能等待</div>  <!-- 新增这一行 -->
  <div class="nopic-textreplace-add-btn" id="nopic-autoclicker-add-click" style="flex:1;min-width:80px;">+ 点击元素</div>
  <div class="nopic-textreplace-add-btn" id="nopic-autoclicker-add-position" style="flex:1;min-width:80px;">+ 点击位置</div>
  <div class="nopic-textreplace-add-btn" id="nopic-autoclicker-add-input" style="flex:1;min-width:80px;">+ 输入文字</div>
  <div class="nopic-textreplace-add-btn" id="nopic-autoclicker-add-shortcut" style="flex:1;min-width:80px;">+ 快捷键</div>
  <div class="nopic-textreplace-add-btn" id="nopic-autoclicker-add-script" style="flex:1;min-width:80px;">+ 运行脚本</div>
</div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="font-size:11px;color:rgba(255,255,255,0.7);">循环次数 (0为无限)</span>
    <input type="number" id="nopic-autoclicker-loop-count" min="0" value="1" style="width:60px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#fff;font-size:12px;padding:4px 6px;text-align:right;">
</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:11px;color:rgba(255,255,255,0.7);">轮次安全延迟(秒)</span>
        <input type="number" id="nopic-autoclicker-safety-delay" min="0" max="30" value="3" style="width:60px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#fff;font-size:12px;padding:4px 6px;text-align:right;">
      </div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="font-size:11px;color:rgba(255,255,255,0.7);">刷新后自动启动</span>
    <div class="nopic-switch" id="nopic-autoclicker-autostart-toggle" style="cursor:pointer;"></div>
</div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="font-size:11px;color:rgba(255,255,255,0.7);">执行过程提示</span>
    <div class="nopic-switch on" id="nopic-autoclicker-notif-toggle" style="cursor:pointer;"></div>
</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="font-size:11px;color:rgba(255,255,255,0.7);">精确匹配当前网站</span>
    <div class="nopic-switch" id="nopic-autoclicker-exactmatch-toggle" style="cursor:pointer;"></div>
</div>
    </div>
    <div class="nopic-privacy-actions" style="margin-top:8px;display:flex;gap:6px;">
  <button class="nopic-privacy-btn primary" id="nopic-autoclicker-save-btn" style="flex:1;padding:6px 0;font-size:12px;border-radius:4px;">保存</button>
  <button class="nopic-privacy-btn primary" id="nopic-autoclicker-save-execute-btn" style="flex:1;padding:6px 0;font-size:12px;border-radius:4px;background:rgba(74,222,128,0.25);border-color:rgba(74,222,128,0.5);color:#4ade80;">保存并执行</button>
</div>
    <div style="margin-top:4px;text-align:center;display:flex;gap:12px;justify-content:center;">
      <span class="nopic-privacy-link danger" id="nopic-autoclicker-clear-btn">清空当前页</span>
      <span class="nopic-privacy-link danger" id="nopic-autoclicker-clear-domain-btn">清空本域名</span>
      <span class="nopic-privacy-link danger" id="nopic-autoclicker-clear-global-btn">清空全局</span>
    </div>
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);">
      <div style="font-size:11px;color:rgba(255,255,255,0.5);line-height:1.5;">
        <div>• 智能等待即等待元素加载才执行操作</div>
        <div>• 由于浏览器安全限制，快捷键可能使用受限</div>
        <div>• 安全延迟是为了防止陷入无法停止的死循环</div>
      </div>
    </div>
  `;

  // ===== 自动点击器运行状态面板 =====
  const autoClickerStatusPanel = document.createElement("div");
  autoClickerStatusPanel.id = "nopic-autoclicker-status-panel";
  autoClickerStatusPanel.innerHTML = `
    <div id="nopic-ac-status-text" style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-right:10px;">准备中...</div>
    <div id="nopic-ac-status-stop" style="padding:3px 10px;background:rgba(239,68,68,0.3);border:1px solid rgba(239,68,68,0.5);border-radius:4px;color:#f87171;font-size:11px;cursor:pointer;white-space:nowrap;margin-left:auto;">终止执行</div>
  `;
  document.documentElement.appendChild(autoClickerStatusPanel);

  function showAutoClickerStatusPanel() {
    const panel = document.getElementById("nopic-autoclicker-status-panel");
    if (!panel) return;

    // 清除之前的隐藏定时器
    if (panel._hideTimer) {
      clearTimeout(panel._hideTimer);
      panel._hideTimer = null;
    }

    panel.classList.add("active");
    const textEl = document.getElementById("nopic-ac-status-text");
    if (textEl) {
      textEl.style.display =
        autoClickerConfig.showNotification === false ? "none" : "";
    }
  }

  function hideAutoClickerStatusPanel() {
    const panel = document.getElementById("nopic-autoclicker-status-panel");
    if (!panel) return;
    // 清除之前的隐藏定时器
    if (panel._hideTimer) {
      clearTimeout(panel._hideTimer);
      panel._hideTimer = null;
    }
    panel.classList.remove("active");
  }

  function updateAutoClickerStatus(msg, type, countdownMs) {
    const panel = document.getElementById("nopic-autoclicker-status-panel");
    const textEl = document.getElementById("nopic-ac-status-text");
    if (!textEl || !panel) return;

    // 确保面板是可见的
    if (!panel.classList.contains("active")) {
      panel.classList.add("active");
    }

    // 如果关闭了执行提示，隐藏文字只保留终止按钮
    if (autoClickerConfig.showNotification === false) {
      textEl.style.display = "none";
      return;
    } else {
      textEl.style.display = "";
    }

    // 清除之前的倒计时
    if (textEl._countdownTimer) {
      clearInterval(textEl._countdownTimer);
      delete textEl._countdownTimer;
    }

    // 如果是 'done' 类型（已终止/已完成），不显示倒计时
    if (type === "done") {
      textEl.textContent = msg;
      textEl.style.color = "#fbbf24";
      return;
    }

    textEl.textContent = msg;
    // 根据状态类型改变颜色
    textEl.style.color =
      type === "error"
        ? "#f87171"
        : type === "success"
          ? "#4ade80"
          : type === "done"
            ? "#fbbf24"
            : "rgba(255,255,255,0.9)";

    // 如果有倒计时，显示并更新
    if (countdownMs && countdownMs > 0) {
      let remaining = Math.ceil(countdownMs / 1000);
      const originalText = msg;

      const updateCountdown = () => {
        if (!textEl.parentNode) {
          clearInterval(textEl._countdownTimer);
          delete textEl._countdownTimer;
          return;
        }
        textEl.textContent = originalText + " (" + remaining + "s)";
        remaining--;
        if (remaining < 0) {
          clearInterval(textEl._countdownTimer);
          delete textEl._countdownTimer;
        }
      };

      updateCountdown();
      textEl._countdownTimer = setInterval(updateCountdown, 1000);
    }
  }

  document
    .getElementById("nopic-ac-status-stop")
    .addEventListener("click", () => {
      if (autoClickerAbortController) {
        autoClickerAbortController.abort();
        autoClickerAbortController = null;
      }
      isAutoClickerRunning = false;

      const panel = document.getElementById("nopic-autoclicker-status-panel");
      const textEl = document.getElementById("nopic-ac-status-text");
      const stopBtn = document.getElementById("nopic-ac-status-stop");

      if (textEl) {
        // 清除倒计时
        if (textEl._countdownTimer) {
          clearInterval(textEl._countdownTimer);
          delete textEl._countdownTimer;
        }
        textEl.textContent = "已终止，下次触发将重新执行";
        textEl.style.color = "#fbbf24";
        panel.classList.add("active");
      }

      // 隐藏终止执行按钮
      if (stopBtn) {
        stopBtn.style.display = "none";
      }

      // 延迟隐藏整个面板
      if (panel) {
        if (panel._hideTimer) {
          clearTimeout(panel._hideTimer);
        }
        panel._hideTimer = setTimeout(() => {
          hideAutoClickerStatusPanel();
          // 恢复终止按钮显示，以便下次使用
          if (stopBtn) {
            stopBtn.style.display = "";
          }
        }, 2000);
      }
    });

  // 执行提示开关事件（使用事件委托，避免DOM未渲染时报错）
  autoClickerSubmenu.addEventListener("click", (e) => {
    const toggle = e.target.closest("#nopic-autoclicker-notif-toggle");
    if (!toggle) return;
    e.stopPropagation();
    toggle.classList.toggle("on");
  });

  // 初始化循环次数输入框和开关状态
  setTimeout(() => {
    const loopInput = document.getElementById("nopic-autoclicker-loop-count");
    if (loopInput) loopInput.value = autoClickerConfig.loopCount || 1;
    // 精确匹配开关
    const exactToggle = document.getElementById(
      "nopic-autoclicker-exactmatch-toggle",
    );
    if (exactToggle) {
      if (getAutoClickerExactMatch()) exactToggle.classList.add("on");
      else exactToggle.classList.remove("on");
      exactToggle.addEventListener("click", function (e) {
        e.stopPropagation();
        this.classList.toggle("on");
        const newVal = this.classList.contains("on");
        setAutoClickerExactMatch(newVal);
        // 切换后立即刷新配置（路径变化）
        autoClickerConfig = getAutoClickerConfig();
        if (autoClickerSubmenuOpen) {
          updateAutoClickerFlowList();
        }
        // 如果正在运行，停止
        if (isAutoClickerRunning && autoClickerAbortController) {
          autoClickerAbortController.abort();
          isAutoClickerRunning = false;
          autoClickerAbortController = null;
          hideAutoClickerStatusPanel();
        }
      });
    }
    const safetyInput = document.getElementById(
      "nopic-autoclicker-safety-delay",
    );
    if (safetyInput) safetyInput.value = 3;
    const notifToggle = document.getElementById(
      "nopic-autoclicker-notif-toggle",
    );
    if (notifToggle) {
      if (autoClickerConfig.showNotification === false)
        notifToggle.classList.remove("on");
      else notifToggle.classList.add("on");
    }
    const autostartToggle = document.getElementById(
      "nopic-autoclicker-autostart-toggle",
    );
    if (autostartToggle) {
      if (autoClickerConfig.autoStartOnLoad === false)
        autostartToggle.classList.remove("on");
      else autostartToggle.classList.add("on");
      // 只切换样式，不保存，等保存按钮统一处理
      autostartToggle.addEventListener("click", function (e) {
        e.stopPropagation();
        this.classList.toggle("on");
      });
    }
  }, 100);

  // ===== 页面可编辑弹窗 =====
  const pageEditSubmenu = document.createElement("div");
  pageEditSubmenu.id = "nopic-pageedit-submenu";
  pageEditSubmenu.className = "nopic-submenu";
  pageEditSubmenu.innerHTML = `
    <div class="nopic-modal-header">
      <span class="nopic-modal-title">页面可编辑</span>
      <div class="nopic-modal-close" id="nopic-pageedit-close">×</div>
    </div>
    <div class="nopic-privacy-section">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
        <span style="font-size:13px;color:rgba(255,255,255,0.9);">启用页面编辑模式</span>
        <div class="nopic-switch" id="nopic-pageedit-switch"></div>
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,0.5);line-height:1.6;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);">
        <div>开启后可直接在页面上编辑文字内容，就和在文档一样轻松。</div>
        <div style="margin-top:6px;color:rgba(255,255,255,0.4);">此开关关闭页面后自动重置，不会记忆状态。</div>
      </div>
    </div>
  `;

  // ===== 替换文字设置弹窗 =====
  const textReplaceSubmenu = document.createElement("div");
  textReplaceSubmenu.id = "nopic-textreplace-submenu";
  textReplaceSubmenu.className = "nopic-submenu";
  textReplaceSubmenu.style.minWidth = "500px";
  textReplaceSubmenu.style.maxWidth = "720px";
  textReplaceSubmenu.innerHTML = `
  <div class="nopic-modal-header" style="padding-bottom:12px;margin-bottom:4px;">
    <span class="nopic-modal-title" style="font-size:15px;font-weight:600;">文字替换</span>
    <div class="nopic-modal-close" id="nopic-textreplace-close" style="width:24px;height:24px;font-size:14px;">✕</div>
  </div>

<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.5;">
  规则自动生效，每次刷新页面都会进行文字替换。
</div>

  <div class="nopic-mask-list-container" style="display:flex;gap:12px;margin-top:12px;max-height:70vh;overflow-y:auto;padding:0 2px;align-items:stretch;">
    
    <!-- 仅当前页 -->
    <div class="nopic-mask-list-column" style="flex:1;min-width:0;background:rgba(255,255,255,0.03);border-radius:10px;padding:10px 10px 8px 10px;border:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;">
      <div class="nopic-mask-list-column-title" style="display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:500;color:rgba(255,255,255,0.5);padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:6px;">
        <span>仅当前页</span>
        <span class="nopic-scope-clear-btn" data-tr-clear="url" title="清除当前URL配置" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;font-size:11px;color:#f87171;cursor:pointer;background:transparent;transition:background 0.2s;flex-shrink:0;" onmouseover="this.style.background='rgba(248,113,113,0.12)'" onmouseout="this.style.background='transparent'">✕</span>
      </div>
      <div class="nopic-mask-list" id="nopic-tr-list-url" style="flex:1;"></div>
      <div class="nopic-textreplace-add-btn" data-tr-add="url" style="display:flex;align-items:center;justify-content:center;padding:6px 0;margin-top:6px;background:rgba(96,165,250,0.08);border:1px dashed rgba(96,165,250,0.2);border-radius:6px;cursor:pointer;font-size:12px;color:#60a5fa;transition:all 0.2s;flex-shrink:0;" onmouseover="this.style.background='rgba(96,165,250,0.18)';this.style.borderColor='rgba(96,165,250,0.35)'" onmouseout="this.style.background='rgba(96,165,250,0.08)';this.style.borderColor='rgba(96,165,250,0.2)'">+ 添加</div>
    </div>

    <!-- 当前网站 -->
    <div class="nopic-mask-list-column" style="flex:1;min-width:0;background:rgba(255,255,255,0.03);border-radius:10px;padding:10px 10px 8px 10px;border:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;">
      <div class="nopic-mask-list-column-title" style="display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:500;color:rgba(255,255,255,0.5);padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:6px;">
        <span>当前网站</span>
        <span class="nopic-scope-clear-btn" data-tr-clear="domain" title="清除域名配置" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;font-size:11px;color:#f87171;cursor:pointer;background:transparent;transition:background 0.2s;flex-shrink:0;" onmouseover="this.style.background='rgba(248,113,113,0.12)'" onmouseout="this.style.background='transparent'">✕</span>
      </div>
      <div class="nopic-mask-list" id="nopic-tr-list-domain" style="flex:1;"></div>
      <div class="nopic-textreplace-add-btn" data-tr-add="domain" style="display:flex;align-items:center;justify-content:center;padding:6px 0;margin-top:6px;background:rgba(96,165,250,0.08);border:1px dashed rgba(96,165,250,0.2);border-radius:6px;cursor:pointer;font-size:12px;color:#60a5fa;transition:all 0.2s;flex-shrink:0;" onmouseover="this.style.background='rgba(96,165,250,0.18)';this.style.borderColor='rgba(96,165,250,0.35)'" onmouseout="this.style.background='rgba(96,165,250,0.08)';this.style.borderColor='rgba(96,165,250,0.2)'">+ 添加</div>
    </div>

    <!-- 全局通用 -->
    <div class="nopic-mask-list-column" style="flex:1;min-width:0;background:rgba(255,255,255,0.03);border-radius:10px;padding:10px 10px 8px 10px;border:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;">
      <div class="nopic-mask-list-column-title" style="display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:500;color:rgba(255,255,255,0.5);padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:6px;">
        <span>全局通用</span>
        <span class="nopic-scope-clear-btn" data-tr-clear="global" title="清除全局配置" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;font-size:11px;color:#f87171;cursor:pointer;background:transparent;transition:background 0.2s;flex-shrink:0;" onmouseover="this.style.background='rgba(248,113,113,0.12)'" onmouseout="this.style.background='transparent'">✕</span>
      </div>
      <div class="nopic-mask-list" id="nopic-tr-list-global" style="flex:1;"></div>
      <div class="nopic-textreplace-add-btn" data-tr-add="global" style="display:flex;align-items:center;justify-content:center;padding:6px 0;margin-top:6px;background:rgba(96,165,250,0.08);border:1px dashed rgba(96,165,250,0.2);border-radius:6px;cursor:pointer;font-size:12px;color:#60a5fa;transition:all 0.2s;flex-shrink:0;" onmouseover="this.style.background='rgba(96,165,250,0.18)';this.style.borderColor='rgba(96,165,250,0.35)'" onmouseout="this.style.background='rgba(96,165,250,0.08)';this.style.borderColor='rgba(96,165,250,0.2)'">+ 添加</div>
    </div>

  </div>
`;

  const quickTextSubmenu = document.createElement("div");
  quickTextSubmenu.id = "nopic-quicktext-submenu";
  quickTextSubmenu.className = "nopic-modal-popup";
  quickTextSubmenu.style.minWidth = "500px";
  quickTextSubmenu.style.maxWidth = "720px";
  quickTextSubmenu.innerHTML = `
  <div class="nopic-modal-header" style="padding-bottom:12px;margin-bottom:4px;">
    <span class="nopic-modal-title" style="font-size:15px;font-weight:600;">快捷文本输入</span>
    <div class="nopic-modal-close" id="nopic-quicktext-close">✕</div>
  </div>

  <div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.5;">
  设置快捷键后，在任意输入框按下组合键即可自动填入对应文本。
</div>

  <div class="nopic-mask-list-container" style="display:flex;gap:12px;margin-top:12px;max-height:70vh;overflow-y:auto;padding:0 2px;align-items:stretch;">
    
    <!-- 仅当前页 -->
    <div class="nopic-mask-list-column" style="flex:1;min-width:0;background:rgba(255,255,255,0.03);border-radius:10px;padding:10px 10px 8px 10px;border:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;">
      <div class="nopic-mask-list-column-title" style="display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:500;color:rgba(255,255,255,0.5);padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:6px;">
        <span>仅当前页</span>
        <span class="nopic-scope-clear-btn" data-qt-clear="url" title="清除当前URL配置" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;font-size:13px;color:#f87171;cursor:pointer;background:transparent;transition:background 0.2s;flex-shrink:0;" onmouseover="this.style.background='rgba(248,113,113,0.12)'" onmouseout="this.style.background='transparent'">✕</span>
      </div>
      <div class="nopic-mask-list" id="nopic-qt-list-url" style="flex:1;"></div>
      <div class="nopic-textreplace-add-btn" data-qt-add="url" style="display:flex;align-items:center;justify-content:center;padding:6px 0;margin-top:6px;background:rgba(96,165,250,0.08);border:1px dashed rgba(96,165,250,0.2);border-radius:6px;cursor:pointer;font-size:12px;color:#60a5fa;transition:all 0.2s;flex-shrink:0;" onmouseover="this.style.background='rgba(96,165,250,0.18)';this.style.borderColor='rgba(96,165,250,0.35)'" onmouseout="this.style.background='rgba(96,165,250,0.08)';this.style.borderColor='rgba(96,165,250,0.2)'">+ 添加</div>
    </div>

    <!-- 当前网站 -->
    <div class="nopic-mask-list-column" style="flex:1;min-width:0;background:rgba(255,255,255,0.03);border-radius:10px;padding:10px 10px 8px 10px;border:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;">
      <div class="nopic-mask-list-column-title" style="display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:500;color:rgba(255,255,255,0.5);padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:6px;">
        <span>当前网站</span>
        <span class="nopic-scope-clear-btn" data-qt-clear="domain" title="清除域名配置" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;font-size:13px;color:#f87171;cursor:pointer;background:transparent;transition:background 0.2s;flex-shrink:0;" onmouseover="this.style.background='rgba(248,113,113,0.12)'" onmouseout="this.style.background='transparent'">✕</span>
      </div>
      <div class="nopic-mask-list" id="nopic-qt-list-domain" style="flex:1;"></div>
      <div class="nopic-textreplace-add-btn" data-qt-add="domain" style="display:flex;align-items:center;justify-content:center;padding:6px 0;margin-top:6px;background:rgba(96,165,250,0.08);border:1px dashed rgba(96,165,250,0.2);border-radius:6px;cursor:pointer;font-size:12px;color:#60a5fa;transition:all 0.2s;flex-shrink:0;" onmouseover="this.style.background='rgba(96,165,250,0.18)';this.style.borderColor='rgba(96,165,250,0.35)'" onmouseout="this.style.background='rgba(96,165,250,0.08)';this.style.borderColor='rgba(96,165,250,0.2)'">+ 添加</div>
    </div>

    <!-- 全局通用 -->
    <div class="nopic-mask-list-column" style="flex:1;min-width:0;background:rgba(255,255,255,0.03);border-radius:10px;padding:10px 10px 8px 10px;border:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;">
      <div class="nopic-mask-list-column-title" style="display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:500;color:rgba(255,255,255,0.5);padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:6px;">
        <span>全局通用</span>
        <span class="nopic-scope-clear-btn" data-qt-clear="global" title="清除全局配置" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;font-size:13px;color:#f87171;cursor:pointer;background:transparent;transition:background 0.2s;flex-shrink:0;" onmouseover="this.style.background='rgba(248,113,113,0.12)'" onmouseout="this.style.background='transparent'">✕</span>
      </div>
      <div class="nopic-mask-list" id="nopic-qt-list-global" style="flex:1;"></div>
      <div class="nopic-textreplace-add-btn" data-qt-add="global" style="display:flex;align-items:center;justify-content:center;padding:6px 0;margin-top:6px;background:rgba(96,165,250,0.08);border:1px dashed rgba(96,165,250,0.2);border-radius:6px;cursor:pointer;font-size:12px;color:#60a5fa;transition:all 0.2s;flex-shrink:0;" onmouseover="this.style.background='rgba(96,165,250,0.18)';this.style.borderColor='rgba(96,165,250,0.35)'" onmouseout="this.style.background='rgba(96,165,250,0.08)';this.style.borderColor='rgba(96,165,250,0.2)'">+ 添加</div>
    </div>

  </div>
`;
  document.documentElement.appendChild(quickTextSubmenu);

  // 这8个依然挂载在 menu 下（保持点击时的相对定位基准）
  menu.appendChild(settingsSubmenu);
  menu.appendChild(displaySubmenu);
  menu.appendChild(disguiseSubmenu);
  // 下面这7个弹窗不挂载到 menu 下，直接挂载到 document.documentElement
  document.documentElement.appendChild(tabDisguiseSubmenu);
  document.documentElement.appendChild(maskSubmenu);
  document.documentElement.appendChild(privacyLockSubmenu);
  document.documentElement.appendChild(textReplaceSubmenu);
  document.documentElement.appendChild(autoClickerSubmenu);
  document.documentElement.appendChild(pageEditSubmenu);

  document.documentElement.appendChild(widget);
  document.documentElement.appendChild(menu);

  // PIN输入状态
  let pinInputState = {
    value: "",
    attempts: 0,
    maxAttempts: 3,
    isActive: false,
  };

  // 显示PIN输入界面
  function showPinInput() {
    const wrapper = document.getElementById("nopic-lock-wrapper");
    const pinArea = document.getElementById("nopic-lock-pin-area");
    const hint = document.getElementById("nopic-lock-hint");
    const arrow = document.querySelector(".nopic-privacy-lock-arrow");
    const bg = document.getElementById("nopic-lock-bg");

    // 重置背景为纯黑
    if (bg) {
      bg.style.transition = "background 0.3s ease";
      bg.style.background = "rgba(0,0,0,1)";
    }

    if (hint) hint.style.opacity = "0";
    if (arrow) arrow.style.opacity = "0";

    if (pinArea) {
      pinArea.style.display = "block";
      pinArea.style.opacity = "0";
      pinArea.style.transform = "translateY(10px)";
      pinArea.style.transition = "opacity 0.3s ease, transform 0.3s ease";
      requestAnimationFrame(() => {
        pinArea.style.opacity = "1";
        pinArea.style.transform = "translateY(0)";
      });
    }

    wrapper.style.transition =
      "transform 0.4s cubic-bezier(0.34, 1.0, 0.64, 1)";
    wrapper.style.transform = "translateY(-8%)";

    pinInputState.value = "";
    pinInputState.isActive = true;
    pinInputState.attempts = 0;
    document
      .querySelectorAll(".nopic-lock-pin-dot")
      .forEach((d) => (d.className = "nopic-lock-pin-dot"));
    document.getElementById("nopic-lock-pin-error").textContent = "";
    document.getElementById("nopic-lock-pin-skip").style.display = "none";
  }

  // 处理PIN输入
  function handlePinInput(key) {
    if (!pinInputState.isActive) return;

    var errorEl = document.getElementById("nopic-lock-pin-error");
    var skipEl = document.getElementById("nopic-lock-pin-skip");
    var dots = document.querySelectorAll(".nopic-lock-pin-dot");

    var savedState = GM_getValue("nopic_skip_toggle_global", null);
    var canSkip = savedState !== "false";

    // 同时更新 DOM 开关状态保持一致
    var skipToggle = document.getElementById("nopic-privacy-skip-toggle");
    if (skipToggle) {
      if (canSkip) {
        skipToggle.classList.add("on");
      } else {
        skipToggle.classList.remove("on");
      }
      var forgotBtn = document.getElementById("nopic-privacy-forgot-btn");
      if (forgotBtn) {
        forgotBtn.style.display = canSkip ? "" : "none";
      }
    }

    if (key === "Backspace") {
      pinInputState.value = pinInputState.value.slice(0, -1);
    } else if (key >= "0" && key <= "9" && pinInputState.value.length < 4) {
      pinInputState.value += key;
    }

    dots.forEach(function (dot, i) {
      dot.className =
        "nopic-lock-pin-dot" +
        (i < pinInputState.value.length ? " filled" : "");
    });

    dots.forEach(function (d) {
      d.classList.remove("error");
    });
    errorEl.textContent = "";

    if (pinInputState.value.length === 4) {
      var effective = getEffectivePrivacyLock();
      if (pinInputState.value === effective.password) {
        pinInputState.isActive = false;
        errorEl.textContent = "✓ 解锁成功";
        errorEl.style.color = "#4ade80";
        setTimeout(function () {
          hidePrivacyLockOverlay(true);
          addPrivacyLog("pin_unlock", true);
          pinInputState.attempts = 0;
        }, 400);
      } else {
        pinInputState.attempts++;
        pinInputState.value = "";
        dots.forEach(function (d) {
          d.className = "nopic-lock-pin-dot error";
        });
        errorEl.textContent = "密码错误";
        errorEl.style.color = "#f87171";
        addPrivacyLog("pin_wrong", false);

        // 只有 canSkip 为 true 且错误次数 >= 3 时才显示跳过按钮
        if (canSkip && pinInputState.attempts >= 3) {
          skipEl.style.display = "inline-block";
          skipEl.onclick = function (e) {
            e.stopPropagation();
            showConfirmModal(
              "确认跳过密码？",
              "跳过密码解锁会被记录。确定要跳过吗？",
              function () {
                // 用户点击确定 - 执行跳过
                pinInputState.isActive = false;
                privacyLockRuntime.forgotUnlockTime = Date.now();
                // 设置待重置标志，用于刷新后提醒
                localStorage.setItem(
                  "nopic_pending_password_reset_" + location.host,
                  "true",
                );
                window._nopicResetAcknowledged = false;
                // 先解锁
                hidePrivacyLockOverlay(true);
                addPrivacyLog("pin_skip", true);
                // 延迟弹出安全警告
                setTimeout(function () {
                  showConfirmModalWithAck(
                    "⚠️ 安全警告",
                    '您已使用"忘记密码跳过解锁"功能，当前密码尚未重置。请立即在隐私锁设置中重置密码，以保护页面安全。',
                  );
                }, 400);
              },
              function () {
                // 用户点击取消 - 回到输入状态
                pinInputState.value = "";
                pinInputState.attempts = 0;
                document
                  .querySelectorAll(".nopic-lock-pin-dot")
                  .forEach(function (d) {
                    d.className = "nopic-lock-pin-dot";
                  });
                var errorEl = document.getElementById("nopic-lock-pin-error");
                if (errorEl) {
                  errorEl.textContent = "已取消，请重新输入密码";
                  errorEl.style.color = "#60a5fa";
                }
                var skipEl = document.getElementById("nopic-lock-pin-skip");
                if (skipEl) {
                  skipEl.style.display = "none";
                  skipEl.onclick = null;
                }
              },
            );
          };
        } else {
          skipEl.style.display = "none";
          skipEl.onclick = null;
        }
      }
    }
  }

  // 修改attemptLockUnlock函数，有密码时进入PIN模式
  function attemptLockUnlock() {
    const effective = getEffectivePrivacyLock();

    // 只有密码存在且为4位时才需要PIN验证
    if (effective.password && effective.password.length === 4) {
      showPinInput();
      return;
    }

    // 无密码或密码不完整，直接解锁
    hidePrivacyLockOverlay(true);
    addPrivacyLog("unlock_slide", true);
  }

  // ===== 隐私锁遮罩层 =====
  const privacyLockOverlay = document.createElement("div");
  privacyLockOverlay.id = "nopic-privacy-lock-overlay";
  privacyLockOverlay.innerHTML = `
  <div class="nopic-privacy-lock-bg" id="nopic-lock-bg"></div>
  <div class="nopic-privacy-lock-wrapper" id="nopic-lock-wrapper">
    <div class="nopic-privacy-lock-handle">
      <div class="nopic-privacy-lock-arrow">⌃</div>
      <div class="nopic-privacy-lock-hint" id="nopic-lock-hint">上拉以解锁</div>
    </div>
    <div class="nopic-privacy-lock-content">
  <div class="nopic-privacy-lock-time" id="nopic-lock-time"></div>
  <div class="nopic-privacy-lock-sub" id="nopic-lock-sub" style="font-size:18px;font-weight:300;color:rgba(255,255,255,0.5);margin-top:8px;letter-spacing:2px;"></div>
  <!-- PIN输入区域 -->
  <div class="nopic-lock-pin-area" id="nopic-lock-pin-area" style="display:none;">
    <div class="nopic-lock-pin-message" id="nopic-lock-pin-message">请输入PIN码</div>
    <div class="nopic-lock-pin-dots">
      <span class="nopic-lock-pin-dot" data-index="0"></span>
      <span class="nopic-lock-pin-dot" data-index="1"></span>
      <span class="nopic-lock-pin-dot" data-index="2"></span>
      <span class="nopic-lock-pin-dot" data-index="3"></span>
    </div>
    <div class="nopic-lock-pin-error" id="nopic-lock-pin-error"></div>
    <div class="nopic-lock-pin-skip" id="nopic-lock-pin-skip" style="display:none;">
      <span>点击此处跳过解锁</span>
    </div>
  </div>
</div>
  </div>
`;
  document.documentElement.appendChild(privacyLockOverlay);

  // ===== 隐私锁日志面板 =====
  const privacyLogPanel = document.createElement("div");
  privacyLogPanel.id = "nopic-privacy-log-panel";
  privacyLogPanel.innerHTML = `
    <div class="nopic-privacy-log-header">
      <span class="nopic-privacy-log-title">解锁日志</span>
      <div class="nopic-privacy-log-close" id="nopic-privacy-log-close">×</div>
    </div>
    <div class="nopic-privacy-log-filters">
      <div class="nopic-privacy-log-filter-btn active" data-filter="all">全部</div>
      <div class="nopic-privacy-log-filter-btn" data-filter="unlock">解锁</div>
      <div class="nopic-privacy-log-filter-btn" data-filter="lock">锁定</div>
      <div class="nopic-privacy-log-filter-btn" data-filter="error">错误</div>
    </div>
    <div class="nopic-privacy-log-list" id="nopic-privacy-log-list"></div>
    <div class="nopic-privacy-log-pagination">
      <button class="nopic-privacy-log-page-btn" id="nopic-log-prev-btn">上一页</button>
      <span class="nopic-privacy-log-page-info" id="nopic-log-page-info">1/1</span>
      <button class="nopic-privacy-log-page-btn" id="nopic-log-next-btn">下一页</button>
    </div>
  `;
  document.documentElement.appendChild(privacyLogPanel);

  // 日志分页和过滤状态
  let logCurrentPage = 1;
  let logCurrentFilter = "all";
  const logPageSize = 10;

  function applySnapPosition(isInit) {
    let offsetX =
      localStorage.getItem("nopicPanelXOffset") !== null
        ? parseFloat(localStorage.getItem("nopicPanelXOffset"))
        : 0;
    let offsetY =
      localStorage.getItem("nopicPanelYOffset") !== null
        ? parseFloat(localStorage.getItem("nopicPanelYOffset"))
        : 0;

    widget.classList.remove("snap-left", "snap-right");

    if (autoSnapConfig) {
      // 关键修复：如果当前已经在右边（right:0 或 left:auto），保持贴右
      let currentlyOnRight =
        widget.style.right === "0" || widget.style.left === "auto";

      let snapToRight = isInit
        ? offsetX > 0
        : currentlyOnRight ||
          widget.offsetLeft > document.documentElement.clientWidth / 2;

      if (snapToRight) {
        widget.classList.add("snap-right");
        if (isInit) {
          widget.style.left = "auto";
          widget.style.right = "0";
        } else {
          widget.style.left =
            document.documentElement.clientWidth - widget.offsetWidth + "px";
          widget.style.right = "auto";
        }
      } else {
        widget.classList.add("snap-left");
        widget.style.left = "0";
        widget.style.right = "auto";
      }
    } else {
      let currentX = document.documentElement.clientWidth / 2 + offsetX;
      widget.style.left =
        Math.max(
          0,
          Math.min(
            document.documentElement.clientWidth - widget.offsetWidth,
            currentX,
          ),
        ) + "px";
      widget.style.right = "auto";
    }

    let currentY = window.innerHeight / 2 + offsetY;
    widget.style.top =
      Math.max(
        0,
        Math.min(window.innerHeight - widget.offsetHeight, currentY),
      ) + "px";
  }
  applySnapPosition(true);

  let isDragging = false,
    startMouseX,
    startMouseY,
    startElemX,
    startElemY,
    mouseDownTime = 0;
  let isHovering = false,
    hoverTimer = null;

  function updateAllUI() {
    settingsSubmenu
      .querySelector('[data-key="loadAnimation"]')
      .classList.toggle("on", loadAnimationConfig);
    settingsSubmenu
      .querySelector('[data-key="disableAnimation"]')
      .classList.toggle("on", disableAnimationConfig);
    settingsSubmenu
      .querySelector('[data-key="outline"]')
      .classList.toggle("on", showOutlineConfig);
    settingsSubmenu
      .querySelector('[data-key="hoverOnly"]')
      .classList.toggle("on", hoverOnlyConfig);
    settingsSubmenu
      .querySelector('[data-key="hoverShowImg"]')
      .classList.toggle("on", hoverShowImgConfig);
    settingsSubmenu
      .querySelector('[data-key="autoSnap"]')
      .classList.toggle("on", autoSnapConfig);
    settingsSubmenu
      .querySelector('[data-key="autoHideIdle"]')
      .classList.toggle("on", autoHideIdleConfig);
    settingsSubmenu
      .querySelector('[data-key="zoomPinMode"]')
      .classList.toggle("on", zoomPinModeConfig);
    const hoverZoomBtn = settingsSubmenu.querySelector(
      '.nopic-range-btn[data-zoom="hover"]',
    );
    const clickZoomBtn = settingsSubmenu.querySelector(
      '.nopic-range-btn[data-zoom="click"]',
    );
    const isRedLight = window.imgHidenSet === null;

    // 判断当前UI上应该高亮哪个按钮
    let activeZoomMode = zoomModeConfig;

    if (isRedLight) {
      // 红灯状态：隐藏悬停和点击选项
      if (hoverZoomBtn) hoverZoomBtn.style.display = "none";
      if (clickZoomBtn) clickZoomBtn.style.display = "none";
      // 如果原始配置是悬停或点击，只在UI上临时显示为中键，【绝不改写 zoomModeConfig】，保留原始记忆
      if (zoomModeConfig === "hover" || zoomModeConfig === "click") {
        activeZoomMode = "middle";
      }
    } else {
      // 绿灯状态：恢复显示逻辑
      if (hoverZoomBtn) hoverZoomBtn.style.display = "";
      if (clickZoomBtn)
        clickZoomBtn.style.display = hoverShowImgConfig ? "none" : "";
      if (hoverShowImgConfig && zoomModeConfig === "click") {
        zoomModeConfig = "hover";
        setLocalConfig("zoomMode", zoomModeConfig);
      }
    }
    // 使用计算出的 activeZoomMode 来高亮，而不是直接用 zoomModeConfig
    settingsSubmenu
      .querySelectorAll(".nopic-range-btn[data-zoom]")
      .forEach((btn) =>
        btn.classList.toggle("active", btn.dataset.zoom === activeZoomMode),
      );
    settingsSubmenu
      .querySelectorAll(".nopic-range-btn[data-leave]")
      .forEach((btn) =>
        btn.classList.toggle(
          "active",
          btn.dataset.leave === zoomLeaveModeConfig,
        ),
      );
    displaySubmenu
      .querySelectorAll(".nopic-range-btn[data-range]")
      .forEach((btn) =>
        btn.classList.toggle("active", btn.dataset.range === statsRangeConfig),
      );
    const map = [
      "Time",
      "Seconds",
      "Count",
      "Total",
      "Percent",
      "Host",
      "AdCount",
      "Memory",
      "LoadTime",
      "ResCount",
      "MouseDistance",
      "ClickCount",
      "ScrollDist",
      "ReadChars",
    ];
    map.forEach((k) => {
      const key = "display" + k;
      const configKey = k.charAt(0).toLowerCase() + k.slice(1);
      const item = displaySubmenu.querySelector('[data-key="' + key + '"]');
      if (item && configs[configKey] !== undefined)
        item
          .querySelector(".nopic-checkbox")
          .classList.toggle("checked", configs[configKey]);
    });
    const leaveOptions = settingsSubmenu.querySelector("#nopic-leave-options");
    if (leaveOptions)
      leaveOptions.style.display = zoomModeConfig === "hover" ? "" : "none";
    const filterRow = document.getElementById("nopic-parade-filter-row");
    const filterInputs = document.getElementById("nopic-parade-filter-inputs");
    const filterToggle = document.getElementById("nopic-parade-filter-toggle");
    if (filterRow) filterRow.style.display = isParadeMode ? "none" : "";
    if (filterInputs)
      filterInputs.style.display =
        !isParadeMode && paradeFilter.enabled ? "flex" : "none";
    if (filterToggle) filterToggle.classList.toggle("on", paradeFilter.enabled);
    const pfMinW = document.getElementById("nopic-pf-minW");
    const pfMinH = document.getElementById("nopic-pf-minH");
    const pfMaxW = document.getElementById("nopic-pf-maxW");
    const pfMaxH = document.getElementById("nopic-pf-maxH");
    if (pfMinW) pfMinW.value = paradeFilter.minW;
    if (pfMinH) pfMinH.value = paradeFilter.minH;
    if (pfMaxW) pfMaxW.value = paradeFilter.maxW;
    if (pfMaxH) pfMaxH.value = paradeFilter.maxH;
    const aboutBtn = menu.querySelector('[data-action="about"]');
    if (aboutBtn) aboutBtn.style.display = isParadeMode ? "none" : "";

    // ===== 阅兵模式按钮显示 =====
    const paradeMenuEntry = document.getElementById("nopic-parade-menu-entry");
    const paradeToggle = document.getElementById("nopic-parade-toggle");
    if (paradeMenuEntry)
      paradeMenuEntry.style.display = paradeConfig.enabled ? "flex" : "none";
    if (paradeToggle) paradeToggle.classList.toggle("on", paradeConfig.enabled);

    // ===== 标签伪装UI更新 =====
    const disguiseToggle = document.getElementById("nopic-disguise-toggle");
    const tabDisguiseMenuEntry = document.getElementById(
      "nopic-tabdisguise-menu-entry",
    );
    if (disguiseToggle)
      disguiseToggle.classList.toggle("on", disguiseConfig.enabled);
    if (tabDisguiseMenuEntry)
      tabDisguiseMenuEntry.style.display = disguiseConfig.enabled
        ? "flex"
        : "none";
    // 更新场景按钮状态（显示配置实际来自哪个级别）
    tabDisguiseSubmenu.querySelectorAll("[data-scope]").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.dataset.scope === currentDisguiseScope,
      );
    });

    // ===== 页面局部遮罩UI更新 =====
    const maskToggle = document.getElementById("nopic-mask-toggle");
    const maskMenuEntry = document.getElementById("nopic-mask-menu-entry");
    if (maskToggle) maskToggle.classList.toggle("on", maskConfig.enabled);
    if (maskMenuEntry)
      maskMenuEntry.style.display = maskConfig.enabled ? "flex" : "none";
    // 更新场景按钮状态
    maskSubmenu.querySelectorAll("[data-scope]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.scope === currentMaskScope);
    });

    // ===== 网页隐私锁UI更新 =====
    const privacyLockToggle = document.getElementById(
      "nopic-privacylock-toggle",
    );
    const privacyLockMenuEntry = document.getElementById(
      "nopic-privacylock-menu-entry",
    );
    if (privacyLockToggle)
      privacyLockToggle.classList.toggle("on", privacyLockConfig.enabled);
    if (privacyLockMenuEntry)
      privacyLockMenuEntry.style.display = privacyLockConfig.enabled
        ? "flex"
        : "none";

    // 渲染隐私锁三列配置
    const effective = getEffectivePrivacyLock();
    const effectiveScope = effective._effectiveScope || null;

    const titles = {
      url: { text: "仅当前页", color: "#60a5fa" },
      domain: { text: "当前网站", color: "#b3951e" },
      global: { text: "全局通用", color: "#a855f7" },
    };

    ["url", "domain", "global"].forEach((scope) => {
      const listEl = document.getElementById(`nopic-pl-list-${scope}`);
      const activeTag = document.getElementById(`nopic-pl-active-${scope}`);
      if (!listEl) return;

      const cfg = getPrivacyLockConfigByScope(scope);
      const hasCustomConfig = hasStoredConfig(scope);
      const isActive = hasCustomConfig && effectiveScope === scope;

      // 关键：定义 hasPassword
      const hasPassword = cfg.password && cfg.password.length === 4;

      const opacity = isActive ? "1" : "0.4";
      const title = titles[scope];

      listEl.innerHTML = `
    <div style="opacity:${opacity};transition:opacity 0.3s ease;display:flex;flex-direction:column;flex:1;gap:6px;">
      <!-- 标题 -->
      <div style="font-size:10px;font-weight:600;color:${title.color};text-align:center;padding-bottom:4px;border-bottom:1px solid ${title.color}25;margin-bottom:4px;">
        ${title.text} <span id="nopic-pl-active-${scope}" style="display:${isActive ? "inline" : "none"};font-size:8px;background:${title.color};color:#fff;padding:1px 6px;border-radius:3px;margin-left:4px;">生效</span>
      </div>
      
      <!-- PIN码设置 -->
      <div style="background:rgba(255,255,255,0.03);border-radius:6px;padding:10px 8px;text-align:center;flex:1;display:flex;flex-direction:column;justify-content:center;">
        <div style="font-size:10px;color:rgba(255,255,255,0.3);margin-bottom:6px;">PIN码</div>
        <div style="display:flex;gap:10px;justify-content:center;margin-bottom:6px;">
          ${[0, 1, 2, 3]
            .map((i) => {
              const filled = cfg.password && cfg.password.length > i;
              const isComplete = cfg.password && cfg.password.length === 4;
              let color = "rgba(255,255,255,0.12)";
              if (filled && isComplete) color = "#4ade80";
              else if (filled && !isComplete) color = "#f87171";
              return `<span class="nopic-pin-dot ${filled ? "filled" : ""}" style="width:14px;height:14px;border-color:${color};background:${filled ? color : "transparent"};"></span>`;
            })
            .join("")}
        </div>
        <div>
          <input type="password" class="nopic-privacy-pin-input" placeholder="${hasPassword ? "●●●●" : "点击输入"}" value="${cfg.password || ""}" data-pl-scope="${scope}" data-pl-key="password" autocomplete="new-password" maxlength="4" inputmode="numeric" style="width:100%;font-size:14px;padding:6px 8px;text-align:center;letter-spacing:8px;font-family:monospace;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#fff;outline:none;caret-color:#60a5fa;">
        </div>
      </div>
      
      <!-- 自动上锁 -->
      <div style="background:rgba(255,255,255,0.03);border-radius:6px;padding:8px;">
        <div style="font-size:10px;color:rgba(255,255,255,0.3);margin-bottom:4px;">自动上锁</div>
        <div style="display:flex;gap:4px;">
          <div class="nopic-privacy-select-btn ${cfg.lockMode === "manual" ? "active" : ""}" data-pl-scope="${scope}" data-pl-key="lockMode" data-pl-val="manual" style="font-size:10px;padding:3px 6px;flex:1;">手动</div>
          <div class="nopic-privacy-select-btn ${cfg.lockMode === "blur" ? "active" : ""}" data-pl-scope="${scope}" data-pl-key="lockMode" data-pl-val="blur" style="font-size:10px;padding:3px 6px;flex:1;">失焦</div>
          <div class="nopic-privacy-select-btn ${cfg.lockMode === "timeout" ? "active" : ""}" data-pl-scope="${scope}" data-pl-key="lockMode" data-pl-val="timeout" style="font-size:10px;padding:3px 6px;flex:1;">超时</div>
        </div>
        <div class="nopic-pl-timeout-row" style="display:${cfg.lockMode === "timeout" ? "flex" : "none"};align-items:center;gap:4px;margin-top:4px;justify-content:center;">
        
        <span style="font-size:9px;color:rgba(255,255,255,0.3);">持续失焦</span>
          <input type="number" class="nopic-privacy-input" value="${cfg.timeoutMinutes || 5}" min="1" max="60" data-pl-scope="${scope}" data-pl-key="timeoutMinutes" style="width:44px;font-size:11px;padding:3px 4px;text-align:center;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:3px;color:#fff;">
          <span style="font-size:9px;color:rgba(255,255,255,0.3);">分钟后上锁</span>
        </div>
      </div>
    </div>
  `;
    });

    // 更新生效标签（独立控制，不受透明度影响）
    ["url", "domain", "global"].forEach((scope) => {
      const activeTag = document.getElementById(`nopic-pl-active-${scope}`);
      if (activeTag) {
        const effective = getEffectivePrivacyLock();
        const effectiveScope = effective._effectiveScope || null;
        const cfg = getPrivacyLockConfigByScope(scope);
        const hasCustomConfig = hasStoredConfig(scope);
        const isActive = hasCustomConfig && effectiveScope === scope;
        activeTag.style.display = isActive ? "inline" : "none";
      }
    });

    // ===== 替换文字UI更新 =====
    const textReplaceToggle = document.getElementById("nopic-replace-toggle");
    if (textReplaceToggle)
      textReplaceToggle.classList.toggle(
        "on",
        nopicGetToggleState("nopic_textreplace", true),
      );
    const textReplaceMenuEntry = document.getElementById(
      "nopic-textreplace-menu-entry",
    );
    const isTrActive = nopicGetToggleState("nopic_textreplace", true); // 读取独立记忆
    if (textReplaceMenuEntry)
      textReplaceMenuEntry.style.display = isTrActive ? "flex" : "none";
    // 更新场景按钮状态
    textReplaceSubmenu.querySelectorAll("[data-scope]").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.dataset.scope === currentTextReplaceScope,
      );
    });
    // 更新替换规则列表
    updateTextReplaceRulesList();

    // ===== 自动点击器UI更新 =====
    const autoClickerToggle = document.getElementById(
      "nopic-autoclicker-toggle",
    );
    const autoClickerMenuEntry = document.getElementById(
      "nopic-autoclicker-menu-entry",
    );
    if (autoClickerToggle)
      autoClickerToggle.classList.toggle("on", autoClickerConfig.enabled);
    if (autoClickerMenuEntry)
      autoClickerMenuEntry.style.display = autoClickerConfig.enabled
        ? "flex"
        : "none";

    // ===== 页面监控器UI更新 =====
    const pageMonitorToggle = document.getElementById(
      "nopic-pagemonitor-toggle",
    );
    const pageMonitorMenuEntry = document.getElementById(
      "nopic-pagemonitor-menu-entry",
    );
    if (pageMonitorToggle) {
      pageMonitorToggle.classList.toggle("on", pageMonitorEnabled);
      // 移除旧监听避免重复，然后绑定新监听
      const newToggle = pageMonitorToggle.cloneNode(true);
      pageMonitorToggle.parentNode.replaceChild(newToggle, pageMonitorToggle);
      newToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        pageMonitorEnabled = !pageMonitorEnabled;
        nopicSetToggleState("nopic_pagemonitor", pageMonitorEnabled);
        updateAllUI();
        if (pageMonitorEnabled) {
          startAllPageMonitors();
        } else {
          stopAllPageMonitors();
        }
      });
    }
    if (pageMonitorMenuEntry)
      pageMonitorMenuEntry.style.display = pageMonitorEnabled ? "flex" : "none";

    // ===== 快捷文本UI更新 =====
    const quickTextToggle = document.getElementById("nopic-quicktext-toggle");
    const quickTextMenuEntry = document.getElementById(
      "nopic-quicktext-menu-entry",
    );
    if (quickTextToggle)
      quickTextToggle.classList.toggle("on", quickTextEnabled);
    if (quickTextMenuEntry)
      quickTextMenuEntry.style.display = quickTextEnabled ? "flex" : "none";

    // ===== 数据采集UI更新 =====
    const dcToggleUI = document.getElementById("nopic-datacollect-toggle");
    const dcMenuEntry = document.getElementById("nopic-datacollect-menu-entry");
    // 从 localStorage 读取状态，而不是从变量
    const dcEnabled = nopicGetToggleState("nopic_datacollect", true);
    if (dcToggleUI) {
      if (dcEnabled) {
        dcToggleUI.classList.add("on");
      } else {
        dcToggleUI.classList.remove("on");
      }
    }
    if (dcMenuEntry) {
      dcMenuEntry.style.display = dcEnabled ? "flex" : "none";
    }

    // ===== 页面可编辑UI更新 =====
    const pageEditToggle = document.getElementById("nopic-pageedit-toggle");
    const pageEditMenuEntry = document.getElementById(
      "nopic-pageedit-menu-entry",
    );
    if (pageEditToggle) pageEditToggle.classList.toggle("on", pageEditEnabled);
    if (pageEditMenuEntry)
      pageEditMenuEntry.style.display = pageEditEnabled ? "flex" : "none";
    const pageEditSwitch = document.getElementById("nopic-pageedit-switch");
    if (pageEditSwitch) {
      pageEditSwitch.classList.toggle("on", pageEditMode);
      // 确保 switch 元素可点击，不被弹窗的 cursor:move 影响
      pageEditSwitch.style.cursor = "pointer";
    }

    // ===== 拓展分割线显示逻辑 =====
    const extSeparator = document.getElementById("nopic-ext-separator");
    const extButtonsRow = document.querySelector(".nopic-ext-buttons-row");
    const col1 = document.querySelector(".nopic-col-1");
    const col2 = document.querySelector(".nopic-col-2");
    const col3 = document.querySelector(".nopic-col-3");

    const col1Visible =
      paradeConfig.enabled ||
      textReplaceConfig.enabled ||
      quickTextEnabled ||
      pageEditEnabled;
    const col2Visible =
      maskConfig.enabled || disguiseConfig.enabled || privacyLockConfig.enabled;
    const col3Visible =
      dcEnabled || autoClickerConfig.enabled || pageMonitorEnabled;
    const anyExtVisible = col1Visible || col2Visible || col3Visible;

    if (extSeparator) {
      extSeparator.style.display = anyExtVisible ? "" : "none";
    }
    if (extButtonsRow) {
      extButtonsRow.style.display = anyExtVisible ? "flex" : "none";
    }
    if (col1) {
      col1.style.display = col1Visible ? "flex" : "none";
      col1.style.flex = col1Visible ? "1" : "0";
    }
    if (col2) {
      col2.style.display = col2Visible ? "flex" : "none";
      col2.style.flex = col2Visible ? "1" : "0";
    }
    if (col3) {
      col3.style.display = col3Visible ? "flex" : "none";
      col3.style.flex = col3Visible ? "1" : "0";
    }

    // 更新标签伪装UI
    tabDisguiseSubmenu.querySelectorAll("[data-title-mode]").forEach((row) => {
      row
        .querySelector(".nopic-radio")
        .classList.toggle(
          "checked",
          row.dataset.titleMode === disguiseConfig.titleMode,
        );
    });
    const titleInput = document.getElementById("nopic-custom-title-input");
    const presetTitleRow = document.getElementById("nopic-preset-title-row");
    const presetTitleSelect = document.getElementById(
      "nopic-preset-title-select",
    );
    if (titleInput) {
      titleInput.value = disguiseConfig.customTitle || "";
      titleInput.style.display =
        disguiseConfig.titleMode === "custom" ? "block" : "none";
    }
    if (presetTitleRow) {
      presetTitleRow.style.display =
        disguiseConfig.titleMode === "preset" ? "block" : "none";
    }
    if (presetTitleSelect) {
      const header = presetTitleSelect.querySelector(
        ".nopic-custom-select-header",
      );
      const options = presetTitleSelect.querySelectorAll(
        ".nopic-custom-select-option",
      );
      // 更新选中状态
      options.forEach((opt) => {
        opt.classList.toggle(
          "selected",
          opt.dataset.value === disguiseConfig.presetTitle,
        );
        if (opt.dataset.value === disguiseConfig.presetTitle) {
          header.textContent = opt.textContent;
        }
      });
      // 如果没有选中值，显示默认文本
      if (!disguiseConfig.presetTitle) {
        header.textContent = "选择预设标题";
      }
    }

    // 更新图标设置
    tabDisguiseSubmenu.querySelectorAll("[data-icon-mode]").forEach((row) => {
      row
        .querySelector(".nopic-radio")
        .classList.toggle(
          "checked",
          row.dataset.iconMode === disguiseConfig.iconMode,
        );
    });
    const iconUploadArea = document.getElementById("nopic-custom-icon-area");
    const presetIconRow = document.getElementById("nopic-preset-icon-row");
    const presetIconSelect = document.getElementById(
      "nopic-preset-icon-select",
    );
    if (iconUploadArea)
      iconUploadArea.style.display =
        disguiseConfig.iconMode === "custom" ? "flex" : "none";
    if (presetIconRow)
      presetIconRow.style.display =
        disguiseConfig.iconMode === "preset" ? "block" : "none";
    if (presetIconSelect) {
      const header = presetIconSelect.querySelector(
        ".nopic-custom-select-header",
      );
      const options = presetIconSelect.querySelectorAll(
        ".nopic-custom-select-option",
      );
      // 更新选中状态
      options.forEach((opt) => {
        opt.classList.toggle(
          "selected",
          opt.dataset.value === disguiseConfig.presetIcon,
        );
        if (opt.dataset.value === disguiseConfig.presetIcon) {
          header.textContent = opt.textContent;
        }
      });
      // 如果没有选中值，显示默认文本
      if (!disguiseConfig.presetIcon) {
        header.textContent = "选择预设图标";
      }
    }
    const iconPreviewImg = document.getElementById("nopic-icon-preview-img");
    if (iconPreviewImg) {
      if (disguiseConfig.customIcon) {
        iconPreviewImg.src = disguiseConfig.customIcon;
        iconPreviewImg.style.display = "block";
      } else {
        iconPreviewImg.style.display = "none";
      }
    }

    // 为所有PIN输入框添加聚焦/失焦提示
    document.querySelectorAll(".nopic-privacy-pin-input").forEach((input) => {
      input.addEventListener("focus", function (e) {
        const parent = this.closest(".nopic-pl-col") || this.parentElement;
        const tip = parent.querySelector(".nopic-pin-tip");
        if (tip) {
          tip.textContent = "输入4位数字密码";
          tip.style.color = "rgba(255,255,255,0.4)";
        }
      });
      input.addEventListener("blur", function (e) {
        const parent = this.closest(".nopic-pl-col") || this.parentElement;
        const tip = parent.querySelector(".nopic-pin-tip");
        if (tip) {
          tip.textContent =
            this.value.length === 4 ? "已设置" : "点击输入框设置4位PIN";
          tip.style.color = "rgba(255,255,255,0.2)";
        }
      });
    });

    // 为所有PIN输入框添加聚焦提示
    document.querySelectorAll(".nopic-privacy-pin-input").forEach((input) => {
      // 移除旧监听避免重复
      input.removeEventListener("focus", handlePinFocus);
      input.removeEventListener("blur", handlePinBlur);
      input.addEventListener("focus", handlePinFocus);
      input.addEventListener("blur", handlePinBlur);
    });

    function handlePinFocus(e) {
      this.placeholder = "请输入4位数字";
      this.style.borderColor = "#60a5fa";
      this.style.boxShadow = "0 0 12px rgba(96,165,250,0.15)";
    }

    function handlePinBlur(e) {
      const val = this.value;
      this.placeholder = val.length === 4 ? "●●●●" : "点击输入";
      this.style.borderColor = "rgba(255,255,255,0.1)";
      this.style.boxShadow = "none";
    }

    // 渲染标签伪装三列列表
    if (document.getElementById("nopic-disguise-list-url")) {
      renderDisguiseLists();
    }
  }

  // 网页隐私锁开关（开关状态独立存储在URL级别）
  document
    .getElementById("nopic-privacylock-toggle")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      privacyLockConfig.enabled = !privacyLockConfig.enabled;
      nopicSetToggleState("nopic_privacylock", privacyLockConfig.enabled);
      privacyLockConfig = { enabled: privacyLockConfig.enabled };
      updateAllUI();
    });

  updateAllUI();

  function updateLampState() {
    lamp.className = window.imgHidenSet !== null ? "on" : "off";
  }
  updateLampState();

  function triggerSpinner() {
    if (window.imgHidenSet === null) return;
    lamp.classList.add("spinning");
    clearTimeout(glowTimer);
    glowTimer = setTimeout(() => {
      lamp.classList.remove("spinning");
      if (widget.classList.contains("sleeping")) {
        lamp.style.animation = "none";
        lamp.offsetHeight;
        lamp.style.animation = "";
      }
    }, 500);
  }

  const formatDist = (px) => {
    const m = px / PX_TO_METER;
    if (m > 1000) return (m / 1000).toFixed(1) + "km";
    return Math.round(m) + "m";
  };

  function updateContent() {
    if (isSleeping) return;
    let rows = [];
    const addRow = (label, value) =>
      rows.push(
        '<div class="stat-row"><span class="stat-label">' +
          label +
          '</span><span class="stat-value">' +
          value +
          "</span></div>",
      );
    if (configs.time || configs.seconds) {
      const now = new Date();
      let h = String(now.getHours()).padStart(2, "0");
      let m = String(now.getMinutes()).padStart(2, "0");
      let s = String(now.getSeconds()).padStart(2, "0");
      let val = "";
      if (configs.time && configs.seconds) val = h + ":" + m + ":" + s;
      else if (configs.time) val = h + ":" + m;
      else if (configs.seconds) val = ":" + s;
      addRow("时间", val);
    }
    if (configs.host)
      addRow(
        "域名",
        location.hostname.length > 15
          ? location.hostname.slice(0, 15) + ".."
          : location.hostname,
      );
    let hiddenCount = 0,
      totalCount = 0;
    if (window.imgHidenSet !== null)
      hiddenCount = Array.from(imageControls.keys()).filter(
        (el) => el.classList.contains("nopic-hidden") && el.isConnected,
      ).length;
    if (configs.count || configs.total || configs.percent)
      totalCount = Array.from(document.querySelectorAll("img, svg")).filter(
        (el) => el.offsetWidth > 15 && el.offsetHeight > 15,
      ).length;
    if (configs.count) addRow("隐藏", hiddenCount);
    if (configs.total) addRow("总数", totalCount);
    if (configs.percent && totalCount > 0)
      addRow("占比", Math.round((hiddenCount / totalCount) * 100) + "%");
    if (configs.adCount) addRow("广告", adCount);
    if (configs.memory && performance.memory)
      addRow(
        "Mem",
        (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + "M",
      );
    if (configs.loadTime) {
      const t = performance.timing;
      const load = t.loadEventEnd - t.navigationStart;
      if (load > 0) addRow("加载", (load / 1000).toFixed(1) + "s");
    }
    if (configs.resCount)
      addRow("资源", performance.getEntriesByType("resource").length);
    let dataSource =
      statsRangeConfig === "session"
        ? sessionData
        : globalData[statsRangeConfig];
    if (configs.mouseDistance) addRow("鼠标", formatDist(dataSource.mouse));
    if (configs.clickCount) addRow("点击", dataSource.click);
    if (configs.scrollDist) addRow("滚动", formatDist(dataSource.scroll));
    if (configs.readChars) addRow("阅读", Math.round(dataSource.read) + "字");
    contentDiv.innerHTML = rows.join("");
  }

  let lastRenderedSecond = -1,
    lastUpdateTime = 0;
  function uiLoop(timestamp) {
    if (!timestamp) timestamp = performance.now();
    if (timestamp - lastUpdateTime > 1000) {
      lastUpdateTime = timestamp;
      updateContent();
      const now = new Date();
      lastRenderedSecond = now.getSeconds();
    } else if (configs.time || configs.seconds) {
      const now = new Date();
      if (now.getSeconds() !== lastRenderedSecond) {
        lastRenderedSecond = now.getSeconds();
        updateContent();
      }
    }
    requestAnimationFrame(uiLoop);
  }
  requestAnimationFrame(uiLoop);

  let isFirstLoad = true;
  function startSleepTimer() {
    clearTimeout(sleepTimer);
    clearTimeout(sleepBgTimer);
    widget.classList.remove("transparent-bg");
    if (!autoHideIdleConfig) return;
    const delay = isFirstLoad ? 3000 : 500;
    isFirstLoad = false;
    sleepTimer = setTimeout(() => {
      if (!autoHideIdleConfig) return;
      if (!isHovering && !isDragging) {
        isSleeping = true;
        widget.classList.add("sleeping");
        sleepBgTimer = setTimeout(() => {
          if (isSleeping) widget.classList.add("transparent-bg");
        }, 500);
      }
    }, delay);
  }
  if (autoHideIdleConfig) startSleepTimer();

  widget.addEventListener("mouseenter", () => {
    clearTimeout(sleepBgTimer);
    widget.classList.remove("transparent-bg");
    if (isSleeping) {
      isSleeping = false;
      widget.classList.remove("sleeping");
      updateContent();
    }
    if (autoHideIdleConfig) startSleepTimer();
  });
  widget.addEventListener("mouseleave", () => {
    if (autoHideIdleConfig) startSleepTimer();
  });
  menu.addEventListener("mouseleave", () => {
    if (autoHideIdleConfig) startSleepTimer();
  });
  menu.querySelector('[data-action="hide"]').addEventListener("click", () => {
    isUISelfHidden = true;
    widget.style.display = "none";
    menu.classList.remove("active");
  });

  // ===== 关于弹窗 =====
  const aboutModal = document.createElement("div");
  aboutModal.id = "nopic-about-modal";
  aboutModal.innerHTML = `
  <div class="about-close" id="nopic-about-close">×</div>
  
  <!-- ===== 左列 ===== -->
  <div class="about-left">

  <!-- 网页控制大师 -->
    <div class="about-section">
      <div class="about-section-title">网页控制大师 <span class="badge-recommend">当前版本</span></div>
      <div class="about-section-desc">包含图片控制等更多功能</div>
      
      <div class="about-method method-1">
        <div class="method-label">方式一：</div>
        <span class="btn-edge disabled">Edge 商店安装</span>
        <span class="badge-pending">已安装</span>
      </div>
      
      <div class="about-method method-2">
        <div class="method-label">方式二：</div>
        <a class="btn-edge" href="https://github.com/Fxalll/WebControlMaster/releases/tag/dev" target="_blank">下载 ZIP</a>
        <span class="method-hint">（详见下方说明）</span>
      </div>
      
      <div class="about-method method-3">
        <div class="method-label">方式三：</div>
        <span class="method-text">GreasyFork 搜索「网页控制大师」</span>
      </div>
    </div>


    <!-- 网页图片大师 -->
    <div class="about-section">
      <div class="about-section-title">网页图片大师</div>
      <div class="about-section-desc">仅图片控制功能</div>
      
      <div class="about-method method-1">
        <div class="method-label">方式一：</div>
        <a class="btn-edge" href="https://microsoftedge.microsoft.com/addons/detail/pmgpklpfinapegpcnoigkllhbgnnphdg" target="_blank">Edge 商店安装</a>
      </div>
      
      <div class="about-method method-2">
        <div class="method-label">方式二：</div>
        <a class="btn-edge" href="https://github.com/Fxalll/WebImageMaster/releases/tag/Dev" target="_blank">下载 ZIP</a>
        <span class="method-hint">（详见下方说明）</span>
      </div>
      
      <div class="about-method method-3">
        <div class="method-label">方式三：</div>
        <span class="method-text">GreasyFork 搜索「网页图片大师」</span>
      </div>
    </div>

    <!-- ===== 方式二通用说明 ===== -->
    <div class="about-guide">
      <div class="about-guide-title">方式二 · 自行加载拓展（适用所有浏览器）</div>
      <div class="about-guide-steps">
        <span>① 进入浏览器「管理拓展」页面</span>
        <span>② 打开右上角「开发者模式」开关</span>
        <span>③ 点击「加载解压缩的拓展」</span>
        <span>④ 选择刚才下载并解压的文件夹</span>
      </div>
      <div class="about-guide-note">适用于 Chrome / Edge / 360 等所有 Chromium 内核浏览器</div>
    </div>
  </div>

  <!-- ===== 右列 ===== -->
  <div class="about-right">
    <div class="about-title">☕ 关于</div>
    <div class="about-text">摸鱼的时候写的脚本，和我一起摸鱼吧～</div>
    <div class="about-text small">永久免费 · 本地运行 · 开源 · MIT 协议</div>
    <div class="about-text small" style="margin-top:6px;">如果这个小工具帮到了你，欢迎请我喝杯咖啡支持开发！</div>
    <img id="nopic-about-img" src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAFA3PEY8MlBGQUZaVVBfeMiCeG5uePWvuZHI////////////////////////////////////////////////////2wBDAVVaWnhpeOuCguv/////////////////////////////////////////////////////////////////////////wAARCAFpAWIDASIAAhEBAxEB/8QAGQAAAwEBAQAAAAAAAAAAAAAAAAMEAgUB/8QAORAAAgIBAQMKBAQGAwEBAAAAAQIAAxEEEiExExQzQVFSYXGBkSIycqE0U7HBI0JiktHhJEOCY/D/xAAXAQEBAQEAAAAAAAAAAAAAAAAAAQID/8QAGhEBAAMBAQEAAAAAAAAAAAAAAAECETESUf/aAAwDAQACEQMRAD8AshCLe6us4dsHygMhE86p7/2P+Ic6p7/2P+IDoRPOqe/9j/iHOqe/9j/iA6ETzqnv/Y/4hzqnv/YwHQmK7ksyEOcT17FrALnGYGoRddyWNhGyZp7FrGXOBA1CJ51T3/sf8Q51T3/sf8QHQilvrdgqtknwMbAIQnjMFUseAgewihqK2YANknwMbAITxiFUk8BFc6p7/wBoDoRPOqicBvsY7PX1QCETzqrPzfaOEAhCEAhCKOpqBILbx4QGwiedU9/7GNVgwBG8HhA9hCKbUVoxDNgjwgNhE86p7/2MYjh1DLvBgahFvfWjbLNg+Uzzqnv/AGP+IDoRPOqe/wDY/wCIc6p7/wBj/iA6ETzqnv8A2P8AiHOqe/8AY/4gOhE86p7/ANjN12pZ8hziBuEIQA8DINd0w+mXngZBrenXy/cwFJTZYMouR5zXNru79x/mU6Hom+qOexEOGbHrAg5td3fuP8w5td3fuP8AMt5ervj3hy9XfHvAi5td3PuJh6nrxtjGZ0kdHzsnOJPr/lSBjQfO3lH6qtrEAUZwYjQfO3lLoEVKmh9q34QVxN3sL02KjtMDma1SM6KFGfizE6dWps2rBsjGMmAl6bK1yy4EXLNXaj1YVgTmRwH6X8Svr+k6DsEUsxwBOdpmCXKWOBv/AElOptrahlVgScfrAal9bsFVskz25S1TKBkmc/TMFuVmOAM/pLucVd8QJKtPatikrgAzoD94sXVscBwSYyBmwE1sAMkic86a0DJXAxOkSAMnhEvfWa2AcZIO6Bz0+dfOdUj4T5TlJ86+c60Dnc3uBzsdeZXzmrPz/aOM5EDo85p7/wBjDnNPf+xkXIW4zsH2hyFvcPtAt5zT3/sZz7Dl2I3gmb5C3uH2nnN7e4YHo09pAITIPjOhUCtSA7iBCoEVoCMECbgEhvose1mC5EuhA5LqUYq24iX6T8Ovr+sn1NNj3sVQkSrTqUpVWGDAj1f4hvSYSix12lXI85vV9O3pKdF0A84EvNru79x/mHNru79x/mXtbWhwzYMzy9XfHvAi5td3fuP8w5td3PuJby9XfHvNo6OPhOYHMet6yA4xmU6D+f0nmv8AnTymtB/P6fvArhCEAPAyDW9Ovl+5l54GQa3p18v3MBuh6Jvq/wARev8AnXyjND0TfV/iL1/zp5QJYQhAs0HF/Se6/wCVPOeaDi/p+891/wAqecDGg+dvKXSHQfO/lLWYKMswHnA9PCT6xGeoBRk5jlsRjhWUnwM1A5fIW/lt7TxqnUZZCBOrEav8O3p+sDnqpY4UZPZNNVYq5ZCB2zek/EL6/pLNX+Hf0/UQObAAscAZJnqqWOFBJ7BG1VulqsysoB3kjED2qmwWqShAB4zoxfLV/mJ/cIcrX+Yv9wgasBNbAccTmcjYBkocTpctX+Yv9wmXtrKMA65weuBzkOGBPbOly9X5izlwgdQ3143Os5nA+U8G84mxTZu+BvaB1BuHlM8tX3195r+X0nMamzJ+BuPZA6HL1fmL7w5arvic7kbPy2/tmSMEgiB1gQRkTJurBwWGRMU2IKkBdRgdsjtrdrGYISCdxAgdEMCMg5Ey11YOyzgHznlAIpUEYOJHqK3N7EIxHgIFnL1fmL7zYYMuVIInJKlSQQQewidDSfh19YEur6dvSU6P8OPOTavp29JTo/w484E+u6f0k8o13T+kngEu0HRN5yGX6Doj5wF6/wCdPKa0H8/p+8zr/nTymtB/P6fvArhCEAPAyDW9Ovl+5l54GQa3ph9P7mA3Q9Cfq/xM6xGd12VJ3dQnuidVqILAb5Tyid5feBzORs/Lf+0w5Gz8tv7TOnyid5feHKJ3l94E2jRl29pSM44iGv8AlTzlHKJ3l95NrWVlXZYHyMDOg+d/KM13RL9UXoPnfyjdd0S/VAVoelP0y6Q6HpT9P7y1mC8SB5wPYnVKWpIUEnsEYHVjhSD6z0kKMk4HjAh0yOt6lkYDfvIPZKdSpahgoJO7cPOMDoTgMCfAz0kAZJwPGBBQjJcrOpVRnJIwJTfbWaWAdScdRhqGVqGCkE7tw85AUcbyrAeIgZgMk4GSYDecRtSMLVJU4B37oGTVYAco27rxMjJ4bz2TpWOprYBgSQcYkKVuHUlSACOIgZNVgHyNjymJ1GsQqQHG8bsTnGtx/K3tAwOM6/AeU5E6/bAzytecba+83xnIJ35nWX5R5QPZyrelf6jOmbEG4uo9Zz7Ec2MQpILZBgJnSqtQVJl1Bx2zm4IODNityPkY54boHUBDbwciexNDqtKqzAEDeDGggjOQRAg1NbtexCEjylWmBWhQRg+MYbEBwWAPnPQQRkEGBz9X07ekp0f4cecm1f4hvSUaR1WnBYDfAVq0drsqrHd1CI5Gz8t/7TOnyid9feHKJ3l94HM5Kz8tvYyzRqy1kMCN/XH8oneX3hyid9feBJr/AJ08prQfz+n7zGtZWdcEHA6pvQfz+n7wK4QhADwkOtUm0YBO6XcYQOTsP3W9obDd0+06pI8IZgcrYbun2hsN3T7Tq5hmByth+6faGw/db2nVzDMCPQqQ7ZBGRGa0E1DAzvlGRDOesQItEpFpyCN0drATUMDO+PyBDIPZAh0YK25bcMdcfqmU0MAwPDr8Z5reh/8AUgG+A7SkC9Sd3H9JXqWDUMFIJ3bh5zn4jdKP+Qvr+kD3TKwvUlSOPV4SzUdA/lGReo6B/KBz6d1qec6FzryTjaHAzm4PYZ5A3V0qHxE6NjLybDaGcTmYPYZqvpFPjAEVg6/Cdx3zpM6lT8Q4T1yNht44TkwPcfF6zqba4ztDhOVPcHsMAPEidZflHkJyBxnWVhsjeOHbA5lvSv5mdCp15JMsOE59uOVbzmcHxgauP8Vz4zo09DX9InMxOnT0SeAxA5+o/EP5y/S/h0kGo6d/OXaY/wDHXeMwI9X+Ib0/SWaX8Mn/AO65JqhnUNjPVKtLu06jzgTapWN5IBPpE7D91vadaeZHhA5Ww3dPtDYbun2nVyPCA3wOVsN3T7Q2G7p9p1sQgcnYfun2leiBG3kYziVEgdkAezED2EIQCEIZgQ67pRuPCS751+Mi13zrjs7IEw3wIIlehzh8/eGu4JiBHPYY9ZVoeLwJRmU6LpTnPCW+cNw4QJ9acVLjvROi33HPdjtd0Q+qJ0XTH6YD9aM0+sm0m7UL6/pOhE6v8O3p+sB3pFav8O/p+s5sdpPxCev6QDSfiE9f0nShDMBd4HIvu6pzqelTzE6sCBiB5gZmbeifyM1umbD/AA28jA5eT2zyEMQAHBzOvjqnIxOv2wOSeOZ5kz0jeRPMQCdWrok3fyicqdWrAqT6YGsjwnMuP8Z9/XC3pG3njMQDB44MMnO+dLT45BOEi1I/jtAr0uOQTfvjuHVOTv4Tz0gdfM5+sP8AHOD1RGYZgEu0R/hHf19shhA7GZ4SO0SbQn+E3n2xeu6QY7IBriNtfKb0H8+/skfrLNBwf0gVwhCAHgZDrSRcoz1S48DINb0w+n9zAdot9TZ70oI8MybQ9C3nMa4kOuD1dsA124rjd5STOeJnpJPHPvPBAr0P8/XPdd8qY+0kBI4bpVoviLbW+BJk9sq0RzY2T/LN64AIuB19kiBI4QOuQDJ9YMU7t3xRWiObWz3Y3W9D/wCoEG/xhvxKdEAburhKNUANO27s6vGBJpB/yF9f0nSwJzdJ+IX1/SWas407+n6wDVfh339n6yLTk8uvnPdKSb1B38f0lt4AobcBugMzvmbuhf6TOfQx5ZN549s6F3Qv9JgcvJxxM8BOeMOqar6RfOAIDtjznUIGydw4T3ZXsHtPYHIxlsdeZ1vWeMo2TuE5ZZu0+8Dq4HhDA7BOSGORvM6q/KPKBzLOlYf1TO/tM1Z0j+c6NSjk0yBw7IBSP4SeUZgdkBuhA5moJF7jPXLdN0C5xmQ6jp385gE8MmB1t3YJz9Xu1DDylelP/HUyPV/iH9P0gJhiE6GjANHAcYHPxCUa0Yu4dUngejzMt0W9Dnt64aIA1NkdcXrTs2Ljdu6oFuB4T0AdW6cjaPafeWaEk7eSTwgVwhCAHhINd0q/TL5lq0Y5ZQfOBy1dl3KxHrK9Hh0bb+Lf1yjkq+4vtNKiqMKAPKBFrVVSuABJcTrsit8yg+YmeSr/AC19oEuiVWL5APnPdYOTVdj4c8cQ1n8MLsfDnsnmk/iM3KfFjt3wJizMN7E+ZmZ1eSr/AC19oclX3F9oEmi6VvplpAbiM+cm1Q5OsFBsnPFZJytn5je8CzVAJVlRsnPECI0zFrgGJIPUZ7pSbLSH+IY4GP1CqlJZFCntAxA91KqtDFQAd28ecgLMRgsSPOOoZnvVXYspzkE5HCUaitBQxCqDu3geMDngkHIODNF2IwWOPON01ZNqlkJXfxG7hLuSr/LX2gc6jpk850yMggxdtaitiiDaxuwN8ixqOyz2MC/YTuj2noRM/KPaQ1i/lF2uUxnfnM6EAnjfKfKD/Icdk52NR2WexgYNjg/MePbOlyab/hHtObyVmd9be06nVnrgck8Z7yj8No485rkrNr5GxnsnQFSYHwD2gFaKUUlRkjsnPsdhYwDEYPbN2csGb5woMQSTvMDXKP3j7w5R++feZnSqrQ1ISg3qOqAUKrUoWUE43kiM5NO4PaegAbgMCewPAABgDA7J4UUnJUE+Uh1Lut7AMQN3XFcpZ+Y390DpcmncHtNABRgDHlFaYlqFJ3mTap3W47LMBiBaUVuKg+ch1gC2gAYGOoRXK2fmN7zJYscsSfOB6rsu4MQPCeFi3E58zLNGitUxZQTnri9aqrYoAA3dUCaW6D+f0/eRSzQfz+kCyEIQCEIQCEIQCSax2XY2WIzmVyLX/wDX6/tA90n8UtynxY4ZnuqHJqhr+DPZukaOy/KxHlK9IeVLcp8QHDMA0TszNtMTu6zGaxitalSQc43RwrVflAHlPWVWHxKCPGBymd2GGZj5mZlusRFqBVQDnG4SKB6rFT8JIPaI+hme5Vdiy9hOYaRA1xDAEYlq1opyqKD2gQE3oqUsyKFYYwQMGL0haxjtsSo6iZYyhhhhkQVFT5VA8oHsN08Y7pmBvdDImIQN5HbPMzG4T3cRA1kQBB4GKfcB2me4AAAgMyO2GR2iLmTxgOyO0Q2h2j3ieqecBAfIdZWquCoxtcZVQ20pz1GI1/8AJ6wI51KehT6RM1VIalJQZx2RwAAwOEDnX2OLnAcgecs07E0KTvM0a6yclASe0SK92S5lRioHUDiBnVfiGlWmrRqFJVSfEQoRXqVnUMx6yI8KFGAMCBBqHau0qjFR2AxBYscscmO1fTtEQLtGiNTkqCc9cTrFCWgKAN0foeg9Y9q0c5ZQfOAjQ9EfOPZEbeyg+c9VQgwoxPYGOSr/AC19ppVVflAHkJJrXZXXZYjd1TWiZm2yzEwKoQhAIZgeEj1dtiWBUYgEZgGrtdLAFbAx1RHOLe+Zl7GsOWOTjEfpKq7EbbAODATzi3vmZex3+ckzoc2p7g957zanuCBzJpHZPlJE6PNqe4J5zanuCArSWO7ttMTum9W7JWNk43zGoAoCmr4M7pnTk3uVtO0oGcQDTMbnK2/EMZ3yjm9XcE0lKVnKLg4xF6t2SsFTg5xAxqFWqvarAVs9Um5xb3zG0O177Np2lxnEp5tT3BAl09rteoZyRv4+Uvk11aVVl612WHAw0dj2F9ts4x+8ChpmeucYmQcwPTPMwZgoGTDiM8QYCbCRkjfCu0bWzg75pl37pkLvkV6qszZJ3DhPTYFsCdZmhuGBJrfivPVgbpUVGeNwBkwtYMMnd1yhXVwcGVB1Q6p5nE9JkGqRhT4zT1o+NoZx2wTeDEayx69jYbGcwpD3WLYyq5Cg4Ezy9vfaLJLEk7yZfXp6mrUlN5EBlBLUqWOciDU1sSzKCZHZdZVYyI2FG4CZ5zd3z7QNXWPVayVsVUcBF84u/MMy7M7Fm3kzMC+itLag9i7THrMbzer8sTnrdYi7KsQBLtK5eraYknMBioqDCjEl1drpYArEDENVbYloCMQMTWnVbqy1o2jniYEvOLe+ZZo3Z0JYk4M1zenuD3iNQTQ4FXwgjqgVPWjkbSgz1K0TOyoGYnSWPYhLnODKIBCEIAd4i7Ka3O0y5OIyGcwOdq61rsARcDGZiu16wQhxOg9NbttOM7u2R6utK2XYGMjtgP0lr2K222ceEpzOXXbZXnYOMyvSWvYG2znGIFOZNq7XrClDjMNXa9exsHGcxdP/ACS3K/Fjh1QPdOTqGYWnaA3iUJTXW2UXBxiCVJXkoMTGqseusMpxvxAfmTa0/wAEH+qTc6uO7b+wjKHN7lbfiXGYE6OyHaU4OJTpr7HuCs2RPdTTXXVtKuDnHGK0n4lfX9IFWq/DN6frFaD/ALPT947V/h29P1idB/2en7wKbTgCIW7+PsAbu2PcZ3Sc1FLQ44dcBrhdnJGZ5X8KYzx4TQKsuIbOMYkBnagygDM9CjjjfPTvgYPDdFZLMA2DHMBndMgKDnG+UJZVFgDDcY0VhF+GDlc7xmG3kEDiIHjcc4nhO6KN1hPyie8oc4IlRRQ2drPVE6/+T1/aM028tG2VJZjbGcSKVXp6mRSU3kR6qFUAcBBQFAA4CewOZqOnbzlFFFT1KzLknxjW09TMWZck+MmtteqxkrOFXgIFPNafyx7mRahQlzKowBL9O7PSrMckyHV/iG9P0EB+noqeoMygk+MpRFRdlRgec5yX2IoVWIA8JbprGsq2m45ge2UVuSzLk47ZNe7UOEqOyuMy48JBremH0/5gY5zd3z7CP06jUKWtG0QZnS012Vkuud/bKq61r3IMDzge11pWMIMTUIQCEIQA8DJNXdZXYAhwMZlZ4GQa3ph9P7mBjnd3eHtMWWtYQXOcTEIFOkpSwNtjOPGV11JVnY3ZnPqverOzjfN88u7R7QGa/wDk9f2k9dr1ElDjMpp/5OeV37PDHjG8zq7D7wJedXd77RlDHUMVt3jGY7mdXYfear09dTbS5zjHGBnmlPd+8Xci6dNurcScSuTa7oR9UCWy+yxdlju8phHattpeMZp61tt2WzjGd0dfpq66iy5z5wEPqLLF2WbcfCP0H/Z6fvJ9OivcqtwM6FVKVZ2c74Gn3RVlgXdnee2Y1jEFCD2yaywuQT1SilVJORGgnG+K0zEpHSK9zmZLY857PIGV2iSTjEwwPEcIzOfACeofCAutCayTxiqiQTn3lWARiJerf8A3QjLnC7gIk7t/bGtuXHXFH4sA9UqKNGc7XpPdXa9exsnGczzRgjb9JjX/APX6/tIqqs7SKTxIkdmptWxgG3A9kyuqsVQBjAEoXT12qHbOW3mA2li9Ss28kSDVfiH850VUIgUcBOdqvxD+cC3S/h19f1M9fT1O20w3mRJqbK0CrjAl1Dl6lZuJgZ5pT3T7ye6xqH5Os4XjLpztZ+IPlAr01jW1bTHfwmrKK7G2mGTjtkFeosqXZXGPGa55b2j2gMuc6dwlRwDvjtJY1lZLHJzIbLWtYFsZ4bpXoeibzgVQk2queplCniJ7pbXt2to8MQKIQhAOqJu06WttMWBAxujoQObqalpcKpJBGd8TOndp1tYMxIIGN0XzKrvN7j/EBGloW3a2iRjsnmppWnZ2STnPGW00LTnZJOe2eXUrdjaJGM8IEFV7U52QN/bG89s7F9v9zOppWnZ2STnPGGmpW4sGJGOyBrntnYvt/uO0+oe1yGAGBndDmVXeb3H+Jh0GlXbrySfh+L/8IDtTa1SAqAcnG+RW6hrVCsFAzndC3UNaoVgoGc7oaeoW2bLEgYzugM0XTf8AmWWILU2Wzg9knesaZeUryTw+KFGpey0KwXB7IHr0rp15RMlh28JvTXNdtbQAxjhDVfhm9P1itB/2en7wN6tc7PrJ1rHXLrADjMWVBPCBmuorvB3Rk0BgTzqgeEwyOue43w2BCscZpd58p7siAAEDBbBhym6DjMWVhGWOSTMmelDM7JEB+k37fpF6/wD6/X9ozScX9IvX/wDX6/tA1Xpa2RSS28Z4/wCpUqhVCjgN0gXVuqgALuGOH+5bWxetWPEgGBLbqrEsZAFwPD/c2tC3KLGJDNvOJLqenfzm01T1oFAXA7R/uBi9BXayDOB2y7Sfh19f1M59jmxyxxk9kbXqnrQIAuB2wHX6l67CqhcDtglS6heVckMd3wwSldQvKuSGPdlFVS1JsqTjxgc/UVLVYFUnGOuM0+nS2ssxbOcbpTbp0sbbYtkDqiHc6VhXXgg7/igM5lV2t7/6jaqlqUhSTk53zOmta2sswAION0xqdQ9ThVCkEZ3wGW0LcQWJGOye00rTnZJOe2Sc9s7q+x/zKNNc121tADGOEB8IQgEDwhA8DAm1OoepwqhSCM75vTXNarFgBg9Un13TL9P+YzQfI/nA1qb2p2dkA57YnntnYvt/uU3ULbjaJGOyR6mladnZJOc8YDUHOs8pu2OGz4+8HA0mDXv2uO1/+ERTc1OdkA5xnMeh53kPuC8MQMc9s7F9v9zSudUdizAA3/D/APjMamhaQpVicnrmtD0jfT+8BnMqx1t7/wCp46DTDbrySTs/FG6i01JtKAd+N8jt1DWrssoG/O6A1LDqTyb4Axn4Y6rSpW4YEkjtk+i6f/zL4GbUFiFWzg9kxTStOdkk57Z7fYa6iwAyO2Y01zXbW0AMY4QGsMzAHxRjTwCB4eE9AAE8MIHsMzyeYgazPDPIDjA8I3zJmzMgZaB4ELeAmxUi8RkzTsEWTs5br3QzNsUAKOAExdStoAJII4YiJpXbO458JEi6a6hqjv3jtm11bqgUKu4YEtwHXBHGI5kneaVtE7F3LHieyVU6VHqViWyeyb5jX3mi2vbTsalAIXgTARcgrtZBnA7ZRTpUepXJbJ7JpaVvHKsSC3ED2lNaCtAg4CB5VWK0CrnA7YjUah6rdlQuMdcqnP1n4g+UCvT2tbWWYAHON0l1vTD6f3MzVqGqXYABGY1a+dKbHOCN26AinUNUpVQpBOd88utNrbTAAgY3TWopWqwKpJBGd81p9OtqEkkYON0CeW6D+f0/eI1FK0soUk5HXH6D+f0/eBXCEIBA8IHcJPfqTS4XZzkZ4wPb9OLXDFsbsTVFPIgjOcxHPv6PvDn3/wA/vAsI3RN9AuxlsYzCi/ltr4cY8YX3GnZ+HOcwJNRQKQvxE5z1TNF/I53ZzH/jP6Nn1hzH/wCn2gG1zv4T8Ozvhsc0G2PizujaNPyJJ2sk+E1fTyqgbWMHMCO/UcquNnAznjESi/TCpNrazvxwk8CnRdN/5ll1hrqLgZxI9F03/mUav8O3pAULucfwiNkHr+8dp6ORz8Wc+Egps5OwPjOJUutBYbSkDzgVkTO+eLcjkBWBJ6szcDO/snmD2TRIUZJwPGZFtZOBYpPnAMHsnuPCahAwQeyeAHPCMhAxjwnqjwmoQEX/ADCZVdpd3ERly53xKtsnIkc7dMFQG9jieGwAYQYmGYsd88hnfhtJO0QTDUXmnZ+HOZ7ShG8zy/T8sQdrAHhK6V4bW+3WG4ZHCIt0nKOW28Z8I5E2Kwuc4ibdXydjLsZx4w0dUnJoFznE3Iuff/P7z3n3/wA/vAsnP1nTnyltNnKVhsYzFXaXlX2i+PSBPRpham1tYOZXTVySFc53xHKHS/w8bXXnMOfb+j+8Bt+nFrhi2MDE1RTyKkZzk5hRdyyFsYwcTN+o5FgNnOfGAX6cXMDtYxNUUcjn4s58Ijnx7n3jtPfy218OMeMB0IQgB4GQa7ph9P7mXngZz9d0w+n9zAnhCEB+nv5EN8Oc+Mb+L/o2PXjE0UcsCQ2MeEs09HI5+LOfCAaejkc/FnPhC+7kQPh2s+MdiJ1FHLAfFjEDyjUcsxGzjA7Y/ERRp+RJO1nPhNX3cioOM78QDUU8sgXaxg5k/Mf/AKfae8+H5f3jKdTyr7IXG7PGAUabkn2trO7HCe6zoG8xN3W8km1jO/GJObuc/wALZ2c9eYEc3SnKWBM4z1yjmJ/MHtAUnT/xi21s9X2gMp0hqsDbeceEpkfPh3D7zder23C7GM9eYDr+gfynMRtlw2M4nSv6B/IznIu06qTjJAgVLrNp1XYxk9sqZtlSeySpoyrhtsbjnhKWGVIzxECYa3JA2PXMqJwCZHzMr8W2N2/hPeegjoz7wPee8f4fDxlc5B+bMsGtHDk/vAfW/KVhscZjkSSTwntFZrXG1kHh4R0JNdI5E96bWoLxJM0dvqK+3+4t67n/AO0AeAhPMGyZ9Zsuy7GcHHGeHVcn8GyW2d2czzmvK/HtgbW/GIaHPv8A5/eHIc4/i7WztdWJ5zE/mD2lVScnWEznEDm218nYVznHhHVaXlEDbeM9WJjV/iH9P0lmk/Dp6/qYG6a+TrCZzibh4ye7Vck+zsZ3dsCfW9P/AOZPGX2i19oDG7EWOMCijUcipXYzk54zF93LMDs4x4zVGn5ZCwYDBxGcxP5g9oCqNPywJ2sY8JZp6eRyNraz4RIbmnw/Ntb+yOovF218OMeMB0IQgB4GQa3ph9P7mXngZBrenXy/cwMU6c3IWBAwZ5dSaSASDkSrQ9E31RWv+dPKBjT6gVAggnMrou5bOFIxic2WaD/s9P3gOuuFONoZznhFc+XuGM1NLXBdkgYzxk/Mn76wGc+XuGeM/OxsKNnBzvmeZP31jaNO1LliwO6AvmLd8e0ZRpmqcksDuxG3WipQSM5OJinULa2yFPDMDOt6H/1J9J+IX1lGt6H/ANSfR9OvkYHRidX+Hf0/UR0xchsqZQcEwOZUhscICBmUjTmn+IWBC9QmqdK1dqsWBAlNqF6yoOMwJbNWroy7JGRJUbZdW44OY5tI6qWJBAEngW89TPyGerrFZgAhGTIlG0wXtOJSNI6ENtDdvgWP8jeU5I3nEuOrRvhAO/dF8zcHORu3wAaJiM7YnvMmG/bG6bGsTIGyeyU8V84Eo1qgY2Duhz5e4ZHxPnKBonIztCBcp2lB7RJ21iqxXZO44j0GygB4gTmW9K/1GB47bTlscTOlR0Nf0iRro3ZQwI3y6tdlFU9QxA1CEns1a12FSDugZu0rWWs4YDMdShrqC5ziarcWIGG4GagIt1QrcqVJIiWqOqPKKwA4YMXq/wAQ3pKdF0A84CuYtj5x7RF1XJPsk53ZnUPCQa7pgP6YHmn1ApQqQTvzHc+XuH3k9Ona1NpSJm6o0sAxzkQKGXnZ2l+HG7fHaak07WWBz2SXTahaVIIJzK6b1uzsgjEBsIQgB4GQa3p18v3MvPCTanTta4ZSNwxvgeaHoW+r/E1qaGuZSpAx2zWmqapCrY3nO6OgQcyfvL7zaf8AEzt79rs8JZiT6qlrdnZIGO2Bum5bs7IO7thdctONoE57JjS0tUW2iDnsM91NLWhdkgY7YHtWoW0nZB3DrmrbVqUM2SCcRWmoalm2iDkdRnmu6MfV+0Dx3GqGxXuIOd8yiHStyjkEEY3RWmtFTlmB3jG6PdxqV2EBBG/4hAHsGqXk0BBznfCjTPXaGJUgdhnunoeuzLFSMY3GVQCEzY4rQsc4HZEc8r7r+3+4D7HFaFjkgdkRz2vsb2/3MX6lLKmVQ2T2iSopdwowCe2BY2oW1SgDAtu3xXMrO8s9XTvWQ5K4U5OI3ndfdb2gKGmeshyy/Cc7ow6pHBUA5bdvg+rrZGADbx1yNDh1PZAoXR2BgcruluN2IgaustgBt/hH9UDk56/WdcTkdmZcNZXw2Wz5QIesS0aysKBhormdh4FfUw5nZ3k94Due191vaROdpmbtOY/mdneT3/1DmdneT3/1Asp6JPpEU2sRWK4ORMrqUrUIQ2V+E9kjsbasYjgTA6iOHQMOBE5+p6d/OOq1KJUqkNkdgmWpa9jYhADcM8YHtOqSuoKQcjsjOep3W9pHYhrcox3iMr0z2IHUqAe2Bi+wW2lhuEdp9SlVeyQSc9U85nZ3k9/9Q5nZ2p7wHc9r7re0m1FousDAHsmbajU2yxGfCap07WrtKQMdsCjRdE31T3U6drXBUjHjN6apqkKtjec7o6BBzKzvL7yjTUtUW2iN/ZH4hAIQhAIm29Km2Wzv7I48DINd0q/TAfzyr+r2hz2rx9pJXQ9q5Wb5nb4e8CjntX9XtDnlX9XtJ+Z2+HvDmdvh7wKOeVf1Q55V4+0n5nb4e8XbS9WNrG/xgX1XpaSFzuHXF67o1+qK0Hzv5Rmt6Nfq/aBJVU1rFVxkb5RUh0zF7MYO7dF6axanJbux1rjUqEq+YHO+A2rUJa+yueGd8ZY4rTabgJJUjaZ9uz5eG4z2/U12VFVzk+EDT3LehqTO03DPvJ7NNZWhdsYE90v4lfX9JXq/w7+n6iBz0Q2OEXGTHrQ9LCxsYXjiY0vTp6/pL7lL1Mq8SICW1FdqlFzltwzEczt/p956mnsrIdgNld5j+eU+PtAn5nb/AEw5nb/T7yldVUzBRnJ8I+BANLYpDHGBv3R/PKzuGcx7/I3lOSDgwH8zsxuK+89GjtyPll3AeUTzurON+fKA4DAAnuIcYQJ21dasQdrdPOeVf1SO3pW84xdLawBAG/xgabTWWMXGMNv3zzmdv9PvHrqK61CNnK7jKFIZQw4HhA5TqUcqeInR0v4dJPbprHtZgBg+MZXclCCt87S8cQJtX+If0/SV6T8Ovr+sivcPczLwMu0n4dPX9TA8s1KVvskNmMrcWLtLnHjJr9PZZaWUDHnHaetq6tlhv84E2s6f0E90+oSpCrA8eqZ13T+knEDoc8q/q9o2q1bRlc4HbOfXQ9i7SiUUsNMNm3cTv3QK4TFVq2jK9XhNwCEIQA8DINb06+X7mXngZBrenXy/cwG6Lom+qOsuSsgOcE+EToehb6v8Rev+dfKA/ndXePtDndXePtOdAcYHUruS3Owc48IjX/Kk80HF/Se6/wCVPOBjQfO/lG67ol+qK0Hzv5Rmt6Nfq/aBJXW1hwoycZlWlosrsywwMdsxoekP0/vLoCdVW1lWFGTmSc0u7v3nRhAhqqemwPYAFHExttyXVlEOWbgJvUKXpZVGScfrJ9PRYlysy4Az1jsge6fTWJarMMAeMrdgilm4Cai9R0D+UBbX12KUQnLDd1SbmlvDZHvF077kHjOrAgr01q2KSowCDxlxOBk8BBjsqSeAiH1NRRgG347IA2qqKkAnOOyc/rhAcYHXPAyDmtuc4GM54yrnVXe3+Uad4z4QEjVVAbyc+UOd1d77SU6W3edn7xBGDjhAobTWuxYAYJzLawVRQeoRSaikIoLcBHqQVBHAwOZd0r/UZXXqalqUFt4G/dJLels+o/vFwOjzunvfaT2Uvc5sQZUxa6e1lDKuQZfQpWlVYYMDmuhRip4iV6fUVpSqsd48IjVfiG9P0mUosdQVXIPjAt53V3j7Q53T3vtJOa3dz7iLdGrbDDBgM1TrZblTuxM10PYNpRkecK6bLBtKuR5yqll06bNp2STmBvS1tXWytuJPbJ9d0q+UsrsWwZQ5Ej1/SjygN0HyN5yqS6D5H85VAIQhADwMg1vTr5fuZeeBkGt6dfL9zAboeib6v8Rev+dPKM0PQn6v8TzV1PYy7K5xAihG81u7kObXdwwH6Di/p+891/yp5zWkqesttjGcTOv+VPOBjQfO/lGa3o1+r9ovQfO/lGa7oh9X7QE6R1rsJY4GJVzmnv8A2M5sMwOlzmnv/YzSX1u2yrZJnLjtOyparMcAQOg7BFLMcARfOae/9jMXWJbUa6ztMeAkj02opZlwBAvW+t2Cq2SfAz3UdA/lIdKf+Qnr+ku1HQP5QOdUQtqEnABl/Oae/wDac2eqCzAAbzAve+t0ZVbLEEDcZKdNaASV3CepTYrqzLhQQT7yl76jW2H4g7oHPgOMJ6u5h5wGrp7sg7BnRHVFDU098Q5zT34DiMgzmnTW5PwS3nNJ/nEYN+DA5JyCQdxEvr1NQRQX3gdkit6V/qmMwKLKLHdmVcqTkHMzza7ufcS6nfUn0iMxAnrurrrCO2GUbxHq4dQynInM1HTv5yrT31pSqs2DAXqKLHuLKuQY2mxKaxXYcMOIm+c09+TXVvbaXrXaU4wfSBTzmnv/AGMnuRr7OUqGVxxi+bXdyWaZClOGGDmAql1pq2LDstkzN6te4eobSgYmdZ+IHkJvSW111EO2CTAbpK2rrYOMHMXq6XssBRcjEpR1dcociePaiHDsATAVpK3rVg4xmUTNdi2AlTnE1AIQhADwMg1vTr9P7mXnhItYjtaCqk7uoQPdHaiVkMwG+Uc4q7495zuRs/Lb+0w5Gz8tv7TA6HL1d8e8OXq7495z+Rs/Lb+0w5Gz8tv7TA6HOKu+JNrbFcLsnMRyNn5bf2me8lZ3G9jAdoPnfyjtWjPWAoydqY0aMrttKRu6xK4HKep0GWUgTKoznCjJl+sVmrGyCd/VFaNGW0llI3dYgI5vb3DDm9vcM6kIHPpRqrVewFVHEmPusSypkRgzHgBN6lS1LBQSd24ecl01brepZGA37yPCB5TW9Vqu6lVHEmVW2pZWyowLEbgJ7qVLUMFBJ3bvWSUVWLcpKsAOvEDHIW9wzddFi2KShABE6MIGLATWwHWCJz+QtI+Qzpwgcvm9vcMOb2j+QzqTxvlPlA5HCGYw1Wb/AIG49k85Gz8tv7TAwDvnXX5R5TmCqzO9G9jOmNyjygcu3pX856KLCAQhOZ7ZU5sY7DceydCsEVoPCAuu2tEVWcAgYIm+cVd8SG2pza5CNjPZMcjZ+W39pgMtqey1mRSVJ3GKYFWwRvE6VAIpUEYI7ZHqK3N7EISPKAtabGGVQkSyixKqlR22WGd3rN6YFaFBBBkmprdr2IQkeUC5WVxlTkTUTpVK0AEEGOgc/XdP6RSVO4yq5Eo1dbNcCFJGOoRukVlqIYEHPZAxpmFNZW07JJ4GY1Cm9w1Q2gBxE91lbNaCASMdQjNEpVGyCDmAaOtkU7QxKYQgEIQgEIQgGIYhCAYhiEIBiEIQCEIQCEIQCEIQCEIQCEIQCEIQCEIQCEIQCGIQgEIQgEMQhAIYhCAQhCAYhCEAhCEAhCEAhCEAhCEAhCED/9k=" style="width:200px;height:200px;border-radius:8px;object-fit:cover;border:1px solid rgba(255,255,255,0.1);pointer-events:auto;cursor:pointer;" title="点击放大查看">

    <div class="about-sponsor">扫码赞助 · 感谢支持</div>
  </div>
`;
  aboutModal.style.cssText =
    "display:none !important;position:fixed;z-index:2147483647;pointer-events:none;opacity:0;transform:scale(0.95);transition:opacity 0.3s ease,transform 0.3s ease;background:rgba(20,20,25,0.95);backdrop-filter:blur(24px) saturate(180%);border:1px solid rgba(255,255,255,0.15);border-radius:16px;padding:24px;box-shadow:0 16px 48px rgba(0,0,0,0.5);color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:320px;text-align:center;";
  document.documentElement.appendChild(aboutModal);

  const PAY_IMG =
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAFA3PEY8MlBGQUZaVVBfeMiCeG5uePWvuZHI////////////////////////////////////////////////////2wBDAVVaWnhpeOuCguv/////////////////////////////////////////////////////////////////////////wAARCAFpAWIDASIAAhEBAxEB/8QAGQAAAwEBAQAAAAAAAAAAAAAAAAMEAgUB/8QAORAAAgIBAQMKBAQGAwEBAAAAAQIAAxEEEiExExQzQVFSYXGBkSIycqE0U7HBI0JiktHhJEOCY/D/xAAXAQEBAQEAAAAAAAAAAAAAAAAAAQID/8QAGhEBAAMBAQEAAAAAAAAAAAAAAAECETESUf/aAAwDAQACEQMRAD8AshCLe6us4dsHygMhE86p7/2P+Ic6p7/2P+IDoRPOqe/9j/iHOqe/9j/iA6ETzqnv/Y/4hzqnv/YwHQmK7ksyEOcT17FrALnGYGoRddyWNhGyZp7FrGXOBA1CJ51T3/sf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";

  function showAboutModal() {
    aboutModal.style.display = "block";
    aboutModal.style.visibility = "visible";
    aboutModal.style.pointerEvents = "auto";

    // 每次打开都重置到底部
    aboutModal.style.transition = "none"; // 先关掉过渡，防止闪现
    aboutModal.style.left = "50%";
    aboutModal.style.top = "100%";
    aboutModal.style.transform = "translate(-50%, 0) scale(0.95)";
    aboutModal.style.opacity = "0";

    // 强制回流，确保上面样式生效
    void aboutModal.offsetHeight;

    // 开启动画
    aboutModal.style.transition =
      "opacity 0.35s ease, top 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";
    aboutModal.style.top = "50%";
    aboutModal.style.transform = "translate(-50%, -50%) scale(1)";
    aboutModal.style.opacity = "1";

    // 边界检查（保留）
    setTimeout(function () {
      var rect = aboutModal.getBoundingClientRect();
      if (rect.height > window.innerHeight - 20) {
        aboutModal.style.top = "10px";
        aboutModal.style.transform = "translateX(-50%) scale(1)";
      }
      if (rect.width > window.innerWidth - 20) {
        aboutModal.style.left = "10px";
        aboutModal.style.transform = "translateY(-50%) scale(1)";
      }
      if (
        rect.height > window.innerHeight - 20 &&
        rect.width > window.innerWidth - 20
      ) {
        aboutModal.style.top = "10px";
        aboutModal.style.left = "10px";
        aboutModal.style.transform = "scale(1)";
      }
    }, 50);
  }

  function hideAboutModal() {
    aboutModal.style.pointerEvents = "none";
    aboutModal.style.transition =
      "opacity 0.3s ease, top 0.35s cubic-bezier(0.4, 0, 0.2, 1), transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)";
    aboutModal.style.top = "100%";
    aboutModal.style.transform = "translate(-50%, 0) scale(0.95)";
    aboutModal.style.opacity = "0";
    setTimeout(function () {
      aboutModal.style.display = "none";
      // ★★★ 关键：不要清除 transition，保留它 ★★★
    }, 400);
  }

  aboutModal
    .querySelector("#nopic-about-close")
    .addEventListener("click", hideAboutModal);
  aboutModal
    .querySelector("#nopic-about-img")
    .addEventListener("click", function () {
      window.open(PAY_IMG, "_blank");
    });

  const confirmModal = document.createElement("div");
  confirmModal.id = "nopic-confirm-modal";
  confirmModal.innerHTML = `
    <div class="nopic-confirm-box">
        <div class="nopic-confirm-title">确认永久隐藏？</div>
        <div class="nopic-confirm-text">当前网站的面板将被隐藏，之后仍可用 Alt+H 快捷键重新唤出。</div>
        <div class="nopic-confirm-btns">
            <button class="nopic-confirm-btn cancel">取消</button>
            <button class="nopic-confirm-btn danger">确认</button>
        </div>
    </div>
`;
  document.documentElement.appendChild(confirmModal);

  let confirmCallback = null;

  // 专门用于安全警告的弹窗 - 点击"我知道了"仅关闭弹窗，不清除标志
  function showConfirmModalWithAck(title, text) {
    confirmModal.querySelector(".nopic-confirm-title").textContent = title;
    confirmModal.querySelector(".nopic-confirm-text").textContent = text;

    // 重置按钮样式
    var confirmBtn = confirmModal.querySelector(".nopic-confirm-btn.danger");
    var cancelBtn = confirmModal.querySelector(".nopic-confirm-btn.cancel");

    // 隐藏取消按钮
    cancelBtn.style.display = "none";

    // 设置确认按钮为"我知道了"
    confirmBtn.textContent = "我知道了";
    confirmBtn.classList.remove("danger");
    confirmBtn.classList.add("cancel");

    // 设置回调 - 仅关闭弹窗，不清除任何标志
    confirmCallback = function () {
      // 只关闭弹窗，不修改任何状态
      hideConfirmModal();
      // 恢复按钮样式供下次使用
      confirmBtn.textContent = "确认";
      confirmBtn.classList.add("danger");
      confirmBtn.classList.remove("cancel");
      cancelBtn.style.display = "";
    };

    confirmModal.classList.add("active");
  }

  // ===== 单元格删除选项弹窗 =====
  // ===== 单元格删除选项弹窗（带动画和模糊背景） =====
  function showDeleteCellModal(colName, rowNum, onShiftUp, onClear) {
    // 移除已存在的弹窗
    var existing = document.getElementById("nopic-cell-del-overlay");
    if (existing) {
      existing.remove();
    }

    // 创建遮罩
    var overlay = document.createElement("div");
    overlay.id = "nopic-cell-del-overlay";
    overlay.className = "nopic-cell-del-overlay";

    // ★★★ 关键：先让弹窗处于隐藏状态，等待添加 active 类触发动画 ★★★
    var box = document.createElement("div");
    box.className = "nopic-cell-del-box";

    box.innerHTML = `
    <div class="nopic-cell-del-header">
      <div class="nopic-cell-del-title">删除单元格</div>
      <div class="nopic-cell-del-subtitle">
        第 <span class="nopic-cell-del-highlight">${rowNum}</span> 行 · 
        <span class="nopic-cell-del-highlight">${colName}</span>
      </div>
    </div>

    <div class="nopic-cell-del-actions">
      <button class="nopic-cell-del-btn nopic-cell-del-btn-primary" data-action="shiftup">
        <div class="nopic-cell-del-btn-content">
          <span class="nopic-cell-del-btn-label">删除并上移</span>
          <span class="nopic-cell-del-btn-hint">下方数据填补空缺</span>
        </div>
      </button>

      <button class="nopic-cell-del-btn nopic-cell-del-btn-secondary" data-action="clear">
        <div class="nopic-cell-del-btn-content">
          <span class="nopic-cell-del-btn-label">仅清空</span>
          <span class="nopic-cell-del-btn-hint">保留空位不移动</span>
        </div>
      </button>

      <button class="nopic-cell-del-cancel" data-action="cancel">取消</button>
    </div>
  `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // ★★★ 强制重绘，确保 transition 生效 ★★★
    void overlay.offsetHeight;

    // ★★★ 用 requestAnimationFrame 双重保险，添加 active 类触发动画 ★★★
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.classList.add("active");
      });
    });

    // 事件绑定
    box
      .querySelector('[data-action="shiftup"]')
      .addEventListener("click", function (e) {
        e.stopPropagation();
        closeWithAnimation(overlay, function () {
          if (typeof onShiftUp === "function") onShiftUp();
        });
      });

    box
      .querySelector('[data-action="clear"]')
      .addEventListener("click", function (e) {
        e.stopPropagation();
        closeWithAnimation(overlay, function () {
          if (typeof onClear === "function") onClear();
        });
      });

    box
      .querySelector('[data-action="cancel"]')
      .addEventListener("click", function (e) {
        e.stopPropagation();
        closeWithAnimation(overlay);
      });

    // 点击遮罩关闭（带动画）
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        closeWithAnimation(overlay);
      }
    });

    // ESC关闭（带动画）
    function onKeyDown(e) {
      if (e.key === "Escape") {
        closeWithAnimation(overlay);
        document.removeEventListener("keydown", onKeyDown);
      }
    }
    document.addEventListener("keydown", onKeyDown);

    // ★★★ 带动画的关闭函数 ★★★
    function closeWithAnimation(el, callback) {
      if (!el || !el.parentNode) {
        if (typeof callback === "function") callback();
        return;
      }
      el.classList.remove("active");
      // 等动画结束后移除 DOM
      setTimeout(function () {
        if (el.parentNode) el.remove();
        if (typeof callback === "function") callback();
      }, 300);
    }
  }

  // ===== 删除单元格并上移（下方数据向上填补） =====
  function dcDeleteCellAndShiftUp(colId, rowIdx) {
    var data = dcState.columnData[colId] || [];
    if (rowIdx >= 0 && rowIdx < data.length) {
      // 删除该位置元素，下方数据自动上移（splice 天然支持）
      data.splice(rowIdx, 1);
      dcState.columnData[colId] = data;
    }
    dcRenderTable();
    dcSaveCache();
  }

  // ===== 仅清空单元格（保留空位） =====
  function dcClearCell(colId, rowIdx) {
    var data = dcState.columnData[colId] || [];
    if (rowIdx >= 0 && rowIdx < data.length) {
      // 只清空内容，不删除元素位置
      data[rowIdx] = "";
      dcState.columnData[colId] = data;
    }
    dcRenderTable();
    dcSaveCache();
  }

  function showConfirmModal(title, text, onConfirm, onCancel) {
    // 确保 confirmModal 在 body 最顶层
    if (confirmModal.parentNode !== document.body) {
      document.body.appendChild(confirmModal);
    }

    // 先确保弹窗是完全关闭的状态，再重新打开
    confirmModal.classList.remove("active");

    // 强制重绘 - 关键！确保 transition 重新生效
    void confirmModal.offsetHeight;

    confirmModal.querySelector(".nopic-confirm-title").textContent = title;
    confirmModal.querySelector(".nopic-confirm-text").textContent = text;

    // 重置取消按钮文字为"取消"
    const cancelBtn = confirmModal.querySelector(".nopic-confirm-btn.cancel");
    cancelBtn.textContent = "取消";
    cancelBtn.style.display = "";

    // 重置确认按钮
    const confirmBtn = confirmModal.querySelector(".nopic-confirm-btn.danger");
    confirmBtn.textContent = "确认";
    confirmBtn.classList.add("danger");
    confirmBtn.classList.remove("cancel");

    // 移除旧的事件监听（通过克隆替换）
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    // 绑定确认回调
    newConfirmBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (typeof onConfirm === "function") onConfirm();
      hideConfirmModal();
    });

    // 绑定取消回调
    newCancelBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (typeof onCancel === "function") onCancel();
      hideConfirmModal();
    });

    // 点击背景也触发取消
    confirmModal.addEventListener("click", function (e) {
      if (e.target === confirmModal) {
        if (typeof onCancel === "function") onCancel();
        hideConfirmModal();
      }
    });

    // 使用 requestAnimationFrame 确保在下一帧添加 active 类
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        confirmModal.classList.add("active");
      });
    });
  }
  function hideConfirmModal() {
    confirmModal.classList.remove("active");
    confirmCallback = null;
  }

  // 绑定按钮事件
  confirmModal
    .querySelector(".cancel")
    .addEventListener("click", hideConfirmModal);
  confirmModal.querySelector(".danger").addEventListener("click", () => {
    if (confirmCallback) confirmCallback();
    hideConfirmModal();
  });
  // 点击背景关闭
  confirmModal.addEventListener("click", (e) => {
    if (e.target === confirmModal) hideConfirmModal();
  });

  menu.querySelector('[data-action="about"]').addEventListener("click", () => {
    showAboutModal();
    menu.classList.remove("active");
  });

  // ▼ 新增：阅兵模式按钮绑定
  menu
    .querySelector('[data-action="paradeMode"]')
    .addEventListener("click", () => {
      if (isParadeMode) {
        exitParadeMode();
      } else {
        enterParadeMode();
      }
      menu.classList.remove("active");
    });

  // 阅兵过滤开关
  document
    .getElementById("nopic-parade-filter-toggle")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      paradeFilter.enabled = !paradeFilter.enabled;
      setParadeFilterConfig(paradeFilter);
      updateAllUI();
      // 如果当前在阅兵模式，刷新
      if (isParadeMode) {
        exitParadeMode();
        setTimeout(() => enterParadeMode(), 100);
      }
    });

  // 过滤数值输入
  ["minW", "minH", "maxW", "maxH"].forEach((k) => {
    const input = document.getElementById("nopic-pf-" + k);
    if (input) {
      input.addEventListener("change", (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val) || val < 1) val = 1;
        if (val > 9999) val = 9999;
        paradeFilter[k] = val;
        e.target.value = val;
        setParadeFilterConfig(paradeFilter);
        if (isParadeMode) {
          exitParadeMode();
          setTimeout(() => enterParadeMode(), 100);
        }
      });
    }
  });

  menu.addEventListener("click", (e) => {
    const permaHideBtn = e.target.closest('[data-action="permaHide"]');
    if (permaHideBtn) {
      e.stopPropagation();
      showConfirmModal(
        "确认永久隐藏？",
        "当前网站的面板将被隐藏，之后仍可用 Alt+H 快捷键重新唤出。",
        () => {
          const permaList = getPermaHiddenSites();
          if (!permaList.includes(location.host)) {
            permaList.push(location.host);
            setPermaHiddenSites(permaList);
          }
          // 自动恢复图片显示
          if (window.imgHidenSet !== null) {
            clearInterval(window.imgHidenSet);
            window.imgHidenSet = null;
            imgShown();
            let imgList = (localStorage.getItem("nopicValueList") || "")
              .split(",")
              .filter((v) => v !== location.host && v);
            localStorage.setItem("nopicValueList", imgList.join(","));
          }
          isUISelfHidden = true;
          widget.style.display = "none";
          menu.classList.remove("active");
        },
      );
      return;
    }

    const sw = e.target.closest(".nopic-switch");
    if (sw) {
      e.stopPropagation();
      const key = sw.dataset.key;
      if (key === "outline") {
        showOutlineConfig = !showOutlineConfig;
        setLocalConfig("showOutline", showOutlineConfig);
      } else if (key === "hoverOnly") {
        hoverOnlyConfig = !hoverOnlyConfig;
        setLocalConfig("hoverOnly", hoverOnlyConfig);
      } else if (key === "hoverShowImg") {
        hoverShowImgConfig = !hoverShowImgConfig;
        setLocalConfig("hoverShowImg", hoverShowImgConfig);
        if (hoverShowImgConfig && zoomModeConfig === "click") {
          zoomModeConfig = "hover";
          setLocalConfig("zoomMode", zoomModeConfig);
          if (window.imgHidenSet) {
            imgShown();
            imgHiden();
          }
        }
      } else if (key === "autoHideIdle") {
        autoHideIdleConfig = !autoHideIdleConfig;
        setLocalConfig("autoHideIdle", autoHideIdleConfig);
        if (!autoHideIdleConfig) {
          clearTimeout(sleepTimer);
          clearTimeout(sleepBgTimer);
          isSleeping = false;
          widget.classList.remove("sleeping", "transparent-bg");
        } else {
          startSleepTimer();
        }
      } else if (key === "autoSnap") {
        autoSnapConfig = !autoSnapConfig;
        setLocalConfig("autoSnap", autoSnapConfig);
        applySnapPosition(false);
      } else if (key === "zoomPinMode") {
        zoomPinModeConfig = !zoomPinModeConfig;
        setLocalConfig("zoomPinMode", zoomPinModeConfig);
        if (zoomedClones.size > 0) {
          imageControls.forEach((btn, el) => {
            if (el._isZoomed) zoomOut(el);
          });
        }
      } else if (key === "disableAnimation") {
        disableAnimationConfig = !disableAnimationConfig;
        setLocalConfig("disableAnimation", disableAnimationConfig);
        // 立即生效
        if (disableAnimationConfig) {
          document.body.classList.add("nopic-animation-disabled");
        } else {
          document.body.classList.remove("nopic-animation-disabled");
        }
      } else if (key === "loadAnimation") {
        loadAnimationConfig = !loadAnimationConfig;
        setGlobalConfig("loadAnimation", loadAnimationConfig);
        if (!loadAnimationConfig) {
          // 如果关闭，移除所有已添加的动画类
          document.querySelectorAll(".nopic-load-anim").forEach((el) => {
            el.classList.remove("nopic-load-anim");
            el.style.opacity = "";
            el.style.filter = "";
            el.style.transition = "";
            el.style.transform = "";
          });
        } else {
          // 如果打开，对当前页面重新应用动画
          setTimeout(initLoadAnimation, 100);
        }
      }
      updateAllUI();
      if (window.imgHidenSet) imgHiden();
      return;
    }

    const zoomBtn = e.target.closest(".nopic-range-btn[data-zoom]");
    if (zoomBtn) {
      e.stopPropagation();
      let newMode = zoomBtn.dataset.zoom;
      if (hoverShowImgConfig && newMode === "click") newMode = "hover";
      zoomModeConfig = newMode;
      setLocalConfig("zoomMode", zoomModeConfig);
      if (zoomModeConfig === "hover") {
        zoomLeaveModeConfig = "leave";
        setLocalConfig("zoomLeaveMode", zoomLeaveModeConfig);
      }
      updateAllUI();
      if (window.imgHidenSet) {
        imgShown();
        imgHiden();
      }
      return;
    }

    const leaveBtn = e.target.closest(".nopic-range-btn[data-leave]");
    if (leaveBtn) {
      e.stopPropagation();
      zoomLeaveModeConfig = leaveBtn.dataset.leave;
      setLocalConfig("zoomLeaveMode", zoomLeaveModeConfig);
      updateAllUI();
      return;
    }

    const trigger = e.target.closest("[data-submenu-trigger]");
    if (trigger) {
      const targetSubmenu = trigger.dataset.submenuTrigger;
      if (targetSubmenu === "displayContent") {
        const isVisible = displaySubmenu.style.display === "flex";
        if (isVisible) hideDisplaySubmenu();
        else showDisplaySubmenu();
      }
    }
  });

  displaySubmenu.addEventListener("click", (e) => {
    e.stopPropagation();
    const rangeBtn = e.target.closest(".nopic-range-btn");
    if (rangeBtn) {
      statsRangeConfig = rangeBtn.dataset.range;
      setGlobalConfig("statsRange", statsRangeConfig);
      updateAllUI();
      updateContent();
      return;
    }
    const item = e.target.closest(".nopic-submenu-item");
    if (item) {
      const key = item.dataset.key;
      const configKey = key.replace("display", "");
      const mapKey = configKey.charAt(0).toLowerCase() + configKey.slice(1);
      if (configs[mapKey] !== undefined) {
        configs[mapKey] = !configs[mapKey];
        setGlobalConfig(key, configs[mapKey]);
      }
      updateAllUI();
      updateContent();
      return;
    }
  });

  const submenuTrigger = menu.querySelector(".nopic-submenu-trigger");
  const settingsTrigger = menu.querySelector('[data-submenu="settings"]');
  const displayTrigger = settingsSubmenu.querySelector(
    '[data-submenu-trigger="displayContent"]',
  );

  const showSettingsSubmenu = () => {
    settingsSubmenu.style.display = "flex";
    const menuRect = menu.getBoundingClientRect();
    const subRect = settingsSubmenu.getBoundingClientRect();

    // 判断主菜单在屏幕哪一侧
    const isMenuOnRightSide = menuRect.left > window.innerWidth / 2;

    if (isMenuOnRightSide) {
      // 主菜单在右侧，二级菜单放左侧
      settingsSubmenu.style.left = "auto";
      settingsSubmenu.style.right = "100%";
      settingsSubmenu.style.marginLeft = "0";
      settingsSubmenu.style.marginRight = "4px";
    } else {
      // 主菜单在左侧，二级菜单放右侧
      settingsSubmenu.style.left = "100%";
      settingsSubmenu.style.right = "auto";
      settingsSubmenu.style.marginLeft = "4px";
      settingsSubmenu.style.marginRight = "0";
    }

    let currentTop = 0;
    let absTop = menuRect.top + currentTop;
    if (absTop + subRect.height > window.innerHeight - 10) {
      currentTop -= absTop + subRect.height - (window.innerHeight - 10);
      if (menuRect.top + currentTop < 10) currentTop = -menuRect.top + 10;
      settingsSubmenu.style.top = currentTop + "px";
    } else settingsSubmenu.style.top = currentTop + "px";
  };

  const hideSettingsSubmenu = () => {
    settingsSubmenu.style.display = "none";
    hideDisplaySubmenu();
  };

  const showDisplaySubmenu = () => {
    displaySubmenu.style.display = "flex";
    const settingsRect = settingsSubmenu.getBoundingClientRect();
    const subRect = displaySubmenu.getBoundingClientRect();

    const isSettingsOnRightSide = settingsRect.left > window.innerWidth / 2;

    if (isSettingsOnRightSide) {
      displaySubmenu.style.left = "auto";
      displaySubmenu.style.right = "100%";
      displaySubmenu.style.marginLeft = "0";
      displaySubmenu.style.marginRight = "4px";
    } else {
      displaySubmenu.style.left = "100%";
      displaySubmenu.style.right = "auto";
      displaySubmenu.style.marginLeft = "4px";
      displaySubmenu.style.marginRight = "0";
    }

    // 和二级菜单顶部对齐
    let currentTop = parseFloat(settingsSubmenu.style.top) || 0;
    let absTop = settingsRect.top + currentTop;

    // 底部超出则往上推
    if (absTop + subRect.height > window.innerHeight - 10) {
      currentTop = window.innerHeight - 10 - subRect.height - settingsRect.top;
    }
    // 顶部不能出去
    if (settingsRect.top + currentTop < 10) {
      currentTop = -settingsRect.top + 10;
    }

    displaySubmenu.style.top = currentTop + "px";
  };

  const hideDisplaySubmenu = () => {
    displaySubmenu.style.display = "none";
  };

  // ===== 标签伪装菜单事件 =====
  const disguiseTrigger = menu.querySelector('[data-submenu="disguise"]');

  const showDisguiseSubmenu = () => {
    disguiseSubmenu.style.display = "flex";
    const menuRect = menu.getBoundingClientRect();
    const subRect = disguiseSubmenu.getBoundingClientRect();
    const isMenuOnRightSide = menuRect.left > window.innerWidth / 2;

    if (isMenuOnRightSide) {
      disguiseSubmenu.style.left = "auto";
      disguiseSubmenu.style.right = "100%";
      disguiseSubmenu.style.marginLeft = "0";
      disguiseSubmenu.style.marginRight = "4px";
      disguiseSubmenu.classList.add("left-side");
    } else {
      disguiseSubmenu.style.left = "100%";
      disguiseSubmenu.style.right = "auto";
      disguiseSubmenu.style.marginLeft = "4px";
      disguiseSubmenu.style.marginRight = "0";
      disguiseSubmenu.classList.remove("left-side");
    }

    // 和设置的二级菜单一样，顶部平齐
    let currentTop = 0;
    let absTop = menuRect.top + currentTop;
    if (absTop + subRect.height > window.innerHeight - 10) {
      currentTop -= absTop + subRect.height - (window.innerHeight - 10);
      if (menuRect.top + currentTop < 10) currentTop = -menuRect.top + 10;
    }
    disguiseSubmenu.style.top = currentTop + "px";
  };

  const hideDisguiseSubmenu = () => {
    disguiseSubmenu.style.display = "none";
  };

  // 标签伪装开关（开关状态独立存储在URL级别）
  document
    .getElementById("nopic-disguise-toggle")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      disguiseConfig.enabled = !disguiseConfig.enabled;
      nopicSetToggleState("nopic_disguise", disguiseConfig.enabled);
      updateAllUI();
      applyDisguise();
    });

  // 标题模式切换
  tabDisguiseSubmenu.querySelectorAll("[data-title-mode]").forEach((row) => {
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      disguiseConfig.titleMode = row.dataset.titleMode;
      setDisguiseConfig(disguiseConfig);
      // 显示/隐藏对应的输入区域
      const presetTitleRow = document.getElementById("nopic-preset-title-row");
      const customTitleInput = document.getElementById(
        "nopic-custom-title-input",
      );
      if (presetTitleRow)
        presetTitleRow.style.display =
          disguiseConfig.titleMode === "preset" ? "block" : "none";
      if (customTitleInput)
        customTitleInput.style.display =
          disguiseConfig.titleMode === "custom" ? "block" : "none";
      updateAllUI();
      applyDisguise();
    });
  });

  // 预设标题选择（自定义下拉框）
  const presetTitleSelect = document.getElementById(
    "nopic-preset-title-select",
  );
  if (presetTitleSelect) {
    const header = presetTitleSelect.querySelector(
      ".nopic-custom-select-header",
    );
    const dropdown = presetTitleSelect.querySelector(
      ".nopic-custom-select-dropdown",
    );
    const options = presetTitleSelect.querySelectorAll(
      ".nopic-custom-select-option",
    );

    // 点击header打开/关闭下拉框
    header.addEventListener("click", (e) => {
      e.stopPropagation();
      presetTitleSelect.classList.toggle("open");
    });

    // 点击选项
    options.forEach((opt) => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        const value = opt.dataset.value;
        disguiseConfig.presetTitle = value;
        setDisguiseConfig(disguiseConfig);
        // 更新header显示
        header.textContent = opt.textContent;
        // 更新选中状态
        options.forEach((o) => o.classList.remove("selected"));
        opt.classList.add("selected");
        // 关闭下拉框
        presetTitleSelect.classList.remove("open");
        applyDisguise();
      });
    });

    // 点击其他地方关闭下拉框
    document.addEventListener("click", () => {
      presetTitleSelect.classList.remove("open");
    });
  }

  // 自定义标题输入
  const customTitleInput = document.getElementById("nopic-custom-title-input");
  customTitleInput.addEventListener("input", (e) => {
    e.stopPropagation();
    disguiseConfig.customTitle = e.target.value;
    // 直接保存到当前scope
    const configToSave = { ...disguiseConfig };
    delete configToSave.enabled;
    if (currentDisguiseScope === "global") {
      GM_setValue("nopic_disguise_global", configToSave);
    } else {
      const key = nopicGetConfigStorageKey(
        "nopic_disguise",
        currentDisguiseScope,
      );
      localStorage.setItem(key, JSON.stringify(configToSave));
    }
    invalidateDisguiseCache();
    // 强制重新读取并应用
    _effectiveDisguiseCache = null;
    const effective = getDisguiseConfig();
    if (
      effective.enabled &&
      effective.titleMode === "custom" &&
      effective.customTitle
    ) {
      document.title = effective.customTitle;
    }
    // 更新UI状态
    updateAllUI();
  });
  customTitleInput.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });
  customTitleInput.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // 图标模式切换
  tabDisguiseSubmenu.querySelectorAll("[data-icon-mode]").forEach((row) => {
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      disguiseConfig.iconMode = row.dataset.iconMode;
      setDisguiseConfig(disguiseConfig);
      // 显示/隐藏对应的输入区域
      const presetIconRow = document.getElementById("nopic-preset-icon-row");
      const customIconArea = document.getElementById("nopic-custom-icon-area");
      if (presetIconRow)
        presetIconRow.style.display =
          disguiseConfig.iconMode === "preset" ? "block" : "none";
      if (customIconArea)
        customIconArea.style.display =
          disguiseConfig.iconMode === "custom" ? "flex" : "none";
      updateAllUI();
      applyDisguise();
    });
  });

  // 预设图标选择（自定义下拉框）
  const presetIconSelect = document.getElementById("nopic-preset-icon-select");
  if (presetIconSelect) {
    const header = presetIconSelect.querySelector(
      ".nopic-custom-select-header",
    );
    const dropdown = presetIconSelect.querySelector(
      ".nopic-custom-select-dropdown",
    );
    const options = presetIconSelect.querySelectorAll(
      ".nopic-custom-select-option",
    );

    // 点击header打开/关闭下拉框
    header.addEventListener("click", (e) => {
      e.stopPropagation();
      presetIconSelect.classList.toggle("open");
    });

    // 点击选项
    options.forEach((opt) => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        const value = opt.dataset.value;
        disguiseConfig.presetIcon = value;
        setDisguiseConfig(disguiseConfig);
        // 更新header显示
        header.textContent = opt.textContent;
        // 更新选中状态
        options.forEach((o) => o.classList.remove("selected"));
        opt.classList.add("selected");
        // 关闭下拉框
        presetIconSelect.classList.remove("open");
        applyDisguise();
      });
    });

    // 点击其他地方关闭下拉框
    document.addEventListener("click", () => {
      presetIconSelect.classList.remove("open");
    });
  }

  // 图标上传
  document
    .getElementById("nopic-icon-upload-btn")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("nopic-icon-file-input").click();
    });

  document
    .getElementById("nopic-icon-file-input")
    .addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // 压缩并转换为Base64
      try {
        const base64 = await compressImageToBase64(file, 64, 64);
        disguiseConfig.customIcon = base64;
        setDisguiseConfig(disguiseConfig);
        updateAllUI();
        applyDisguise();
      } catch (err) {
        console.error("图标处理失败:", err);
      }
      e.target.value = "";
    });

  // 清空自定义图标
  document
    .getElementById("nopic-clear-icon-btn")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      disguiseConfig.customIcon = "";
      setDisguiseConfig(disguiseConfig);
      updateAllUI();
      applyDisguise();
    });

  // 重置按钮
  document
    .getElementById("nopic-disguise-reset-btn")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      disguiseConfig = { ...defaultDisguiseConfig };
      setDisguiseConfig(disguiseConfig);
      updateAllUI();
      applyDisguise();
    });

  tabDisguiseSubmenu.querySelectorAll("[data-scope]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const newScope = btn.dataset.scope;
      nopicSetConfigScope("nopic_disguise", newScope);
      currentDisguiseScope = newScope;
      invalidateDisguiseCache();
      if (newScope === "global") {
        const saved = GM_getValue("nopic_disguise_global", null);
        disguiseConfig = saved
          ? typeof saved === "string"
            ? JSON.parse(saved)
            : { ...saved }
          : { ...defaultDisguiseConfig };
      } else {
        const key = nopicGetConfigStorageKey("nopic_disguise", newScope);
        const saved = localStorage.getItem(key);
        disguiseConfig = saved
          ? JSON.parse(saved)
          : { ...defaultDisguiseConfig };
      }
      disguiseConfig.enabled = nopicGetToggleState(
        "nopic_disguise",
        defaultDisguiseConfig.enabled,
      );
      updateAllUI();
    });
  });

  // 清除按钮事件：清除指定级别的配置，不影响其他级别
  tabDisguiseSubmenu.querySelectorAll("[data-clear-scope]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const scopeToClear = btn.dataset.clearScope;
      if (scopeToClear === "global") {
        GM_setValue("nopic_disguise_global", null);
      } else {
        const key = nopicGetConfigStorageKey("nopic_disguise", scopeToClear);
        localStorage.removeItem(key);
      }
      invalidateDisguiseCache();
      if (currentDisguiseScope === scopeToClear) {
        disguiseConfig = { ...defaultDisguiseConfig };
        disguiseConfig.enabled = nopicGetToggleState(
          "nopic_disguise",
          defaultDisguiseConfig.enabled,
        );
        updateAllUI();
      }
    });
  });

  // 清除按钮事件（手动清除某个级别的配置，不影响其他级别）
  tabDisguiseSubmenu.querySelectorAll("[data-clear-scope]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const scopeToClear = btn.dataset.clearScope;
      const key = nopicGetConfigStorageKey("nopic_disguise", scopeToClear);
      localStorage.removeItem(key);
      // 如果清除的是当前正在编辑的scope，重置为默认值
      if (currentDisguiseScope === scopeToClear) {
        disguiseConfig = { ...defaultDisguiseConfig };
        disguiseConfig.enabled = nopicGetToggleState(
          "nopic_disguise",
          defaultDisguiseConfig.enabled,
        );
        updateAllUI();
        applyDisguise();
      }
    });
  });

  // ===== 标签伪装功能实现 =====
  // 压缩图片并转为Base64
  async function compressImageToBase64(file, targetWidth, targetHeight) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          const base64 = canvas.toDataURL("image/png");
          resolve(base64);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // 获取原始favicon
  function getOriginalFavicon() {
    const faviconLink = document.querySelector("link[rel~='icon']");
    if (faviconLink) return faviconLink.href;
    return "/favicon.ico";
  }

  // 预设图标数据（SVG格式的Base64）
  const presetIcons = {
    wps: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNCIgZmlsbD0iIzAwODhGRiIvPjx0ZXh0IHg9IjE2IiB5PSIyMiIgZm9udC1zaXplPSIxNCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+V1BTPC90ZXh0Pjwvc3ZnPg==",
    office:
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNCIgZmlsbD0iI0Q1MzEzMyIvPjx0ZXh0IHg9IjE2IiB5PSIyMiIgZm9udC1zaXplPSIxMiIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+T0ZGSUNFPC90ZXh0Pjwvc3ZnPg==",
    word: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNCIgZmlsbD0iIzJCOThGQiIvPjx0ZXh0IHg9IjE2IiB5PSIyMiIgZm9udC1zaXplPSIxNCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+VzwvdGV4dD48L3N2Zz4=",
    excel:
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNCIgZmlsbD0iIzEwNzQ0MyIvPjx0ZXh0IHg9IjE2IiB5PSIyMiIgZm9udC1zaXplPSIxNCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RTwvdGV4dD48L3N2Zz4=",
    ppt: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNCIgZmlsbD0iI0QyNDcyNiIvPjx0ZXh0IHg9IjE2IiB5PSIyMiIgZm9udC1zaXplPSIxNCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+UDwvdGV4dD48L3N2Zz4=",
    pdf: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNCIgZmlsbD0iI0MzMzEyNSIvPjx0ZXh0IHg9IjE2IiB5PSIyMiIgZm9udC1zaXplPSIxMiIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+UERGPC90ZXh0Pjwvc3ZnPg==",
    folder:
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHBhdGggZD0iTTQgOGgyNGwyIDIydjRIMnYtMjR6IiBmaWxsPSIjRkZDMDM3Ii8+PC9zdmc+",
    mail: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNCIgZmlsbD0iIzAwODhGRiIvPjxwYXRoIGQ9Ik0yIDZsMTQgMTBsMTQtMTB2MjBIMnYtMjB6IiBmaWxsPSIjZmZmIi8+PC9zdmc+",
    learn:
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNCIgZmlsbD0iIzRGQzNFNSIvPjx0ZXh0IHg9IjE2IiB5PSIyMiIgZm9udC1zaXplPSIxNCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+TDwvdGV4dD48L3N2Zz4=",
  };

  // ===== 渲染标签伪装三列列表 =====
  function renderDisguiseLists() {
    const effective = getDisguiseConfig();
    const effectiveScope = effective._effectiveScope;
    const listUrl = document.getElementById("nopic-disguise-list-url");
    const listDomain = document.getElementById("nopic-disguise-list-domain");
    const listGlobal = document.getElementById("nopic-disguise-list-global");
    if (!listUrl || !listDomain || !listGlobal) return;

    // 获取三个作用域的配置
    function getDisguiseConfigByScope(scope) {
      try {
        if (scope === "global") {
          const saved = GM_getValue("nopic_disguise_global", null);
          return saved
            ? typeof saved === "string"
              ? JSON.parse(saved)
              : { ...saved }
            : {};
        }
        // 关键修复：url 级别使用完整的 URL key，而不是 host
        const key =
          scope === "domain"
            ? "nopic_disguise_domain_" + location.host
            : "nopic_disguise_" + encodeURIComponent(nopicGetUrlKey());
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : {};
      } catch (e) {
        return {};
      }
    }

    const scopes = ["url", "domain", "global"];
    const containers = [listUrl, listDomain, listGlobal];

    scopes.forEach((scope, idx) => {
      const container = containers[idx];
      const cfg = getDisguiseConfigByScope(scope);
      const hasData =
        (cfg.titleMode && cfg.titleMode !== "native") ||
        (cfg.iconMode && cfg.iconMode !== "native");

      let html = "";
      const titleLabel =
        {
          native: "原生标题",
          preset: "预设: " + (cfg.presetTitle || "未设置"),
          custom: "自定义: " + (cfg.customTitle || "未设置"),
        }[cfg.titleMode] || "原生标题";

      const iconLabel =
        {
          native: "原生图标",
          preset: "预设图标",
          custom: "自定义图标",
        }[cfg.iconMode] || "原生图标";

      html += `
      <div style="font-size:10px;font-weight:600;color:${["#60a5fa", "#b3951e", "#a855f7"][idx]};text-align:center;padding-bottom:4px;border-bottom:1px solid ${["#60a5fa", "#b3951e", "#a855f7"][idx]}25;margin-bottom:4px;">
        ${["仅当前页", "当前网站", "全局通用"][idx]}
        <span style="font-size:8px;background:${["#60a5fa", "#b3951e", "#a855f7"][idx]};color:#fff;padding:1px 6px;border-radius:3px;margin-left:4px;">${hasData ? "已配置" : "未配置"}</span>
      </div>
    `;

      // 判断当前配置是否生效 - 按优先级 url > domain > global
      let isEffective = false;
      const urlCfg = getDisguiseConfigByScope("url");
      const domainCfg = getDisguiseConfigByScope("domain");
      const globalCfg = getDisguiseConfigByScope("global");

      const hasUrlData = !!(
        (urlCfg.titleMode && urlCfg.titleMode !== "native") ||
        (urlCfg.iconMode && urlCfg.iconMode !== "native")
      );
      const hasDomainData = !!(
        (domainCfg.titleMode && domainCfg.titleMode !== "native") ||
        (domainCfg.iconMode && domainCfg.iconMode !== "native")
      );
      const hasGlobalData = !!(
        (globalCfg.titleMode && globalCfg.titleMode !== "native") ||
        (globalCfg.iconMode && globalCfg.iconMode !== "native")
      );

      if (scope === "url") {
        // url 只要有配置就生效（最高优先级）
        isEffective = hasUrlData;
      } else if (scope === "domain") {
        // domain 只在 url 没有配置时才生效
        isEffective = hasDomainData && !hasUrlData;
      } else if (scope === "global") {
        // global 只在 url 和 domain 都没有配置时才生效
        isEffective = hasGlobalData && !hasUrlData && !hasDomainData;
      }
      // 如果没有配置数据，不降低透明度（保持可读性）
      if (!hasData) isEffective = false;

      const opacity = isEffective ? "1" : "0.4";
      const borderColor = isEffective
        ? "rgba(96,165,250,0.3)"
        : "rgba(255,255,255,0.05)";

      html += `
  <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;gap:3px;border-left:2px solid ${isEffective ? "#4ade80" : "rgba(255,255,255,0.06)"};transition:all 0.2s ease;cursor:default;opacity:${opacity};">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:11px;color:rgba(255,255,255,0.85);font-weight:400;">${titleLabel}</span>
      <span style="font-size:9px;color:rgba(255,255,255,0.25);">${iconLabel}</span>
    </div>
    <div style="display:flex;gap:4px;margin-top:2px;justify-content:flex-end;">
      <button class="nopic-disguise-btn primary" style="font-size:9px;padding:1px 10px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.12);border-radius:3px;color:#60a5fa;cursor:pointer;" data-disguise-edit="${scope}">编辑</button>
      <button class="nopic-disguise-btn danger" style="font-size:9px;padding:1px 10px;background:transparent;border:1px solid rgba(248,113,113,0.12);border-radius:3px;color:#f87171;cursor:pointer;" data-disguise-clear="${scope}">清除</button>
    </div>
    ${isEffective ? '<div style="font-size:8px;color:#4ade80;text-align:right;margin-top:1px;">● 生效中</div>' : ""}
  </div>
`;

      container.innerHTML = html;
    });

    // 绑定编辑按钮事件
    document.querySelectorAll("[data-disguise-edit]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const scope = btn.dataset.disguiseEdit;
        // 切换到对应作用域并打开编辑弹窗
        nopicSetConfigScope("nopic_disguise", scope);
        currentDisguiseScope = scope;
        // 读取配置并填充到编辑界面
        const cfg = getDisguiseConfigByScope(scope);
        disguiseConfig = { ...defaultDisguiseConfig, ...cfg };
        disguiseConfig.enabled = nopicGetToggleState(
          "nopic_disguise",
          defaultDisguiseConfig.enabled,
        );
        // 关闭当前三列视图，显示编辑界面
        document
          .getElementById("nopic-disguise-list-view")
          ?.style.setProperty("display", "none");
        document
          .getElementById("nopic-disguise-edit-view")
          ?.style.setProperty("display", "flex");
        updateAllUI();
        applyDisguise();
      });
    });

    // 绑定清除按钮事件
    document.querySelectorAll("[data-disguise-clear]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const scope = btn.dataset.disguiseClear;
        if (scope === "global") {
          GM_setValue("nopic_disguise_global", null);
        } else {
          const key = nopicGetConfigStorageKey("nopic_disguise", scope);
          localStorage.removeItem(key);
        }
        invalidateDisguiseCache();
        renderDisguiseLists();
        applyDisguise();
      });
    });
  }

  // 应用标签伪装
  // 应用标签伪装（始终按优先级读取生效配置，与编辑面板无关）
  function applyDisguise() {
    const effective = getDisguiseConfig();
    if (!effective.enabled) {
      restoreNativeTitle();
      restoreNativeIcon();
      return;
    }

    if (effective.titleMode === "preset" && effective.presetTitle) {
      document.title = effective.presetTitle;
    } else if (effective.titleMode === "custom" && effective.customTitle) {
      document.title = effective.customTitle;
    } else {
      restoreNativeTitle();
    }

    if (
      effective.iconMode === "preset" &&
      effective.presetIcon &&
      presetIcons[effective.presetIcon]
    ) {
      setCustomFavicon(presetIcons[effective.presetIcon]);
    } else if (effective.iconMode === "custom" && effective.customIcon) {
      setCustomFavicon(effective.customIcon);
    } else {
      restoreNativeIcon();
    }
  }

  // 恢复原生标题
  function restoreNativeTitle() {
    document.title = originalTitle;
  }

  // 恢复原生图标
  function restoreNativeIcon() {
    // 移除自定义图标
    const customIcon = document.querySelector("link[data-nopic-custom='true']");
    if (customIcon) customIcon.remove();

    // 确保原生图标存在
    if (!document.querySelector("link[rel~='icon']")) {
      const nativeIcon = document.createElement("link");
      nativeIcon.rel = "icon";
      nativeIcon.href = originalFavicon || "/favicon.ico";
      document.head.appendChild(nativeIcon);
    }
  }

  // 设置自定义图标
  function setCustomFavicon(base64) {
    // 移除原生图标
    const nativeIcons = document.querySelectorAll("link[rel~='icon']");
    nativeIcons.forEach((icon) => icon.remove());

    // 添加自定义图标
    const customIcon = document.createElement("link");
    customIcon.rel = "icon";
    customIcon.href = base64;
    customIcon.setAttribute("data-nopic-custom", "true");
    document.head.appendChild(customIcon);
  }

  // 监听标题变化，保持伪装
  let titleObserver = null;
  let _isSettingTitle = false;
  function observeTitle() {
    if (titleObserver) titleObserver.disconnect();

    titleObserver = new MutationObserver(() => {
      // 自己设标题触发的回调，跳过，防止死循环
      if (_isSettingTitle) return;
      const effective = getDisguiseConfig();
      if (!effective.enabled) {
        originalTitle = document.title;
        return;
      }
      let target = null;
      if (effective.titleMode === "custom" && effective.customTitle)
        target = effective.customTitle;
      else if (effective.titleMode === "preset" && effective.presetTitle)
        target = effective.presetTitle;
      if (target !== null) {
        if (document.title !== target) {
          _isSettingTitle = true;
          document.title = target;
          setTimeout(() => {
            _isSettingTitle = false;
          }, 0);
        }
      } else {
        originalTitle = document.title;
      }
    });

    const titleElement = document.querySelector("title");
    if (titleElement) {
      titleObserver.observe(titleElement, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
  }

  // 用于控制文字替换监听器的生命周期
  let _trScrollHandler = null;
  let _trMutationObserver = null;
  let _trScrollTimer = null;

  function initTextReplace() {
    // 1. 先清理掉旧的监听（防止重复绑定）
    destroyTextReplaceListeners();

    // 2. 执行一次全量替换
    applyTextReplace();

    // 3. 绑定滚动监听
    _trScrollHandler = () => {
      clearTimeout(_trScrollTimer);
      _trScrollTimer = setTimeout(() => {
        applyTextReplaceIncremental();
      }, 200);
    };
    window.addEventListener("scroll", _trScrollHandler, { passive: true });

    // 4. 绑定 DOM 变化监听
    _trMutationObserver = new MutationObserver((mutations) => {
      let shouldReplace = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (
              node.id === "nopic-widget" ||
              node.id === "nopic-menu" ||
              node.id?.startsWith("nopic-") ||
              node.classList?.contains("nopic-textreplace-span") ||
              node.closest?.("#nopic-widget") ||
              node.closest?.("#nopic-menu") ||
              node.closest?.("[id^='nopic-']")
            ) {
              continue;
            }
            shouldReplace = true;
            break;
          }
        }
        if (shouldReplace) break;
      }
      if (shouldReplace) {
        clearTimeout(window._textReplaceTimer);
        window._textReplaceTimer = setTimeout(() => {
          applyTextReplaceIncremental();
        }, 500);
      }
    });

    if (document.body) {
      _trMutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  // 新增：专门用来销毁监听器的函数
  function destroyTextReplaceListeners() {
    if (_trScrollHandler) {
      window.removeEventListener("scroll", _trScrollHandler);
      _trScrollHandler = null;
    }
    if (_trScrollTimer) {
      clearTimeout(_trScrollTimer);
      _trScrollTimer = null;
    }
    if (_trMutationObserver) {
      _trMutationObserver.disconnect();
      _trMutationObserver = null;
    }
    if (window._textReplaceTimer) {
      clearTimeout(window._textReplaceTimer);
      delete window._textReplaceTimer;
    }
  }

  // 封装启动监听的逻辑，供初始化和开关切换时复用
  function startTextReplaceIfNeeded() {
    if (nopicGetToggleState("nopic_textreplace", true)) {
      initTextReplace();
    }
  }

  // 页面加载后初始化文字替换（受独立开关控制）
  setTimeout(startTextReplaceIfNeeded, 500);

  // 增量替换：只处理还没有被替换的文本节点
  // 增量替换：只处理视窗内还没有被替换的文本节点
  function applyTextReplaceIncremental() {
    const effectiveRules = getEffectiveTextReplaceRules();
    if (effectiveRules.length === 0) return;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false,
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent) continue;
      // 跳过已经在替换 span 里的文本节点
      if (
        parent.classList &&
        parent.classList.contains("nopic-textreplace-span")
      )
        continue;
      if (
        parent.tagName === "SCRIPT" ||
        parent.tagName === "STYLE" ||
        parent.tagName === "NOSCRIPT" ||
        parent.closest("#nopic-widget") ||
        parent.closest("#nopic-menu") ||
        parent.closest("#nopic-textreplace-submenu") ||
        parent.closest(".nopic-clone") ||
        parent.closest(".nopic-parade-clone")
      )
        continue;

      // 只收集视窗内的文本节点
      const rect = parent.getBoundingClientRect();
      if (
        rect.bottom >= 0 &&
        rect.top <= window.innerHeight &&
        rect.right >= 0 &&
        rect.left <= window.innerWidth
      ) {
        textNodes.push(node);
      }
    }

    textNodes.forEach((textNode) => {
      const originalText = textNode.textContent;
      let hasReplaced = false;
      let matchedRule = null;
      let matchIndex = -1;

      for (const rule of effectiveRules) {
        if (!rule.from) continue;
        const idx = rule.caseSensitive
          ? originalText.indexOf(rule.from)
          : originalText.toLowerCase().indexOf(rule.from.toLowerCase());
        if (idx !== -1) {
          matchedRule = rule;
          matchIndex = idx;
          hasReplaced = true;
          break;
        }
      }

      if (hasReplaced && matchedRule) {
        const beforeText = originalText.slice(0, matchIndex);
        const afterText = originalText.slice(
          matchIndex + matchedRule.from.length,
        );

        const fragment = document.createDocumentFragment();

        if (beforeText) {
          fragment.appendChild(document.createTextNode(beforeText));
        }

        const replaceSpan = document.createElement("span");
        replaceSpan.className = "nopic-textreplace-span fade-out";
        replaceSpan.textContent = matchedRule.to;
        fragment.appendChild(replaceSpan);

        if (afterText) {
          fragment.appendChild(document.createTextNode(afterText));
        }

        textNode.parentNode.replaceChild(fragment, textNode);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            replaceSpan.classList.remove("fade-out");
            replaceSpan.classList.add("fade-in");
          });
        });
      }
    });
  }

  // 初始化标签伪装
  function initDisguise() {
    originalTitle = document.title;
    originalFavicon = getOriginalFavicon();

    // 应用已保存的配置
    applyDisguise();
    observeTitle();

    // 监听head变化，防止图标被恢复
    // 监听head变化，防止图标被恢复（preset 和 custom 都保护）
    const headObserver = new MutationObserver(() => {
      const effective = getDisguiseConfig();
      if (!effective.enabled) return;
      let targetIcon = null;
      if (effective.iconMode === "custom" && effective.customIcon)
        targetIcon = effective.customIcon;
      else if (
        effective.iconMode === "preset" &&
        effective.presetIcon &&
        presetIcons[effective.presetIcon]
      )
        targetIcon = presetIcons[effective.presetIcon];
      if (targetIcon) {
        const cur = document.querySelector("link[data-nopic-custom='true']");
        if (!cur || cur.href !== targetIcon) setCustomFavicon(targetIcon);
      }
    });
    headObserver.observe(document.head, { childList: true });
  }

  // 页面加载后初始化
  setTimeout(initDisguise, 100);

  // ===== 页面局部遮罩功能实现 =====
  let maskDrawOverlay = null;
  let maskDrawBox = null;
  let isDrawingMask = false;
  let maskDrawStartX = 0;
  let maskDrawStartY = 0;
  let maskDrawCurrentColor = "#000000";
  let maskDrawCurrentOpacity = 100;
  let maskDrawCurrentPosition = "absolute";
  let maskLayers = []; // 存储所有遮罩层DOM元素

  // 生成唯一ID
  function generateMaskId() {
    return "mask_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  }

  // 创建遮罩层DOM
  function createMaskLayer(maskData) {
    const layer = document.createElement("div");
    layer.className = "nopic-mask-layer " + maskData.positionMode;
    layer.id = maskData.id;
    layer.style.left = maskData.x + "px";
    layer.style.width = maskData.width + "px";
    layer.style.height = maskData.height + "px";
    layer.style.background = maskData.color;
    layer.style.opacity = maskData.opacity / 100;
    layer.style.borderRadius =
      (maskData.radius != null ? maskData.radius : 8) + "px";
    void layer.offsetWidth;

    // fixed 模式：相对于视口定位
    // absolute 模式：相对于文档定位，top 值直接使用文档坐标
    if (maskData.positionMode === "fixed") {
      layer.style.top = maskData.y + "px";
    } else {
      // absolute 模式，top 值是文档坐标，不需要加 scrollY
      layer.style.top = maskData.y + "px";
    }

    document.body.appendChild(layer);
    maskLayers.push(layer);

    // 点击触发光效动画
    layer.addEventListener("click", () => {
      layer.style.animation = "none";
      void layer.offsetWidth;
      layer.style.animation = "nopic-mask-glow 1.2s ease-out forwards";
      layer.addEventListener(
        "animationend",
        () => {
          layer.style.animation = "none";
        },
        { once: true },
      );
    });

    // 双击进入编辑模式
    layer.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      enterEditMode(maskData.id);
    });

    return layer;
  }

  // 编辑模式
  let editingMaskId = null;
  let editDragStartX = 0;
  let editDragStartY = 0;
  let editMaskStartLeft = 0;
  let editMaskStartTop = 0;

  function enterEditMode(maskId) {
    const layer = document.getElementById(maskId);
    if (!layer) return;

    editingMaskId = maskId;
    layer.classList.add("editing");

    layer.addEventListener("mousedown", startEditDrag);
    document.addEventListener("mousemove", onEditDrag);
    document.addEventListener("mouseup", endEditDrag);
  }

  function exitEditMode() {
    if (!editingMaskId) return;
    const layer = document.getElementById(editingMaskId);
    if (layer) {
      layer.classList.remove("editing");
      layer.removeEventListener("mousedown", startEditDrag);
    }
    document.removeEventListener("mousemove", onEditDrag);
    document.removeEventListener("mouseup", endEditDrag);

    // 保存更新后的位置
    const maskData = maskConfig.masks.find((m) => m.id === editingMaskId);
    if (maskData && layer) {
      maskData.x = parseInt(layer.style.left);
      maskData.y = parseInt(layer.style.top);
      setMaskConfig(maskConfig);
      updateMaskList();
    }

    editingMaskId = null;
  }

  function startEditDrag(e) {
    if (!editingMaskId) return;
    const layer = document.getElementById(editingMaskId);
    if (!layer) return;

    editDragStartX = e.clientX;
    editDragStartY = e.clientY;
    editMaskStartLeft = parseInt(layer.style.left);
    editMaskStartTop = parseInt(layer.style.top);
    e.preventDefault();
  }

  function onEditDrag(e) {
    if (!editingMaskId) return;
    const layer = document.getElementById(editingMaskId);
    if (!layer) return;

    const dx = e.clientX - editDragStartX;
    const dy = e.clientY - editDragStartY;
    layer.style.left = editMaskStartLeft + dx + "px";
    layer.style.top = editMaskStartTop + dy + "px";
  }

  function endEditDrag(e) {
    // 保存位置
    const layer = document.getElementById(editingMaskId);
    if (layer) {
      const maskData = maskConfig.masks.find((m) => m.id === editingMaskId);
      if (maskData) {
        maskData.x = parseInt(layer.style.left);
        maskData.y = parseInt(layer.style.top);
        setMaskConfig(maskConfig);
        updateMaskList();
      }
    }
  }

  // 开始绘制遮罩
  function startMaskDraw() {
    if (isDrawingMask) return;
    isDrawingMask = true;

    // 隐藏遮罩设置窗口
    hideMaskSubmenu();

    // 获取当前设置
    maskDrawCurrentColor = document.getElementById("nopic-mask-color").value;
    maskDrawCurrentOpacity = parseInt(
      document.getElementById("nopic-mask-opacity").value,
    );
    const activePosBtn = document.querySelector(
      ".nopic-mask-position-btn.active",
    );
    maskDrawCurrentPosition = activePosBtn
      ? activePosBtn.dataset.position
      : "absolute";

    // 创建绘制层
    maskDrawOverlay = document.createElement("div");
    maskDrawOverlay.id = "nopic-mask-draw-overlay";
    document.body.appendChild(maskDrawOverlay);

    maskDrawBox = document.createElement("div");
    maskDrawBox.id = "nopic-mask-draw-box";
    maskDrawOverlay.appendChild(maskDrawBox);

    // 提示文字
    const tip = document.createElement("div");
    tip.style.cssText =
      "position:fixed;top:10px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:#fff;padding:8px 16px;border-radius:6px;font-size:12px;z-index:2147483640;";
    tip.textContent = "按住鼠标拖动绘制遮罩区域，松开完成绘制，按ESC取消";
    tip.id = "nopic-mask-draw-tip";
    document.body.appendChild(tip);

    maskDrawOverlay.addEventListener("mousedown", onMaskDrawMouseDown);
    document.addEventListener("keydown", onMaskDrawKeyDown);

    // 更新按钮状态
    const drawBtn = document.getElementById("nopic-mask-draw-btn");
    if (drawBtn) drawBtn.textContent = "取消绘制";
  }

  // 结束绘制遮罩
  function endMaskDraw() {
    if (!isDrawingMask) return;
    isDrawingMask = false;

    if (maskDrawOverlay) {
      maskDrawOverlay.remove();
      maskDrawOverlay = null;
    }
    if (maskDrawBox) {
      maskDrawBox = null;
    }
    const tip = document.getElementById("nopic-mask-draw-tip");
    if (tip) tip.remove();

    document.removeEventListener("keydown", onMaskDrawKeyDown);

    // 更新按钮状态
    const drawBtn = document.getElementById("nopic-mask-draw-btn");
    if (drawBtn) drawBtn.textContent = "开始绘制";

    // ===== 修复：绘制完成后自动重新打开遮罩设置弹窗 =====
    maskSubmenuOpen = true;
    maskSubmenu.style.display = "flex";
    // 关键：重新添加 active 类
    requestAnimationFrame(() => {
      maskSubmenu.classList.add("active");
      // 确保弹窗居中
      const rect = maskSubmenu.getBoundingClientRect();
      let left = (window.innerWidth - rect.width) / 2;
      let top = (window.innerHeight - rect.height) / 2;
      if (left < 10) left = 10;
      if (top < 10) top = 10;
      maskSubmenu.style.left = left + "px";
      maskSubmenu.style.top = top + "px";
    });
  }

  function onMaskDrawMouseDown(e) {
    maskDrawStartX = e.clientX;
    maskDrawStartY = e.clientY;

    maskDrawBox.style.left = maskDrawStartX + "px";
    maskDrawBox.style.top = maskDrawStartY + "px";
    maskDrawBox.style.width = "0px";
    maskDrawBox.style.height = "0px";

    maskDrawOverlay.addEventListener("mousemove", onMaskDrawMouseMove);
    maskDrawOverlay.addEventListener("mouseup", onMaskDrawMouseUp);
  }

  function onMaskDrawMouseMove(e) {
    const currentX = e.clientX;
    const currentY = e.clientY;

    const width = Math.abs(currentX - maskDrawStartX);
    const height = Math.abs(currentY - maskDrawStartY);
    const left = Math.min(currentX, maskDrawStartX);
    const top = Math.min(currentY, maskDrawStartY);

    maskDrawBox.style.left = left + "px";
    maskDrawBox.style.top = top + "px";
    maskDrawBox.style.width = width + "px";
    maskDrawBox.style.height = height + "px";
  }

  function onMaskDrawMouseUp(e) {
    maskDrawOverlay.removeEventListener("mousemove", onMaskDrawMouseMove);
    maskDrawOverlay.removeEventListener("mouseup", onMaskDrawMouseUp);

    const width = Math.abs(e.clientX - maskDrawStartX);
    const height = Math.abs(e.clientY - maskDrawStartY);

    if (width < 10 || height < 10) {
      // 区域太小，不创建
      endMaskDraw();
      return;
    }

    const left = Math.min(e.clientX, maskDrawStartX);
    const top = Math.min(e.clientY, maskDrawStartY);

    // 根据位置模式计算坐标
    // fixed 模式：使用视口坐标
    // absolute 模式：使用文档坐标（视口坐标 + 滚动偏移）
    let finalX = left;
    let finalY = top;
    if (maskDrawCurrentPosition === "absolute") {
      finalX = left + window.scrollX;
      finalY = top + window.scrollY;
    }

    // 创建遮罩数据
    const maskData = {
      id: generateMaskId(),
      x: finalX,
      y: finalY,
      width: width,
      height: height,
      color: maskDrawCurrentColor,
      opacity: maskDrawCurrentOpacity,
      positionMode: maskDrawCurrentPosition,
      radius: parseInt(document.getElementById("nopic-mask-radius").value) || 0,
    };

    maskConfig.masks.push(maskData);
    setMaskConfig(maskConfig);

    // 创建遮罩层
    createMaskLayer(maskData);
    updateMaskList();

    endMaskDraw();
    // 绘制完成后自动显示遮罩设置窗口
    maskSubmenuOpen = true;
    maskSubmenu.style.display = "flex";
  }

  function onMaskDrawKeyDown(e) {
    if (e.key === "Escape") {
      endMaskDraw();
    }
  }

  // 清除所有遮罩
  function clearAllMasks() {
    // 只清除当前选中层级的遮罩数据
    const scope = nopicGetConfigScope("nopic_mask");
    if (scope === "global") {
      GM_setValue("nopic_mask_global", { masks: [] });
    } else {
      const key = nopicGetConfigStorageKey("nopic_mask", scope);
      localStorage.setItem(key, JSON.stringify({ masks: [] }));
    }
    maskConfig.masks = [];
    updateMaskList();
    // 重新加载页面上的遮罩（保留其他层级的）
    loadSavedMasks();
  }

  // 删除单个遮罩
  function deleteMask(maskId) {
    const layer = document.getElementById(maskId);
    if (layer && layer.parentNode) {
      layer.remove();
    }
    maskLayers = maskLayers.filter((l) => l.id !== maskId);
    maskConfig.masks = maskConfig.masks.filter((m) => m.id !== maskId);
    setMaskConfig(maskConfig);
    updateMaskList();
  }

  // 更新遮罩列表UI
  // 获取指定scope的遮罩配置
  function getMaskConfigByScope(scope) {
    try {
      if (scope === "global") {
        // 全局级别使用 GM_getValue 跨域共享
        const saved = GM_getValue("nopic_mask_global", null);
        if (saved) {
          return typeof saved === "string" ? JSON.parse(saved) : { ...saved };
        }
      } else {
        const key = nopicGetConfigStorageKey("nopic_mask", scope);
        const saved = localStorage.getItem(key);
        if (saved) {
          return JSON.parse(saved);
        }
      }
    } catch (e) {}
    return { masks: [] };
  }

  function updateMaskList() {
    const listSection = document.getElementById("nopic-mask-list-section");
    const listUrl = document.getElementById("nopic-mask-list-url");
    const listDomain = document.getElementById("nopic-mask-list-domain");
    const listGlobal = document.getElementById("nopic-mask-list-global");

    if (!listSection || !listUrl || !listDomain || !listGlobal) return;

    // 分别获取三个scope的遮罩配置
    const urlMasks = getMaskConfigByScope("url").masks || [];
    const domainMasks = getMaskConfigByScope("domain").masks || [];
    const globalMasks = getMaskConfigByScope("global").masks || [];

    const totalCount =
      urlMasks.length + domainMasks.length + globalMasks.length;
    listSection.style.display = totalCount > 0 ? "block" : "none";

    // 渲染单个列表
    function renderList(container, masks, scope) {
      container.innerHTML = "";
      masks.forEach((mask) => {
        const item = document.createElement("div");
        item.className = "nopic-mask-item";
        item.innerHTML = `
          <div class="nopic-mask-item-color" style="background:${mask.color};opacity:${
            mask.opacity / 100
          }"></div>
          <div class="nopic-mask-item-info">${mask.width}×${mask.height}</div>
          <div class="nopic-mask-item-delete" data-id="${mask.id}" data-scope="${scope}">×</div>
        `;
        container.appendChild(item);

        // 点击删除
        item
          .querySelector(".nopic-mask-item-delete")
          .addEventListener("click", (e) => {
            e.stopPropagation();
            deleteMaskByScope(mask.id, scope);
          });

        // 双击编辑
        item.addEventListener("dblclick", () => {
          enterEditModeByScope(mask.id, scope);
        });
        // 单击定位并高亮
        item.addEventListener("click", (e) => {
          // 排除点击删除按钮的情况
          if (e.target.classList.contains("nopic-mask-item-delete")) return;

          const layer = document.getElementById(mask.id);
          if (!layer) return;

          // 平滑滚动到遮罩所在位置（absolute模式会自动计算文档流位置，fixed模式不受影响）
          layer.scrollIntoView({ behavior: "smooth", block: "center" });

          // 添加高亮动画
          layer.classList.remove("nopic-mask-highlight");
          void layer.offsetWidth; // 强制重排，重置动画
          layer.classList.add("nopic-mask-highlight");

          // 2秒后自动移除高亮
          if (layer._highlightTimer) clearTimeout(layer._highlightTimer);
          layer._highlightTimer = setTimeout(() => {
            layer.classList.remove("nopic-mask-highlight");
          }, 2000);
        });
      });
    }

    renderList(listUrl, urlMasks, "url");
    renderList(listDomain, domainMasks, "domain");
    renderList(listGlobal, globalMasks, "global");
  }

  // 按scope删除遮罩
  function deleteMaskByScope(maskId, scope) {
    const config = getMaskConfigByScope(scope);
    config.masks = config.masks.filter((m) => m.id !== maskId);
    if (scope === "global") {
      // 全局级别使用 GM_setValue 跨域共享
      GM_setValue("nopic_mask_global", config);
    } else {
      const key = nopicGetConfigStorageKey("nopic_mask", scope);
      localStorage.setItem(key, JSON.stringify(config));
    }
    // 如果删除的是当前生效的配置，更新maskConfig
    if (scope === currentMaskScope) {
      maskConfig.masks = config.masks;
    }
    updateMaskList();
    // 重新加载遮罩层
    loadSavedMasks();
  }

  // 按scope进入编辑模式
  function enterEditModeByScope(maskId, scope) {
    const config = getMaskConfigByScope(scope);
    const maskData = config.masks.find((m) => m.id === maskId);
    if (!maskData) return;

    // 临时切换到对应scope进行编辑
    const originalScope = nopicGetConfigScope("nopic_mask");
    nopicSetConfigScope("nopic_mask", scope);

    enterEditMode(maskId);

    // 编辑完成后恢复scope
    nopicSetConfigScope("nopic_mask", originalScope);
  }

  // 加载已保存的遮罩
  // 加载已保存的遮罩
  function loadSavedMasks() {
    // 先清除现有遮罩层
    maskLayers.forEach((layer) => {
      if (layer && layer.parentNode) {
        layer.remove();
      }
    });
    maskLayers = [];

    // 只要总开关开启，就同时加载 url、domain、global 三个级别的所有遮罩
    if (maskConfig.enabled) {
      ["url", "domain", "global"].forEach((scope) => {
        const config = getMaskConfigByScope(scope);
        if (config && config.masks) {
          config.masks.forEach((maskData) => {
            createMaskLayer(maskData);
          });
        }
      });
    }
    updateMaskList();
  }

  // 遮罩开关事件
  // 阅兵模式开关
  document
    .getElementById("nopic-parade-toggle")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      paradeConfig.enabled = !paradeConfig.enabled;
      setParadeConfig(paradeConfig);
      updateAllUI();
    });

  // 局部遮罩开关（开关状态独立存储在URL级别）
  document
    .getElementById("nopic-mask-toggle")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      maskConfig.enabled = !maskConfig.enabled;
      nopicSetToggleState("nopic_mask", maskConfig.enabled);
      updateAllUI();

      if (maskConfig.enabled) {
        loadSavedMasks();
      } else {
        // 关闭时移除所有遮罩层（但保留数据）
        maskLayers.forEach((layer) => {
          if (layer && layer.parentNode) {
            layer.remove();
          }
        });
        maskLayers = [];
      }
    });

  // 透明度滑块事件
  document
    .getElementById("nopic-mask-opacity")
    .addEventListener("input", (e) => {
      const val = e.target.value;
      document.getElementById("nopic-mask-opacity-val").textContent = val + "%";
      maskDrawCurrentOpacity = parseInt(val);
    });
  // 圆角滑块事件
  document
    .getElementById("nopic-mask-radius")
    .addEventListener("input", (e) => {
      const val = e.target.value;
      document.getElementById("nopic-mask-radius-val").textContent = val + "px";
    });

  // 阻止新增的滑块冒泡
  document
    .getElementById("nopic-mask-radius")
    .addEventListener("mousedown", (e) => e.stopPropagation());
  // 阻止颜色选择器和滑块的冒泡
  document
    .getElementById("nopic-mask-color")
    .addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });
  document
    .getElementById("nopic-mask-opacity")
    .addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });

  // 位置模式切换
  document.querySelectorAll(".nopic-mask-position-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      document
        .querySelectorAll(".nopic-mask-position-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      maskDrawCurrentPosition = btn.dataset.position;
    });
  });

  // 开始绘制按钮
  document
    .getElementById("nopic-mask-draw-btn")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      if (isDrawingMask) {
        endMaskDraw();
      } else {
        startMaskDraw();
      }
    });

  // 清除全部按钮
  document
    .getElementById("nopic-mask-clear-btn")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      clearAllMasks();
    });

  // 场景切换事件（开关状态独立存储，不受场景切换影响）
  maskSubmenu.querySelectorAll("[data-scope]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const newScope = btn.dataset.scope;
      nopicSetConfigScope("nopic_mask", newScope);
      currentMaskScope = newScope;

      const config = getMaskConfigByScope(newScope);
      maskConfig.masks = JSON.parse(JSON.stringify(config.masks || []));

      updateAllUI();
    });
  });

  // 初始化遮罩
  setTimeout(loadSavedMasks, 100);

  // ===== 输入法输入状态跟踪 =====
  let isComposing = false;
  document.addEventListener("compositionstart", () => {
    isComposing = true;
  });
  document.addEventListener("compositionend", () => {
    isComposing = false;
  });

  // ===== 通用弹窗显示和拖动功能 =====
  // ===== 通用弹窗显示和拖动功能 =====
  function showPopupAtTrigger(popup, trigger) {
    popup.style.display = "flex";
    // ★★★ 关键：强制重排，让浏览器先计算布局 ★★★
    void popup.offsetHeight;

    // ★★★ 用 requestAnimationFrame 等待一帧，确保内容完全渲染 ★★★
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        popup.classList.add("active");

        const popupRect = popup.getBoundingClientRect();
        let left = (window.innerWidth - popupRect.width) / 2;
        let top = (window.innerHeight - popupRect.height) / 2;
        if (left < 10) left = 10;
        if (top < 10) top = 10;
        if (left + popupRect.width > window.innerWidth - 10) {
          left = window.innerWidth - popupRect.width - 10;
        }
        if (top + popupRect.height > window.innerHeight - 10) {
          top = window.innerHeight - popupRect.height - 10;
        }
        popup.style.left = left + "px";
        popup.style.top = top + "px";
        popup.style.transform = "none";
      });
    });
  }

  // 拖动功能
  function makeDraggable(popup) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    popup.addEventListener("mousedown", (e) => {
      // 只在标题栏或空白区域开始拖动
      const target = e.target;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "BUTTON" ||
        target.classList.contains("nopic-radio-row") ||
        target.classList.contains("nopic-privacy-select-btn") ||
        target.classList.contains("nopic-textreplace-rule-item") ||
        target.classList.contains("nopic-forcecopy-option") ||
        target.classList.contains("nopic-modal-close")
      ) {
        return;
      }
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = popup.offsetLeft;
      startTop = popup.offsetTop;
      popup.style.cursor = "move";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let newLeft = startLeft + dx;
      let newTop = startTop + dy;

      // 边界检查
      // if (newLeft < 0) newLeft = 0;
      // if (newTop < 0) newTop = 0;
      // if (newLeft + popup.offsetWidth > window.innerWidth) {
      //   newLeft = window.innerWidth - popup.offsetWidth;
      // }
      // if (newTop + popup.offsetHeight > window.innerHeight) {
      //   newTop = window.innerHeight - popup.offsetHeight;
      // }

      popup.style.left = newLeft + "px";
      popup.style.top = newTop + "px";
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        popup.style.cursor = "move";
      }
    });
  }

  // 二级弹窗状态变量（提前声明以便在菜单mouseleave事件中使用）
  let tabDisguiseSubmenuOpen = false;
  let maskSubmenuOpen = false;
  let privacyLockSubmenuOpen = false;
  let textReplaceSubmenuOpen = false;
  let autoClickerSubmenuOpen = false;
  let pageEditSubmenuOpen = false;
  let forceCopySubmenuOpen = false;
  // ↓↓↓ 缺失的函数定义，加上后所有弹窗关闭逻辑才能正常工作 ↓↓↓
  function hideForceCopySubmenu() {
    forceCopySubmenuOpen = false;
  }

  // 为所有弹窗添加拖动功能
  makeDraggable(tabDisguiseSubmenu);
  makeDraggable(maskSubmenu);
  makeDraggable(privacyLockSubmenu);
  makeDraggable(textReplaceSubmenu);
  makeDraggable(autoClickerSubmenu);
  makeDraggable(pageEditSubmenu);
  makeDraggable(quickTextSubmenu);

  const pageMonitorTrigger = menu.querySelector('[data-submenu="pagemonitor"]');

  if (pageMonitorTrigger) {
    pageMonitorTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (pageMonitorSubmenuOpen) {
        hidePageMonitorSubmenu();
      } else {
        showPageMonitorSubmenu();
        hideAllSubmenus("pagemonitor");
      }
    });
  }

  // ===== 标签伪装子菜单事件（弹窗方式） =====
  const tabDisguiseTrigger = menu.querySelector('[data-submenu="tabdisguise"]');

  const showTabDisguiseSubmenu = () => {
    tabDisguiseSubmenuOpen = true;
    showPopupAtTrigger(tabDisguiseSubmenu, tabDisguiseTrigger);
  };

  const hideTabDisguiseSubmenu = () => {
    tabDisguiseSubmenuOpen = false;
    tabDisguiseSubmenu.style.transform = "scale(0.92) translateY(-10px)";
    tabDisguiseSubmenu.style.opacity = "0";
    tabDisguiseSubmenu.classList.remove("active");
    setTimeout(() => {
      tabDisguiseSubmenu.style.display = "none";
      tabDisguiseSubmenu.style.transform = "";
      tabDisguiseSubmenu.style.opacity = "";
    }, 250);
  };

  if (tabDisguiseTrigger) {
    tabDisguiseTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (tabDisguiseSubmenuOpen) {
        hideTabDisguiseSubmenu();
      } else {
        showTabDisguiseSubmenu();
        hideAllSubmenus("tabdisguise");
      }
    });
  }

  // 返回列表按钮
  const disguiseBackBtn = document.getElementById("nopic-disguise-back-btn");
  if (disguiseBackBtn) {
    disguiseBackBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("nopic-disguise-list-view").style.display =
        "flex";
      document.getElementById("nopic-disguise-edit-view").style.display =
        "none";
      renderDisguiseLists();
      applyDisguise();
    });
  }

  // 关闭按钮事件
  const tabDisguiseCloseBtn = document.getElementById(
    "nopic-tabdisguise-close",
  );
  if (tabDisguiseCloseBtn) {
    tabDisguiseCloseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hideTabDisguiseSubmenu();
    });
  }

  // ===== 遮罩子菜单事件（弹窗方式） =====
  const maskTrigger = menu.querySelector('[data-submenu="mask"]');

  const showMaskSubmenu = () => {
    maskSubmenuOpen = true;
    showPopupAtTrigger(maskSubmenu, maskTrigger);
  };

  const hideMaskSubmenu = () => {
    maskSubmenuOpen = false;
    maskSubmenu.style.transform = "scale(0.92) translateY(-10px)";
    maskSubmenu.style.opacity = "0";
    maskSubmenu.classList.remove("active");
    setTimeout(() => {
      maskSubmenu.style.display = "none";
      maskSubmenu.style.transform = "";
      maskSubmenu.style.opacity = "";
    }, 250);
  };

  if (maskTrigger) {
    maskTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (maskSubmenuOpen) {
        hideMaskSubmenu();
      } else {
        showMaskSubmenu();
        hideAllSubmenus("mask");
      }
    });
  }

  // 关闭按钮事件
  const maskCloseBtn = document.getElementById("nopic-mask-close");
  if (maskCloseBtn) {
    maskCloseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hideMaskSubmenu();
    });
  }

  // ===== 隐私锁子菜单事件（弹窗方式） =====
  const privacyLockTrigger = menu.querySelector('[data-submenu="privacylock"]');

  function showPrivacyLockSubmenu() {
    privacyLockSubmenuOpen = true;
    showPopupAtTrigger(privacyLockSubmenu, privacyLockTrigger);

    // 恢复忘记密码跳过开关状态
    var skipToggle = document.getElementById("nopic-privacy-skip-toggle");
    if (skipToggle) {
      var saved = GM_getValue("nopic_skip_toggle_global", null);
      if (saved === "false") {
        skipToggle.classList.remove("on");
      } else {
        skipToggle.classList.add("on");
      }
    }

    // ===== 自动加载锁屏外观配置到UI =====
    const appConfig = getLockAppearanceConfig();
    const bgColorInput = document.getElementById("nopic-lock-bg-color");
    const textColorInput = document.getElementById("nopic-lock-text-color");
    const timeFormatInput = document.getElementById("nopic-lock-time-format");
    const customTextInput = document.getElementById("nopic-lock-custom-text");

    if (bgColorInput) bgColorInput.value = appConfig.bgColor || "#1a1a2e";
    if (textColorInput) textColorInput.value = appConfig.textColor || "#ffffff";
    if (timeFormatInput)
      timeFormatInput.value = appConfig.timeFormat || "{时}:{分}";
    if (customTextInput) customTextInput.value = appConfig.customText || "";

    // 打开面板时刷新UI，确保显示与当前锁定状态一致
    updateAllUI();
  }

  const hidePrivacyLockSubmenu = () => {
    privacyLockSubmenuOpen = false;
    privacyLockSubmenu.style.transform = "scale(0.92) translateY(-10px)";
    privacyLockSubmenu.style.opacity = "0";
    privacyLockSubmenu.classList.remove("active");
    setTimeout(() => {
      privacyLockSubmenu.style.display = "none";
      privacyLockSubmenu.style.transform = "";
      privacyLockSubmenu.style.opacity = "";
    }, 250);
  };

  if (privacyLockTrigger) {
    privacyLockTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (privacyLockSubmenuOpen) {
        hidePrivacyLockSubmenu();
      } else {
        showPrivacyLockSubmenu();
        hideAllSubmenus("privacylock");
      }
    });
  }

  // 关闭按钮事件
  const privacyLockCloseBtn = document.getElementById(
    "nopic-privacylock-close",
  );
  if (privacyLockCloseBtn) {
    privacyLockCloseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hidePrivacyLockSubmenu();
    });
  }

  // ===== 替换文字子菜单（弹窗方式） =====
  const textReplaceTrigger = document.getElementById(
    "nopic-textreplace-menu-entry",
  );

  const showTextReplaceSubmenu = () => {
    textReplaceSubmenuOpen = true;
    showPopupAtTrigger(textReplaceSubmenu, textReplaceTrigger);
  };

  const hideTextReplaceSubmenu = () => {
    textReplaceSubmenuOpen = false;
    textReplaceSubmenu.style.transform = "scale(0.92) translateY(-10px)";
    textReplaceSubmenu.style.opacity = "0";
    textReplaceSubmenu.classList.remove("active");
    setTimeout(() => {
      textReplaceSubmenu.style.display = "none";
      textReplaceSubmenu.style.transform = "";
      textReplaceSubmenu.style.opacity = "";
    }, 250);
  };

  if (textReplaceTrigger) {
    textReplaceTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (textReplaceSubmenuOpen) {
        hideTextReplaceSubmenu();
      } else {
        showTextReplaceSubmenu();
        hideAllSubmenus("textreplace");
      }
    });
  }

  // 关闭按钮事件
  const textReplaceCloseBtn = document.getElementById(
    "nopic-textreplace-close",
  );
  if (textReplaceCloseBtn) {
    textReplaceCloseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hideTextReplaceSubmenu();
    });
  }

  // ===== 自动点击器子菜单（弹窗方式） =====
  const autoClickerTrigger = document.getElementById(
    "nopic-autoclicker-menu-entry",
  );

  const showAutoClickerSubmenu = () => {
    autoClickerSubmenuOpen = true;
    showPopupAtTrigger(autoClickerSubmenu, autoClickerTrigger);
    updateAutoClickerFlowList();
    // 阻止点击事件冒泡到页面，防止关闭网站菜单
    autoClickerSubmenu.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  };

  const hideAutoClickerSubmenu = () => {
    autoClickerSubmenuOpen = false;
    autoClickerSubmenu.style.transform = "scale(0.92) translateY(-10px)";
    autoClickerSubmenu.style.opacity = "0";
    autoClickerSubmenu.classList.remove("active");
    setTimeout(() => {
      autoClickerSubmenu.style.display = "none";
      autoClickerSubmenu.style.transform = "";
      autoClickerSubmenu.style.opacity = "";
    }, 250);
  };

  if (autoClickerTrigger) {
    autoClickerTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (autoClickerSubmenuOpen) {
        hideAutoClickerSubmenu();
      } else {
        showAutoClickerSubmenu();
        hideAllSubmenus("autoclicker");
      }
    });
  }

  const autoClickerCloseBtn = document.getElementById(
    "nopic-autoclicker-close",
  );
  if (autoClickerCloseBtn) {
    autoClickerCloseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hideAutoClickerSubmenu();
    });
  }

  // ===== 页面可编辑子菜单（弹窗方式） =====
  const pageEditTrigger = document.getElementById("nopic-pageedit-menu-entry");

  const showPageEditSubmenu = () => {
    pageEditSubmenuOpen = true;
    showPopupAtTrigger(pageEditSubmenu, pageEditTrigger);
  };

  const hidePageEditSubmenu = () => {
    pageEditSubmenuOpen = false;
    pageEditSubmenu.style.transform = "scale(0.92) translateY(-10px)";
    pageEditSubmenu.style.opacity = "0";
    pageEditSubmenu.classList.remove("active");
    setTimeout(() => {
      pageEditSubmenu.style.display = "none";
      pageEditSubmenu.style.transform = "";
      pageEditSubmenu.style.opacity = "";
    }, 250);
  };

  if (pageEditTrigger) {
    pageEditTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (pageEditSubmenuOpen) {
        hidePageEditSubmenu();
      } else {
        showPageEditSubmenu();
        hideAllSubmenus("pageedit");
      }
    });
  }

  const pageEditCloseBtn = document.getElementById("nopic-pageedit-close");
  if (pageEditCloseBtn) {
    pageEditCloseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hidePageEditSubmenu();
    });
  }

  // ===== 统一隐藏所有弹窗 =====
  function hideAllSubmenus(except) {
    if (except !== "settings") hideSettingsSubmenu();
    if (except !== "disguise") hideDisguiseSubmenu();
    if (except !== "tabdisguise") hideTabDisguiseSubmenu();
    if (except !== "mask") hideMaskSubmenu();
    if (except !== "privacylock") hidePrivacyLockSubmenu();
    if (except !== "textreplace") hideTextReplaceSubmenu();
    if (except !== "autoclicker") hideAutoClickerSubmenu();
    if (except !== "pageedit") hidePageEditSubmenu();
    if (except !== "pagemonitor") hidePageMonitorSubmenu();
    if (except !== "forcecopy") hideForceCopySubmenu();
    if (except !== "quicktext") hideQuickTextSubmenu();
    if (except !== "datacollect") hideDCSubmenu();
  }

  // ===== 快捷文本功能逻辑 =====
  let quickTextSubmenuOpen = false;

  const showQuickTextSubmenu = () => {
    quickTextSubmenuOpen = true;
    showPopupAtTrigger(
      quickTextSubmenu,
      document.getElementById("nopic-quicktext-menu-entry"),
    );
    renderQuickTextLists();
  };
  const hideQuickTextSubmenu = () => {
    quickTextSubmenuOpen = false;
    quickTextSubmenu.style.transform = "scale(0.92) translateY(-10px)";
    quickTextSubmenu.style.opacity = "0";
    quickTextSubmenu.classList.remove("active");
    isRecordingShortcut = false;
    setTimeout(() => {
      quickTextSubmenu.style.display = "none";
      quickTextSubmenu.style.transform = "";
      quickTextSubmenu.style.opacity = "";
    }, 250);
  };

  document
    .getElementById("nopic-quicktext-close")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      hideQuickTextSubmenu();
    });

  document
    .getElementById("nopic-quicktext-menu-entry")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      if (quickTextSubmenuOpen) hideQuickTextSubmenu();
      else {
        hideSettingsSubmenu();
        hideDisguiseSubmenu();
        hideTabDisguiseSubmenu();
        hideMaskSubmenu();
        hidePrivacyLockSubmenu();
        hideTextReplaceSubmenu();
        hideAutoClickerSubmenu();
        hidePageEditSubmenu();
        hideForceCopySubmenu();
        hideDCSubmenu();
        showQuickTextSubmenu();
      }
    });

  document
    .getElementById("nopic-quicktext-toggle")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      quickTextEnabled = !quickTextEnabled;
      nopicSetToggleState("nopic_quicktext", quickTextEnabled);
      updateAllUI();
    });

  // 清除按钮事件（仅清除对应scope的数据，不影响其他scope）
  quickTextSubmenu.querySelectorAll("[data-qt-clear]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const scope = btn.dataset.qtClear;
      if (scope === "global") {
        GM_setValue("nopic_quicktext_global", { items: [] });
      } else {
        const key =
          scope === "domain"
            ? "nopic_quicktext_domain_" + location.host
            : "nopic_quicktext_" + encodeURIComponent(nopicGetUrlKey());
        localStorage.setItem(key, JSON.stringify({ items: [] }));
      }
      renderQuickTextLists();
    });
  });

  function renderQuickTextLists() {
    ["url", "domain", "global"].forEach((scope) => {
      const listEl = document.getElementById(`nopic-qt-list-${scope}`);
      const config = getQuickTextConfigByScope(scope);
      listEl.innerHTML = "";

      config.items.forEach((item, idx) => {
        const div = document.createElement("div");
        div.className = "nopic-mask-item";
        div.style.flexDirection = "column";
        div.style.alignItems = "stretch";
        div.style.gap = "4px";
        div.style.cursor = "pointer"; // 增加手型光标提示可点击
        div.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="nopic-qt-display-text" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;" title="点击编辑: ${item.text}">${item.text}</span>
            <div class="nopic-mask-item-delete" data-qt-del="${scope}-${idx}" style="flex-shrink:0;">×</div>
          </div>
          <div class="nopic-qt-display-shortcut" style="font-size:9px;color:#60a5fa;background:rgba(96,165,250,0.15);padding:1px 4px;border-radius:2px;text-align:center;font-family:monospace;" title="点击重新录制">${item.shortcut}</div>
        `;
        listEl.appendChild(div);

        // 点击文本进入编辑模式
        const textSpan = div.querySelector(".nopic-qt-display-text");
        const shortcutDiv = div.querySelector(".nopic-qt-display-shortcut");

        textSpan.addEventListener("click", (e) => {
          e.stopPropagation();
          if (div.querySelector(".nopic-qt-edit-row")) return; // 已在编辑状态
          enterEditMode(div, scope, idx, config.items[idx]);
        });

        // 点击快捷键进入重新录制模式
        shortcutDiv.addEventListener("click", (e) => {
          e.stopPropagation();
          if (div.querySelector(".nopic-qt-edit-row")) return;
          enterEditMode(div, scope, idx, config.items[idx], true); // true 表示聚焦录制框
        });
      });

      // 绑定删除事件
      listEl.querySelectorAll("[data-qt-del]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const [s, i] = btn.dataset.qtDel.split("-");
          const cfg = getQuickTextConfigByScope(s);
          cfg.items.splice(parseInt(i), 1);
          setQuickTextConfigByScope(s, cfg);
          renderQuickTextLists();
        });
      });
    });
  }

  // 抽离出的行内编辑逻辑
  function enterEditMode(
    containerDiv,
    scope,
    idx,
    itemData,
    focusRecord = false,
  ) {
    const editRow = document.createElement("div");
    editRow.className = "nopic-qt-edit-row";
    editRow.style.cssText =
      "display:flex;flex-direction:column;gap:4px;padding:6px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.3);border-radius:4px;margin-top:4px;";
    editRow.innerHTML = `
      <input type="text" class="nopic-textreplace-input nopic-qt-edit-text" value="${itemData.text.replace(
        /"/g,
        "&quot;",
      )}" style="font-size:11px;">
      <div style="display:flex;gap:4px;">
        <input type="text" class="nopic-textreplace-input nopic-qt-shortcut-input" value="${
          itemData.shortcut
        }" placeholder="点击右侧录制" style="flex:1;font-size:10px;cursor:default;font-family:monospace;" readonly>
        <button class="nopic-qt-record-btn" style="padding:2px 8px;background:rgba(239,68,68,0.3);border:1px solid rgba(239,68,68,0.5);border-radius:3px;color:#f87171;font-size:10px;cursor:pointer;white-space:nowrap;">录制键/鼠</button>
      </div>
      <div style="display:flex;gap:4px;justify-content:flex-end;">
        <button class="nopic-qt-cancel-btn" style="padding:2px 8px;background:rgba(255,255,255,0.1);border-radius:3px;color:#fff;font-size:10px;cursor:pointer;">取消</button>
        <button class="nopic-qt-save-btn" style="padding:2px 8px;background:rgba(96,165,250,0.3);border:1px solid rgba(96,165,250,0.5);border-radius:3px;color:#60a5fa;font-size:10px;cursor:pointer;">保存</button>
      </div>
    `;

    // 隐藏原本的显示内容
    containerDiv.querySelector(".nopic-qt-display-text").style.display = "none";
    containerDiv.querySelector(".nopic-qt-display-shortcut").style.display =
      "none";
    containerDiv.appendChild(editRow);

    const textInput = editRow.querySelector(".nopic-qt-edit-text");
    const shortcutInput = editRow.querySelector(".nopic-qt-shortcut-input");
    const recordBtn = editRow.querySelector(".nopic-qt-record-btn");
    const saveBtn = editRow.querySelector(".nopic-qt-save-btn");
    const cancelBtn = editRow.querySelector(".nopic-qt-cancel-btn");

    // 阻止输入框事件冒泡
    textInput.addEventListener("mousedown", (e) => e.stopPropagation());
    textInput.addEventListener("click", (e) => e.stopPropagation());
    shortcutInput.addEventListener("mousedown", (e) => e.stopPropagation());

    // 录制逻辑
    recordBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      isRecordingShortcut = true;
      recordingTarget = shortcutInput;
      recordBtn.textContent = "等待操作...";
      recordBtn.style.background = "rgba(251,191,36,0.3)";
      recordBtn.style.borderColor = "rgba(251,191,36,0.5)";
      recordBtn.style.color = "#fbbf24";
    });

    cancelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      editRow.remove();
      containerDiv.querySelector(".nopic-qt-display-text").style.display = "";
      containerDiv.querySelector(".nopic-qt-display-shortcut").style.display =
        "";
    });

    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const newText = textInput.value.trim();
      const newShortcut = shortcutInput.value.trim();
      if (!newText || !newShortcut) return;

      const cfg = getQuickTextConfigByScope(scope);
      cfg.items[idx] = {
        ...cfg.items[idx],
        text: newText,
        shortcut: newShortcut,
      };
      setQuickTextConfigByScope(scope, cfg);
      renderQuickTextLists();
    });

    // 根据参数决定聚焦哪个输入框
    if (focusRecord) {
      recordBtn.click();
    } else {
      textInput.focus();
      textInput.select();
    }
  }

  // 添加按钮与录制逻辑
  quickTextSubmenu.querySelectorAll("[data-qt-add]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const scope = btn.dataset.qtAdd;
      const listEl = document.getElementById(`nopic-qt-list-${scope}`);
      if (listEl.querySelector(".nopic-qt-edit-row")) return; // 防止重复添加

      const editRow = document.createElement("div");
      editRow.className = "nopic-qt-edit-row";
      editRow.style.cssText =
        "display:flex;flex-direction:column;gap:4px;padding:6px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.3);border-radius:4px;margin-top:4px;";
      editRow.innerHTML = `
        <input type="text" class="nopic-textreplace-input" placeholder="输入预设文本" style="font-size:11px;">
        <div style="display:flex;gap:4px;">
          <input type="text" class="nopic-textreplace-input nopic-qt-shortcut-input" placeholder="点击右侧录制" style="flex:1;font-size:10px;cursor:default;font-family:monospace;" readonly>
          <button class="nopic-qt-record-btn" style="padding:2px 8px;background:rgba(239,68,68,0.3);border:1px solid rgba(239,68,68,0.5);border-radius:3px;color:#f87171;font-size:10px;cursor:pointer;white-space:nowrap;">录制键/鼠</button>
        </div>
        <div style="display:flex;gap:4px;justify-content:flex-end;">
          <button class="nopic-qt-cancel-btn" style="padding:2px 8px;background:rgba(255,255,255,0.1);border-radius:3px;color:#fff;font-size:10px;cursor:pointer;">取消</button>
          <button class="nopic-qt-save-btn" style="padding:2px 8px;background:rgba(96,165,250,0.3);border:1px solid rgba(96,165,250,0.5);border-radius:3px;color:#60a5fa;font-size:10px;cursor:pointer;">保存</button>
        </div>
      `;
      listEl.appendChild(editRow);

      const textInput = editRow.querySelector(
        "input[type='text']:not(.nopic-qt-shortcut-input)",
      );
      const shortcutInput = editRow.querySelector(".nopic-qt-shortcut-input");
      const recordBtn = editRow.querySelector(".nopic-qt-record-btn");
      const saveBtn = editRow.querySelector(".nopic-qt-save-btn");
      const cancelBtn = editRow.querySelector(".nopic-qt-cancel-btn");

      // 阻止输入框事件冒泡导致弹窗关闭
      textInput.addEventListener("mousedown", (e) => e.stopPropagation());
      textInput.addEventListener("click", (e) => e.stopPropagation());

      recordBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        isRecordingShortcut = true;
        recordingTarget = shortcutInput;
        recordBtn.textContent = "请按下...";
        recordBtn.style.background = "rgba(251,191,36,0.3)";
        recordBtn.style.borderColor = "rgba(251,191,36,0.5)";
        recordBtn.style.color = "#fbbf24";
        recordBtn.textContent = "等待操作...";
      });

      cancelBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        editRow.remove();
        isRecordingShortcut = false;
      });

      saveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const text = textInput.value.trim();
        const shortcut = shortcutInput.value.trim();
        if (!text || !shortcut) return;

        const cfg = getQuickTextConfigByScope(scope);
        cfg.items.push({ id: Date.now(), text, shortcut });
        setQuickTextConfigByScope(scope, cfg);
        editRow.remove();
        renderQuickTextLists();
      });

      textInput.focus();
    });
  });

  // ===== 数据采集弹窗控制 =====
  const dcTrigger = document.getElementById("nopic-datacollect-menu-entry");
  let dcSubmenuOpen = false;

  function showDCSubmenu() {
    dcSubmenuOpen = true;
    showPopupAtTrigger(
      dataCollectSubmenu,
      document.getElementById("nopic-datacollect-menu-entry"),
    );
    dcSaveCache();
  }

  function hideDCSubmenu() {
    dcSubmenuOpen = false;
    dataCollectSubmenu.style.transform = "scale(0.92) translateY(-10px)";
    dataCollectSubmenu.style.opacity = "0";
    dataCollectSubmenu.classList.remove("active");
    setTimeout(() => {
      dataCollectSubmenu.style.display = "none";
      dataCollectSubmenu.style.transform = "";
      dataCollectSubmenu.style.opacity = "";
    }, 250);
    dcSaveCache();
  }

  // 按钮点击事件
  if (dcTrigger) {
    dcTrigger.addEventListener("click", function (e) {
      e.stopPropagation();
      if (dcSubmenuOpen) {
        hideDCSubmenu();
      } else {
        showDCSubmenu();
        hideAllSubmenus("datacollect");
      }
    });
  } else {
    console.warn("[nopic] 数据采集按钮未找到");
  }

  // 关闭按钮
  const dcCloseBtn = document.getElementById("nopic-datacollect-close");
  if (dcCloseBtn) {
    dcCloseBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      hideDCSubmenu();
    });
  }

  // ===== 数据采集开关事件 =====
  const dcToggle = document.getElementById("nopic-datacollect-toggle");
  if (dcToggle) {
    dcToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      // 切换开关状态
      this.classList.toggle("on");
      const isEnabled = this.classList.contains("on");
      // 保存状态到 localStorage
      nopicSetToggleState("nopic_datacollect", isEnabled);
      // 更新UI
      updateAllUI();
    });
  }

  // ===== 数据采集核心状态 =====
  // ===== 修改 dcState 数据结构 =====
  const dcState = {
    columns: [],
    // rows 改为按列存储：{ colId: [value1, value2, ...] }
    columnData: {},
    selectedRows: new Set(),
    isPicking: false,
    isWatching: false,
    observer: null,
    _watchTimer: null,
    pickHighlight: null,
    pickOverlay: null,
    pickPreview: null,
  };

  // ===== 替换 dcSaveCache 函数 =====
  // 恢复期间禁止保存，避免 showDCSubmenu 把 isWatching 持久化为 false
  var _dcRestoring = false;
  function dcSaveCache() {
    if (_dcRestoring) return;
    try {
      // 剥离运行时字段（_collected 是 WeakSet，不可也不应序列化）
      var cleanColumns = dcState.columns.map(function (col) {
        var c = {};
        for (var k in col) {
          if (k === "_collected") continue;
          if (Object.prototype.hasOwnProperty.call(col, k)) c[k] = col[k];
        }
        return c;
      });
      localStorage.setItem(
        "nopic_dc_data_" + location.host,
        JSON.stringify({
          columns: cleanColumns,
          columnData: dcState.columnData,
          // 持久化采集状态，以便翻页/刷新后自动恢复
          isWatching: dcState.isWatching,
          submenuOpen: dcSubmenuOpen,
        }),
      );
    } catch (e) {}
  }
  // ===== 替换结束 =====

  // ===== 替换 dcLoadCache 函数 =====
  function dcLoadCache() {
    try {
      var raw = localStorage.getItem("nopic_dc_data_" + location.host);
      if (raw) {
        var parsed = JSON.parse(raw);
        dcState.columns = parsed.columns || [];
        dcState.columnData = parsed.columnData || {};
        // 读取上次保存的采集状态（暂存，待UI就绪后再恢复）
        dcState._savedIsWatching = !!parsed.isWatching;
        dcState._savedSubmenuOpen = !!parsed.submenuOpen;
      }
    } catch (e) {}
    // 重置每列的去重标记为新的 WeakSet（JSON 反序列化后会变成 {}，不可用；
    // 且新页面 DOM 全新，应允许整页重新采集）
    dcState.columns.forEach(function (col) {
      col._collected = new WeakSet();
    });
  }
  // ===== 替换结束 =====
  dcLoadCache();

  // 工具函数
  function dcEscapeHtml(str) {
    if (!str) return "";
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function dcGenerateId() {
    // 生成基于数字的列名：列1、列2、列3...
    var nextIndex = dcState.columns.length + 1;
    return "列" + nextIndex + "（文本）";
  }

  function dcGetElementText(el) {
    if (!el) return "";
    return (el.innerText || el.textContent || "").trim();
  }

  function dcGetElementLink(el) {
    if (!el) return "";
    if (el.tagName === "A") return el.href || "";
    let a = el.closest("a");
    return a ? a.href : "";
  }

  function dcGetElementImage(el) {
    if (!el) return "";
    if (el.tagName === "IMG") return el.src || "";
    let img = el.querySelector("img");
    return img ? img.src : "";
  }

  function dcGetElementType(el) {
    if (!el) return "text";
    if (el.tagName === "IMG") return "image";
    // 检查是否包含链接
    let link = el.closest("a") || (el.tagName === "A" ? el : null);
    if (link && link.href) return "link";
    return "text";
  }

  // ===== 元素去重标记（内存级，不污染DOM）=====
  // 同一页面会话内，已被某列采集过的元素加入 WeakSet，避免重复采集；
  // 翻页/刷新后脚本重新注入，WeakSet 清空 + DOM 元素全新 → 整页重新采集（符合预期）
  function dcEnsureCollectedSet(col) {
    if (!col) return null;
    if (!col._collected || typeof col._collected.has !== "function") {
      col._collected = new WeakSet();
    }
    return col._collected;
  }
  function dcMarkCollected(el, col) {
    var set = dcEnsureCollectedSet(col);
    if (!el || !set) return;
    set.add(el);
  }
  function dcIsCollected(el, col) {
    var set = dcEnsureCollectedSet(col);
    if (!el || !set) return false;
    return set.has(el);
  }

  // ===== 统一数据提取（供选取/监听复用，保证一致）=====
  function dcExtractValue(el, col) {
    if (!el || !col) return "";
    var type = col.type;
    if (type === "text_with_link_image") {
      return JSON.stringify({
        text: dcGetElementText(el),
        link: dcGetElementLink(el),
        image: dcGetElementImage(el),
      });
    }
    if (type === "text_with_link") {
      var t = dcGetElementText(el);
      var l = dcGetElementLink(el);
      var im = dcGetElementImage(el);
      if (l || im) {
        var obj = { text: t, link: l };
        if (im) obj.image = im;
        return JSON.stringify(obj);
      }
      return t;
    }
    if (type === "link") return dcGetElementLink(el);
    if (type === "image") return dcGetElementImage(el);
    return dcGetElementText(el);
  }

  // ===== 结构相似度匹配（核心算法） =====
  function dcGetStructureSignature(el) {
    if (!el) return "";
    var parts = [];
    var cur = el;
    var depth = 0;
    var maxDepth = 4;

    while (
      cur &&
      cur !== document.body &&
      cur !== document.documentElement &&
      depth < maxDepth
    ) {
      var tag = cur.tagName.toLowerCase();
      var cls = "";
      var id = "";

      // 获取id（如果有意义）
      if (
        cur.id &&
        !cur.id.startsWith("nopic-") &&
        !cur.id.startsWith("dc_") &&
        !cur.id.startsWith("pm_")
      ) {
        id = "#" + cur.id;
      }

      // 获取class（过滤无意义的）
      if (cur.className && typeof cur.className === "string") {
        var classList = cur.className.split(" ").filter(function (c) {
          return (
            c &&
            !c.startsWith("nopic-") &&
            !c.startsWith("dc_") &&
            !c.startsWith("pm_") &&
            !/^[a-f0-9]{8,}/.test(c)
          );
        });
        if (classList.length > 0) {
          cls = "." + classList[0];
        }
      }

      var sig = tag;
      if (id) {
        sig = id;
      } else if (cls) {
        sig = tag + cls;
      }

      // ===== 关键：不加 nth-child，让匹配更宽松 =====
      parts.unshift(sig);
      cur = cur.parentElement;
      depth++;
    }

    return parts.join(" > ");
  }

  function dcFindSimilarElements(sampleEl) {
    if (!sampleEl) return [];
    let signature = dcGetStructureSignature(sampleEl);
    if (!signature) return [];
    let results = [];
    try {
      let candidates = document.querySelectorAll(signature);
      candidates.forEach((el) => {
        if (
          el !== sampleEl &&
          !el.closest("#nopic-datacollect-submenu") &&
          !el.closest("#nopic-widget") &&
          !el.closest("#nopic-menu")
        ) {
          results.push(el);
        }
      });
    } catch (e) {}
    // 如果结果太少，降级匹配
    if (results.length < 2) {
      let parts = signature.split(" > ");
      if (parts.length >= 2) {
        let lastTwo = parts.slice(-2).join(" > ");
        try {
          let candidates = document.querySelectorAll(lastTwo);
          candidates.forEach((el) => {
            if (
              el !== sampleEl &&
              !el.closest("#nopic-datacollect-submenu") &&
              !el.closest("#nopic-widget") &&
              !el.closest("#nopic-menu")
            ) {
              if (!results.includes(el)) results.push(el);
            }
          });
        } catch (e) {}
      }
    }
    return results;
  }

  // 生成选择器
  function dcGetSelector(el) {
    if (!el) return "";
    if (el.id && !el.id.startsWith("nopic-")) {
      try {
        const s = "#" + CSS.escape(el.id);
        if (document.querySelectorAll(s).length === 1) return s;
      } catch (e) {}
    }
    let path = [];
    let cur = el;
    while (cur && cur !== document.body && path.length < 6) {
      let seg = cur.tagName.toLowerCase();
      if (cur.id && !cur.id.startsWith("nopic-")) {
        try {
          path.unshift("#" + CSS.escape(cur.id));
          break;
        } catch (e) {}
      }
      let parent = cur.parentElement;
      if (parent) {
        let siblings = Array.from(parent.children).filter(
          (c) => c.tagName === cur.tagName,
        );
        if (siblings.length > 1) {
          seg += ":nth-of-type(" + (siblings.indexOf(cur) + 1) + ")";
        }
      }
      path.unshift(seg);
      cur = parent;
    }
    return path.join(" > ");
  }

  // ===== 选取元素模式 =====
  function dcStartPick() {
    if (dcState.isPicking) {
      dcCancelPick();
      return;
    }
    dcState.isPicking = true;
    const btn = document.getElementById("nopic-dc-pick-btn");
    if (btn) {
      btn.textContent = "使用ESC键以取消选取";
      btn.classList.add("picking");
    }

    // 高亮遮罩
    dcState.pickOverlay = document.createElement("div");
    dcState.pickOverlay.style.cssText =
      "position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483640;pointer-events:none;";
    document.body.appendChild(dcState.pickOverlay);

    dcState.pickHighlight = document.createElement("div");
    dcState.pickHighlight.style.cssText =
      "position:fixed;z-index:2147483641;border:2px solid #60a5fa;background:rgba(96,165,250,0.15);border-radius:4px;pointer-events:none;display:none;";
    document.body.appendChild(dcState.pickHighlight);

    dcState.pickPreview = document.createElement("div");
    dcState.pickPreview.style.cssText =
      "position:fixed;z-index:2147483642;background:rgba(0,0,0,0.85);color:#fff;font-size:11px;padding:4px 10px;border-radius:4px;pointer-events:none;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:none;";
    document.body.appendChild(dcState.pickPreview);

    document.addEventListener("mousemove", dcOnPickMove);
    document.addEventListener("click", dcOnPickClick, true);
    document.addEventListener("keydown", dcOnPickKey);
  }

  function dcCancelPick() {
    dcState.isPicking = false;
    const btn = document.getElementById("nopic-dc-pick-btn");
    if (btn) {
      btn.textContent = "开始选取元素";
      btn.classList.remove("picking");
    }
    if (dcState.pickOverlay) {
      dcState.pickOverlay.remove();
      dcState.pickOverlay = null;
    }
    if (dcState.pickHighlight) {
      dcState.pickHighlight.remove();
      dcState.pickHighlight = null;
    }
    if (dcState.pickPreview) {
      dcState.pickPreview.remove();
      dcState.pickPreview = null;
    }
    document.removeEventListener("mousemove", dcOnPickMove);
    document.removeEventListener("click", dcOnPickClick, true);
    document.removeEventListener("keydown", dcOnPickKey);
  }

  function dcOnPickMove(e) {
    if (!dcState.isPicking) return;
    let el = document.elementFromPoint(e.clientX, e.clientY);
    if (
      el &&
      (el.closest("#nopic-datacollect-submenu") ||
        el.closest("#nopic-widget") ||
        el.closest("#nopic-menu") ||
        el.closest("#nopic-zoom-container"))
    ) {
      dcState.pickHighlight.style.display = "none";
      dcState.pickPreview.style.display = "none";
      return;
    }
    if (!el || !el.tagName) {
      dcState.pickHighlight.style.display = "none";
      return;
    }
    let rect = el.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 5) {
      dcState.pickHighlight.style.display = "none";
      return;
    }
    dcState.pickHighlight.style.display = "block";
    dcState.pickHighlight.style.left = rect.left + "px";
    dcState.pickHighlight.style.top = rect.top + "px";
    dcState.pickHighlight.style.width = rect.width + "px";
    dcState.pickHighlight.style.height = rect.height + "px";
    dcState.pickHighlight._currentEl = el;

    let txt = (el.innerText || el.textContent || "").trim().substring(0, 60);
    if (!txt && el.tagName === "IMG") txt = "🖼 图片";
    else if (!txt && el.tagName === "A") txt = "🔗 链接";
    else if (!txt) txt = "[" + el.tagName.toLowerCase() + "]";
    dcState.pickPreview.textContent = txt;
    dcState.pickPreview.style.display = "block";
    dcState.pickPreview.style.left =
      Math.min(e.clientX + 16, window.innerWidth - 320) + "px";
    dcState.pickPreview.style.top =
      Math.min(e.clientY + 16, window.innerHeight - 40) + "px";
  }

  function dcOnPickClick(e) {
    if (!dcState.isPicking) return;
    e.preventDefault();
    e.stopPropagation();
    let el = document.elementFromPoint(e.clientX, e.clientY);
    if (
      !el ||
      el.closest("#nopic-datacollect-submenu") ||
      el.closest("#nopic-widget") ||
      el.closest("#nopic-menu")
    )
      return;
    if (!el.tagName) return;
    if (el.nodeType === Node.TEXT_NODE) el = el.parentElement;
    if (!el || !el.tagName) return;

    // 检测是否包含链接
    let linkEl = el.closest("a") || (el.tagName === "A" ? el : null);
    let hasLink = linkEl && linkEl.href;

    // 检测是否包含图片
    let hasImage =
      el.tagName === "IMG" || (el.querySelector && el.querySelector("img"))
        ? true
        : false;

    // 列类型：同时有链接和图片 → text_with_link_image；仅图片 → image；仅链接 → text_with_link；否则 text
    let colType;
    if (hasLink && hasImage) colType = "text_with_link_image";
    else if (hasImage) colType = "image";
    else if (hasLink) colType = "text_with_link";
    else colType = "text";

    // 列名 - 使用数字编号
    var nextIndex = dcState.columns.length + 1;
    var typeSuffix = "";
    if (hasLink && hasImage) typeSuffix = "（图文）";
    else if (hasImage) typeSuffix = "（图片）";
    else if (hasLink) typeSuffix = "（链接）";
    else typeSuffix = "（文本）";
    var colName = "列" + nextIndex + typeSuffix;

    let colId = dcGenerateId();

    // 获取当前所有匹配的元素
    let matches = dcFindSimilarElements(el);

    // 去重，确保样本在第一个
    let uniqueMatches = [];
    let seenEls = new Set();
    uniqueMatches.push(el);
    seenEls.add(el);

    matches.forEach((matchEl) => {
      if (!seenEls.has(matchEl)) {
        seenEls.add(matchEl);
        uniqueMatches.push(matchEl);
      }
    });

    matches = uniqueMatches;

    // ===== 按元素在页面中的位置排序（从上到下，从左到右） =====
    matches.sort(function (a, b) {
      var rectA = a.getBoundingClientRect();
      var rectB = b.getBoundingClientRect();
      // 先按垂直位置排序
      if (Math.abs(rectA.top - rectB.top) > 20) {
        return rectA.top - rectB.top;
      }
      // 同一行按水平位置排序
      return rectA.left - rectB.left;
    });

    // ===== 新增列 =====
    var newCol = {
      id: colId,
      name: colName,
      type: colType,
      sampleSelector: dcGetSelector(el),
      sampleSignature: dcGetStructureSignature(el),
      hasLink: hasLink,
      hasImage: hasImage,
    };
    dcState.columns.push(newCol);

    // ===== 独立存储每列数据，使用统一提取函数 =====
    var columnData = [];
    matches.forEach(function (matchEl) {
      columnData.push(dcExtractValue(matchEl, newCol));
      // 标记已采集，避免后续监听时重复采集
      dcMarkCollected(matchEl, newCol);
    });

    // 直接存储到 columnData 中
    dcState.columnData[colId] = columnData;

    dcCancelPick();
    dcRenderTable();
    dcSaveCache();
    dcAnimateCollect(matches);
  }

  function dcOnPickKey(e) {
    if (e.key === "Escape") dcCancelPick();
  }

  // ===== 抓取动画：临时span遮罩 → 原地闪烁 → 飞向采集弹窗 → 移除 =====
  // 页面原DOM无改动、不隐藏；transform/opacity 走GPU，不阻塞遍历与渲染
  function dcAnimateCollect(elements) {
    if (!elements || elements.length === 0) return;

    // 汇聚目标：采集弹窗中心；弹窗不可见时退到右上角
    var target;
    var submenu = document.getElementById("nopic-datacollect-submenu");
    if (submenu && submenu.style.display !== "none") {
      var sr = submenu.getBoundingClientRect();
      target = { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 };
    } else {
      target = { x: window.innerWidth - 80, y: 80 };
    }

    // 限制单批并发量，避免大批量时创建过多节点
    var MAX_BATCH = 60;
    var list = [];
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (!el || !el.isConnected) continue;
      var rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      list.push({ el: el, rect: rect });
      if (list.length >= MAX_BATCH) break;
    }

    list.forEach(function (item) {
      var rect = item.rect;
      var span = document.createElement("span");
      span.className = "nopic-dc-anim-overlay";
      span.style.left = rect.left + "px";
      span.style.top = rect.top + "px";
      span.style.width = rect.width + "px";
      span.style.height = rect.height + "px";
      document.body.appendChild(span);

      // 阶段1：原地高亮闪烁
      span.style.animation = "nopic-dc-flash 0.45s ease-in-out 2";

      // 阶段2：飞向弹窗
      var startFly = function (theSpan, r) {
        var dx = target.x - (r.left + r.width / 2);
        var dy = target.y - (r.top + r.height / 2);
        theSpan.style.animation = "none";
        void theSpan.offsetWidth; // 强制回流以重启动画
        theSpan.style.setProperty("--fx", dx + "px");
        theSpan.style.setProperty("--fy", dy + "px");
        theSpan.style.animation =
          "nopic-dc-fly 0.55s cubic-bezier(0.5,0,0.9,0.6) forwards";
        var onEnd = function () {
          theSpan.removeEventListener("animationend", onEnd);
          if (theSpan.parentNode) theSpan.remove();
        };
        theSpan.addEventListener("animationend", onEnd);
        // 兜底移除，防止事件丢失
        setTimeout(function () {
          if (theSpan.parentNode) theSpan.remove();
        }, 800);
      };

      // 闪烁结束后启动飞行（0.45s × 2 ≈ 0.9s）
      setTimeout(function () {
        startFly(span, rect);
      }, 950);
    });
  }

  // ===== 渲染表格 =====
  // ===== 替换整个 dcRenderTable 函数 =====
  function dcRenderTable() {
    const thead = document.getElementById("nopic-dc-thead");
    const tbody = document.getElementById("nopic-dc-tbody");
    if (!thead || !tbody) return;

    // 计算最大行数（取所有列中数据最多的）
    var maxRows = 0;
    dcState.columns.forEach(function (col) {
      var data = dcState.columnData[col.id] || [];
      if (data.length > maxRows) maxRows = data.length;
    });

    // ---- 表头 ----
    var headerHtml =
      '<tr><th style="width:30px;text-align:center;background:rgba(0,0,0,0.5);color:#fff;">#</th>';
    dcState.columns.forEach(function (col) {
      headerHtml +=
        '<th style="padding:6px 10px;text-align:left;position:relative;border-bottom:1px solid rgba(255,255,255,0.06);" data-col-id="' +
        col.id +
        '">';
      headerHtml +=
        '<span style="display:inline-flex;align-items:center;gap:6px;max-width:100%;">';
      headerHtml +=
        '<span class="nopic-dc-col-name" style="display:inline-block;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
        dcEscapeHtml(col.name) +
        "</span>";
      headerHtml += "</span>";
      headerHtml +=
        '<span style="font-size:9px;color:rgba(255,255,255,0.3);margin-left:4px;">[' +
        "行数" +
        ":" +
        (dcState.columnData[col.id] || []).length +
        "]</span>";
      headerHtml +=
        '<span class="nopic-dc-col-rename" style="display:none;cursor:pointer;flex-shrink:0;color:rgba(255,255,255,0.5);transition:all 0.2s;padding:2px;" data-col-id="' +
        col.id +
        '" title="修改列名">' +
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 20h9"/>' +
        '<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>' +
        "</svg>" +
        "</span>";
      headerHtml +=
        '<span class="nopic-dc-col-delete" style="display:none;position:absolute;right:4px;top:50%;transform:translateY(-50%);color:#f87171;font-size:14px;cursor:pointer;padding:0 4px;" data-col-id="' +
        col.id +
        '">×</span>';
      headerHtml += "</th>";
    });
    headerHtml += "</tr>";
    thead.innerHTML = headerHtml;

    // 表头悬停删除
    thead.querySelectorAll("th[data-col-id]").forEach(function (th) {
      th.addEventListener("mouseenter", function () {
        var del = this.querySelector(".nopic-dc-col-delete");
        if (del) del.style.display = "block";
        var rename = this.querySelector(".nopic-dc-col-rename");
        if (rename) rename.style.opacity = "1";
      });
      th.addEventListener("mouseleave", function () {
        var del = this.querySelector(".nopic-dc-col-delete");
        if (del) del.style.display = "none";
        var rename = this.querySelector(".nopic-dc-col-rename");
        if (rename) rename.style.opacity = "0";
      });
    });

    // ===== 列名修改（黄色笔图标点击） =====
    thead.querySelectorAll(".nopic-dc-col-rename").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var colId = this.dataset.colId;
        var col = dcState.columns.find(function (c) {
          return c.id === colId;
        });
        if (!col) return;

        // 如果已经在编辑状态，不重复触发
        var th = this.closest("th");
        if (th.querySelector(".nopic-dc-col-edit-input")) return;

        var originalName = col.name;

        // 构建包含删除按钮的表头 HTML（复用逻辑）
        function buildHeaderHtml(name) {
          var count = (dcState.columnData[colId] || []).length;
          return `
        <span style="display:inline-flex;align-items:center;gap:6px;max-width:100%;">
          <span class="nopic-dc-col-name" style="display:inline-block;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${dcEscapeHtml(name)}</span>
        </span>
        <span style="font-size:9px;color:rgba(255,255,255,0.3);margin-left:4px;">[${col.type}:${count}]</span>
                  <span class="nopic-dc-col-rename" style="display:none;cursor:pointer;flex-shrink:0;color:rgba(255,255,255,0.5);transition:all 0.2s;padding:2px;" data-col-id="' + col.id + '" title="修改列名">
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
</span>
        <span class="nopic-dc-col-delete" style="display:none;position:absolute;right:4px;top:50%;transform:translateY(-50%);color:#f87171;font-size:14px;cursor:pointer;padding:0 4px;" data-col-id="${colId}">×</span>
      `;
        }

        // 保存原始 HTML
        var originalHtml = th.innerHTML;

        // 清空 th，放入输入框
        th.innerHTML = "";
        var input = document.createElement("input");
        input.type = "text";
        input.className = "nopic-dc-col-edit-input";
        input.value = originalName;
        input.style.cssText = `
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
      background: rgba(251, 191, 36, 0.12);
      border: 1.5px solid #fbbf24;
      border-radius: 6px;
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 8px;
      outline: none;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.15);
    `;
        th.appendChild(input);

        input.focus();
        input.select();

        // ===== 恢复表头 =====
        function restoreHeader(name) {
          th.innerHTML = buildHeaderHtml(name);
          // 重新绑定删除按钮
          var delBtn = th.querySelector(".nopic-dc-col-delete");
          if (delBtn) {
            delBtn.addEventListener("click", function (e) {
              e.stopPropagation();
              var id = this.dataset.colId;
              showConfirmModal("确认删除列", "确定删除该列吗？", function () {
                dcState.columns = dcState.columns.filter(function (c) {
                  return c.id !== id;
                });
                delete dcState.columnData[id];
                dcRenderTable();
                dcSaveCache();
                hideConfirmModal();
              });
            });
          }
          // 重新绑定重命名按钮
          var renameBtn = th.querySelector(".nopic-dc-col-rename");
          if (renameBtn) {
            renameBtn.addEventListener("click", function (e) {
              e.stopPropagation();
              // 触发修改（其实就是重新进入编辑模式）
              // 这里用简单方式：模拟双击，通过事件触发
              var clickEvent = new MouseEvent("click", { bubbles: true });
              this.dispatchEvent(clickEvent);
            });
            // 悬停显示
            renameBtn.addEventListener("mouseenter", function () {
              this.style.transform = "scale(1.15)";
            });
            renameBtn.addEventListener("mouseleave", function () {
              this.style.transform = "scale(1)";
            });
          }
          // 重新绑定悬停显示删除按钮
          th.addEventListener("mouseenter", function () {
            var del = this.querySelector(".nopic-dc-col-delete");
            if (del) del.style.display = "block";
            var rename = this.querySelector(".nopic-dc-col-rename");
            if (rename) rename.style.opacity = "1";
          });
          th.addEventListener("mouseleave", function () {
            var del = this.querySelector(".nopic-dc-col-delete");
            if (del) del.style.display = "none";
            var rename = this.querySelector(".nopic-dc-col-rename");
            if (rename) rename.style.opacity = "0";
          });
        }

        // ===== 保存 =====
        function saveColName() {
          var newName = input.value.trim();
          if (newName && newName !== originalName) {
            col.name = newName;
            dcSaveCache();
          }
          restoreHeader(col.name);
        }

        // ===== 取消 =====
        function cancelEdit() {
          restoreHeader(originalName);
        }

        // ===== 键盘事件 =====
        input.addEventListener("keydown", function (e) {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            saveColName();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit();
          }
        });

        // ===== 失去焦点保存 =====
        input.addEventListener("blur", function () {
          setTimeout(function () {
            if (input.parentNode) {
              saveColName();
            }
          }, 100);
        });

        input.addEventListener("dblclick", function (e) {
          e.stopPropagation();
        });

        input.addEventListener("mousedown", function (e) {
          e.stopPropagation();
        });
      });
    });

    // 列删除
    thead.querySelectorAll(".nopic-dc-col-delete").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var colId = this.dataset.colId;
        showConfirmModal("确认删除列", "确定删除该列吗？", function () {
          dcState.columns = dcState.columns.filter(function (c) {
            return c.id !== colId;
          });
          delete dcState.columnData[colId];
          dcRenderTable();
          dcSaveCache();
          hideConfirmModal();
        });
      });
    });

    // ---- 数据行（按行索引展示） ----
    var rowHtml = "";
    for (var rowIdx = 0; rowIdx < maxRows; rowIdx++) {
      rowHtml +=
        '<tr class="nopic-dc-row" data-row="' +
        rowIdx +
        '" style="border-bottom:1px solid rgba(255,255,255,0.04);">';
      // 行号 + 悬停删除按钮
      rowHtml +=
        '<td class="nopic-dc-row-num" style="text-align:center;padding:4px 0;font-size:10px;color:rgba(255,255,255,0.3);position:relative;cursor:default;background:rgba(0,0,0,0.3);">';
      rowHtml +=
        '<span class="nopic-dc-rownum-text">' + (rowIdx + 1) + "</span>";
      rowHtml +=
        '<span class="nopic-dc-row-del" data-row="' +
        rowIdx +
        '" style="display:none;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#f87171;font-size:14px;cursor:pointer;font-weight:bold;padding:2px 4px;" title="删除该行">×</span>';
      rowHtml += "</td>";

      dcState.columns.forEach(function (col) {
        var data = dcState.columnData[col.id] || [];
        var val = data[rowIdx] || "";
        var colId = col.id;
        var rowIndex = rowIdx;

        rowHtml +=
          '<td style="padding:4px 8px;max-width:200px;position:relative;cursor:pointer;" ';
        rowHtml += 'data-col-id="' + colId + '" ';
        rowHtml += 'data-row-idx="' + rowIndex + '" ';
        rowHtml += 'class="nopic-dc-cell" ';
        rowHtml += 'title="悬停显示×删除">';

        // 显示内容
        if (col.type === "image" && val) {
          rowHtml +=
            '<img src="' +
            dcEscapeHtml(val) +
            '" style="max-height:30px;max-width:60px;border-radius:3px;object-fit:contain;background:rgba(255,255,255,0.05);display:block;" onerror="this.style.display=\'none\'">';
          rowHtml +=
            '<span style="font-size:9px;color:rgba(255,255,255,0.3);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;">' +
            dcEscapeHtml(val.substring(0, 40)) +
            "</span>";
        } else if (
          col.type === "text_with_link" ||
          col.type === "text_with_link_image"
        ) {
          var parsed = null;
          try {
            parsed = JSON.parse(val);
          } catch (e) {}
          if (parsed && typeof parsed === "object") {
            if (parsed.image) {
              var imgHref = parsed.link || parsed.image;
              rowHtml +=
                '<a href="' +
                dcEscapeHtml(imgHref) +
                '" target="_blank" style="display:block;margin-bottom:2px;">';
              rowHtml +=
                '<img src="' +
                dcEscapeHtml(parsed.image) +
                '" style="max-height:40px;max-width:70px;border-radius:3px;object-fit:contain;background:rgba(255,255,255,0.05);display:block;" onerror="this.style.display=\'none\'">';
              rowHtml += "</a>";
            }
            if (parsed.text) {
              var displayText = parsed.text;
              if (displayText.length > 60)
                displayText = displayText.substring(0, 58) + "…";
              rowHtml +=
                '<div style="font-size:12px;color:rgba(255,255,255,0.9);line-height:1.4;word-break:break-word;">' +
                dcEscapeHtml(displayText) +
                "</div>";
            }
            if (parsed.link) {
              var displayLink =
                parsed.link.length > 50
                  ? parsed.link.substring(0, 48) + "…"
                  : parsed.link;
              rowHtml +=
                '<div style="font-size:10px;color:rgba(96,165,250,0.7);line-height:1.3;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">🔗 ' +
                dcEscapeHtml(displayLink) +
                "</div>";
            }
          } else {
            rowHtml += dcEscapeHtml(String(val).substring(0, 80));
          }
        } else if (col.type === "link" && val) {
          rowHtml +=
            '<a href="' +
            dcEscapeHtml(val) +
            '" target="_blank" style="color:#60a5fa;text-decoration:none;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;max-width:140px;">' +
            dcEscapeHtml(val.substring(0, 50)) +
            "</a>";
        } else {
          var displayVal = String(val);
          if (displayVal.length > 80)
            displayVal = displayVal.substring(0, 80) + "…";
          rowHtml +=
            '<span style="font-size:12px;color:rgba(255,255,255,0.85);line-height:1.4;word-break:break-word;">' +
            dcEscapeHtml(displayVal) +
            "</span>";
        }

        // 单元格悬停删除按钮
        rowHtml +=
          '<span class="nopic-dc-cell-del" style="display:none;position:absolute;top:2px;right:4px;color:#f87171;font-size:14px;cursor:pointer;font-weight:bold;padding:0 4px;z-index:5;border-radius:3px;" data-col-id="' +
          colId +
          '" data-row-idx="' +
          rowIndex +
          '" title="删除此单元格">×</span>';
        rowHtml += "</td>";
      });
      rowHtml += "</tr>";
    }

    if (maxRows === 0) {
      // ★★★ 隐藏表头 ★★★
      thead.style.display = "none";
      // ★★★ 暂无数据 - 居中显示，占据整个表格区域 ★★★
      rowHtml =
        '<tr><td colspan="' +
        (dcState.columns.length + 1) +
        '" style="text-align:center;color:rgba(255,255,255,0.3);padding:40px 20px;font-size:13px;cursor:default;pointer-events:none;border:none;background:transparent !important;">暂无数据</td></tr>';
      tbody.className = "nopic-dc-empty";
    } else {
      // 显示表头
      thead.style.display = "";
      tbody.className = "";
    }
    tbody.innerHTML = rowHtml;

    // ===== 绑定单元格事件 =====
    setTimeout(function () {
      document.querySelectorAll(".nopic-dc-row-del").forEach(function (btn) {
        btn.removeEventListener("click", dcOnRowDelClick);
        btn.addEventListener("click", dcOnRowDelClick);
      });

      document.querySelectorAll(".nopic-dc-cell").forEach(function (cell) {
        cell.removeEventListener("mouseenter", dcOnCellMouseEnter);
        cell.removeEventListener("mouseleave", dcOnCellMouseLeave);
        cell.removeEventListener("dblclick", dcOnCellDblClick);
        cell.addEventListener("mouseenter", dcOnCellMouseEnter);
        cell.addEventListener("mouseleave", dcOnCellMouseLeave);
        cell.addEventListener("dblclick", dcOnCellDblClick);
      });

      document.querySelectorAll(".nopic-dc-cell-del").forEach(function (btn) {
        btn.removeEventListener("click", dcOnCellDelClick);
        btn.addEventListener("click", dcOnCellDelClick);
      });
    }, 50);

    dcUpdateStatus();
  }
  // ===== 替换结束 =====

  // ===== 单元格双击编辑 =====
  function dcOnCellDblClick(e) {
    e.stopPropagation();
    var cell = e.currentTarget;
    var colId = cell.dataset.colId;
    var rowIdx = parseInt(cell.dataset.rowIdx, 10);

    // 找到对应的列
    var col = dcState.columns.find(function (c) {
      return c.id === colId;
    });
    if (!col) return;

    // 获取当前值
    var data = dcState.columnData[colId] || [];
    var currentVal = data[rowIdx] || "";

    // 创建输入框
    var input = document.createElement("input");
    input.type = "text";
    input.value = currentVal;
    input.style.cssText =
      "width:100%;background:rgba(255,255,255,0.1);border:1px solid #60a5fa;border-radius:4px;color:#fff;font-size:12px;padding:2px 6px;box-sizing:border-box;outline:none;";
    input.autofocus = true;

    // 保存原内容
    var originalHtml = cell.innerHTML;

    // 清空单元格，放入输入框
    cell.innerHTML = "";
    cell.appendChild(input);

    // 选中全部文字方便修改
    input.select();

    // 保存函数
    var saveEdit = function () {
      var newVal = input.value;
      // 更新数据
      if (!dcState.columnData[colId]) dcState.columnData[colId] = [];
      dcState.columnData[colId][rowIdx] = newVal;
      dcSaveCache();
      dcRenderTable();
    };

    var cancelEdit = function () {
      cell.innerHTML = originalHtml;
      // 重新绑定事件
      cell.addEventListener("dblclick", dcOnCellDblClick);
      cell.addEventListener("contextmenu", dcOnCellContextMenu);
    };

    // 回车保存
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        saveEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      }
      e.stopPropagation();
    });

    // 失去焦点保存
    input.addEventListener("blur", function (e) {
      // 延迟执行，防止点击其他地方时触发两次
      setTimeout(function () {
        if (input.parentNode) {
          saveEdit();
        }
      }, 100);
    });

    // 阻止双击冒泡
    input.addEventListener("dblclick", function (e) {
      e.stopPropagation();
    });
  }

  // ===== 行删除按钮点击 =====
  function dcOnRowDelClick(e) {
    e.stopPropagation();
    var rowIdx = parseInt(this.dataset.row, 10);
    if (!isNaN(rowIdx)) {
      showConfirmModal(
        "确认删除行",
        "确定要删除第 " + (rowIdx + 1) + " 行的所有数据吗？",
        function () {
          dcDeleteRow(rowIdx);
          hideConfirmModal();
          dcRenderTable();
        },
      );
    }
  }

  // ===== 单元格悬停进入 - 显示删除按钮 =====
  function dcOnCellMouseEnter(e) {
    var cell = e.currentTarget;
    var delBtn = cell.querySelector(".nopic-dc-cell-del");
    if (delBtn) {
      delBtn.style.display = "block";
    }
  }

  // ===== 单元格悬停离开 - 隐藏删除按钮 =====
  function dcOnCellMouseLeave(e) {
    var cell = e.currentTarget;
    var delBtn = cell.querySelector(".nopic-dc-cell-del");
    if (delBtn) {
      delBtn.style.display = "none";
    }
  }

  // ===== 单元格删除按钮点击 =====
  function dcOnCellDelClick(e) {
    e.stopPropagation();
    var btn = e.currentTarget;
    var colId = btn.dataset.colId;
    var rowIdx = parseInt(btn.dataset.rowIdx, 10);

    var col = dcState.columns.find(function (c) {
      return c.id === colId;
    });
    var colName = col ? col.name : "未知列";

    // ✅ 创建自定义确认弹窗，带两个选项
    showDeleteCellModal(
      colName,
      rowIdx + 1,
      function () {
        // 选项1：删除并上移
        dcDeleteCellAndShiftUp(colId, rowIdx);
      },
      function () {
        // 选项2：仅清空
        dcClearCell(colId, rowIdx);
      },
    );
  }

  // ===== 单元格双击编辑 =====
  function dcOnCellDblClick(e) {
    e.stopPropagation();
    var cell = e.currentTarget;
    var colId = cell.dataset.colId;
    var rowIdx = parseInt(cell.dataset.rowIdx, 10);

    var col = dcState.columns.find(function (c) {
      return c.id === colId;
    });
    if (!col) return;

    var data = dcState.columnData[colId] || [];
    var currentVal = data[rowIdx] || "";

    var input = document.createElement("input");
    input.type = "text";
    input.value = currentVal;
    input.style.cssText =
      "width:100%;background:rgba(255,255,255,0.1);border:1px solid #60a5fa;border-radius:4px;color:#fff;font-size:12px;padding:2px 6px;box-sizing:border-box;outline:none;";
    input.autofocus = true;

    var originalHtml = cell.innerHTML;
    cell.innerHTML = "";
    cell.appendChild(input);
    input.select();

    var saveEdit = function () {
      var newVal = input.value;
      if (!dcState.columnData[colId]) dcState.columnData[colId] = [];
      dcState.columnData[colId][rowIdx] = newVal;
      dcSaveCache();
      dcRenderTable();
    };

    var cancelEdit = function () {
      cell.innerHTML = originalHtml;
      cell.addEventListener("mouseenter", dcOnCellMouseEnter);
      cell.addEventListener("mouseleave", dcOnCellMouseLeave);
      cell.addEventListener("dblclick", dcOnCellDblClick);
    };

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        saveEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      }
      e.stopPropagation();
    });

    input.addEventListener("blur", function (e) {
      setTimeout(function () {
        if (input.parentNode) {
          saveEdit();
        }
      }, 100);
    });

    input.addEventListener("dblclick", function (e) {
      e.stopPropagation();
    });
  }

  // ===== 删除指定行：从所有列中移除同一索引的数据 =====
  function dcDeleteRow(rowIdx) {
    dcState.columns.forEach(function (col) {
      var data = dcState.columnData[col.id] || [];
      if (rowIdx >= 0 && rowIdx < data.length) {
        data.splice(rowIdx, 1);
        dcState.columnData[col.id] = data;
      }
    });
    dcRenderTable();
    dcSaveCache();
  }

  // ===== 在 dcRenderTable 函数后面添加导出功能 =====

  // ---- 导出下拉菜单 ----
  var exportMenu = document.createElement("div");
  exportMenu.id = "nopic-dc-export-menu";
  exportMenu.style.cssText = `
  display:none;
  position:fixed;
  z-index:2147483648;
  background:rgba(30,30,35,0.95);
  backdrop-filter:blur(20px);
  border:1px solid rgba(255,255,255,0.1);
  border-radius:8px;
  padding:4px 0;
  min-width:120px;
  box-shadow:0 8px 32px rgba(0,0,0,0.4);
`;
  exportMenu.innerHTML = `
  <div class="nopic-dc-export-option" data-format="csv" style="padding:8px 16px;cursor:pointer;color:rgba(255,255,255,0.8);font-size:12px;display:flex;align-items:center;gap:8px;transition:background 0.15s;">
    导出表格（CSV）
  </div>
  <div class="nopic-dc-export-option" data-format="html" style="padding:8px 16px;cursor:pointer;color:rgba(255,255,255,0.8);font-size:12px;display:flex;align-items:center;gap:8px;transition:background 0.15s;border-top:1px solid rgba(255,255,255,0.06);">
    导出网页（HTML）
  </div>
`;
  document.documentElement.appendChild(exportMenu);

  // 导出选项悬停效果
  exportMenu
    .querySelectorAll(".nopic-dc-export-option")
    .forEach(function (opt) {
      opt.addEventListener("mouseenter", function () {
        this.style.background = "rgba(96,165,250,0.15)";
      });
      opt.addEventListener("mouseleave", function () {
        this.style.background = "transparent";
      });
    });

  // ---- 导出按钮点击 ----
  document
    .getElementById("nopic-dc-export-btn")
    .addEventListener("click", function (e) {
      e.stopPropagation();
      showExportOptionsModal();
    });

  // ---- 点击其他地方关闭导出菜单 ----
  document.addEventListener("click", function (e) {
    if (
      !e.target.closest("#nopic-dc-export-menu") &&
      !e.target.closest("#nopic-dc-export-btn")
    ) {
      exportMenu.style.display = "none";
    }
  });

  // ---- 导出选项点击 ----
  exportMenu
    .querySelectorAll(".nopic-dc-export-option")
    .forEach(function (opt) {
      opt.addEventListener("click", function (e) {
        e.stopPropagation();
        var format = this.dataset.format;
        if (format === "csv") {
          exportCSV();
        } else if (format === "html") {
          exportHTML();
        }
        exportMenu.style.display = "none";
      });
    });

  // ===== 导出选项弹窗 =====
  // ===== 导出选项弹窗（带动画和模糊背景） =====
  function showExportOptionsModal() {
    if (dcState.columns.length === 0) {
      showConfirmModal("提示", "没有数据可导出", function () {
        hideConfirmModal();
      });
      return;
    }

    // 移除已存在的弹窗
    var existing = document.getElementById("nopic-export-overlay");
    if (existing) {
      existing.remove();
    }

    // 创建遮罩
    var overlay = document.createElement("div");
    overlay.id = "nopic-export-overlay";

    var box = document.createElement("div");
    box.className = "nopic-export-box";

    box.innerHTML = `
    <div class="nopic-export-title">导出选项</div>
    <div class="nopic-export-subtitle">选择要导出的内容</div>

    <div class="nopic-export-checkbox-group">
      <label class="nopic-export-checkbox-label">
        <input type="checkbox" class="nopic-export-checkbox" data-field="text" checked>
        文字
      </label>
      <label class="nopic-export-checkbox-label">
        <input type="checkbox" class="nopic-export-checkbox" data-field="image" checked>
        图片
      </label>
      <label class="nopic-export-checkbox-label">
        <input type="checkbox" class="nopic-export-checkbox" data-field="link">
        超链接
      </label>
    </div>

    <div class="nopic-export-actions">
      <button class="nopic-export-cancel">取消</button>
      <div class="nopic-export-spacer"></div>
      <button class="nopic-export-btn nopic-export-csv-btn">导出为表格(CSV)</button>
      <button class="nopic-export-btn nopic-export-html-btn">导出为网页</button>
      <button class="nopic-export-btn nopic-export-json-btn">导出为JSON</button>
    </div>
  `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // ★★★ 强制重绘，确保 transition 生效 ★★★
    void overlay.offsetHeight;

    // ★★★ 用 requestAnimationFrame 双重保险，添加 active 类触发动画 ★★★
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.classList.add("active");
      });
    });

    function getSelectedFields() {
      var fields = [];
      box
        .querySelectorAll(".nopic-export-checkbox:checked")
        .forEach(function (cb) {
          fields.push(cb.dataset.field);
        });
      return fields;
    }

    // ★★★ 带动画的关闭函数 ★★★
    function closeWithAnimation(el, callback) {
      if (!el || !el.parentNode) {
        if (typeof callback === "function") callback();
        return;
      }
      el.classList.remove("active");
      setTimeout(function () {
        if (el.parentNode) el.remove();
        if (typeof callback === "function") callback();
      }, 300);
    }

    // 取消
    box
      .querySelector(".nopic-export-cancel")
      .addEventListener("click", function (e) {
        e.stopPropagation();
        closeWithAnimation(overlay);
      });

    // 按钮悬停效果
    box
      .querySelector(".nopic-export-csv-btn")
      .addEventListener("mouseenter", function () {
        this.style.background = "rgba(96,165,250,0.35)";
      });
    box
      .querySelector(".nopic-export-csv-btn")
      .addEventListener("mouseleave", function () {
        this.style.background = "rgba(96,165,250,0.2)";
      });
    box
      .querySelector(".nopic-export-html-btn")
      .addEventListener("mouseenter", function () {
        this.style.background = "rgba(244,114,182,0.35)";
      });
    box
      .querySelector(".nopic-export-html-btn")
      .addEventListener("mouseleave", function () {
        this.style.background = "rgba(244,114,182,0.2)";
      });
    box
      .querySelector(".nopic-export-json-btn")
      .addEventListener("mouseenter", function () {
        this.style.background = "rgba(251,191,36,0.35)";
      });
    box
      .querySelector(".nopic-export-json-btn")
      .addEventListener("mouseleave", function () {
        this.style.background = "rgba(251,191,36,0.2)";
      });

    // 导出 CSV
    box
      .querySelector(".nopic-export-csv-btn")
      .addEventListener("click", function (e) {
        e.stopPropagation();
        var fields = getSelectedFields();
        if (fields.length === 0) {
          showTip("请至少选择一项导出内容");
          return;
        }
        closeWithAnimation(overlay, function () {
          exportCSV(fields);
        });
      });

    // 导出 HTML
    box
      .querySelector(".nopic-export-html-btn")
      .addEventListener("click", function (e) {
        e.stopPropagation();
        var fields = getSelectedFields();
        if (fields.length === 0) {
          showTip("请至少选择一项导出内容");
          return;
        }
        closeWithAnimation(overlay, function () {
          exportHTML(fields);
        });
      });

    // 导出 JSON
    box
      .querySelector(".nopic-export-json-btn")
      .addEventListener("click", function (e) {
        e.stopPropagation();
        var fields = getSelectedFields();
        if (fields.length === 0) {
          showTip("请至少选择一项导出内容");
          return;
        }
        closeWithAnimation(overlay, function () {
          exportJSON(fields);
        });
      });

    // 点击遮罩关闭（带动画）
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        closeWithAnimation(overlay);
      }
    });

    // ESC关闭（带动画）
    function onKeyDown(e) {
      if (e.key === "Escape") {
        closeWithAnimation(overlay);
        document.removeEventListener("keydown", onKeyDown);
      }
    }
    document.addEventListener("keydown", onKeyDown);

    // 提示函数
    function showTip(msg) {
      var tip = document.createElement("div");
      tip.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      z-index:2147483650;
      background:rgba(30,30,35,0.95);
      backdrop-filter:blur(24px);
      border:1px solid rgba(255,255,255,0.15);
      border-radius:16px;
      padding:24px 32px;
      color:#fff;
      font-family:-apple-system,BlinkMacSystemFont,sans-serif;
      text-align:center;
      min-width:200px;
      box-shadow:0 12px 48px rgba(0,0,0,0.5);
      animation:nopic-fadeIn 0.2s ease;
    `;
      tip.innerHTML = `
      <div style="font-size:14px;color:rgba(255,255,255,0.8);">${msg}</div>
      <button style="margin-top:12px;padding:6px 20px;background:rgba(96,165,250,0.2);border:1px solid rgba(96,165,250,0.3);border-radius:6px;color:#60a5fa;font-size:12px;cursor:pointer;">知道了</button>
    `;
      document.body.appendChild(tip);
      tip.querySelector("button").addEventListener("click", function () {
        tip.remove();
      });
      setTimeout(function () {
        if (tip.parentNode) tip.remove();
      }, 2000);
    }
  }

  // ===== 导出 CSV =====
  function exportCSV(fields) {
    if (dcState.columns.length === 0) {
      showConfirmModal("提示", "没有数据可导出", function () {
        hideConfirmModal();
      });
      return;
    }

    fields = fields || ["text", "image", "link"];

    var maxRows = 0;
    dcState.columns.forEach(function (col) {
      var data = dcState.columnData[col.id] || [];
      if (data.length > maxRows) maxRows = data.length;
    });

    if (maxRows === 0) {
      showConfirmModal("提示", "没有数据可导出", function () {
        hideConfirmModal();
      });
      return;
    }

    // 表头 - 保持原样
    var headers = dcState.columns.map(function (col) {
      return '"' + col.name.replace(/"/g, '""') + '"';
    });
    var csvRows = [headers.join(",")];

    for (var rowIdx = 0; rowIdx < maxRows; rowIdx++) {
      var rowData = dcState.columns.map(function (col) {
        var data = dcState.columnData[col.id] || [];
        var val = data[rowIdx] || "";

        if (
          col.type === "text_with_link" ||
          col.type === "text_with_link_image"
        ) {
          try {
            var parsed = JSON.parse(val);
            if (parsed && typeof parsed === "object") {
              var parts = [];
              if (fields.includes("text") && parsed.text)
                parts.push(parsed.text);
              if (fields.includes("image") && parsed.image)
                parts.push(parsed.image + "（图片）");
              if (fields.includes("link") && parsed.link)
                parts.push(parsed.link + "（超链接）");
              val = parts.join("\n");
            }
          } catch (e) {}
        } else if (col.type === "link") {
          if (fields.includes("link")) {
            val = val + "（超链接）";
          } else {
            val = "";
          }
        } else if (col.type === "image") {
          if (fields.includes("image")) {
            val = val + "（图片）";
          } else {
            val = "";
          }
        } else {
          if (!fields.includes("text")) {
            val = "";
          }
        }

        var strVal = String(val);
        strVal = '"' + strVal.replace(/"/g, '""') + '"';
        return strVal;
      });
      csvRows.push(rowData.join(","));
    }

    var csvContent = csvRows.join("\n");
    var blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download =
      "采集数据_自定义_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  // ===== 导出 HTML =====
  function exportHTML(fields) {
    if (dcState.columns.length === 0) {
      showConfirmModal("提示", "没有数据可导出", function () {
        hideConfirmModal();
      });
      return;
    }

    fields = fields || ["text", "image", "link"];

    var maxRows = 0;
    dcState.columns.forEach(function (col) {
      var data = dcState.columnData[col.id] || [];
      if (data.length > maxRows) maxRows = data.length;
    });

    if (maxRows === 0) {
      showConfirmModal("提示", "没有数据可导出", function () {
        hideConfirmModal();
      });
      return;
    }

    // 表头 - 保持原样
    var headers = dcState.columns.map(function (col) {
      return col.name;
    });

    var rows = [];
    for (var rowIdx = 0; rowIdx < maxRows; rowIdx++) {
      var rowData = dcState.columns.map(function (col) {
        var data = dcState.columnData[col.id] || [];
        var val = data[rowIdx] || "";

        if (
          col.type === "text_with_link" ||
          col.type === "text_with_link_image"
        ) {
          try {
            var parsed = JSON.parse(val);
            if (parsed && typeof parsed === "object") {
              var parts = [];
              if (fields.includes("text") && parsed.text) {
                parts.push(dcEscapeHtml(parsed.text));
              }
              if (fields.includes("image") && parsed.image) {
                parts.push(
                  '<img src="' +
                    dcEscapeHtml(parsed.image) +
                    '" style="max-height:60px;max-width:120px;border-radius:4px;object-fit:contain;display:inline-block;vertical-align:middle;">',
                );
              }
              if (fields.includes("link") && parsed.link) {
                parts.push(
                  '<a href="' +
                    dcEscapeHtml(parsed.link) +
                    '" target="_blank" style="color:#60a5fa;text-decoration:none;word-break:break-all;">' +
                    dcEscapeHtml(parsed.link) +
                    "</a>",
                );
              }
              return parts.join(" ");
            }
          } catch (e) {}
        } else if (col.type === "link") {
          if (fields.includes("link")) {
            return (
              '<a href="' +
              dcEscapeHtml(val) +
              '" target="_blank" style="color:#60a5fa;text-decoration:none;word-break:break-all;">' +
              dcEscapeHtml(val) +
              "</a>"
            );
          }
          return "";
        } else if (col.type === "image") {
          if (fields.includes("image")) {
            return (
              '<img src="' +
              dcEscapeHtml(val) +
              '" style="max-height:60px;max-width:120px;border-radius:4px;object-fit:contain;display:inline-block;vertical-align:middle;"> <span style="font-size:10px;color:rgba(255,255,255,0.3);">（图片）</span>'
            );
          }
          return "";
        } else {
          if (!fields.includes("text")) return "";
          return dcEscapeHtml(val);
        }
        return dcEscapeHtml(val);
      });
      rows.push(rowData);
    }

    var htmlContent = generateHTMLTemplate(headers, rows);
    var blob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download =
      "采集数据_自定义_" + new Date().toISOString().slice(0, 10) + ".html";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  // ===== 导出 JSON =====
  function exportJSON(fields) {
    if (dcState.columns.length === 0) {
      showConfirmModal("提示", "没有数据可导出", function () {
        hideConfirmModal();
      });
      return;
    }

    fields = fields || ["text", "image"];

    var jsonData = {};
    dcState.columns.forEach(function (col) {
      var rawData = dcState.columnData[col.id] || [];
      var parsedData = rawData.map(function (val) {
        // 根据列类型处理
        if (
          col.type === "text_with_link" ||
          col.type === "text_with_link_image"
        ) {
          try {
            var parsed = JSON.parse(val);
            if (parsed && typeof parsed === "object") {
              var filtered = {};
              if (fields.includes("text") && parsed.text !== undefined) {
                filtered.text = parsed.text;
              }
              if (fields.includes("image") && parsed.image !== undefined) {
                filtered.image = parsed.image;
              }
              if (fields.includes("link") && parsed.link !== undefined) {
                filtered.link = parsed.link;
              }
              // 如果过滤后为空，返回 null
              if (Object.keys(filtered).length === 0) return null;
              return filtered;
            }
          } catch (e) {}
          return val;
        } else if (col.type === "link") {
          // 纯链接列：只有勾选超链接才导出
          if (fields.includes("link")) {
            return val;
          }
          return null;
        } else if (col.type === "image") {
          // 纯图片列：只有勾选图片才导出
          if (fields.includes("image")) {
            return val;
          }
          return null;
        } else {
          // 普通文本列：只有勾选文字才导出
          if (fields.includes("text")) {
            return val;
          }
          return null;
        }
      });
      // 过滤掉 null
      jsonData[col.name] = parsedData.filter(function (item) {
        return item !== null;
      });
    });

    // 检查是否有数据
    var hasData = false;
    for (var key in jsonData) {
      if (jsonData[key].length > 0) {
        hasData = true;
        break;
      }
    }
    if (!hasData) {
      showConfirmModal("提示", "没有数据可导出", function () {
        hideConfirmModal();
      });
      return;
    }

    var jsonStr = JSON.stringify(jsonData, null, 2);
    var blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download =
      "采集数据_原始_" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  // ===== HTML 模板生成 =====
  function generateHTMLTemplate(headers, rows) {
    var now = new Date();
    var timeStr = now.toLocaleString("zh-CN");
    var url = location.href;

    // 表格行
    var tableRows = rows
      .map(function (row) {
        return (
          "<tr>" +
          row
            .map(function (cell) {
              return "<td>" + cell + "</td>";
            })
            .join("") +
          "</tr>"
        );
      })
      .join("");

    // 表头
    var headerHtml = headers
      .map(function (h) {
        return "<th>" + h + "</th>";
      })
      .join("");

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>数据采集导出 - ${timeStr}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #0f0f12;
      color: #e8e8e8;
      padding: 20px;
      min-height: 100vh;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 16px 20px;
      background: rgba(255,255,255,0.04);
      border-radius: 12px;
      margin-bottom: 20px;
      border: 1px solid rgba(255,255,255,0.06);
      flex-wrap: wrap;
      gap: 12px;
    }
    .header-left h1 {
      font-size: 20px;
      font-weight: 600;
      color: #fff;
      letter-spacing: 0.5px;
    }
    .header-left .meta {
      font-size: 12px;
      color: rgba(255,255,255,0.4);
      margin-top: 4px;
    }
    .header-left .meta span {
      margin-right: 16px;
    }
    .header-right {
      display: flex;
      gap: 12px;
      align-items: center;
      font-size: 12px;
      color: rgba(255,255,255,0.4);
    }
    .badge {
      display: inline-block;
      padding: 2px 12px;
      border-radius: 12px;
      font-size: 11px;
      background: rgba(96,165,250,0.15);
      color: #60a5fa;
      border: 1px solid rgba(96,165,250,0.2);
    }
    .table-wrapper {
      background: rgba(255,255,255,0.03);
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.06);
      overflow: hidden;
    }
    .table-scroll {
      overflow: auto;
      max-height: 75vh;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    thead {
      position: sticky;
      top: 0;
      z-index: 10;
    }
    th {
      background: #1a1a20;
      padding: 10px 14px;
      text-align: left;
      font-weight: 600;
      color: rgba(255,255,255,0.8);
      border-bottom: 2px solid rgba(96,165,250,0.2);
      white-space: nowrap;
      font-size: 12px;
      letter-spacing: 0.3px;
    }
    td {
      padding: 8px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      color: rgba(255,255,255,0.85);
      word-break: break-word;
      vertical-align: middle;
      line-height: 1.5;
      max-width: 300px;
    }
    td a {
      color: #60a5fa;
      text-decoration: none;
      word-break: break-all;
    }
    td a:hover {
      text-decoration: underline;
    }
    tr:hover td {
      background: rgba(96,165,250,0.04);
    }
    .row-number {
      color: rgba(255,255,255,0.25);
      font-size: 11px;
      text-align: center;
      min-width: 36px;
      font-variant-numeric: tabular-nums;
    }
    .footer {
      padding: 12px 20px;
      font-size: 11px;
      color: rgba(255,255,255,0.25);
      border-top: 1px solid rgba(255,255,255,0.04);
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: rgba(255,255,255,0.3);
    }
    .empty-state .icon {
      font-size: 48px;
      margin-bottom: 12px;
      opacity: 0.4;
    }
    .empty-state .text {
      font-size: 14px;
    }
    @media (max-width: 600px) {
      body { padding: 10px; }
      th, td { padding: 6px 8px; font-size: 12px; }
      .header { flex-direction: column; align-items: flex-start; }
      .header-left h1 { font-size: 17px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <h1>数据采集导出</h1>
        <div class="meta">
          <span>导出时间: ${timeStr}</span>
          <span>来源: ${url}</span>
          <span class="badge">${headers.length} 列 · ${rows.length} 行</span>
        </div>
      </div>
      <div class="header-right">
        <span>数据采集</span>
      </div>
    </div>

    <div class="table-wrapper">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th class="row-number">#</th>
              ${headerHtml}
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(function (row, idx) {
                return (
                  "<tr><td class='row-number'>" +
                  (idx + 1) +
                  "</td>" +
                  row
                    .map(function (cell) {
                      return "<td>" + cell + "</td>";
                    })
                    .join("") +
                  "</tr>"
                );
              })
              .join("")}
          </tbody>
        </table>
      </div>
      <div class="footer">
        <span>共 ${rows.length} 行数据</span>
        <span>由 网页控制大师 导出 · 数据仅供个人参考</span>
      </div>
    </div>
  </div>
</body>
</html>`;
  }
  // ===== 导出功能添加完毕 =====

  // ===== 替换 dcUpdateStatus 函数 =====
  function dcUpdateStatus() {
    var totalRows = 0;
    dcState.columns.forEach(function (col) {
      var data = dcState.columnData[col.id] || [];
      if (data.length > totalRows) totalRows = data.length;
    });

    document.getElementById("nopic-dc-row-count").textContent =
      "数据: " + totalRows + " 行";
    document.getElementById("nopic-dc-col-count").textContent =
      "字段: " + dcState.columns.length + " 列";
  }
  // ===== 替换结束 =====

  function dcClearTable() {
    var totalRows = 0;
    dcState.columns.forEach(function (col) {
      totalRows += (dcState.columnData[col.id] || []).length;
    });

    if (totalRows === 0 && dcState.columns.length === 0) return;

    showConfirmModal("确认清空", "确定清空所有数据和列吗？", function () {
      dcState.columns = [];
      dcState.columnData = {};
      dcRenderTable();
      dcSaveCache();
      hideConfirmModal();
    });
  }

  // ===== 按钮事件绑定 =====
  document
    .getElementById("nopic-dc-pick-btn")
    .addEventListener("click", dcStartPick);
  document
    .getElementById("nopic-dc-clear-btn")
    .addEventListener("click", dcClearTable);

  document
    .getElementById("nopic-dc-start-btn")
    .addEventListener("click", dcStartWatching);
  document
    .getElementById("nopic-dc-stop-btn")
    .addEventListener("click", dcStopWatching);

  // 初始化渲染
  dcRenderTable();

  // 页面卸载时清理 observer，但不重置采集状态（以便翻页/刷新后继续采集）
  window.addEventListener("beforeunload", function () {
    // 仅断开 observer，不调用 dcStopWatching，避免把 isWatching 置为 false
    if (dcState.observer) {
      try {
        dcState.observer.disconnect();
      } catch (e) {}
      dcState.observer = null;
    }
    if (dcState._watchTimer) {
      clearTimeout(dcState._watchTimer);
      dcState._watchTimer = null;
    }
    // 确保最新的采集/窗口状态已持久化
    dcSaveCache();
  });

  // ===== 持续抓取功能 =====
  function dcStartWatching() {
    if (dcState.isWatching) return;
    if (dcState.columns.length === 0) {
      return;
    }

    dcState.isWatching = true;
    document.getElementById("nopic-dc-start-btn").style.display = "none";
    document.getElementById("nopic-dc-stop-btn").style.display = "";

    // 创建 MutationObserver
    dcState.observer = new MutationObserver(function (mutations) {
      // 节流：每500ms最多检查一次
      if (dcState._watchTimer) return;
      dcState._watchTimer = setTimeout(function () {
        dcState._watchTimer = null;
        dcCheckNewData();
      }, 500);
    });

    dcState.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    // 持久化采集状态（翻页/刷新后自动恢复采集）
    dcSaveCache();
  }

  function dcStopWatching() {
    dcState.isWatching = false;
    if (dcState.observer) {
      dcState.observer.disconnect();
      dcState.observer = null;
    }
    if (dcState._watchTimer) {
      clearTimeout(dcState._watchTimer);
      dcState._watchTimer = null;
    }
    document.getElementById("nopic-dc-start-btn").style.display = "";
    document.getElementById("nopic-dc-stop-btn").style.display = "none";
    // 持久化停止状态
    dcSaveCache();
  }

  // ===== 跨页面/刷新后自动恢复采集状态 =====
  // 若上一页（同域名）已打开抓取窗口或正在采集，则在新页面自动恢复
  _dcRestoring = true;
  try {
    if (dcState._savedSubmenuOpen) {
      showDCSubmenu();
    }
    if (dcState._savedIsWatching && dcState.columns.length > 0) {
      // 延迟启动，确保页面 DOM（尤其是 document.body）已就绪
      var _restoreWatching = function () {
        try {
          if (!document.body) {
            // body 尚未就绪，等待 DOMContentLoaded 后再试
            document.addEventListener("DOMContentLoaded", function once() {
              document.removeEventListener("DOMContentLoaded", once);
              _restoreWatching();
            });
            return;
          }
          // 恢复保存操作，让 dcStartWatching 内的 dcSaveCache 正常持久化
          _dcRestoring = false;
          dcStartWatching();
          // 启动后立即检查一次，抓取当前页已有数据
          dcCheckNewData();
        } catch (e) {
          _dcRestoring = false;
          console.warn("[nopic] 恢复采集状态失败:", e);
        }
      };
      setTimeout(_restoreWatching, 800);
    } else {
      _dcRestoring = false;
    }
    // 清除暂存标记，避免重复恢复
    delete dcState._savedSubmenuOpen;
    delete dcState._savedIsWatching;
  } catch (e) {
    _dcRestoring = false;
    console.warn("[nopic] 恢复数据采集状态出错:", e);
  }

  // ===== 替换整个 dcCheckNewData 函数 =====
  function dcCheckNewData() {
    if (dcState.columns.length === 0 || !dcState.isWatching) return;

    var anyNew = false;
    var newElsForAnim = [];
    var animSeen = new Set();

    dcState.columns.forEach(function (col) {
      if (!col.sampleSignature) return;

      var matchedElements = [];
      try {
        var candidates = document.querySelectorAll(col.sampleSignature);
        candidates.forEach(function (el) {
          if (
            !el.closest("#nopic-datacollect-submenu") &&
            !el.closest("#nopic-widget") &&
            !el.closest("#nopic-menu") &&
            !el.closest("#nopic-zoom-container")
          ) {
            matchedElements.push(el);
          }
        });
      } catch (e) {
        console.log("[数据采集] 列 '" + col.name + "' 匹配出错:", e);
        return;
      }

      // 按垂直位置排序
      matchedElements.sort(function (a, b) {
        return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
      });

      var existingData = dcState.columnData[col.id] || [];
      var newData = [];

      // ===== 关键：按元素身份去重，而非按数量 =====
      // 已被采集过的元素（在 WeakSet 中）跳过；只采集新元素
      matchedElements.forEach(function (el) {
        if (dcIsCollected(el, col)) return;
        newData.push(dcExtractValue(el, col));
        dcMarkCollected(el, col);
        if (!animSeen.has(el)) {
          animSeen.add(el);
          newElsForAnim.push(el);
        }
      });

      if (newData.length > 0) {
        dcState.columnData[col.id] = existingData.concat(newData);
        anyNew = true;
        console.log(
          "[数据采集] 列 '" + col.name + "' 新增:",
          newData.length,
          "条",
        );
      }
    });

    if (anyNew) {
      dcRenderTable();
      dcSaveCache();
      // 新增抓取元素时重复全套动画
      dcAnimateCollect(newElsForAnim);
    }
  }

  // ===== 替换文字规则列表更新 =====

  settingsTrigger.addEventListener("mouseenter", () => {
    showSettingsSubmenu();
    hideDisplaySubmenu();
    hideDisguiseSubmenu();
    // 拓展菜单是点击方式，不自动关闭
  });
  settingsSubmenu.addEventListener("mouseenter", showSettingsSubmenu);

  // 拓展菜单事件
  disguiseTrigger.addEventListener("mouseenter", () => {
    showDisguiseSubmenu();
    hideSettingsSubmenu();
    // 拓展菜单是点击方式，不自动关闭
  });
  disguiseSubmenu.addEventListener("mouseenter", showDisguiseSubmenu);

  // 鼠标移到"显示内容"上展开三级菜单
  displayTrigger.addEventListener("mouseenter", showDisplaySubmenu);
  displaySubmenu.addEventListener("mouseenter", showDisplaySubmenu);

  menu.addEventListener("mouseleave", () => {
    setTimeout(() => {
      // 如果输入框正在聚焦，不关闭菜单
      if (customTitleInput && document.activeElement === customTitleInput) {
        return;
      }
      // 如果正在使用输入法输入，不关闭菜单
      if (isComposing) return;
      // 检查拓展菜单的输入框是否聚焦
      const maskColorInput = document.getElementById("nopic-mask-color-input");
      const textReplaceInputs = textReplaceSubmenu.querySelectorAll("input");
      let isInputFocused = false;
      textReplaceInputs.forEach((input) => {
        if (document.activeElement === input) isInputFocused = true;
      });
      if (maskColorInput && document.activeElement === maskColorInput)
        isInputFocused = true;
      if (isInputFocused) return;

      // 如果二级弹窗（如文字替换、强力复制等）处于打开状态，不关闭菜单
      if (
        tabDisguiseSubmenuOpen ||
        maskSubmenuOpen ||
        privacyLockSubmenuOpen ||
        textReplaceSubmenuOpen ||
        autoClickerSubmenuOpen ||
        pageEditSubmenuOpen ||
        forceCopySubmenuOpen ||
        quickTextSubmenuOpen
      ) {
        return;
      }

      if (
        !menu.matches(":hover") &&
        !settingsSubmenu.matches(":hover") &&
        !displaySubmenu.matches(":hover") &&
        !disguiseSubmenu.matches(":hover") &&
        !maskSubmenu.matches(":hover") &&
        !tabDisguiseSubmenu.matches(":hover") &&
        !privacyLockSubmenu.matches(":hover") &&
        !textReplaceSubmenu.matches(":hover") &&
        !autoClickerSubmenu.matches(":hover") &&
        !pageEditSubmenu.matches(":hover") &&
        !quickTextSubmenu.matches(":hover")
      ) {
        hideSettingsSubmenu();
        hideDisguiseSubmenu();
        // 拓展菜单是点击方式，不自动关闭
      }
    }, 100);
  });
  settingsSubmenu.addEventListener("mouseleave", () => {
    setTimeout(() => {
      if (
        !settingsSubmenu.matches(":hover") &&
        !displaySubmenu.matches(":hover") &&
        !settingsTrigger.matches(":hover")
      ) {
        hideSettingsSubmenu();
      }
    }, 100);
  });
  displaySubmenu.addEventListener("mouseleave", () => {
    setTimeout(() => {
      if (
        !displaySubmenu.matches(":hover") &&
        !displayTrigger.matches(":hover")
      ) {
        hideDisplaySubmenu();
      }
    }, 100);
  });
  disguiseSubmenu.addEventListener("mouseleave", () => {
    setTimeout(() => {
      // 如果输入框正在聚焦，不关闭菜单
      if (customTitleInput && document.activeElement === customTitleInput) {
        return;
      }
      if (
        !disguiseSubmenu.matches(":hover") &&
        !disguiseTrigger.matches(":hover")
      ) {
        hideDisguiseSubmenu();
      }
    }, 100);
  });

  document.addEventListener("keydown", (e) => {
    // PIN码输入监听（隐私锁）
    if (privacyLockRuntime.isLocked && pinInputState.isActive) {
      if (e.key === "Backspace" || (e.key >= "0" && e.key <= "9")) {
        e.preventDefault();
        e.stopPropagation();
        handlePinInput(e.key);
        return;
      }
      if (e.key === "Escape") {
        // ESC取消PIN，回到上拉状态
        pinInputState.isActive = false;
        const pinArea = document.getElementById("nopic-lock-pin-area");
        if (pinArea) pinArea.style.display = "none";
        const wrapper = document.getElementById("nopic-lock-wrapper");
        const hint = document.getElementById("nopic-lock-hint");
        const arrow = document.querySelector(".nopic-privacy-lock-arrow");
        if (hint) {
          hint.style.opacity = "1";
          hint.textContent = "上拉以解锁";
        }
        if (arrow) arrow.style.opacity = "1";
        wrapper.style.transition =
          "transform 0.5s cubic-bezier(0.34, 1.0, 0.64, 1)";
        wrapper.style.transform = "translateY(0)";
        return;
      }
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.key.toLowerCase() === "h") {
      isUISelfHidden = !isUISelfHidden;
      widget.style.display = isUISelfHidden ? "none" : "flex";
      if (!isUISelfHidden) {
        triggerHoverOn();
        const list = getPermaHiddenSites().filter((h) => h !== location.host);
        setPermaHiddenSites(list);
        updateContent(); // ← 加这一行
      }
    }
  });

  function triggerHoverOn() {
    clearTimeout(hoverTimer);
    isHovering = true;
    menu.classList.add("active");
  }
  function triggerHoverOff() {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      // 如果输入框正在聚焦，不关闭菜单
      if (customTitleInput && document.activeElement === customTitleInput) {
        return;
      }
      isHovering = false;
      menu.classList.remove("active");
      // 关闭一级子菜单（设置、显示内容、拓展），二级弹窗有自己的关闭按钮，不自动关闭
      settingsSubmenu.style.display = "none";
      displaySubmenu.style.display = "none";
      disguiseSubmenu.style.display = "none";
    }, 300);
  }
  widget.addEventListener("mouseenter", triggerHoverOn);
  widget.addEventListener("mouseleave", triggerHoverOff);
  menu.addEventListener("mouseenter", triggerHoverOn);
  menu.addEventListener("mouseleave", triggerHoverOff);

  widget.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    mouseDownTime = Date.now();
    startMouseX = e.clientX;
    startMouseY = e.clientY;
    startElemX = widget.offsetLeft;
    startElemY = widget.offsetTop;
    widget.classList.add("dragging");

    // 新增：清除 right，避免和 left 拉扯导致宽度异常
    widget.style.right = "auto";

    menu.classList.remove("active");
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    let newLeft = Math.max(
      0,
      Math.min(
        window.innerWidth - widget.offsetWidth,
        startElemX + e.clientX - startMouseX,
      ),
    );
    let newTop = Math.max(
      0,
      Math.min(
        window.innerHeight - widget.offsetHeight,
        startElemY + e.clientY - startMouseY,
      ),
    );
    widget.style.left = newLeft + "px";
    widget.style.top = newTop + "px";
  });
  document.addEventListener("mouseup", (e) => {
    if (!isDragging) return;
    isDragging = false;
    widget.classList.remove("dragging");
    let isClick =
      Date.now() - mouseDownTime < 200 &&
      Math.abs(e.clientX - startMouseX) < 5 &&
      Math.abs(e.clientY - startMouseY) < 5;
    if (isClick) {
      if (window.imgHidenSet === null) {
        // ===== 新增：重置关闭标志，允许重新开启 =====
        window._nopicManuallyClosed = false;

        imgHiden();
        window.imgHidenSet = setInterval(imgHiden, 500);
        let list = (localStorage.getItem("nopicValueList") || "")
          .split(",")
          .filter((x) => x);
        if (!list.includes(location.host)) {
          list.push(location.host);
          localStorage.setItem("nopicValueList", list.join(","));
        }
      } else {
        clearInterval(window.imgHidenSet);
        window.imgHidenSet = null;
        imgShown();
        let list = (localStorage.getItem("nopicValueList") || "")
          .split(",")
          .filter((v) => v !== location.host && v);
        localStorage.setItem("nopicValueList", list.join(","));
      }
      updateLampState();
      updateAllUI();
      updateContent();
    }
    localStorage.setItem(
      "nopicPanelXOffset",
      widget.offsetLeft - window.innerWidth / 2,
    );
    localStorage.setItem(
      "nopicPanelYOffset",
      widget.offsetTop - window.innerHeight / 2,
    );
    // 新增：先清除 right，让 applySnapPosition 正常计算 left
    widget.style.right = "auto";
    if (autoSnapConfig) applySnapPosition(false);
    if (isHovering) menu.classList.add("active");
  });

  function syncMenu() {
    if (menu.classList.contains("active")) {
      const wRect = widget.getBoundingClientRect();
      const mWidth = 220;
      const mHeight = menu.offsetHeight || 200;

      // 判断菜单应该显示在左侧还是右侧
      const showOnRight = wRect.right + 10 + mWidth < window.innerWidth;

      // 清除之前的 right/left 设置
      menu.style.left = "";
      menu.style.right = "";

      if (showOnRight) {
        // 显示在右侧
        menu.style.left = wRect.right + 10 + "px";
        menu.style.right = "auto";
      } else {
        // 显示在左侧（右侧空间不够）
        menu.style.right = window.innerWidth - wRect.left + 0 + "px";
        menu.style.left = "auto";
      }

      let menuTop = wRect.top + wRect.height / 2 - mHeight / 2;
      if (menuTop < 10) menuTop = 10;
      if (menuTop + mHeight > window.innerHeight - 10)
        menuTop = window.innerHeight - mHeight - 10;
      menu.style.top = menuTop + "px";
    }
    requestAnimationFrame(syncMenu);
  }
  syncMenu();

  if (
    (localStorage.getItem("nopicValueList") || "")
      .split(",")
      .includes(location.host)
  ) {
    setTimeout(() => {
      imgHiden();
      window.imgHidenSet = setInterval(imgHiden, 500);
      updateLampState();
      updateAllUI(); // 新增：切换灯状态时刷新UI，动态显隐放大选项
      updateContent();
    }, 50);
  }
  // 检查是否被永久隐藏
  if (getPermaHiddenSites().includes(location.host)) {
    isUISelfHidden = true;
    widget.style.display = "none";
  }
  window.addEventListener("resize", () => {
    if (window.imgHidenSet)
      imageControls.forEach((btn, el) => syncElementPosition(el));
    if (autoSnapConfig) applySnapPosition(false);
  });

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.removedNodes) {
        if (node === widget || node === menu) {
          if (!document.getElementById("nopic-widget"))
            document.documentElement.appendChild(widget);
          if (!document.getElementById("nopic-menu"))
            document.documentElement.appendChild(menu);
          break;
        }
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // ===== 网页隐私锁功能实现 =====
  let privacyLockTimeoutTimer = null;
  let privacyLockLastActivity = Date.now();

  function updateLockTime() {
    const appearance = getLockAppearanceConfig();

    // 应用背景色和文字色
    const bg = document.getElementById("nopic-lock-bg");
    const wrapper = document.getElementById("nopic-lock-wrapper");
    const timeEl = document.getElementById("nopic-lock-time");
    const subEl = document.getElementById("nopic-lock-sub");

    if (bg) bg.style.setProperty("background", appearance.bgColor, "important");
    if (wrapper)
      wrapper.style.setProperty("background", appearance.bgColor, "important");
    if (timeEl)
      timeEl.style.setProperty("color", appearance.textColor, "important");
    if (subEl)
      subEl.style.setProperty(
        "color",
        appearance.textColor + "80",
        "important",
      );

    // 更新时间文字
    const formatted = formatLockTime(
      appearance.timeFormat,
      appearance.customText,
    );
    if (timeEl) timeEl.textContent = formatted;

    // 如果有自定义文字且格式里没用到，显示在副标题
    if (subEl) {
      const hasCustom = appearance.timeFormat.includes("{自定义}");
      if (appearance.customText && !hasCustom) {
        subEl.textContent = appearance.customText;
        subEl.style.display = "block";
      } else {
        subEl.style.display = "none";
      }
    }
  }

  // 隐私锁拖动状态
  // 隐私锁拖动状态
  let lockDragState = {
    isDragging: false,
    startY: 0,
    currentY: 0,
    isUnlocking: false,
  };

  function initLockDrag() {
    const wrapper = document.getElementById("nopic-lock-wrapper");
    if (!wrapper) return;

    wrapper.removeEventListener("mousedown", onLockDragStart);
    wrapper.removeEventListener("touchstart", onLockDragStartTouch);
    document.removeEventListener("mousemove", onLockDragMove);
    document.removeEventListener("mouseup", onLockDragEnd);
    document.removeEventListener("touchmove", onLockDragMoveTouch);
    document.removeEventListener("touchend", onLockDragEndTouch);

    wrapper.addEventListener("mousedown", onLockDragStart);
    wrapper.addEventListener("touchstart", onLockDragStartTouch, {
      passive: true,
    });
    document.addEventListener("mousemove", onLockDragMove);
    document.addEventListener("mouseup", onLockDragEnd);
    document.addEventListener("touchmove", onLockDragMoveTouch, {
      passive: false,
    });
    document.addEventListener("touchend", onLockDragEndTouch);
  }

  function onLockDragStart(e) {
    if (e.button !== 0) return;
    const wrapper = document.getElementById("nopic-lock-wrapper");
    if (!wrapper) return;
    if (wrapper.classList.contains("unlocked")) return;

    lockDragState.isDragging = true;
    lockDragState.startY = e.clientY;
    lockDragState.wrapper = wrapper;
    wrapper.classList.add("dragging");
    lockDragState.isUnlocking = false;
  }

  function onLockDragStartTouch(e) {
    const touch = e.touches[0];
    const wrapper = document.getElementById("nopic-lock-wrapper");
    if (!wrapper) return;
    if (wrapper.classList.contains("unlocked")) return;

    lockDragState.isDragging = true;
    lockDragState.startY = touch.clientY;
    lockDragState.wrapper = wrapper;
    wrapper.classList.add("dragging");
    lockDragState.isUnlocking = false;
  }

  function onLockDragMove(e) {
    if (!lockDragState.isDragging) return;
    e.preventDefault();
    const dy = e.clientY - lockDragState.startY;
    updateLockDragPosition(dy);
  }

  function onLockDragMoveTouch(e) {
    if (!lockDragState.isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    const dy = touch.clientY - lockDragState.startY;
    updateLockDragPosition(dy);
  }

  function updateLockDragPosition(dy) {
    const wrapper = lockDragState.wrapper;
    if (!wrapper) return;

    let newY = (dy / window.innerHeight) * 100;
    newY = Math.max(-100, Math.min(0, newY));

    const progress = Math.max(0, Math.min(1, -newY / 100));

    const hint = document.getElementById("nopic-lock-hint");
    const arrow = document.querySelector(".nopic-privacy-lock-arrow");

    const opacityAmount = Math.max(0, 1 - progress * 2);

    if (hint) {
      hint.style.opacity = opacityAmount;
      if (progress < 0.3) {
        hint.textContent = "上拉以解锁";
      } else if (progress < 0.6) {
        hint.textContent = "松手解锁";
      }
    }

    if (arrow) {
      arrow.style.opacity = opacityAmount;
    }

    // 背景透明度：有密码时始终保持纯黑，无密码时随进度变透明
    const bg = document.getElementById("nopic-lock-bg");
    if (bg) {
      const effective = getEffectivePrivacyLock();
      const hasPassword = effective.password && effective.password.length === 4;

      if (hasPassword) {
        bg.style.setProperty("background", "rgba(0,0,0,1)", "important");
      } else {
        bg.style.setProperty(
          "background",
          `rgba(0,0,0,${1 - progress})`,
          "important",
        );
      }
    }

    wrapper.style.transform = `translateY(${newY}%)`;
    lockDragState.currentY = newY;
  }

  function onLockDragEnd(e) {
    if (!lockDragState.isDragging) return;
    const wrapper = lockDragState.wrapper;
    if (wrapper) wrapper.classList.remove("dragging");

    const currentY = lockDragState.currentY || 0;
    lockDragState.isDragging = false;

    if (currentY < -20) {
      attemptLockUnlock();
    } else {
      wrapper.style.transition =
        "transform 0.5s cubic-bezier(0.34, 1.0, 0.64, 1)";
      wrapper.style.transform = "translateY(0)";
      const hint = document.getElementById("nopic-lock-hint");
      const arrow = document.querySelector(".nopic-privacy-lock-arrow");
      if (hint) {
        hint.style.opacity = "1";
        hint.textContent = "上拉以解锁";
      }
      if (arrow) {
        arrow.style.opacity = "1";
      }
      const bg = document.getElementById("nopic-lock-bg");
      if (bg) {
        const effective = getEffectivePrivacyLock();
        const hasPassword =
          effective.password && effective.password.length === 4;
        bg.style.background = hasPassword ? "rgba(0,0,0,1)" : "rgba(0,0,0,1)";
      }
      setTimeout(() => {
        wrapper.style.transition = "";
      }, 550);
    }
    lockDragState.wrapper = null;
  }

  function onLockDragEndTouch(e) {
    onLockDragEnd(e);
  }

  // 显示锁定遮罩
  function showPrivacyLockOverlay() {
    // 记录当前是锁屏状态，刷新后保持
    sessionStorage.setItem("nopic_was_locked_" + location.host, "true");
    if (!nopicGetToggleState("nopic_privacylock", true)) return;
    if (privacyLockRuntime.isLocked) return;

    // 阻止页面滚动
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    privacyLockOverlay.classList.add("active");
    privacyLockRuntime.isLocked = true;
    privacyLockRuntime.pinAttempts = 0;
    privacyLockRuntime.pinInput = "";

    const wrapper = document.getElementById("nopic-lock-wrapper");
    const hint = document.getElementById("nopic-lock-hint");
    const arrow = document.querySelector(".nopic-privacy-lock-arrow");
    const bg = document.getElementById("nopic-lock-bg");

    wrapper.classList.remove("unlocked", "dragging");
    wrapper.style.transition = "none";
    wrapper.style.transform = "translateY(-100%)";

    if (hint) {
      hint.style.opacity = "1";
      hint.textContent = "上拉以解锁";
    }
    if (arrow) {
      arrow.style.opacity = "1";
    }
    if (bg) {
      bg.style.transition = "none";
      const app = getLockAppearanceConfig();
      bg.style.background = app.bgColor;
    }

    updateLockTime();
    if (privacyLockRuntime._clockInterval)
      clearInterval(privacyLockRuntime._clockInterval);
    // ★★★ 使用 requestAnimationFrame 精确同步（和显示内容一样） ★★★
    let lastLockSecond = -1;

    function lockTimeLoop() {
      if (!privacyLockRuntime.isLocked) return;

      const now = new Date();
      const currentSecond = now.getSeconds();

      // 关键：秒数变化时才更新
      if (currentSecond !== lastLockSecond) {
        updateLockTime();
        lastLockSecond = currentSecond;
      }

      privacyLockRuntime._clockInterval = requestAnimationFrame(lockTimeLoop);
    }

    // 立即执行一次
    updateLockTime();
    lastLockSecond = new Date().getSeconds();
    privacyLockRuntime._clockInterval = requestAnimationFrame(lockTimeLoop);

    requestAnimationFrame(() => {
      wrapper.style.transition =
        "transform 0.7s cubic-bezier(0.34, 1.0, 0.64, 1)";
      wrapper.style.transform = "translateY(0)";
    });

    setTimeout(initLockDrag, 300);
    addPrivacyLog("lock", true);
  }
  // 隐藏锁定遮罩
  function hidePrivacyLockOverlay(animate = true) {
    sessionStorage.removeItem("nopic_was_locked_" + location.host);

    // 注意：这里不再弹窗，由 initPrivacyLock 负责在页面加载时弹窗
    // 但为了兼容跳过解锁后立即弹窗，保留此逻辑但不要重复
    // 实际上跳过解锁后立即弹窗的逻辑已经在 handlePinInput 和 forgot-btn 中处理了

    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";

    const wrapper = document.getElementById("nopic-lock-wrapper");
    const pinArea = document.getElementById("nopic-lock-pin-area");

    pinInputState.isActive = false;
    pinInputState.value = "";
    if (pinArea) pinArea.style.display = "none";

    if (animate) {
      wrapper.style.transition = "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)";
      wrapper.style.transform = "translateY(-100%)";
      wrapper.classList.add("unlocked");

      setTimeout(() => {
        privacyLockOverlay.classList.remove("active");
        privacyLockRuntime.isLocked = false;
        privacyLockRuntime.pinInput = "";
        wrapper.style.transition = "none";
        wrapper.style.transform = "translateY(-100%)";
        wrapper.classList.remove("unlocked");
        const hint = document.getElementById("nopic-lock-hint");
        const arrow = document.querySelector(".nopic-privacy-lock-arrow");
        if (hint) {
          hint.style.filter = "blur(0px)";
          hint.style.opacity = "1";
          hint.textContent = "上拉以解锁";
          hint.style.color = "rgba(255,255,255,0.5)";
        }
        if (arrow) {
          arrow.style.filter = "blur(0px)";
          arrow.style.opacity = "1";
        }
      }, 550);
    } else {
      privacyLockOverlay.classList.remove("active");
      privacyLockRuntime.isLocked = false;
      privacyLockRuntime.pinInput = "";
      wrapper.style.transition = "none";
      wrapper.style.transform = "translateY(-100%)";
      wrapper.classList.remove("unlocked");
      const hint = document.getElementById("nopic-lock-hint");
      const arrow = document.querySelector(".nopic-privacy-lock-arrow");
      if (hint) {
        hint.style.filter = "blur(0px)";
        hint.style.opacity = "1";
        hint.textContent = "上拉以解锁";
        hint.style.color = "rgba(255,255,255,0.5)";
      }
      if (arrow) {
        arrow.style.filter = "blur(0px)";
        arrow.style.opacity = "1";
      }
    }

    if (privacyLockRuntime._clockInterval) {
      cancelAnimationFrame(privacyLockRuntime._clockInterval);
      privacyLockRuntime._clockInterval = null;
    }
    privacyLockLastActivity = Date.now();
  }

  // 尝试解锁
  function attemptPrivacyUnlock(password) {
    const effective = getEffectivePrivacyLock();

    // 检查密码是否匹配
    if (
      password === effective.password &&
      effective.password &&
      effective.password.length === 4
    ) {
      // 密码解锁成功 - 清除所有待重置标志
      localStorage.removeItem("nopic_pending_password_reset_" + location.host);
      window._nopicResetAcknowledged = false;

      hidePrivacyLockOverlay();
      if (privacyLockRuntime.forgotUnlockTime) {
        privacyLockRuntime.forgotUnlockTime = null;
      }
      addPrivacyLog("password_unlock", true);
      return true;
    } else {
      const errorEl = document.getElementById("nopic-privacy-lock-error");
      if (errorEl) errorEl.classList.add("show");
      addPrivacyLog("password_wrong", false);
      return false;
    }
  }

  // 启动上锁监听器 (适配新三列配置读取)
  function startPrivacyLockListeners() {
    stopPrivacyLockListeners();
    if (!nopicGetToggleState("nopic_privacylock", true)) return;

    const effective = getEffectivePrivacyLock();

    if (effective.lockMode === "blur") {
      window.addEventListener("blur", showPrivacyLockOverlay);
    }

    if (effective.lockMode === "timeout") {
      privacyLockLastActivity = Date.now();
      let lastUpdate = 0;
      const throttledUpdate = () => {
        const now = Date.now();
        if (now - lastUpdate > 5000) {
          privacyLockLastActivity = Date.now();
          lastUpdate = now;
        }
      };
      window._nopicPrivacyLockThrottledUpdate = throttledUpdate;
      ["mousemove", "keydown", "click", "scroll"].forEach((event) => {
        document.addEventListener(event, throttledUpdate, { passive: true });
      });

      privacyLockTimeoutTimer = setInterval(() => {
        const elapsed = (Date.now() - privacyLockLastActivity) / 60000;
        if (elapsed >= effective.timeoutMinutes) {
          showPrivacyLockOverlay();
        }
      }, 10000);
    }
  }

  // 停止上锁监听器
  function stopPrivacyLockListeners() {
    window.removeEventListener("blur", showPrivacyLockOverlay);
    if (privacyLockTimeoutTimer) {
      clearInterval(privacyLockTimeoutTimer);
      privacyLockTimeoutTimer = null;
    }
    if (window._nopicPrivacyLockThrottledUpdate) {
      ["mousemove", "keydown", "click", "scroll"].forEach((event) => {
        document.removeEventListener(
          event,
          window._nopicPrivacyLockThrottledUpdate,
        );
      });
      window._nopicPrivacyLockThrottledUpdate = null;
    }
  }

  // 解锁按钮点击
  const unlockBtn = document.getElementById("nopic-privacy-unlock-btn");
  if (unlockBtn) {
    unlockBtn.addEventListener("click", () => {
      const unlockPasswordInput = document.getElementById(
        "nopic-privacy-unlock-password",
      );
      if (unlockPasswordInput.style.display !== "none") {
        attemptPrivacyUnlock(unlockPasswordInput.value);
      } else {
        attemptPrivacyUnlock("");
      }
    });
  }

  // 密码输入框回车
  const unlockPasswordInput = document.getElementById(
    "nopic-privacy-unlock-password",
  );
  if (unlockPasswordInput) {
    unlockPasswordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        attemptPrivacyUnlock(unlockPasswordInput.value);
      }
    });
  }

  // 初始化时检查是否需要显示锁定遮罩
  function initPrivacyLock() {
    // 检测待重置密码标志
    var pendingReset = localStorage.getItem(
      "nopic_pending_password_reset_" + location.host,
    );

    // 【关键修复】无论是否锁定，只要存在待重置标志，就弹出安全警告
    if (pendingReset === "true") {
      // 延迟弹出，确保页面加载完成
      setTimeout(function () {
        showConfirmModal(
          "⚠️ 安全警告",
          '检测到您曾使用"忘记密码跳过解锁"功能，当前密码尚未重置。请立即在隐私锁设置中重置密码，以保护页面安全。',
          function () {
            // 用户点击"我知道了" - 只关闭弹窗，不清除标志
            hideConfirmModal();
          },
        );
        // 修改确认按钮样式
        var confirmBtn = document.querySelector(
          "#nopic-confirm-modal .nopic-confirm-btn.danger",
        );
        if (confirmBtn) {
          confirmBtn.textContent = "我知道了";
          confirmBtn.classList.remove("danger");
          confirmBtn.classList.add("cancel");
        }
        var cancelBtn = document.querySelector(
          "#nopic-confirm-modal .nopic-confirm-btn.cancel:not(.danger)",
        );
        if (cancelBtn) cancelBtn.style.display = "none";
      }, 500); // 延迟500ms确保DOM已加载
    }

    // 刷新时如果之前是上锁状态，则保持上锁
    var wasLocked = sessionStorage.getItem("nopic_was_locked_" + location.host);
    if (wasLocked === "true") {
      var effective = getEffectivePrivacyLock();
      if (
        effective.password &&
        effective.password.length === 4 &&
        nopicGetToggleState("nopic_privacylock", true)
      ) {
        setTimeout(function () {
          if (!privacyLockRuntime.isLocked) {
            showPrivacyLockOverlay();
          }
        }, 300);
      }
      sessionStorage.removeItem("nopic_was_locked_" + location.host);
    }

    var wrapper = document.getElementById("nopic-lock-wrapper");
    if (wrapper) {
      wrapper.style.transition = "none";
      wrapper.style.transform = "translateY(-100%)";
    }
    if (nopicGetToggleState("nopic_privacylock", true)) {
      // 移除旧的忘记密码解锁提示（已被上面的逻辑替代）
      startPrivacyLockListeners();
    }
  }
  setTimeout(initPrivacyLock, 100);

  // ===== 自动点击器功能实现 =====
  let autoClickerRecording = false;
  let autoClickerRecordingPosition = false;
  let autoClickerRecordPositionTimeout = null;
  let autoClickerRecordTimeout = null;
  let autoClickerTempStep = null;

  function updateAutoClickerFlowList() {
    const list = document.getElementById("nopic-autoclicker-flow-list");
    if (!list) return;

    if (autoClickerConfig.steps.length === 0) {
      list.innerHTML =
        '<div style="text-align:center;color:rgba(255,255,255,0.5);padding:20px;font-size:12px;">暂无步骤，点击上方按钮添加</div>';
      return;
    }

    list.innerHTML = autoClickerConfig.steps
      .map((step, index) => {
        const typeLabels = {
          delay: "⏱ 延时等待",
          wait: "⏳ 智能等待",
          click: "🖱 点击元素",
          position: "📍 点击位置",
          input: "⌨️ 输入文字",
          shortcut: "⚡ 执行快捷键",
          script: "📜 运行脚本",
        };
        const typeLabel = typeLabels[step.type] || step.type;

        let detailHtml = "";
        if (step.type === "delay") {
          detailHtml = `<div style="font-size:11px;color:rgba(255,255,255,0.5);display:flex;align-items:center;gap:6px;">
  <input type="number" class="nopic-delay-input" value="${step.value}" min="100" step="100" style="width:80px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:4px;color:#fff;font-size:11px;padding:2px 6px;text-align:right;" data-delay-id="${step.id}" data-delay-index="${index}">
  <span>毫秒</span>
</div>`;
        } else if (step.type === "wait") {
          const targetInfo =
            step.targetSelector || step.targetXpath || "等待下一步元素";
          const shortInfo =
            targetInfo.length > 25
              ? targetInfo.substring(0, 25) + "..."
              : targetInfo;
          detailHtml = `<div style="font-size:11px;color:rgba(255,255,255,0.5);display:flex;align-items:center;gap:6px;">
    <span>等待:</span>
    <span style="color:rgba(255,255,255,0.7);" title="${targetInfo}">${shortInfo}</span>
    <span style="font-size:10px;color:rgba(255,255,255,0.3);">(${step.timeout || 30}s超时)</span>
  </div>`;
        } else if (step.type === "click") {
          const selectorText = step.selector || step.xpath || "未知元素";
          const shortText =
            selectorText.length > 30
              ? selectorText.substring(0, 30) + "..."
              : selectorText;
          detailHtml = `<div style="font-size:11px;color:rgba(255,255,255,0.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${selectorText}">${shortText}</div>`;
        } else if (step.type === "position") {
          detailHtml = `<div style="font-size:11px;color:rgba(255,255,255,0.5);">X:${Math.round(step.x)} Y:${Math.round(step.y)}</div>`;
        } else if (step.type === "input") {
          const textShort =
            step.text && step.text.length > 20
              ? step.text.substring(0, 20) + "..."
              : step.text || "";
          detailHtml = `<div style="font-size:11px;color:rgba(255,255,255,0.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">输入: "${textShort}"</div>`;
        } else if (step.type === "shortcut") {
          const shortcutText = step.shortcut || "";
          detailHtml = `<div style="font-size:11px;color:rgba(255,255,255,0.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">快捷键: ${shortcutText}</div>`;
        } else if (step.type === "script") {
          const codeShort =
            step.code && step.code.length > 30
              ? step.code.substring(0, 30) + "..."
              : step.code || "";
          detailHtml = `<div style="font-size:11px;color:rgba(255,255,255,0.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace;">${codeShort}</div>`;
        }

        const borderColors = {
          delay: "#fbbf24",
          wait: "#fcd34d",
          click: "#4ade80",
          position: "#60a5fa",
          input: "#a78bfa",
          shortcut: "#22d3ee",
          script: "#f472b6",
        };
        const borderColor = borderColors[step.type] || "#888";

        return `
  <div class="nopic-autoclicker-step-item" data-step-index="${index}" style="display:flex;align-items:center;gap:8px;padding:8px;background:rgba(255,255,255,0.05);border-radius:6px;margin-bottom:6px;border-left:3px solid ${borderColor};transition:background 0.2s, transform 0.15s, opacity 0.2s;">
    <div style="display:flex;flex-direction:column;align-items:center;color:rgba(255,255,255,0.3);font-size:10px;flex-shrink:0;width:20px;user-select:none;cursor:grab;" draggable="true" class="nopic-drag-handle">
      <span>⠿</span>
      <span style="font-size:8px;margin-top:2px;">${index + 1}</span>
    </div>
    <span style="font-size:16px;flex-shrink:0;">${typeLabels[step.type].split(" ")[0]}</span>
    <div style="flex:1;min-width:0;">
      <div style="font-size:12px;color:rgba(255,255,255,0.9);">${typeLabel}</div>
      ${detailHtml}
    </div>
    <div class="nopic-mask-item-delete" data-delete-step="${index}" style="flex-shrink:0;cursor:pointer;">×</div>
  </div>
`;
      })
      .join("");

    // 绑定删除
    list.querySelectorAll("[data-delete-step]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(e.target.dataset.deleteStep);
        autoClickerConfig.steps.splice(idx, 1);
        refreshAllWaitLinks();
        updateAutoClickerFlowList();
      });
    });

    // ===== 新增：延时输入即时保存 =====
    list.querySelectorAll(".nopic-delay-input").forEach((input) => {
      input.addEventListener("input", function (e) {
        e.stopPropagation();
        const idx = parseInt(this.dataset.delayIndex);
        let val = parseInt(this.value);
        if (isNaN(val) || val < 100) val = 100;
        autoClickerConfig.steps[idx].value = val;
      });
    });

    // ===== 拖拽排序功能 =====
    let dragItem = null;
    let dragOverItem = null;
    let dragIndex = -1;
    let dragOverIndex = -1;

    list.querySelectorAll(".nopic-autoclicker-step-item").forEach((item) => {
      // 拖拽开始
      item.addEventListener("dragstart", function (e) {
        e.stopPropagation(); // 阻止冒泡到弹窗
        dragItem = this;
        dragIndex = parseInt(this.dataset.stepIndex);
        this.style.opacity = "0.4";
        this.style.transform = "scale(0.95)";
        this.style.background = "rgba(255,255,255,0.02)";
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", "");
        // 防止弹窗被拖动
        this.style.cursor = "grabbing";
      });

      // 拖拽结束
      item.addEventListener("dragend", function (e) {
        e.stopPropagation();
        this.style.opacity = "1";
        this.style.transform = "scale(1)";
        this.style.background = "";
        this.style.cursor = "grab";
        // 清除所有高亮
        list.querySelectorAll(".nopic-autoclicker-step-item").forEach((el) => {
          el.style.borderColor = "";
          el.style.background = "";
          el.style.transform = "";
          el.style.opacity = "1";
        });
        dragItem = null;
        dragOverItem = null;
        // 恢复弹窗拖动
        autoClickerSubmenu.style.cursor = "move";
      });

      // 拖拽经过
      item.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";

        if (dragItem && dragItem !== this) {
          dragOverItem = this;
          dragOverIndex = parseInt(this.dataset.stepIndex);

          // 高亮当前目标
          list
            .querySelectorAll(".nopic-autoclicker-step-item")
            .forEach((el) => {
              el.style.borderColor = "";
              el.style.background = "";
              el.style.transform = "";
            });
          this.style.borderColor = "#60a5fa";
          this.style.background = "rgba(96,165,250,0.15)";

          // 视觉指示：上下移动
          const rect = this.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if (e.clientY > midY) {
            this.style.transform = "translateY(6px)";
          } else {
            this.style.transform = "translateY(-6px)";
          }
        }
      });

      // 拖拽进入
      item.addEventListener("dragenter", function (e) {
        e.preventDefault();
        e.stopPropagation();
      });

      // 拖拽离开
      item.addEventListener("dragleave", function (e) {
        e.stopPropagation();
        if (dragItem && dragItem !== this) {
          const related = e.relatedTarget;
          if (related && this.contains(related)) return;
          this.style.borderColor = "";
          this.style.background = "";
          this.style.transform = "";
        }
      });

      // 放置
      item.addEventListener("drop", function (e) {
        e.preventDefault();
        e.stopPropagation();

        if (!dragItem || dragItem === this) {
          this.style.borderColor = "";
          this.style.background = "";
          this.style.transform = "";
          return;
        }

        const fromIndex = parseInt(dragItem.dataset.stepIndex);
        const toIndex = parseInt(this.dataset.stepIndex);

        if (fromIndex === toIndex) {
          this.style.borderColor = "";
          this.style.background = "";
          this.style.transform = "";
          return;
        }

        // 重新排序 steps 数组
        const [movedStep] = autoClickerConfig.steps.splice(fromIndex, 1);
        autoClickerConfig.steps.splice(toIndex, 0, movedStep);

        refreshAllWaitLinks(); // 添加这一行

        // 清除样式
        this.style.borderColor = "";
        this.style.background = "";
        this.style.transform = "";
        if (dragItem) {
          dragItem.style.opacity = "1";
          dragItem.style.transform = "scale(1)";
          dragItem.style.background = "";
          dragItem.style.cursor = "grab";
        }

        // 重新渲染列表
        updateAutoClickerFlowList();
      });
    });
  }

  function addDelayStep() {
    autoClickerConfig.steps.push({
      id: Date.now(),
      type: "delay",
      value: 1000,
    });
    refreshAllWaitLinks();
    updateAutoClickerFlowList();
  }

  // ===== 添加智能等待步骤 =====
  function addWaitStep() {
    const steps = autoClickerConfig.steps;

    // 直接在当前步骤后面插入一个 wait 步骤
    const waitStep = {
      id: Date.now(),
      type: "wait",
      targetSelector: "",
      targetXpath: "",
      targetType: "",
      timeout: 30000,
      _autoLinked: true, // 标记为自动关联
    };

    // 插入到末尾（用户可以通过拖拽调整位置）
    steps.push(waitStep);

    // 自动关联下一个有选择器的步骤
    autoLinkWaitStep(waitStep);

    updateAutoClickerFlowList();

    // 显示成功提示
    const panel = document.getElementById("nopic-autoclicker-status-panel");
    const textEl = document.getElementById("nopic-ac-status-text");
    if (textEl) {
      const linkedInfo =
        waitStep.targetSelector || waitStep.targetXpath || "等待下一步元素";
      textEl.textContent = `✅ 已添加智能等待，等待: "${linkedInfo.substring(0, 30)}..."`;
      textEl.style.color = "#4ade80";
      panel.classList.add("active");
      setTimeout(() => {
        panel.classList.remove("active");
      }, 2000);
    }
  }

  // ===== 自动关联 wait 步骤到下一个有选择器的步骤 =====
  function autoLinkWaitStep(waitStep) {
    const steps = autoClickerConfig.steps;
    const waitIndex = steps.indexOf(waitStep);
    if (waitIndex === -1) return;

    // 从 wait 步骤后面开始找第一个有选择器的步骤（click 或 input）
    for (let i = waitIndex + 1; i < steps.length; i++) {
      const s = steps[i];
      if (
        (s.type === "click" || s.type === "input") &&
        (s.selector || s.xpath)
      ) {
        waitStep.targetSelector = s.selector || "";
        waitStep.targetXpath = s.xpath || "";
        waitStep.targetType = s.type;
        waitStep.targetIndex = i;
        return;
      }
    }

    // 没找到，清空关联
    waitStep.targetSelector = "";
    waitStep.targetXpath = "";
    waitStep.targetType = "";
    waitStep.targetIndex = -1;
  }

  // ===== 刷新所有 wait 步骤的关联 =====
  function refreshAllWaitLinks() {
    const steps = autoClickerConfig.steps;
    steps.forEach((step, index) => {
      if (step.type === "wait" && step._autoLinked !== false) {
        // 重新从当前位置往后找
        let found = false;
        for (let i = index + 1; i < steps.length; i++) {
          const s = steps[i];
          if (
            (s.type === "click" || s.type === "input") &&
            (s.selector || s.xpath)
          ) {
            step.targetSelector = s.selector || "";
            step.targetXpath = s.xpath || "";
            step.targetType = s.type;
            step.targetIndex = i;
            found = true;
            break;
          }
        }
        if (!found) {
          step.targetSelector = "";
          step.targetXpath = "";
          step.targetType = "";
          step.targetIndex = -1;
        }
      }
    });
  }

  function addClickStep() {
    if (autoClickerRecording) return;
    autoClickerRecording = true;

    const list = document.getElementById("nopic-autoclicker-flow-list");
    if (list) {
      const tip = document.createElement("div");
      tip.id = "nopic-autoclicker-record-tip";
      tip.style.cssText =
        "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(239,68,68,0.9);color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;z-index:2147483647;pointer-events:none;";
      tip.textContent = "请在 3 秒内点击页面上的目标元素...";
      document.body.appendChild(tip);
    }

    const clickHandler = (e) => {
      if (!autoClickerRecording) return;
      // 排除点击脚本自身UI（保留对输入框的支持）
      if (
        e.target.closest("#nopic-autoclicker-submenu") ||
        e.target.closest("#nopic-widget") ||
        e.target.closest("#nopic-menu") ||
        e.target.closest("#nopic-zoom-container") ||
        e.target.closest("#nopic-parade-overlay")
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const el = e.target;

      // 尝试生成高精度CSS选择器或XPath
      let selector = "";
      let xpath = "";

      // 核心算法：尝试寻找最短且唯一的定位路径
      function getUniqueSelector(targetEl) {
        if (
          targetEl.id &&
          document.querySelectorAll("#" + CSS.escape(targetEl.id)).length === 1
        ) {
          return "#" + CSS.escape(targetEl.id);
        }

        // 尝试利用独特属性定位 (如 name, data-*, aria-label, href 等)
        const uniqueAttrs = [
          "name",
          "data-id",
          "data-value",
          "data-testid",
          "aria-label",
          "title",
          "placeholder",
        ];
        for (const attr of uniqueAttrs) {
          const val = targetEl.getAttribute(attr);
          if (val) {
            // 属性值如果包含特殊字符需要转义
            const escapedVal = val.replace(/"/g, '\\"');
            const testSelector = `${targetEl.tagName.toLowerCase()}[${attr}="${escapedVal}"]`;
            if (document.querySelectorAll(testSelector).length === 1) {
              return testSelector;
            }
          }
        }

        // 结合最近的有 ID 的祖先节点生成相对路径
        let path = [];
        let current = targetEl;
        while (
          current &&
          current !== document.body &&
          current !== document.documentElement
        ) {
          let segment = current.tagName.toLowerCase();

          // 如果找到唯一ID的祖先，作为锚点
          if (
            current.id &&
            document.querySelectorAll("#" + CSS.escape(current.id)).length === 1
          ) {
            path.unshift("#" + CSS.escape(current.id));
            const fullSelector = path.join(" > ");
            // 验证这条路径是否真的唯一
            if (document.querySelectorAll(fullSelector).length === 1)
              return fullSelector;
            break; // 如果加了祖先ID还不唯一，说明结构太重复，放弃CSS转用XPath
          }

          // 计算在同类型兄弟节点中的位置 (使用 nth-of-type 更精确)
          const parent = current.parentElement;
          if (parent) {
            const sameTagSiblings = Array.from(parent.children).filter(
              (c) => c.tagName === current.tagName,
            );
            if (sameTagSiblings.length > 1) {
              const index = sameTagSiblings.indexOf(current) + 1;
              segment += `:nth-of-type(${index})`;
            }
          }
          path.unshift(segment);
          current = parent;
        }
        return null; // CSS无法唯一确定，返回null交由XPath处理
      }

      function getStableXPath(targetEl) {
        const parts = [];
        let current = targetEl;
        while (current && current.nodeType === Node.ELEMENT_NODE) {
          let idx = 1;
          let sibling = current.previousSibling;
          while (sibling) {
            if (
              sibling.nodeType === Node.ELEMENT_NODE &&
              sibling.tagName === current.tagName
            )
              idx++;
            sibling = sibling.previousSibling;
          }
          const tagName = current.tagName.toLowerCase();
          parts.unshift(tagName + (idx > 1 ? `[${idx}]` : ""));
          if (current.id) {
            parts[0] = tagName + '[@id="' + current.id + '"]';
            break; // 遇到ID就停止向上遍历
          }
          current = current.parentNode;
        }
        return parts.length ? "/" + parts.join("/") : "";
      }

      selector = getUniqueSelector(el);
      if (!selector) {
        selector = el.tagName.toLowerCase(); // 兜底写个tag
        xpath = getStableXPath(el);

        // 如果目标元素直接包含少量文本，将其作为XPath的强力保险
        const directTexts = Array.from(el.childNodes).filter(
          (n) =>
            n.nodeType === Node.TEXT_NODE &&
            n.textContent.trim().length > 0 &&
            n.textContent.trim().length < 30,
        );
        if (directTexts.length > 0) {
          const txt = directTexts[0].textContent.trim();
          // 处理单双引号转义，防止XPath语法错误
          const escapedTxt =
            txt.includes('"') && txt.includes("'")
              ? txt.replace(/"/g, "&quot;")
              : txt;
          const quote = escapedTxt.includes('"') ? "'" : '"';
          parts[parts.length - 1] +=
            `[contains(text(), ${quote}${escapedTxt}${quote})]`;
          xpath = "/" + parts.join("/");
        }
      } else {
        xpath = getStableXPath(el);
      }

      // 生成XPath
      const getXPath = (element) => {
        if (element.id) return '//*[@id="' + element.id + '"]';
        const parts = [];
        while (element && element.nodeType === Node.ELEMENT_NODE) {
          let idx = 1;
          let sibling = element.previousSibling;
          while (sibling) {
            if (
              sibling.nodeType === Node.ELEMENT_NODE &&
              sibling.tagName === element.tagName
            )
              idx++;
            sibling = sibling.previousSibling;
          }
          const tagName = element.tagName.toLowerCase();
          parts.unshift(tagName + "[" + idx + "]");
          element = element.parentNode;
        }
        return parts.length ? "/" + parts.join("/") : "";
      };
      xpath = getXPath(el);

      autoClickerConfig.steps.push({
        id: Date.now(),
        type: "click",
        selector: selector,
        xpath: xpath,
      });

      autoClickerRecording = false;
      clearTimeout(autoClickerRecordTimeout);

      const tip = document.getElementById("nopic-autoclicker-record-tip");
      if (tip) tip.remove();

      document.removeEventListener("click", clickHandler, true);
      updateAutoClickerFlowList();
    };

    document.addEventListener("click", clickHandler, true);

    autoClickerRecordTimeout = setTimeout(() => {
      if (autoClickerRecording) {
        autoClickerRecording = false;
        const tip = document.getElementById("nopic-autoclicker-record-tip");
        if (tip) {
          tip.textContent = "记录超时，未检测到点击";
          tip.style.background = "rgba(100,100,100,0.9)";
          setTimeout(() => tip.remove(), 1500);
        }
        document.removeEventListener("click", clickHandler, true);
      }
    }, 3000);
  }

  // ===== 添加点击位置步骤 =====
  function addPositionStep() {
    if (autoClickerRecordingPosition) return;
    autoClickerRecordingPosition = true;

    const tip = document.createElement("div");
    tip.id = "nopic-autoclicker-record-position-tip";
    tip.style.cssText =
      "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(96,165,250,0.9);color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;z-index:2147483647;pointer-events:none;";
    tip.textContent = "请在 3 秒内点击页面上的目标位置...";
    document.body.appendChild(tip);

    const clickHandler = (e) => {
      if (!autoClickerRecordingPosition) return;
      if (
        e.target.closest("#nopic-autoclicker-submenu") ||
        e.target.closest("#nopic-widget") ||
        e.target.closest("#nopic-menu")
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // 记录绝对位置（包含滚动偏移）
      const x = e.clientX + window.scrollX;
      const y = e.clientY + window.scrollY;

      autoClickerConfig.steps.push({
        id: Date.now(),
        type: "position",
        x: x,
        y: y,
      });

      autoClickerRecordingPosition = false;
      clearTimeout(autoClickerRecordPositionTimeout);
      const tip = document.getElementById(
        "nopic-autoclicker-record-position-tip",
      );
      if (tip) tip.remove();
      document.removeEventListener("click", clickHandler, true);
      updateAutoClickerFlowList();
    };

    document.addEventListener("click", clickHandler, true);

    autoClickerRecordPositionTimeout = setTimeout(() => {
      if (autoClickerRecordingPosition) {
        autoClickerRecordingPosition = false;
        const tip = document.getElementById(
          "nopic-autoclicker-record-position-tip",
        );
        if (tip) {
          tip.textContent = "记录超时";
          tip.style.background = "rgba(100,100,100,0.9)";
          setTimeout(() => tip.remove(), 1500);
        }
        document.removeEventListener("click", clickHandler, true);
      }
    }, 3000);
  }

  // ===== 添加输入文字步骤 =====
  function addInputStep() {
    // 先关闭自动点击器弹窗
    hideAutoClickerSubmenu();

    const overlay = document.createElement("div");
    overlay.id = "nopic-autoclicker-input-overlay";
    overlay.style.cssText = `
  position:fixed;top:0;left:0;right:0;bottom:0;
  z-index:2147483649;
  background:rgba(0,0,0,0.6);
  display:flex;align-items:center;justify-content:center;
  pointer-events:none;
`;

    const dialog = document.createElement("div");
    dialog.style.cssText = `
    background:rgba(30,30,35,0.95);
    backdrop-filter:blur(24px);
    border:1px solid rgba(255,255,255,0.15);
    border-radius:12px;
    padding:20px;
    min-width:320px;
    max-width:400px;
    color:#fff;
    font-family:-apple-system,BlinkMacSystemFont,sans-serif;
    box-shadow:0 12px 48px rgba(0,0,0,0.5);
  `;
    dialog.style.pointerEvents = "auto";
    // 阻止点击冒泡
    dialog.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    dialog.innerHTML = `
    <div style="font-size:14px;font-weight:600;margin-bottom:12px;">输入要填入的文字</div>
    <input type="text" id="nopic-autoclicker-input-text" placeholder="请输入要输入的文字..." style="width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#fff;font-size:13px;padding:8px 12px;box-sizing:border-box;outline:none;">
    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:6px;">执行时会向当前聚焦的输入框输入文字（需要先用"点击位置"步骤聚焦输入框）</div>
    <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">
      <button id="nopic-autoclicker-input-cancel" style="padding:6px 16px;background:rgba(255,255,255,0.1);border:none;border-radius:6px;color:#fff;font-size:12px;cursor:pointer;">取消</button>
      <button id="nopic-autoclicker-input-confirm" style="padding:6px 16px;background:rgba(96,165,250,0.3);border:1px solid rgba(96,165,250,0.5);border-radius:6px;color:#60a5fa;font-size:12px;cursor:pointer;">确定</button>
    </div>
  `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const textInput = dialog.querySelector("#nopic-autoclicker-input-text");
    textInput.focus();

    const confirmBtn = dialog.querySelector("#nopic-autoclicker-input-confirm");
    const cancelBtn = dialog.querySelector("#nopic-autoclicker-input-cancel");

    const closeDialog = () => {
      overlay.remove();
      document.removeEventListener("keydown", keyHandler);
      // 恢复显示自动点击器弹窗
      autoClickerSubmenuOpen = true;
      autoClickerSubmenu.style.display = "flex";
      autoClickerSubmenu.classList.add("active");
    };

    const keyHandler = (e) => {
      if (e.key === "Enter") {
        confirmBtn.click();
      }
      if (e.key === "Escape") {
        cancelBtn.click();
      }
    };
    document.addEventListener("keydown", keyHandler);

    // 取消按钮
    cancelBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      closeDialog();
    });

    confirmBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      const inputText = textInput.value;
      if (!inputText.trim()) {
        textInput.style.borderColor = "#f87171";
        return;
      }

      // 直接保存步骤，只需要保存文字
      autoClickerConfig.steps.push({
        id: Date.now(),
        type: "input",
        text: inputText,
      });

      closeDialog();
      updateAutoClickerFlowList();
    });
  }

  // ===== 添加执行快捷键步骤 =====
  function addShortcutStep() {
    // 先关闭自动点击器弹窗
    hideAutoClickerSubmenu();

    const overlay = document.createElement("div");
    overlay.id = "nopic-autoclicker-shortcut-overlay";
    overlay.style.cssText = `
  position:fixed;top:0;left:0;right:0;bottom:0;
  z-index:2147483649;
  background:rgba(0,0,0,0.6);
  display:flex;align-items:center;justify-content:center;
  pointer-events:none;
`;

    const dialog = document.createElement("div");
    dialog.style.cssText = `
    background:rgba(30,30,35,0.95);
    backdrop-filter:blur(24px);
    border:1px solid rgba(255,255,255,0.15);
    border-radius:12px;
    padding:20px;
    min-width:320px;
    max-width:400px;
    color:#fff;
    font-family:-apple-system,BlinkMacSystemFont,sans-serif;
    box-shadow:0 12px 48px rgba(0,0,0,0.5);
  `;
    dialog.style.pointerEvents = "auto";
    dialog.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    dialog.innerHTML = `
  <div style="padding:0 0 16px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
    <div style="font-size:17px;font-weight:600;color:#fff;letter-spacing:-0.3px;text-align:left;">录入快捷键</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:3px;text-align:left;">点击下方区域后按下键盘组合键</div>
  </div>

  <div style="padding-top:16px;">
    <div id="nopic-shortcut-input-area" style="
      width:100%;
      min-height:64px;
      border-radius:10px;
      color:rgba(255,255,255,0.8);
      font-size:20px;
      padding:16px;
      box-sizing:border-box;
      display:flex;
      align-items:center;
      justify-content:center;
      font-weight:500;
      cursor:pointer;
      background:rgba(255,255,255,0.04);
      border:1.5px dashed rgba(255,255,255,0.1);
      transition:border-color 0.25s ease, background 0.25s ease;
      letter-spacing:0.5px;
      user-select:none;
    " onmouseover="this.style.borderColor='rgba(96,165,250,0.3)';this.style.background='rgba(96,165,250,0.06)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.1)';this.style.background='rgba(255,255,255,0.04)'">
      点击后按下快捷键
    </div>

    <div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:10px;text-align:center;letter-spacing:0.2px;">
      支持组合键 · 如 Ctrl+C · Ctrl+V · Ctrl+Z
    </div>
  </div>

  <div style="display:flex;gap:8px;margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);justify-content:flex-end;">
    <button id="nopic-autoclicker-shortcut-cancel" style="
      padding:8px 20px;
      background:transparent;
      border:none;
      border-radius:8px;
      color:rgba(255,255,255,0.35);
      font-size:13px;
      cursor:pointer;
      transition:color 0.15s, background 0.15s;
      font-weight:400;
    " onmouseover="this.style.color='rgba(255,255,255,0.6)';this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.color='rgba(255,255,255,0.35)';this.style.background='transparent'">
      取消
    </button>
    <button id="nopic-autoclicker-shortcut-confirm" style="
      padding:8px 24px;
      background:rgba(96,165,250,0.15);
      border:1px solid rgba(96,165,250,0.3);
      border-radius:8px;
      color:#60a5fa;
      font-size:13px;
      cursor:pointer;
      transition:all 0.2s cubic-bezier(0.4,0,0.2,1);
      font-weight:500;
    " onmouseover="this.style.background='rgba(96,165,250,0.25)';this.style.borderColor='rgba(96,165,250,0.5)';this.style.transform='scale(1.02)'" onmouseout="this.style.background='rgba(96,165,250,0.15)';this.style.borderColor='rgba(96,165,250,0.3)';this.style.transform='scale(1)'">
      确定
    </button>
  </div>
`;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const shortcutArea = dialog.querySelector("#nopic-shortcut-input-area");
    const confirmBtn = dialog.querySelector(
      "#nopic-autoclicker-shortcut-confirm",
    );
    const cancelBtn = dialog.querySelector(
      "#nopic-autoclicker-shortcut-cancel",
    );

    let recordedShortcut = "";
    let recordedKeys = {
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      key: "",
    };

    const closeDialog = () => {
      overlay.remove();
      // 恢复显示自动点击器弹窗
      autoClickerSubmenuOpen = true;
      autoClickerSubmenu.style.display = "flex";
      autoClickerSubmenu.classList.add("active");
    };

    // 点击区域开始监听快捷键
    shortcutArea.addEventListener("click", function () {
      shortcutArea.focus();
      shortcutArea.style.borderColor = "#22d3ee";
      shortcutArea.textContent = "请按下快捷键...";
    });

    shortcutArea.setAttribute("tabindex", "0");
    shortcutArea.focus();

    // 监听按键
    shortcutArea.addEventListener("keydown", function (e) {
      e.preventDefault();
      e.stopPropagation();

      // 记录修饰键
      recordedKeys.ctrl = e.ctrlKey;
      recordedKeys.alt = e.altKey;
      recordedKeys.shift = e.shiftKey;
      recordedKeys.meta = e.metaKey;

      // 记录主键（排除修饰键本身）
      const key = e.key;
      if (
        key !== "Control" &&
        key !== "Alt" &&
        key !== "Shift" &&
        key !== "Meta"
      ) {
        recordedKeys.key = key;
      }

      // 构建显示文本
      const parts = [];
      if (recordedKeys.ctrl) parts.push("Ctrl");
      if (recordedKeys.alt) parts.push("Alt");
      if (recordedKeys.shift) parts.push("Shift");
      if (recordedKeys.meta) parts.push("Meta");
      if (recordedKeys.key) parts.push(recordedKeys.key.toUpperCase());

      recordedShortcut = parts.join("+");

      // ===== 核心：判断快捷键支持情况 =====
      const keyLower = (recordedKeys.key || "").toLowerCase();
      let supportStatus = "";
      let supportColor = "";
      let actionDesc = "";
      let isSupported = false;

      // ---- 完全支持的快捷键（直接操作DOM） ----
      const fullySupported = {
        backspace: { icon: "⌫", desc: "退格键", detail: "删除光标前字符" },
        delete: { icon: "⌦", desc: "删除键", detail: "删除光标后字符" },
        enter: { icon: "↵", desc: "回车键", detail: "提交表单 / 插入换行" },
        " ": { icon: "␣", desc: "空格键", detail: "插入空格" },
        tab: { icon: "⇥", desc: "Tab键", detail: "插入缩进（两个空格）" },
        escape: { icon: "⎋", desc: "Esc键", detail: "取消焦点" },
      };

      // ---- 支持的特殊组合键（execCommand） ----
      const supportedCombos = {
        "ctrl+a": { icon: "📋", desc: "全选", detail: "选中全部内容" },
        "ctrl+c": { icon: "📄", desc: "复制", detail: "复制选中内容" },
        "ctrl+v": { icon: "📥", desc: "粘贴", detail: "粘贴剪贴板内容" },
        "ctrl+x": { icon: "✂️", desc: "剪切", detail: "剪切选中内容" },
        "ctrl+z": { icon: "↩️", desc: "撤销", detail: "撤销上一步操作" },
        "ctrl+y": { icon: "↪️", desc: "重做", detail: "重做已撤销操作" },
        "ctrl+b": { icon: "𝐁", desc: "加粗", detail: "文字加粗" },
        "ctrl+i": { icon: "𝑰", desc: "斜体", detail: "文字斜体" },
        "ctrl+u": { icon: "U̲", desc: "下划线", detail: "添加下划线" },
        "ctrl+enter": { icon: "📤", desc: "提交表单", detail: "提交当前表单" },
        "meta+a": { icon: "📋", desc: "全选", detail: "选中全部内容" },
        "meta+c": { icon: "📄", desc: "复制", detail: "复制选中内容" },
        "meta+v": { icon: "📥", desc: "粘贴", detail: "粘贴剪贴板内容" },
        "meta+x": { icon: "✂️", desc: "剪切", detail: "剪切选中内容" },
        "meta+z": { icon: "↩️", desc: "撤销", detail: "撤销上一步操作" },
        "meta+y": { icon: "↪️", desc: "重做", detail: "重做已撤销操作" },
        "meta+b": { icon: "𝐁", desc: "加粗", detail: "文字加粗" },
        "meta+i": { icon: "𝑰", desc: "斜体", detail: "文字斜体" },
        "meta+u": { icon: "U̲", desc: "下划线", detail: "添加下划线" },
        "meta+enter": { icon: "📤", desc: "提交表单", detail: "提交当前表单" },
      };

      // ---- 构建组合键key用于查找 ----
      let comboKey = "";
      const modParts = [];
      if (recordedKeys.ctrl) modParts.push("ctrl");
      if (recordedKeys.meta) modParts.push("meta");
      if (recordedKeys.alt) modParts.push("alt");
      if (recordedKeys.shift) modParts.push("shift");
      if (recordedKeys.key) {
        const keyForCombo = recordedKeys.key.toLowerCase();
        if (keyForCombo === " ") {
          comboKey =
            modParts.length > 0 ? modParts.join("+") + "+space" : "space";
        } else if (
          keyForCombo === "enter" ||
          keyForCombo === "tab" ||
          keyForCombo === "escape"
        ) {
          comboKey =
            modParts.length > 0
              ? modParts.join("+") + "+" + keyForCombo
              : keyForCombo;
        } else {
          comboKey =
            modParts.length > 0
              ? modParts.join("+") + "+" + keyForCombo
              : keyForCombo;
        }
      }

      // ---- 判断支持状态 ----
      let info = null;

      if (recordedKeys.key) {
        // 1. 检查是否是完全支持的快捷键
        if (fullySupported[keyLower]) {
          info = fullySupported[keyLower];
          supportStatus = "（可用）";
          supportColor = "#4ade80";
          isSupported = true;
        }
        // 2. 检查是否是支持的组合键
        else if (supportedCombos[comboKey]) {
          info = supportedCombos[comboKey];
          supportStatus = "（可用）";
          supportColor = "#4ade80";
          isSupported = true;
        }
        // 3. 普通字符输入（无修饰键或只有Shift）
        else if (
          recordedKeys.key.length === 1 &&
          !recordedKeys.ctrl &&
          !recordedKeys.alt &&
          !recordedKeys.meta
        ) {
          const charDisplay = recordedKeys.shift
            ? recordedKeys.key.toUpperCase()
            : recordedKeys.key;
          info = { icon: "⌨️", desc: `输入字符`, detail: `"${charDisplay}"` };
          supportStatus = "（可用）";
          supportColor = "#4ade80";
          isSupported = true;
        }
        // 4. 有修饰键但不支持的组合
        else if (recordedKeys.ctrl || recordedKeys.meta || recordedKeys.alt) {
          supportStatus = "(可能无法执行)";
          supportColor = "#fbbf24";
          isSupported = false;
        }
        // 5. 其他按键
        else {
          supportStatus = "(可能无法执行)";
          supportColor = "#fbbf24";
          isSupported = false;
        }
      }

      // 如果没有录制到任何键
      if (!recordedShortcut) {
        shortcutArea.innerHTML = `
          <div style="font-size:14px;color:rgba(255,255,255,0.4);">👆 点击后按下快捷键</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:4px;">支持组合键: Ctrl / Alt / Shift</div>
        `;
        return;
      }

      // ---- 显示结果（美化版） ----
      let html = `
        <div style="display:flex;align-items:center;gap:14px;width:100%;padding:4px 0;">
          <!-- 左侧：快捷键名称 -->
          <div style="font-size:24px;font-weight:700;color:#22d3ee;letter-spacing:1px;flex-shrink:0;">${recordedShortcut}</div>
          
          <!-- 右侧：状态 + 信息 -->
          <div style="flex:1;text-align:left;min-width:0;">
            <!-- 状态行 -->
            <div style="font-size:13px;font-weight:500;color:${supportColor};">
              ${supportStatus}
            </div>
      `;

      if (isSupported && info) {
        html += `
            <!-- 操作描述 -->
            <div style="font-size:14px;color:rgba(255,255,255,0.9);margin-top:2px;">
              ${info.icon} ${info.desc}
              <span style="font-size:12px;color:rgba(255,255,255,0.4);margin-left:6px;">${info.detail}</span>
            </div>
        `;
      } else {
        html += `
            <!-- 不支持提示 -->
            <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-top:2px;">
              此快捷键不在支持列表中
            </div>
            <div style="font-size:11px;color:#fbbf24;margin-top:2px;">
              💡 建议使用「运行脚本」步骤代替
            </div>
        `;
      }

      html += `
          </div>
        </div>
      `;

      shortcutArea.innerHTML = html;
    });

    // 取消按钮
    cancelBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      closeDialog();
    });

    // 确定按钮
    confirmBtn.addEventListener("click", function (e) {
      e.stopPropagation();

      if (!recordedShortcut) {
        shortcutArea.style.borderColor = "#f87171";
        shortcutArea.textContent = "请先录入快捷键";
        return;
      }

      // 保存步骤
      autoClickerConfig.steps.push({
        id: Date.now(),
        type: "shortcut",
        shortcut: recordedShortcut,
        ctrlKey: recordedKeys.ctrl,
        altKey: recordedKeys.alt,
        shiftKey: recordedKeys.shift,
        metaKey: recordedKeys.meta,
        key: recordedKeys.key,
      });

      closeDialog();
      updateAutoClickerFlowList();
    });
  }

  // ===== 添加运行脚本步骤 =====
  function addScriptStep() {
    // 先关闭自动点击器弹窗
    hideAutoClickerSubmenu();

    const overlay = document.createElement("div");
    overlay.id = "nopic-autoclicker-script-overlay";
    overlay.style.cssText = `
  position:fixed;top:0;left:0;right:0;bottom:0;
  z-index:2147483649;
  background:rgba(0,0,0,0.6);
  display:flex;align-items:center;justify-content:center;
  pointer-events:none;
`;

    const dialog = document.createElement("div");
    dialog.style.cssText = `
    background:rgba(30,30,35,0.95);
    backdrop-filter:blur(24px);
    border:1px solid rgba(255,255,255,0.15);
    border-radius:12px;
    padding:20px;
    min-width:400px;
    max-width:500px;
    color:#fff;
    font-family:-apple-system,BlinkMacSystemFont,sans-serif;
    box-shadow:0 12px 48px rgba(0,0,0,0.5);
  `;
    dialog.style.pointerEvents = "auto";
    // 阻止点击冒泡
    dialog.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    dialog.innerHTML = `
    <div style="font-size:14px;font-weight:600;margin-bottom:8px;">运行脚本</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:12px;">输入JavaScript代码，将在页面上下文中执行</div>
    <textarea id="nopic-autoclicker-script-code" rows="6" placeholder="// 在此输入JavaScript代码&#10;// 例如: console.log('Hello');&#10;// 例如: document.querySelector('#btn')?.click();" style="width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#fff;font-size:12px;padding:8px 12px;box-sizing:border-box;outline:none;font-family:monospace;resize:vertical;"></textarea>
    <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">
      <button id="nopic-autoclicker-script-cancel" style="padding:6px 16px;background:rgba(255,255,255,0.1);border:none;border-radius:6px;color:#fff;font-size:12px;cursor:pointer;">取消</button>
      <button id="nopic-autoclicker-script-confirm" style="padding:6px 16px;background:rgba(244,114,182,0.3);border:1px solid rgba(244,114,182,0.5);border-radius:6px;color:#f472b6;font-size:12px;cursor:pointer;">添加</button>
    </div>
  `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const textarea = dialog.querySelector("#nopic-autoclicker-script-code");
    textarea.focus();

    const confirmBtn = dialog.querySelector(
      "#nopic-autoclicker-script-confirm",
    );
    const cancelBtn = dialog.querySelector("#nopic-autoclicker-script-cancel");

    const closeDialog = () => {
      overlay.remove();
      // 恢复显示自动点击器弹窗
      autoClickerSubmenuOpen = true;
      autoClickerSubmenu.style.display = "flex";
    };

    confirmBtn.addEventListener("click", () => {
      const code = textarea.value.trim();
      if (!code) {
        textarea.style.borderColor = "#f87171";
        return;
      }

      autoClickerConfig.steps.push({
        id: Date.now(),
        type: "script",
        code: code,
      });

      closeDialog();
      updateAutoClickerFlowList();
    });

    cancelBtn.addEventListener("click", () => {
      closeDialog();
    });

    document.addEventListener("keydown", function keyHandler(e) {
      if (e.key === "Escape") {
        closeDialog();
        document.removeEventListener("keydown", keyHandler);
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        confirmBtn.click();
        document.removeEventListener("keydown", keyHandler);
      }
    });
  }

  // 自动点击器运行状态控制
  let isAutoClickerRunning = false;
  let autoClickerAbortController = null;

  function executeAutoClicker() {
    if (!autoClickerConfig.enabled || autoClickerConfig.steps.length === 0)
      return;
    // 如果正在运行，先终止上一轮，然后重新开始
    if (isAutoClickerRunning) {
      if (autoClickerAbortController) {
        autoClickerAbortController.abort();
      }
      isAutoClickerRunning = false;
      autoClickerAbortController = null;
    }

    // 新增：终止标志，用于阻止后续更新
    let isTerminated = false;

    isAutoClickerRunning = true;
    autoClickerAbortController = new AbortController();
    const signal = autoClickerAbortController.signal;

    showAutoClickerStatusPanel();

    let currentLoop = 0;
    const isInfinity = autoClickerConfig.loopCount === 0;
    const maxLoop = isInfinity ? Infinity : autoClickerConfig.loopCount;

    function runLoop() {
      if (signal.aborted) {
        isTerminated = true;
        return finishExecution("已手动终止");
      }
      if (!isInfinity && currentLoop >= maxLoop) {
        isTerminated = true;
        return finishExecution("已完成所有循环");
      }

      currentLoop++;
      let index = 0;

      const safetyDelay = autoClickerSafetyConfig.delay * 1000;
      if (safetyDelay <= 0) {
        runNext();
        return;
      }

      return new Promise((resolve) => {
        // 如果已经终止，不再更新状态
        if (!isTerminated) {
          updateAutoClickerStatus(
            `第 ${currentLoop} 轮即将开始 (${autoClickerSafetyConfig.delay}秒后执行，可点击终止)`,
            "pending",
            safetyDelay,
          );
        }
        const safetyTimer = setTimeout(() => {
          if (signal.aborted) {
            isTerminated = true;
            return resolve();
          }
          runNext();
          resolve();
        }, safetyDelay);

        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(safetyTimer);
            isTerminated = true;
            resolve();
          },
          { once: true },
        );
      });

      function runNext() {
        if (signal.aborted) {
          isTerminated = true;
          return finishExecution("已手动终止");
        }
        if (index >= autoClickerConfig.steps.length) {
          if (!isTerminated) {
            updateAutoClickerStatus(`第 ${currentLoop} 轮完成`, "success");
          }
          setTimeout(runLoop, 200);
          return;
        }

        const step = autoClickerConfig.steps[index];
        const stepNum = index + 1;
        const totalSteps = autoClickerConfig.steps.length;

        if (!isTerminated) {
          updateAutoClickerStatus(
            `第 ${currentLoop} 轮 - 准备执行步骤 ${stepNum}/${totalSteps}`,
            "pending",
          );
        }

        if (step.type === "delay") {
          // 延时
          if (!isTerminated && autoClickerConfig.showNotification) {
            updateAutoClickerStatus(
              `第 ${currentLoop} 轮 - 等待 ${step.value} 毫秒...`,
              "pending",
              step.value,
            );
          }
          setTimeout(() => {
            if (!signal.aborted && !isTerminated) runNext();
            else if (signal.aborted) {
              isTerminated = true;
              finishExecution("已手动终止");
            }
          }, step.value);
          index++;
        } else if (step.type === "wait") {
          // 智能等待 - 等待目标元素加载
          index++;

          // 如果 wait 步骤没有关联目标，尝试重新关联
          if (!step.targetSelector && !step.targetXpath) {
            const steps = autoClickerConfig.steps;
            const stepIndex = steps.indexOf(step);
            if (stepIndex !== -1) {
              for (let i = stepIndex + 1; i < steps.length; i++) {
                const s = steps[i];
                if (
                  (s.type === "click" || s.type === "input") &&
                  (s.selector || s.xpath)
                ) {
                  step.targetSelector = s.selector || "";
                  step.targetXpath = s.xpath || "";
                  step.targetType = s.type;
                  step.targetIndex = i;
                  break;
                }
              }
            }
          }

          const targetSelector = step.targetSelector || "";
          const targetXpath = step.targetXpath || "";

          // 如果没有目标元素，直接跳过
          if (!targetSelector && !targetXpath) {
            if (!isTerminated) {
              updateAutoClickerStatus(
                `第 ${currentLoop} 轮 - 无目标元素，跳过等待`,
                "pending",
              );
            }
            setTimeout(() => {
              if (!isTerminated) runNext();
            }, 200);
            return;
          }

          if (!isTerminated) {
            updateAutoClickerStatus(
              `第 ${currentLoop} 轮 - 等待元素加载...`,
              "pending",
            );
          }

          const waitTimeout = step.timeout || 30000;
          const startTime = Date.now();
          const checkInterval = 200;

          // 使用 setTimeout 循环检查
          function checkElement() {
            if (signal.aborted || isTerminated) {
              isTerminated = true;
              finishExecution("已手动终止");
              return;
            }

            let target = null;
            // 尝试CSS选择器
            try {
              if (targetSelector) {
                target = document.querySelector(targetSelector);
              }
            } catch (e) {}
            // 如果没找到，尝试XPath
            if (!target && targetXpath) {
              try {
                const result = document.evaluate(
                  targetXpath,
                  document,
                  null,
                  XPathResult.FIRST_ORDERED_NODE_TYPE,
                  null,
                );
                target = result.singleNodeValue;
              } catch (e) {}
            }

            // 【新增】检查元素是否真正可见
            function isElementVisible(el) {
              if (!el) return false;
              if (!el.isConnected) return false;

              // 检查尺寸
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 && rect.height === 0) return false;

              // 检查样式
              const style = window.getComputedStyle(el);
              if (style.display === "none") return false;
              if (style.visibility === "hidden") return false;
              if (parseFloat(style.opacity) === 0) return false;

              // 递归检查父元素是否隐藏
              let parent = el.parentElement;
              while (parent && parent !== document.body) {
                const parentStyle = window.getComputedStyle(parent);
                if (parentStyle.display === "none") return false;
                if (parentStyle.visibility === "hidden") return false;
                if (parseFloat(parentStyle.opacity) === 0) return false;
                parent = parent.parentElement;
              }

              return true;
            }

            // 判断元素是否存在且可见
            const isVisible = target && isElementVisible(target);

            if (isVisible) {
              // 元素已加载
              if (!isTerminated && autoClickerConfig.showNotification) {
                updateAutoClickerStatus(
                  `第 ${currentLoop} 轮 - 目标元素已加载`,
                  "success",
                );
              }
              // 视觉反馈
              try {
                const flash = document.createElement("div");
                flash.style.cssText =
                  "position:absolute;pointer-events:none;z-index:2147483646;border:2px solid #fbbf24;border-radius:4px;transition:opacity 0.3s;";
                const rect = target.getBoundingClientRect();
                flash.style.left = rect.left + window.scrollX + "px";
                flash.style.top = rect.top + window.scrollY + "px";
                flash.style.width = rect.width + "px";
                flash.style.height = rect.height + "px";
                document.body.appendChild(flash);
                setTimeout(() => {
                  flash.style.opacity = "0";
                  setTimeout(() => flash.remove(), 300);
                }, 300);
              } catch (e) {}
              setTimeout(() => {
                if (!isTerminated) runNext();
              }, 200);
              return;
            }

            // 检查是否超时
            if (Date.now() - startTime > waitTimeout) {
              if (!isTerminated) {
                updateAutoClickerStatus(
                  `第 ${currentLoop} 轮 - 等待超时，未找到目标元素`,
                  "error",
                );
              }
              setTimeout(() => {
                if (!isTerminated) runNext();
              }, 300);
              return;
            }

            // 继续等待
            setTimeout(checkElement, checkInterval);
          }

          // 开始检查
          setTimeout(checkElement, 100);
        } else if (step.type === "click") {
          // 点击元素
          index++;
          let target = null;
          try {
            target = document.querySelector(step.selector);
          } catch (e) {}
          if (!target && step.xpath) {
            try {
              const result = document.evaluate(
                step.xpath,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null,
              );
              target = result.singleNodeValue;
            } catch (e) {}
          }

          if (target) {
            let clicked = false;
            try {
              if (typeof target.click === "function") {
                target.click();
                clicked = true;
              }
            } catch (e) {}
            if (!clicked) {
              target.dispatchEvent(
                new MouseEvent("click", { bubbles: true, cancelable: true }),
              );
            }
            if (!isTerminated) {
              if (autoClickerConfig.showNotification) {
                updateAutoClickerStatus(
                  `第 ${currentLoop} 轮 - 步骤 ${stepNum} 点击成功`,
                  "success",
                );
              } else {
                updateAutoClickerStatus(
                  `第 ${currentLoop} 轮 - 执行中 ${stepNum}/${totalSteps}`,
                  "pending",
                );
              }
            }
            // 视觉反馈
            const flash = document.createElement("div");
            flash.style.cssText =
              "position:absolute;pointer-events:none;z-index:2147483646;border:2px solid #4ade80;border-radius:4px;transition:opacity 0.3s;";
            const rect = target.getBoundingClientRect();
            flash.style.left = rect.left + window.scrollX + "px";
            flash.style.top = rect.top + window.scrollY + "px";
            flash.style.width = rect.width + "px";
            flash.style.height = rect.height + "px";
            document.body.appendChild(flash);
            setTimeout(() => {
              flash.style.opacity = "0";
              setTimeout(() => flash.remove(), 300);
            }, 300);
            setTimeout(() => {
              if (!isTerminated) runNext();
            }, 200);
          } else {
            if (!isTerminated) {
              updateAutoClickerStatus(
                `第 ${currentLoop} 轮 - 步骤 ${stepNum} 失败：未找到元素`,
                "error",
              );
            }
            setTimeout(() => {
              if (!isTerminated) runNext();
            }, 500);
          }
        } else if (step.type === "position") {
          // 点击位置 - 稳健方案，彻底解决滚动偏移问题
          index++;
          try {
            const x = step.x || 0;
            const y = step.y || 0;

            // 先滚动到目标位置（居中）
            window.scrollTo({
              left: Math.max(0, x - window.innerWidth / 2),
              top: Math.max(0, y - window.innerHeight / 2),
              behavior: "instant",
            });

            // 使用延迟确保滚动完全完成（增加延迟时间）
            setTimeout(() => {
              if (signal.aborted || isTerminated) return;

              // 重新计算视口坐标
              let viewX = x - window.scrollX;
              let viewY = y - window.scrollY;

              // 检查坐标是否在可视区域内
              const isInViewport =
                viewX >= 0 &&
                viewX <= window.innerWidth &&
                viewY >= 0 &&
                viewY <= window.innerHeight;

              // 如果不在可视区域，强制滚动并重试
              if (!isInViewport) {
                // 强制滚动到精确位置
                window.scrollTo({
                  left: Math.max(0, x - window.innerWidth / 2),
                  top: Math.max(0, y - window.innerHeight / 2),
                  behavior: "instant",
                });

                // 额外延迟再试
                setTimeout(() => {
                  if (signal.aborted || isTerminated) return;

                  // 重新计算坐标
                  viewX = x - window.scrollX;
                  viewY = y - window.scrollY;

                  // 再次检查，如果还不在可视区域，直接使用边界值
                  if (viewX < 0) viewX = 0;
                  if (viewX > window.innerWidth) viewX = window.innerWidth - 1;
                  if (viewY < 0) viewY = 0;
                  if (viewY > window.innerHeight)
                    viewY = window.innerHeight - 1;

                  executeClick(viewX, viewY);
                }, 150);
                return;
              }

              executeClick(viewX, viewY);
            }, 200); // 增加延迟确保滚动完成

            function executeClick(viewX, viewY) {
              if (signal.aborted || isTerminated) return;

              // 确保坐标在有效范围内
              viewX = Math.max(0, Math.min(viewX, window.innerWidth - 1));
              viewY = Math.max(0, Math.min(viewY, window.innerHeight - 1));

              // 获取目标元素
              let el = document.elementFromPoint(viewX, viewY);

              // 如果没找到元素，尝试稍微偏移再试一次
              if (!el) {
                // 尝试附近几个点
                const offsets = [
                  [0, 0],
                  [5, 0],
                  [-5, 0],
                  [0, 5],
                  [0, -5],
                  [10, 10],
                  [-10, -10],
                ];
                for (const [dx, dy] of offsets) {
                  const testX = Math.max(
                    0,
                    Math.min(viewX + dx, window.innerWidth - 1),
                  );
                  const testY = Math.max(
                    0,
                    Math.min(viewY + dy, window.innerHeight - 1),
                  );
                  el = document.elementFromPoint(testX, testY);
                  if (el) {
                    // 更新坐标到实际点击位置
                    viewX = testX;
                    viewY = testY;
                    break;
                  }
                }
              }

              if (el) {
                // 滚动元素到可视区域（确保完全可见）
                try {
                  el.scrollIntoView({ behavior: "instant", block: "center" });
                } catch (e) {}

                // 先尝试聚焦（输入框、按钮等可聚焦元素）
                try {
                  if (typeof el.focus === "function") {
                    el.focus();
                  }
                } catch (e) {}

                // 模拟鼠标按下和释放（更真实的点击）
                try {
                  // mousedown
                  el.dispatchEvent(
                    new MouseEvent("mousedown", {
                      bubbles: true,
                      cancelable: true,
                      clientX: viewX,
                      clientY: viewY,
                      button: 0,
                    }),
                  );

                  // mouseup
                  el.dispatchEvent(
                    new MouseEvent("mouseup", {
                      bubbles: true,
                      cancelable: true,
                      clientX: viewX,
                      clientY: viewY,
                      button: 0,
                    }),
                  );

                  // click
                  el.dispatchEvent(
                    new MouseEvent("click", {
                      bubbles: true,
                      cancelable: true,
                      clientX: viewX,
                      clientY: viewY,
                      button: 0,
                    }),
                  );
                } catch (e) {
                  // 如果鼠标事件失败，尝试简单点击
                  try {
                    if (typeof el.click === "function") {
                      el.click();
                    }
                  } catch (e2) {}
                }

                // 如果是输入框，额外触发 focus 事件确保完全激活
                if (
                  el.tagName === "INPUT" ||
                  el.tagName === "TEXTAREA" ||
                  el.isContentEditable
                ) {
                  try {
                    el.dispatchEvent(
                      new FocusEvent("focus", { bubbles: true }),
                    );
                    // 光标移到末尾
                    if (el.setSelectionRange && el.value !== undefined) {
                      const len = el.value.length;
                      el.setSelectionRange(len, len);
                    }
                  } catch (e) {}
                }

                if (!isTerminated && autoClickerConfig.showNotification) {
                  updateAutoClickerStatus(
                    `第 ${currentLoop} 轮 - 位置点击成功 (${Math.round(x)}, ${Math.round(y)})`,
                    "success",
                  );
                }

                // 视觉反馈 - 圆圈扩散
                try {
                  const flash = document.createElement("div");
                  flash.style.cssText =
                    "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #60a5fa;border-radius:50%;width:20px;height:20px;transform:translate(-50%,-50%);transition:all 0.3s ease-out;";
                  flash.style.left = viewX + "px";
                  flash.style.top = viewY + "px";
                  document.body.appendChild(flash);
                  setTimeout(() => {
                    flash.style.width = "60px";
                    flash.style.height = "60px";
                    flash.style.opacity = "0";
                    setTimeout(() => {
                      try {
                        flash.remove();
                      } catch (e) {}
                    }, 300);
                  }, 50);
                } catch (e) {}

                setTimeout(() => {
                  if (!isTerminated) runNext();
                }, 300);
              } else {
                // 完全没找到元素，尝试通过坐标直接触发事件
                try {
                  // 直接在文档上触发点击
                  document.dispatchEvent(
                    new MouseEvent("click", {
                      bubbles: true,
                      cancelable: true,
                      clientX: viewX,
                      clientY: viewY,
                      button: 0,
                    }),
                  );

                  if (!isTerminated) {
                    updateAutoClickerStatus(
                      `第 ${currentLoop} 轮 - 位置点击 (坐标点击，无目标元素)`,
                      "warning",
                    );
                  }
                } catch (e) {
                  if (!isTerminated) {
                    updateAutoClickerStatus(
                      `第 ${currentLoop} 轮 - 位置点击失败：无元素`,
                      "error",
                    );
                  }
                }

                setTimeout(() => {
                  if (!isTerminated) runNext();
                }, 300);
              }
            }
          } catch (e) {
            if (!isTerminated) {
              updateAutoClickerStatus(
                `第 ${currentLoop} 轮 - 位置点击错误: ${e.message}`,
                "error",
              );
            }
            setTimeout(() => {
              if (!isTerminated) runNext();
            }, 300);
          }
        } else if (step.type === "input") {
          // 输入文字 - 在光标位置插入（追加/插入模式，不替换原有内容）
          index++;

          // 获取当前聚焦的元素
          const target = document.activeElement;

          // 检查是否有有效的聚焦元素（不是body或document）
          if (target && target !== document.body && target !== document) {
            try {
              const textToInsert = step.text || "";

              if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
                // 如果是数字输入框，直接赋值到末尾
                if (target.type === "number") {
                  target.value = textToInsert;
                } else {
                  target.focus();
                  const start = target.selectionStart || 0;
                  const end = target.selectionEnd || 0;
                  const currentValue = target.value || "";
                  target.value =
                    currentValue.substring(0, start) +
                    textToInsert +
                    currentValue.substring(end);
                  const newCursorPos = start + textToInsert.length;
                  target.selectionStart = target.selectionEnd = newCursorPos;
                }
                target.dispatchEvent(new Event("input", { bubbles: true }));
              } else if (target.isContentEditable) {
                // contentEditable 元素：使用 execCommand 插入（不删除原有内容）
                target.focus();
                // 如果当前有选中内容，先删除（保持原生行为：插入替换选中的部分）
                // 但这里我们不主动删除，而是直接插入，选中内容会被覆盖（浏览器默认行为）
                // 或者使用 insertText 在光标位置插入，如果光标处有选中，会被替换
                document.execCommand("insertText", false, textToInsert);
              } else {
                // 其他可聚焦元素
                if (target.focus) target.focus();
                document.execCommand("insertText", false, textToInsert);
              }

              // 触发输入事件
              target.dispatchEvent(new Event("input", { bubbles: true }));
              target.dispatchEvent(new Event("change", { bubbles: true }));

              // 触发输入事件
              target.dispatchEvent(new Event("input", { bubbles: true }));
              target.dispatchEvent(new Event("change", { bubbles: true }));

              if (!isTerminated && autoClickerConfig.showNotification) {
                updateAutoClickerStatus(
                  `第 ${currentLoop} 轮 - 输入成功`,
                  "success",
                );
              }

              // 视觉反馈
              const flash = document.createElement("div");
              flash.style.cssText =
                "position:absolute;pointer-events:none;z-index:2147483646;border:2px solid #a78bfa;border-radius:4px;transition:opacity 0.3s;";
              const rect = target.getBoundingClientRect();
              flash.style.left = rect.left + window.scrollX + "px";
              flash.style.top = rect.top + window.scrollY + "px";
              flash.style.width = rect.width + "px";
              flash.style.height = rect.height + "px";
              document.body.appendChild(flash);
              setTimeout(() => {
                flash.style.opacity = "0";
                setTimeout(() => flash.remove(), 300);
              }, 300);

              setTimeout(() => {
                if (!isTerminated) runNext();
              }, 300);
            } catch (e) {
              if (!isTerminated) {
                updateAutoClickerStatus(
                  `第 ${currentLoop} 轮 - 输入失败: ${e.message}`,
                  "error",
                );
              }
              setTimeout(() => {
                if (!isTerminated) runNext();
              }, 300);
            }
          } else {
            if (!isTerminated) {
              updateAutoClickerStatus(
                `第 ${currentLoop} 轮 - 输入失败：没有聚焦的输入框，请先用"点击位置"步骤聚焦输入框`,
                "error",
              );
            }
            setTimeout(() => {
              if (!isTerminated) runNext();
            }, 300);
          }
        } else if (step.type === "shortcut") {
          // 执行快捷键 - 直接操作DOM方式（不依赖键盘事件模拟）
          index++;

          try {
            const target = document.activeElement || document.body;
            const key = (step.key || "").toLowerCase();

            // 构建快捷键描述（用于日志显示）
            const parts = [];
            if (step.ctrlKey) parts.push("Ctrl");
            if (step.altKey) parts.push("Alt");
            if (step.shiftKey) parts.push("Shift");
            if (step.metaKey) parts.push("Meta");
            if (step.key) parts.push(step.key.toUpperCase());
            const shortcutDesc = parts.join("+");

            // ========== 获取当前操作描述 ==========
            let actionDesc = "";
            let executed = false;
            let execMethod = "";

            // 检查目标是否是可编辑元素（输入框、文本域、contentEditable）
            const isInputField =
              target.tagName === "INPUT" || target.tagName === "TEXTAREA";
            const isContentEditable = target.isContentEditable === true;
            const isButton =
              target.tagName === "BUTTON" ||
              target.tagName === "A" ||
              target.getAttribute("role") === "button";

            // ---- 退格键 (Backspace) ----
            if (key === "backspace") {
              try {
                if (isInputField) {
                  const start = target.selectionStart || 0;
                  const end = target.selectionEnd || 0;
                  const value = target.value || "";
                  if (start === end) {
                    if (start > 0) {
                      const deletedChar = value[start - 1] || "";
                      actionDesc = `删除字符 "${deletedChar}" (退格)`;
                      target.value =
                        value.substring(0, start - 1) + value.substring(start);
                      target.selectionStart = target.selectionEnd = start - 1;
                      executed = true;
                      execMethod = "直接操作";
                    } else {
                      actionDesc = "退格键 - 已在开头，无字符可删";
                      executed = false;
                    }
                  } else {
                    const deletedText = value.substring(start, end);
                    actionDesc = `删除选中内容 "${deletedText}" (退格)`;
                    target.value =
                      value.substring(0, start) + value.substring(end);
                    target.selectionStart = target.selectionEnd = start;
                    executed = true;
                    execMethod = "直接操作";
                  }
                  if (executed)
                    target.dispatchEvent(new Event("input", { bubbles: true }));
                } else if (isContentEditable) {
                  document.execCommand("delete");
                  actionDesc = "删除 (退格)";
                  executed = true;
                  execMethod = "execCommand";
                } else {
                  actionDesc = "退格键 - 当前焦点不在可编辑元素上";
                  executed = false;
                }
              } catch (e) {
                actionDesc = "退格键 - 执行失败";
                executed = false;
              }
            }

            // ---- 删除键 (Delete) ----
            if (!executed && key === "delete") {
              try {
                if (isInputField) {
                  const start = target.selectionStart || 0;
                  const end = target.selectionEnd || 0;
                  const value = target.value || "";
                  if (start === end) {
                    if (start < value.length) {
                      const deletedChar = value[start] || "";
                      actionDesc = `删除字符 "${deletedChar}" (Delete)`;
                      target.value =
                        value.substring(0, start) + value.substring(start + 1);
                      target.selectionStart = target.selectionEnd = start;
                      executed = true;
                      execMethod = "直接操作";
                    } else {
                      actionDesc = "Delete键 - 已在末尾，无字符可删";
                      executed = false;
                    }
                  } else {
                    const deletedText = value.substring(start, end);
                    actionDesc = `删除选中内容 "${deletedText}" (Delete)`;
                    target.value =
                      value.substring(0, start) + value.substring(end);
                    target.selectionStart = target.selectionEnd = start;
                    executed = true;
                    execMethod = "直接操作";
                  }
                  if (executed)
                    target.dispatchEvent(new Event("input", { bubbles: true }));
                } else if (isContentEditable) {
                  document.execCommand("delete");
                  actionDesc = "删除 (Delete)";
                  executed = true;
                  execMethod = "execCommand";
                } else {
                  actionDesc = "Delete键 - 当前焦点不在可编辑元素上";
                  executed = false;
                }
              } catch (e) {
                actionDesc = "Delete键 - 执行失败";
                executed = false;
              }
            }

            // ---- Enter 键 ----
            if (!executed && key === "enter") {
              try {
                if (isInputField) {
                  if (
                    target.type === "text" ||
                    target.type === "search" ||
                    target.type === "password"
                  ) {
                    const form = target.closest("form");
                    if (form) {
                      actionDesc = "触发表单提交 (Enter)";
                      form.dispatchEvent(
                        new Event("submit", {
                          bubbles: true,
                          cancelable: true,
                        }),
                      );
                      executed = true;
                      execMethod = "表单提交";
                    } else {
                      actionDesc = "Enter键 - 未找到父级表单";
                      executed = false;
                    }
                  } else if (target.type === "textarea") {
                    const start = target.selectionStart || 0;
                    const end = target.selectionEnd || 0;
                    const value = target.value || "";
                    target.value =
                      value.substring(0, start) + "\n" + value.substring(end);
                    target.selectionStart = target.selectionEnd = start + 1;
                    target.dispatchEvent(new Event("input", { bubbles: true }));
                    actionDesc = "插入换行 (Enter)";
                    executed = true;
                    execMethod = "直接操作";
                  } else {
                    actionDesc = `Enter键 - 不支持的输入框类型: ${target.type}`;
                    executed = false;
                  }
                } else if (isContentEditable) {
                  document.execCommand("insertText", false, "\n");
                  actionDesc = "插入换行 (Enter)";
                  executed = true;
                  execMethod = "execCommand";
                } else if (isButton) {
                  target.click();
                  actionDesc = "点击按钮/链接 (Enter)";
                  executed = true;
                  execMethod = "点击";
                } else {
                  actionDesc = "Enter键 - 当前焦点不在可交互元素上";
                  executed = false;
                }
              } catch (e) {
                actionDesc = "Enter键 - 执行失败";
                executed = false;
              }
            }

            // ---- 空格键 ----
            if (!executed && key === " ") {
              try {
                if (isInputField) {
                  const start = target.selectionStart || 0;
                  const end = target.selectionEnd || 0;
                  const value = target.value || "";
                  target.value =
                    value.substring(0, start) + " " + value.substring(end);
                  target.selectionStart = target.selectionEnd = start + 1;
                  target.dispatchEvent(new Event("input", { bubbles: true }));
                  actionDesc = "插入空格";
                  executed = true;
                  execMethod = "直接操作";
                } else if (isContentEditable) {
                  document.execCommand("insertText", false, " ");
                  actionDesc = "插入空格";
                  executed = true;
                  execMethod = "execCommand";
                } else {
                  actionDesc = "空格键 - 当前焦点不在可编辑元素上";
                  executed = false;
                }
              } catch (e) {
                actionDesc = "空格键 - 执行失败";
                executed = false;
              }
            }

            // ---- Tab 键 ----
            if (!executed && key === "tab") {
              try {
                if (isInputField) {
                  const start = target.selectionStart || 0;
                  const end = target.selectionEnd || 0;
                  const value = target.value || "";
                  target.value =
                    value.substring(0, start) + "  " + value.substring(end);
                  target.selectionStart = target.selectionEnd = start + 2;
                  target.dispatchEvent(new Event("input", { bubbles: true }));
                  actionDesc = "插入Tab (两个空格)";
                  executed = true;
                  execMethod = "直接操作";
                } else if (isContentEditable) {
                  document.execCommand("insertText", false, "  ");
                  actionDesc = "插入Tab (两个空格)";
                  executed = true;
                  execMethod = "execCommand";
                } else {
                  actionDesc = "Tab键 - 当前焦点不在可编辑元素上";
                  executed = false;
                }
              } catch (e) {
                actionDesc = "Tab键 - 执行失败";
                executed = false;
              }
            }

            // ---- Escape 键 ----
            if (!executed && key === "escape") {
              try {
                target.blur();
                actionDesc = "取消焦点 (Escape)";
                executed = true;
                execMethod = "直接操作";
              } catch (e) {
                actionDesc = "Escape键 - 执行失败";
                executed = false;
              }
            }

            // ========== 字符输入（普通字母/数字/符号） ==========
            if (!executed && step.key && step.key.length === 1) {
              try {
                const hasOnlyShift =
                  step.shiftKey &&
                  !step.ctrlKey &&
                  !step.altKey &&
                  !step.metaKey;
                const hasNoModifiers =
                  !step.ctrlKey &&
                  !step.altKey &&
                  !step.shiftKey &&
                  !step.metaKey;

                if (hasNoModifiers || hasOnlyShift) {
                  const charToInsert = step.key;
                  const displayChar = hasOnlyShift
                    ? charToInsert.toUpperCase()
                    : charToInsert;

                  if (isInputField) {
                    const start = target.selectionStart || 0;
                    const end = target.selectionEnd || 0;
                    const value = target.value || "";
                    target.value =
                      value.substring(0, start) +
                      charToInsert +
                      value.substring(end);
                    target.selectionStart = target.selectionEnd =
                      start + charToInsert.length;
                    target.dispatchEvent(new Event("input", { bubbles: true }));
                    actionDesc = `输入字符 "${displayChar}"${hasOnlyShift ? " (Shift+)" : ""}`;
                    executed = true;
                    execMethod = "直接操作";
                  } else if (isContentEditable) {
                    document.execCommand("insertText", false, charToInsert);
                    actionDesc = `输入字符 "${displayChar}"${hasOnlyShift ? " (Shift+)" : ""}`;
                    executed = true;
                    execMethod = "execCommand";
                  } else {
                    actionDesc = `字符输入 - 当前焦点不在可编辑元素上`;
                    executed = false;
                  }
                } else {
                  // 有 Ctrl/Alt/Meta 修饰键，不当作普通字符
                  actionDesc = "组合键 - 跳过字符输入";
                  executed = false;
                }
              } catch (e) {
                actionDesc = `字符输入失败: ${e.message}`;
                executed = false;
              }
            }

            // ========== 组合键处理 (Ctrl+X / Ctrl+C 等) ==========
            if (!executed) {
              const hasOnlyCtrl =
                step.ctrlKey && !step.altKey && !step.shiftKey && !step.metaKey;
              const hasOnlyMeta =
                step.metaKey && !step.ctrlKey && !step.altKey && !step.shiftKey;

              if (hasOnlyCtrl || hasOnlyMeta) {
                const commandMap = {
                  a: { cmd: "selectAll", desc: "全选 (Ctrl+A)" },
                  c: { cmd: "copy", desc: "复制 (Ctrl+C)" },
                  v: { cmd: "paste", desc: "粘贴 (Ctrl+V)" },
                  x: { cmd: "cut", desc: "剪切 (Ctrl+X)" },
                  z: { cmd: "undo", desc: "撤销 (Ctrl+Z)" },
                  y: { cmd: "redo", desc: "重做 (Ctrl+Y)" },
                  b: { cmd: "bold", desc: "加粗 (Ctrl+B)" },
                  i: { cmd: "italic", desc: "斜体 (Ctrl+I)" },
                  u: { cmd: "underline", desc: "下划线 (Ctrl+U)" },
                };

                const mapped = commandMap[key];
                if (mapped) {
                  try {
                    if (target && target.focus) target.focus();
                    const result = document.execCommand(
                      mapped.cmd,
                      false,
                      null,
                    );
                    if (result || mapped.cmd === "selectAll") {
                      actionDesc = mapped.desc;
                      executed = true;
                      execMethod = "execCommand";
                    } else {
                      actionDesc = mapped.desc + " - 执行失败（可能不支持）";
                      executed = false;
                    }
                  } catch (e) {
                    actionDesc = mapped.desc + ` - 执行异常: ${e.message}`;
                    executed = false;
                  }
                }
              }

              // Ctrl+A: 全选（特殊处理）
              if (!executed && (step.ctrlKey || step.metaKey) && key === "a") {
                try {
                  if (isInputField) {
                    target.focus();
                    target.select();
                    actionDesc = "全选 (Ctrl+A)";
                    executed = true;
                    execMethod = "直接操作";
                  } else if (isContentEditable) {
                    target.focus();
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(target);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    actionDesc = "全选 (Ctrl+A)";
                    executed = true;
                    execMethod = "直接操作";
                  } else {
                    document.execCommand("selectAll");
                    actionDesc = "全选 (Ctrl+A)";
                    executed = true;
                    execMethod = "execCommand";
                  }
                } catch (e) {
                  actionDesc = "全选 (Ctrl+A) - 执行失败";
                  executed = false;
                }
              }

              // Ctrl+Enter: 提交表单
              if (
                !executed &&
                (step.ctrlKey || step.metaKey) &&
                key === "enter"
              ) {
                try {
                  const form = target.closest("form");
                  if (form) {
                    form.dispatchEvent(
                      new Event("submit", { bubbles: true, cancelable: true }),
                    );
                    actionDesc = "提交表单 (Ctrl+Enter)";
                    executed = true;
                    execMethod = "表单提交";
                  } else {
                    actionDesc = "Ctrl+Enter - 未找到父级表单";
                    executed = false;
                  }
                } catch (e) {
                  actionDesc = "Ctrl+Enter - 执行失败";
                  executed = false;
                }
              }
            }

            // ========== 最后兜底：尝试触发键盘事件 ==========
            if (!executed) {
              try {
                const eventOptions = {
                  key: step.key || "",
                  code: step.key
                    ? step.key.length === 1
                      ? `Key${step.key.toUpperCase()}`
                      : step.key
                    : "",
                  ctrlKey: !!step.ctrlKey,
                  altKey: !!step.altKey,
                  shiftKey: !!step.shiftKey,
                  metaKey: !!step.metaKey,
                  bubbles: true,
                  cancelable: true,
                  composed: true,
                  view: window,
                };

                const keydownEvent = new KeyboardEvent("keydown", eventOptions);
                target.dispatchEvent(keydownEvent);

                const keyupEvent = new KeyboardEvent("keyup", eventOptions);
                target.dispatchEvent(keyupEvent);

                if (!actionDesc) {
                  actionDesc = `触发键盘事件: ${shortcutDesc} (可能未生效)`;
                } else {
                  actionDesc += " (已触发键盘事件)";
                }
                executed = true;
                execMethod = "键盘事件";
              } catch (e) {
                if (!actionDesc) {
                  actionDesc = `触发键盘事件失败: ${e.message}`;
                }
                executed = false;
              }
            }

            // 如果没有操作描述，生成一个通用的
            if (!actionDesc) {
              if (executed) {
                actionDesc = `执行快捷键: ${shortcutDesc}`;
              } else {
                actionDesc = `快捷键 ${shortcutDesc} - 未执行任何操作（可能不支持）`;
              }
            }

            // 构建最终状态信息
            let statusMsg = `第 ${currentLoop} 轮 - ${actionDesc}`;
            if (executed && execMethod) {
              statusMsg += ` [${execMethod}]`;
            }
            if (!executed) {
              statusMsg += " ⚠️ 未执行任何操作";
            }

            // 更新状态显示
            if (!isTerminated) {
              updateAutoClickerStatus(
                statusMsg,
                executed ? "success" : "warning",
              );
            }

            // 延迟后继续下一步
            setTimeout(() => {
              if (!isTerminated) runNext();
            }, 300);
          } catch (e) {
            if (!isTerminated) {
              updateAutoClickerStatus(
                `第 ${currentLoop} 轮 - 快捷键执行异常: ${e.message}`,
                "error",
              );
            }
            setTimeout(() => {
              if (!isTerminated) runNext();
            }, 300);
          }
        } else if (step.type === "script") {
          // 运行脚本
          index++;
          try {
            const result = (0, eval)(step.code);
            if (!isTerminated) {
              updateAutoClickerStatus(
                `第 ${currentLoop} 轮 - 脚本执行成功`,
                "success",
              );
            }
          } catch (e) {
            if (!isTerminated) {
              updateAutoClickerStatus(
                `第 ${currentLoop} 轮 - 脚本执行错误: ${e.message}`,
                "error",
              );
            }
          }
          setTimeout(() => {
            if (!isTerminated) runNext();
          }, 300);
        }
      }
      runNext();
    }

    runLoop();

    function finishExecution(msg) {
      isTerminated = true;
      isAutoClickerRunning = false;
      autoClickerAbortController = null;
      // 只有没有被终止过才更新状态，避免覆盖"已终止"的显示
      if (!isTerminated) {
        updateAutoClickerStatus(msg, "done");
      }
      const panel = document.getElementById("nopic-autoclicker-status-panel");
      if (panel) {
        panel._hideTimer = setTimeout(hideAutoClickerStatusPanel, 3000);
      }
    }
  }

  // 自动点击器事件绑定
  const autoClickerToggle = document.getElementById("nopic-autoclicker-toggle");
  if (autoClickerToggle) {
    autoClickerToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      autoClickerConfig.enabled = !autoClickerConfig.enabled;
      setAutoClickerConfig(autoClickerConfig);
      updateAllUI();
    });
  }

  const autoClickerAddDelay = document.getElementById(
    "nopic-autoclicker-add-delay",
  );
  if (autoClickerAddDelay) {
    autoClickerAddDelay.addEventListener("click", (e) => {
      e.stopPropagation();
      addDelayStep();
    });
  }

  const autoClickerAddClick = document.getElementById(
    "nopic-autoclicker-add-click",
  );
  if (autoClickerAddClick) {
    autoClickerAddClick.addEventListener("click", (e) => {
      e.stopPropagation();
      addClickStep();
    });
  }

  // 智能等待按钮
  const autoClickerAddWait = document.getElementById(
    "nopic-autoclicker-add-wait",
  );
  if (autoClickerAddWait) {
    autoClickerAddWait.addEventListener("click", function (e) {
      e.stopPropagation();
      addWaitStep();
    });
  }

  // 添加点击位置按钮
  const autoClickerAddPosition = document.getElementById(
    "nopic-autoclicker-add-position",
  );
  if (autoClickerAddPosition) {
    autoClickerAddPosition.addEventListener("click", function (e) {
      e.stopPropagation();
      addPositionStep();
    });
  }

  // 添加输入文字按钮
  const autoClickerAddInput = document.getElementById(
    "nopic-autoclicker-add-input",
  );
  if (autoClickerAddInput) {
    autoClickerAddInput.addEventListener("click", function (e) {
      e.stopPropagation();
      addInputStep();
    });
  }

  // 添加执行快捷键按钮
  const autoClickerAddShortcut = document.getElementById(
    "nopic-autoclicker-add-shortcut",
  );
  if (autoClickerAddShortcut) {
    autoClickerAddShortcut.addEventListener("click", function (e) {
      e.stopPropagation();
      addShortcutStep();
    });
  }

  // 添加运行脚本按钮
  const autoClickerAddScript = document.getElementById(
    "nopic-autoclicker-add-script",
  );
  if (autoClickerAddScript) {
    autoClickerAddScript.addEventListener("click", function (e) {
      e.stopPropagation();
      addScriptStep();
    });
  }

  // 安全延迟输入框失焦或改变时校验
  const safetyInput = document.getElementById("nopic-autoclicker-safety-delay");
  if (safetyInput) {
    safetyInput.addEventListener("change", (e) => {
      let val = parseInt(e.target.value);
      if (isNaN(val) || val < 0) val = 0;
      if (val > 30) val = 30;

      // 为0时弹出警告
      if (val === 0) {
        showConfirmModal(
          "关闭安全延迟警告",
          "将安全延迟设置为 0 秒意味着自动点击会立即执行。如果脚本在没有设置初始延时时自动运行，您可能没有足够的时间点击“终止执行”按钮。确定要关闭吗？",
          () => {
            autoClickerSafetyConfig.delay = 0;
            setAutoClickerSafetyConfig(autoClickerSafetyConfig);
            safetyInput.value = 0;
          },
          () => {
            // 取消则恢复为3秒
            autoClickerSafetyConfig.delay = 3;
            setAutoClickerSafetyConfig(autoClickerSafetyConfig);
            safetyInput.value = 3;
            // 阻止默认的弹窗关闭行为，保持输入框聚焦方便继续修改
            const confirmBox = document.querySelector(
              "#nopic-confirm-modal .nopic-confirm-box",
            );
            if (confirmBox) confirmBox.style.pointerEvents = "none";
            setTimeout(() => {
              hideConfirmModal();
              if (confirmBox) confirmBox.style.pointerEvents = "";
              safetyInput.focus();
              safetyInput.select();
            }, 150);
          },
        );
      } else {
        autoClickerSafetyConfig.delay = val;
        setAutoClickerSafetyConfig(autoClickerSafetyConfig);
        e.target.value = val;
      }
    });

    // 阻止输入框事件冒泡
    safetyInput.addEventListener("mousedown", (e) => e.stopPropagation());
  }

  const autoClickerSaveBtn = document.getElementById(
    "nopic-autoclicker-save-btn",
  );
  if (autoClickerSaveBtn) {
    autoClickerSaveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const loopInput = document.getElementById("nopic-autoclicker-loop-count");
      if (loopInput) {
        let val = parseInt(loopInput.value);
        autoClickerConfig.loopCount = isNaN(val) || val < 0 ? 1 : val;
      }
      const notifToggle = document.getElementById(
        "nopic-autoclicker-notif-toggle",
      );
      if (notifToggle) {
        autoClickerConfig.showNotification =
          notifToggle.classList.contains("on");
      }
      const autostartToggle = document.getElementById(
        "nopic-autoclicker-autostart-toggle",
      );
      if (autostartToggle) {
        autoClickerConfig.autoStartOnLoad =
          autostartToggle.classList.contains("on");
      }
      const sInput = document.getElementById("nopic-autoclicker-safety-delay");
      if (sInput) {
        let sVal = parseInt(sInput.value);
        if (isNaN(sVal) || sVal < 0) sVal = 0;
        if (sVal > 30) sVal = 30;
        autoClickerSafetyConfig.delay = sVal;
        setAutoClickerSafetyConfig(autoClickerSafetyConfig);
      }

      setAutoClickerConfig(autoClickerConfig);
      hideAutoClickerSubmenu();
      // 移除 executeAutoClicker()，保存后不自动执行
    });
  }

  // 保存并执行按钮
  const autoClickerSaveExecuteBtn = document.getElementById(
    "nopic-autoclicker-save-execute-btn",
  );
  if (autoClickerSaveExecuteBtn) {
    autoClickerSaveExecuteBtn.addEventListener("click", function (e) {
      e.stopPropagation();

      // 1. 保存配置
      const loopInput = document.getElementById("nopic-autoclicker-loop-count");
      if (loopInput) {
        let val = parseInt(loopInput.value);
        autoClickerConfig.loopCount = isNaN(val) || val < 0 ? 1 : val;
      }
      const notifToggle = document.getElementById(
        "nopic-autoclicker-notif-toggle",
      );
      if (notifToggle) {
        autoClickerConfig.showNotification =
          notifToggle.classList.contains("on");
      }
      const autostartToggle = document.getElementById(
        "nopic-autoclicker-autostart-toggle",
      );
      if (autostartToggle) {
        autoClickerConfig.autoStartOnLoad =
          autostartToggle.classList.contains("on");
      }
      const sInput = document.getElementById("nopic-autoclicker-safety-delay");
      if (sInput) {
        let sVal = parseInt(sInput.value);
        if (isNaN(sVal) || sVal < 0) sVal = 0;
        if (sVal > 30) sVal = 30;
        autoClickerSafetyConfig.delay = sVal;
        setAutoClickerSafetyConfig(autoClickerSafetyConfig);
      }
      setAutoClickerConfig(autoClickerConfig);

      // 2. 关闭弹窗
      hideAutoClickerSubmenu();

      // 3. 立即执行
      if (autoClickerConfig.steps.length > 0) {
        executeAutoClicker();
      } else {
        // 没有步骤时提示
        const panel = document.getElementById("nopic-autoclicker-status-panel");
        const textEl = document.getElementById("nopic-ac-status-text");
        if (textEl) {
          textEl.textContent = "⚠️ 没有可执行的步骤";
          textEl.style.color = "#fbbf24";
          panel.classList.add("active");
          setTimeout(() => {
            panel.classList.remove("active");
          }, 2000);
        }
      }
    });
  }

  const autoClickerClearBtn = document.getElementById(
    "nopic-autoclicker-clear-btn",
  );
  if (autoClickerClearBtn) {
    autoClickerClearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // 清空步骤
      autoClickerConfig.steps = [];
      // 立即保存到 localStorage
      setAutoClickerConfig(autoClickerConfig);
      // 刷新列表显示
      updateAutoClickerFlowList();
    });
  }
  // 扫描指定范围内的自动点击器流程，返回 { key, url, steps } 列表
  function scanAutoClickerFlows(scope) {
    const prefix = "nopic_autoclicker_";
    const results = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (!saved || !saved.steps || saved.steps.length === 0) continue;
        let urlStr = key.replace(prefix, "");
        try {
          urlStr = decodeURIComponent(urlStr);
        } catch (e) {}
        // 用字符串包含判断域名，避免 new URL 解析非法地址报错导致漏掉
        if (scope === "domain" && !urlStr.includes(location.host)) continue;
        const shortUrl =
          urlStr.length > 50 ? urlStr.substring(0, 50) + "..." : urlStr;
        results.push({ key, url: shortUrl, steps: saved.steps });
      } catch (ex) {}
    }
    return results;
  }

  // 清空本域名所有自动点击器流程
  const autoClickerClearDomainBtn = document.getElementById(
    "nopic-autoclicker-clear-domain-btn",
  );
  if (autoClickerClearDomainBtn) {
    autoClickerClearDomainBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const flows = scanAutoClickerFlows("domain");
      if (flows.length === 0) {
        showConfirmModal(
          "无流程",
          "当前网站下没有找到任何自动点击器流程。",
          () => {},
        );
        return;
      }
      const summary = flows
        .map((f, i) => `${i + 1}. ${f.url} (${f.steps.length}步)`)
        .join("\n");
      showConfirmModal(
        "确认清空本域名流程？",
        `将在 ${location.host} 下清空以下 ${flows.length} 个流程：\n\n${summary}`,
        () => {
          flows.forEach((f) => localStorage.removeItem(f.key));
          autoClickerConfig.steps = [];
          setAutoClickerConfig(autoClickerConfig);
          updateAutoClickerFlowList();
        },
      );
    });
  }

  // 清空全局所有自动点击器流程
  const autoClickerClearGlobalBtn = document.getElementById(
    "nopic-autoclicker-clear-global-btn",
  );
  if (autoClickerClearGlobalBtn) {
    autoClickerClearGlobalBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const flows = scanAutoClickerFlows("global");
      if (flows.length === 0) {
        showConfirmModal(
          "无流程",
          "全局范围内没有找到任何自动点击器流程。",
          () => {},
        );
        return;
      }
      const summary =
        flows.length <= 8
          ? flows
              .map((f, i) => `${i + 1}. ${f.url} (${f.steps.length}步)`)
              .join("\n")
          : flows
              .slice(0, 8)
              .map((f, i) => `${i + 1}. ${f.url} (${f.steps.length}步)`)
              .join("\n") + `\n...等共 ${flows.length} 个`;
      showConfirmModal(
        "确认清空全局流程？",
        `将清空所有域名下的 ${flows.length} 个流程：\n\n${summary}`,
        () => {
          flows.forEach((f) => localStorage.removeItem(f.key));
          autoClickerConfig.steps = [];
          setAutoClickerConfig(autoClickerConfig);
          updateAutoClickerFlowList();
        },
      );
    });
  }

  // 页面可编辑事件绑定
  const pageEditSwitch = document.getElementById("nopic-pageedit-switch");
  if (pageEditSwitch) {
    pageEditSwitch.addEventListener("click", function (e) {
      e.stopPropagation();
      pageEditMode = !pageEditMode;
      document.designMode = pageEditMode ? "on" : "off";
      updateAllUI();
      triggerTextWaveEffect();
    });
  }

  // ===== 人浪特效：波浪式逐行模糊+淡出 =====
  function triggerTextWaveEffect() {
    // 收集所有包含直接文本节点的叶子元素
    const textLeaves = [];
    const allEls = document.body.getElementsByTagName("*");

    for (const el of allEls) {
      // 排除脚本UI
      if (
        el.closest("#nopic-widget") ||
        el.closest("#nopic-menu") ||
        el.closest("[id^='nopic-']") ||
        el.closest("#nopic-zoom-container") ||
        el.closest("#nopic-parade-overlay") ||
        el.closest("#nopic-about-modal") ||
        el.closest("#nopic-confirm-modal")
      ) {
        continue;
      }

      // 只取有直接文本节点的元素
      let hasDirectText = false;
      for (const child of el.childNodes) {
        if (
          child.nodeType === Node.TEXT_NODE &&
          child.textContent.trim().length > 0
        ) {
          hasDirectText = true;
          break;
        }
      }
      if (!hasDirectText) continue;

      const r = el.getBoundingClientRect();
      if (
        r.width > 10 &&
        r.height > 10 &&
        r.bottom >= 0 &&
        r.top <= window.innerHeight &&
        r.right >= 0 &&
        r.left <= window.innerWidth
      ) {
        textLeaves.push(el);
      }
    }

    if (textLeaves.length === 0) return;

    // 按从上到下排序
    textLeaves.sort(
      (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
    );

    const list = textLeaves.slice(0, 150);

    // 波浪参数
    const waveInterval = 15; // 每个元素间隔(ms)
    const effectDuration = 150; // 模糊+淡出持续时间(ms)

    // 预先设置过渡
    list.forEach((el) => {
      el.style.transition = `filter ${effectDuration}ms ease, opacity ${effectDuration}ms ease`;
    });

    // 波浪式：每个元素独立完成"模糊+淡出 → 清晰+淡入"
    list.forEach((el, i) => {
      const startTime = i * waveInterval;

      // 第一阶段：模糊 + 透明度归零
      setTimeout(() => {
        el.style.filter = "blur(4px)";
        el.style.opacity = "0";
      }, startTime);

      // 第二阶段：清晰 + 透明度恢复（紧跟第一阶段之后）
      setTimeout(
        () => {
          el.style.filter = "blur(0px)";
          el.style.opacity = "1";
        },
        startTime + effectDuration + 10,
      );
    });

    // 清理过渡属性
    const cleanupDelay = list.length * waveInterval + effectDuration * 2 + 50;
    setTimeout(() => {
      list.forEach((el) => {
        el.style.transition = "";
        el.style.filter = "";
        el.style.opacity = "";
      });
    }, cleanupDelay);
  }

  // 页面可编辑事件绑定
  const pageEditToggle = document.getElementById("nopic-pageedit-toggle");
  if (pageEditToggle) {
    pageEditToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      pageEditEnabled = !pageEditEnabled;
      setPageEditEnabled(pageEditEnabled);
      updateAllUI();
    });
  }

  // ===== 隐私锁面板事件委托（补全缺失逻辑） =====
  privacyLockSubmenu.addEventListener("click", (e) => {
    // 如果点击的是日志按钮或日志面板内的元素，直接放行
    if (
      e.target.closest("#nopic-privacy-log-btn") ||
      e.target.closest("#nopic-privacy-log-panel")
    ) {
      return;
    }

    // 跳过开关处理
    var skipToggle = e.target.closest("#nopic-privacy-skip-toggle");
    if (skipToggle) {
      e.stopPropagation();
      skipToggle.classList.toggle("on");
      var isOn = skipToggle.classList.contains("on");
      GM_setValue("nopic_skip_toggle_global", isOn ? "true" : "false");

      var forgotBtn = document.getElementById("nopic-privacy-forgot-btn");
      if (forgotBtn) {
        forgotBtn.style.display = isOn ? "" : "none";
      }
      if (!isOn) {
        var skipEl = document.getElementById("nopic-lock-pin-skip");
        if (skipEl) {
          skipEl.style.display = "none";
          skipEl.onclick = null;
        }
      }
      return;
    }

    // 如果隐私锁已激活，阻止所有操作（日志按钮除外）
    if (
      privacyLockRuntime.isLocked &&
      !e.target.closest("#nopic-privacy-log-btn")
    ) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }

    e.stopPropagation();

    // PIN码按钮点击
    const pinBtn = e.target.closest(".nopic-pin-btn");
    if (pinBtn) {
      e.stopPropagation();
      const scope = pinBtn.dataset.plScope;
      const pinVal = pinBtn.dataset.plPin;
      let cfg = getPrivacyLockConfigByScope(scope);
      const currentPin = cfg.password || "";

      if (pinVal === "clear") {
        cfg.password = currentPin.slice(0, -1);
      } else {
        if (currentPin.length < 4) {
          cfg.password = currentPin + pinVal;
        }
      }

      if (cfg.password && cfg.password.length === 4) {
        cfg.unlockMode = "password";
      }

      setPrivacyLockConfigByScope(scope, cfg);
      updateAllUI();
      return;
    }

    const selectBtn = e.target.closest(
      ".nopic-privacy-select-btn[data-pl-key]",
    );
    if (selectBtn) {
      const scope = selectBtn.dataset.plScope;
      const key = selectBtn.dataset.plKey;
      const val = selectBtn.dataset.plVal;
      let cfg = getPrivacyLockConfigByScope(scope);

      if (key === "unlockMode") {
        if (val === "nopassword") {
          cfg.password = "";
          cfg.unlockMode = "password";
        } else if (val === "password") {
          cfg.unlockMode = "password";
        }
      } else {
        cfg[key] = val;
      }

      setPrivacyLockConfigByScope(scope, cfg);
      updateAllUI();
      startPrivacyLockListeners();
      return;
    }

    const clearBtn = e.target.closest("[data-pl-clear]");
    if (clearBtn) {
      const scope = clearBtn.dataset.plClear;
      setPrivacyLockConfigByScope(scope, { ...defaultPrivacyLockConfig });
      updateAllUI();
      startPrivacyLockListeners();
      return;
    }

    // 锁屏外观设置保存
    const bgColorInput = document.getElementById("nopic-lock-bg-color");
    const textColorInput = document.getElementById("nopic-lock-text-color");
    const timeFormatInput = document.getElementById("nopic-lock-time-format");
    const customTextInput = document.getElementById("nopic-lock-custom-text");

    if (bgColorInput) {
      bgColorInput.addEventListener("input", function (e) {
        e.stopPropagation();
        const app = getLockAppearanceConfig();
        app.bgColor = this.value;
        setLockAppearanceConfig(app);
        updateLockTime();
      });
    }
    if (textColorInput) {
      textColorInput.addEventListener("input", function (e) {
        e.stopPropagation();
        const app = getLockAppearanceConfig();
        app.textColor = this.value;
        setLockAppearanceConfig(app);
        updateLockTime();
      });
    }
    if (timeFormatInput) {
      timeFormatInput.addEventListener("input", function (e) {
        e.stopPropagation();
        const app = getLockAppearanceConfig();
        app.timeFormat = this.value || "{时}:{分}";
        setLockAppearanceConfig(app);
        updateLockTime();
      });
    }
    if (customTextInput) {
      customTextInput.addEventListener("input", function (e) {
        e.stopPropagation();
        const app = getLockAppearanceConfig();
        app.customText = this.value;
        setLockAppearanceConfig(app);
        updateLockTime();
      });
    }

    // 占位符说明弹窗
    const helpBtn = document.getElementById("nopic-lock-format-help");
    if (helpBtn) {
      helpBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        showConfirmModal(
          "📋 占位符说明",
          "{年} - 年份\n{月} - 月份(01-12)\n{日} - 日期(01-31)\n{周几} - 星期几(一~日)\n{时} - 小时(00-23)\n{分} - 分钟(00-59)\n{秒} - 秒钟(00-59)\n{时节} - 春夏秋冬\n{自定义} - 自定义文字\n\n示例: {年}年{月}月{日}日 {周几}\n       {时}:{分}:{秒} {时节}",
          function () {},
        );
        // 修改确认按钮文字
        const confirmBtn = document.querySelector(
          "#nopic-confirm-modal .nopic-confirm-btn.danger",
        );
        if (confirmBtn) {
          confirmBtn.textContent = "知道了";
          confirmBtn.classList.remove("danger");
          confirmBtn.classList.add("cancel");
        }
      });
    }

    // 加载已保存的外观配置到UI
    const appConfig = getLockAppearanceConfig();
    if (bgColorInput) bgColorInput.value = appConfig.bgColor;
    if (textColorInput) textColorInput.value = appConfig.textColor;
    if (timeFormatInput) timeFormatInput.value = appConfig.timeFormat;
    if (customTextInput) customTextInput.value = appConfig.customText;
  });

  privacyLockSubmenu.addEventListener("input", (e) => {
    // 如果隐私锁已激活，阻止所有操作
    if (privacyLockRuntime.isLocked) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    const target = e.target;
    if (target.dataset.plKey === "password") {
      const scope = target.dataset.plScope;
      // 只允许数字
      let val = target.value.replace(/\D/g, "");
      if (val.length > 4) val = val.slice(0, 4);
      target.value = val;

      let cfg = getPrivacyLockConfigByScope(scope);
      cfg.password = val;
      if (val.length === 4) {
        cfg.unlockMode = "password";
      }
      setPrivacyLockConfigByScope(scope, cfg);
      updateAllUI();
      // 重新聚焦到输入框
      setTimeout(() => {
        const newTarget = document.querySelector(
          `input[data-pl-scope="${scope}"][data-pl-key="password"]`,
        );
        if (newTarget) {
          newTarget.focus();
          newTarget.setSelectionRange(
            newTarget.value.length,
            newTarget.value.length,
          );
        }
      }, 10);
    } else if (target.dataset.plKey === "timeoutMinutes") {
      const scope = target.dataset.plScope;
      let val = parseInt(target.value);
      if (isNaN(val) || val < 1) val = 1;
      if (val > 60) val = 60;
      let cfg = getPrivacyLockConfigByScope(scope);
      cfg.timeoutMinutes = val;
      setPrivacyLockConfigByScope(scope, cfg);
    }
  });

  privacyLockSubmenu.addEventListener("mousedown", (e) => {
    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "BUTTON" ||
      e.target.closest(".nopic-privacy-select-btn")
    ) {
      e.stopPropagation();
    }
  });

  document
    .getElementById("nopic-privacy-lock-now-btn")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      hidePrivacyLockSubmenu();
      showPrivacyLockOverlay();
    });

  document.getElementById("nopic-privacy-log-btn").addEventListener(
    "click",
    function (e) {
      e.stopPropagation();
      e.preventDefault();
      privacyLogPanel.classList.add("active");
      logCurrentPage = 1;
      renderPrivacyLogs();
    },
    true,
  ); // 添加 true 表示在捕获阶段执行

  var forgotBtn = document.getElementById("nopic-privacy-forgot-btn");
  if (forgotBtn) {
    forgotBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      showConfirmModal(
        "确认跳过密码？",
        "跳过密码解锁会被记录。确定要跳过吗？",
        function () {
          // 用户点击确定 - 执行跳过
          privacyLockRuntime.forgotUnlockTime = Date.now();
          addPrivacyLog("forgot_unlock", true);
          localStorage.setItem(
            "nopic_pending_password_reset_" + location.host,
            "true",
          );
          window._nopicResetAcknowledged = false;
          hidePrivacyLockOverlay(true);
          // 延迟弹出安全警告
          setTimeout(function () {
            showConfirmModalWithAck(
              "⚠️ 安全警告",
              '您已使用"忘记密码跳过解锁"功能，当前密码尚未重置。请立即在隐私锁设置中重置密码，以保护页面安全。',
            );
          }, 400);
        },
        function () {
          // 用户点击取消 - 不执行任何操作
        },
      );
    });
  }

  function renderPrivacyLogs() {
    const logCfg = getPrivacyLogConfig();
    let logs = logCfg.logs || [];
    if (logCurrentFilter !== "all") {
      logs = logs.filter((log) => {
        if (logCurrentFilter === "unlock") {
          // 解锁筛选应包括：unlock、pin_skip、forgot_unlock
          return (
            log.action.includes("unlock") ||
            log.action === "pin_skip" ||
            log.action === "forgot_unlock"
          );
        }
        if (logCurrentFilter === "lock") return log.action === "lock";
        if (logCurrentFilter === "error")
          return log.action === "error" || log.action.includes("wrong");
        return true;
      });
    }
    const totalPages = Math.max(1, Math.ceil(logs.length / logPageSize));
    if (logCurrentPage > totalPages) logCurrentPage = totalPages;
    const start = (logCurrentPage - 1) * logPageSize;
    const pageLogs = logs.slice(start, start + logPageSize);
    const listEl = document.getElementById("nopic-privacy-log-list");
    listEl.innerHTML =
      pageLogs.length === 0
        ? '<div style="text-align:center;color:rgba(255,255,255,0.5);padding:20px;">暂无日志</div>'
        : pageLogs
            .map((log) => {
              const time = new Date(log.time);
              const timeStr = time.toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });
              let actionClass = "";
              let actionText = log.action;
              if (
                log.action.includes("unlock") &&
                log.action !== "forgot_unlock"
              ) {
                actionClass = "unlock";
                actionText = "解锁";
              } else if (log.action === "lock") {
                actionClass = "lock";
                actionText = "锁定";
              } else if (log.action.includes("wrong")) {
                actionClass = "error";
                actionText = "密码错误";
              } else if (log.action === "forgot_unlock") {
                actionClass = "reset";
                actionText = "忘记密码解锁";
              } else if (log.action === "button_unlock") {
                actionClass = "unlock";
                actionText = "按钮解锁";
              } else if (log.action === "password_unlock") {
                actionClass = "unlock";
                actionText = "密码解锁";
              } else if (log.action === "pin_skip") {
                actionClass = "reset";
                actionText = "跳过PIN解锁";
              }
              return `<div class="nopic-privacy-log-item">
          <span class="nopic-privacy-log-time">${timeStr}</span>
          <span class="nopic-privacy-log-action ${actionClass}">${actionText}</span>
          <span class="nopic-privacy-log-status ${log.success ? "success" : "fail"}">${
            log.success ? "成功" : "失败"
          }</span>
        </div>`;
            })
            .join("");
    document.getElementById("nopic-log-page-info").textContent =
      `${logCurrentPage}/${totalPages}`;
    document.getElementById("nopic-log-prev-btn").disabled =
      logCurrentPage <= 1;
    document.getElementById("nopic-log-next-btn").disabled =
      logCurrentPage >= totalPages;
  }

  document
    .getElementById("nopic-privacy-log-close")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      privacyLogPanel.classList.remove("active");
    });

  document.querySelectorAll(".nopic-privacy-log-filter-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      document
        .querySelectorAll(".nopic-privacy-log-filter-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      logCurrentFilter = btn.dataset.filter;
      logCurrentPage = 1;
      renderPrivacyLogs();
    });
  });

  document
    .getElementById("nopic-log-prev-btn")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      if (logCurrentPage > 1) {
        logCurrentPage--;
        renderPrivacyLogs();
      }
    });

  document
    .getElementById("nopic-log-next-btn")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      logCurrentPage++;
      renderPrivacyLogs();
    });

  // ===== 替换文字功能实现 =====
  function updateTextReplaceRulesList() {
    const listUrl = document.getElementById("nopic-tr-list-url");
    const listDomain = document.getElementById("nopic-tr-list-domain");
    const listGlobal = document.getElementById("nopic-tr-list-global");

    if (!listUrl || !listDomain || !listGlobal) return;

    const urlRules = getTextReplaceConfigByScope("url").rules || [];
    const domainRules = getTextReplaceConfigByScope("domain").rules || [];
    const globalRules = getTextReplaceConfigByScope("global").rules || [];

    function renderList(container, rules, scope) {
      container.innerHTML = "";
      rules.forEach((rule, idx) => {
        const item = document.createElement("div");
        item.className = "nopic-mask-item";
        item.style.flexDirection = "column";
        item.style.alignItems = "stretch";
        item.style.gap = "2px";
        item.style.cursor = "pointer";
        item.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:rgba(255,255,255,0.9);" title="原文字: ${rule.from}">${rule.from}</span>
            <div class="nopic-mask-item-delete" data-tr-del="${scope}-${idx}" style="flex-shrink:0;">×</div>
          </div>
          <div style="font-size:10px;color:#60a5fa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-left:4px;" title="替换为: ${rule.to}">→ ${rule.to}</div>
        `;
        container.appendChild(item);

        // 点击编辑
        item.addEventListener("click", (e) => {
          if (e.target.classList.contains("nopic-mask-item-delete")) return;
          enterTextReplaceEditMode(item, scope, idx, rule);
        });

        // 删除
        item
          .querySelector(".nopic-mask-item-delete")
          .addEventListener("click", (e) => {
            e.stopPropagation();
            const cfg = getTextReplaceConfigByScope(scope);
            cfg.rules.splice(idx, 1);
            setTextReplaceConfigByScope(scope, cfg);
            updateTextReplaceRulesList();
            applyTextReplace();
          });
      });
    }

    renderList(listUrl, urlRules, "url");
    renderList(listDomain, domainRules, "domain");
    renderList(listGlobal, globalRules, "global");
  }

  // 应用文字替换（只替换视窗内的文字）
  function applyTextReplace() {
    // 先恢复所有已替换的内容
    restoreTextReplace();

    const effectiveRules = getEffectiveTextReplaceRules();
    if (effectiveRules.length === 0) return;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false,
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent) continue;
      // 跳过已经在替换 span 里的文本节点
      if (
        parent.classList &&
        parent.classList.contains("nopic-textreplace-span")
      )
        continue;
      if (
        parent.tagName === "SCRIPT" ||
        parent.tagName === "STYLE" ||
        parent.tagName === "NOSCRIPT" ||
        parent.closest("#nopic-widget") ||
        parent.closest("#nopic-menu") ||
        parent.closest("#nopic-textreplace-submenu") ||
        parent.closest(".nopic-clone") ||
        parent.closest(".nopic-parade-clone")
      )
        continue;

      // 只收集视窗内的文本节点
      const rect = parent.getBoundingClientRect();
      if (
        rect.bottom >= 0 &&
        rect.top <= window.innerHeight &&
        rect.right >= 0 &&
        rect.left <= window.innerWidth
      ) {
        textNodes.push(node);
      }
    }

    textNodes.forEach((textNode) => {
      const originalText = textNode.textContent;
      let hasReplaced = false;
      let matchedRule = null;
      let matchIndex = -1;

      for (const rule of effectiveRules) {
        if (!rule.from) continue;
        const idx = rule.caseSensitive
          ? originalText.indexOf(rule.from)
          : originalText.toLowerCase().indexOf(rule.from.toLowerCase());
        if (idx !== -1) {
          matchedRule = rule;
          matchIndex = idx;
          hasReplaced = true;
          break;
        }
      }

      if (hasReplaced && matchedRule) {
        const beforeText = originalText.slice(0, matchIndex);
        const afterText = originalText.slice(
          matchIndex + matchedRule.from.length,
        );

        const fragment = document.createDocumentFragment();

        if (beforeText) {
          fragment.appendChild(document.createTextNode(beforeText));
        }

        const replaceSpan = document.createElement("span");
        replaceSpan.className = "nopic-textreplace-span fade-out";
        replaceSpan.textContent = matchedRule.to;
        fragment.appendChild(replaceSpan);

        if (afterText) {
          fragment.appendChild(document.createTextNode(afterText));
        }

        textNode.parentNode.replaceChild(fragment, textNode);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            replaceSpan.classList.remove("fade-out");
            replaceSpan.classList.add("fade-in");
          });
        });
      }
    });
  }

  // 转义正则特殊字符
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // 恢复文字替换
  function restoreTextReplace() {
    const spans = document.querySelectorAll(".nopic-textreplace-span");
    spans.forEach((span) => {
      // 获取 span 里的替换后文字
      const replacedText = span.textContent;

      // 找到这个 span 在父节点中的位置
      const parent = span.parentNode;
      if (!parent) return;

      // 创建文本节点恢复原始内容
      // 注意：这里简化处理，直接用文本节点替换 span
      // 如果需要完全精确恢复，需要记录原始文本，但通常替换后的文本就是用户想看到的
      const textNode = document.createTextNode(replacedText);

      // 先添加淡出动画
      span.classList.remove("fade-in");
      span.classList.add("fade-out");

      // 动画结束后替换回文本节点
      setTimeout(() => {
        if (span.parentNode) {
          span.parentNode.replaceChild(textNode, span);
        }
      }, 300);
    });
  }

  // 判断当前scope是否有存储数据
  function hasStoredConfig(scope) {
    if (scope === "url") {
      const key = "nopic_privacylock_" + encodeURIComponent(nopicGetUrlKey());
      return localStorage.getItem(key) !== null;
    }
    if (scope === "domain") {
      const key = "nopic_privacylock_domain_" + location.host;
      return localStorage.getItem(key) !== null;
    }
    if (scope === "global") {
      return GM_getValue("nopic_privacylock_global", null) !== null;
    }
    return false;
  }

  function enterTextReplaceEditMode(containerDiv, scope, idx, ruleData) {
    if (containerDiv.querySelector(".nopic-tr-edit-row")) return;

    const editRow = document.createElement("div");
    editRow.className = "nopic-tr-edit-row";
    editRow.style.cssText =
      "display:flex;flex-direction:column;gap:4px;padding:6px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.3);border-radius:4px;margin-top:4px;";
    editRow.innerHTML = `
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="font-size:10px;color:rgba(255,255,255,0.5);width:40px;flex-shrink:0;">查找</span>
        <input type="text" class="nopic-textreplace-input nopic-tr-edit-from" value="${ruleData.from.replace(
          /"/g,
          "&quot;",
        )}" style="flex:1;font-size:11px;">
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="font-size:10px;color:rgba(255,255,255,0.5);width:40px;flex-shrink:0;">替换</span>
        <input type="text" class="nopic-textreplace-input nopic-tr-edit-to" value="${ruleData.to.replace(
          /"/g,
          "&quot;",
        )}" style="flex:1;font-size:11px;">
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="font-size:10px;color:rgba(255,255,255,0.5);width:40px;flex-shrink:0;">选项</span>
        <label style="font-size:10px;color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:4px;cursor:pointer;">
          <input type="checkbox" class="nopic-tr-edit-case" ${
            ruleData.caseSensitive ? "checked" : ""
          } style="width:12px;height:12px;">
          区分大小写
        </label>
      </div>
      <div style="display:flex;gap:4px;justify-content:flex-end;">
        <button class="nopic-qt-cancel-btn" style="padding:2px 8px;background:rgba(255,255,255,0.1);border-radius:3px;color:#fff;font-size:10px;cursor:pointer;">取消</button>
        <button class="nopic-qt-save-btn" style="padding:2px 8px;background:rgba(96,165,250,0.3);border:1px solid rgba(96,165,250,0.5);border-radius:3px;color:#60a5fa;font-size:10px;cursor:pointer;">保存</button>
      </div>
    `;

    Array.from(containerDiv.children).forEach(
      (c) => (c.style.display = "none"),
    );
    containerDiv.appendChild(editRow);

    const fromInput = editRow.querySelector(".nopic-tr-edit-from");
    const toInput = editRow.querySelector(".nopic-tr-edit-to");
    const caseCheck = editRow.querySelector(".nopic-tr-edit-case");
    const saveBtn = editRow.querySelector(".nopic-qt-save-btn");
    const cancelBtn = editRow.querySelector(".nopic-qt-cancel-btn");

    [fromInput, toInput].forEach((input) => {
      input.addEventListener("mousedown", (e) => e.stopPropagation());
      input.addEventListener("click", (e) => e.stopPropagation());
    });
    caseCheck.addEventListener("mousedown", (e) => e.stopPropagation());

    cancelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      editRow.remove();
      Array.from(containerDiv.children).forEach((c) => (c.style.display = ""));
    });

    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const newFrom = fromInput.value.trim();
      const newTo = toInput.value;
      if (!newFrom) return;

      const cfg = getTextReplaceConfigByScope(scope);
      cfg.rules[idx] = {
        ...cfg.rules[idx],
        from: newFrom,
        to: newTo,
        caseSensitive: caseCheck.checked,
      };
      setTextReplaceConfigByScope(scope, cfg);
      updateTextReplaceRulesList();
      applyTextReplace();
    });

    fromInput.focus();
    fromInput.select();
  }

  // 替换文字开关
  document
    .getElementById("nopic-replace-toggle")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();

      // 1. 直接读取并反转独立记忆（不碰 textReplaceConfig.enabled）
      const currentState = nopicGetToggleState("nopic_textreplace", true);
      const newState = !currentState;
      nopicSetToggleState("nopic_textreplace", newState);

      // 2. 同步功能开关
      if (newState) {
        startTextReplaceIfNeeded(); // 打开：重新初始化监听
      } else {
        restoreTextReplace(); // 恢复文字
        destroyTextReplaceListeners(); // 关键：彻底销毁监听器！
      }

      // 3. 刷新UI
      updateAllUI();
    });

  // 清除按钮事件
  textReplaceSubmenu.querySelectorAll("[data-tr-clear]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const scope = btn.dataset.trClear;
      if (scope === "global") {
        GM_setValue("nopic_textreplace_global", { rules: [] });
      } else {
        const key =
          scope === "domain"
            ? "nopic_textreplace_domain_" + location.host
            : "nopic_textreplace_" + encodeURIComponent(nopicGetUrlKey());
        localStorage.setItem(key, JSON.stringify({ rules: [] }));
      }
      updateTextReplaceRulesList();
      applyTextReplace();
    });
  });

  // 添加规则按钮
  textReplaceSubmenu.querySelectorAll("[data-tr-add]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const scope = btn.dataset.trAdd;
      const listEl = document.getElementById(`nopic-tr-list-${scope}`);
      if (listEl.querySelector(".nopic-tr-edit-row")) return;

      const editRow = document.createElement("div");
      editRow.className = "nopic-tr-edit-row";
      editRow.style.cssText =
        "display:flex;flex-direction:column;gap:4px;padding:6px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.3);border-radius:4px;margin-top:4px;";
      editRow.innerHTML = `
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="font-size:10px;color:rgba(255,255,255,0.5);width:40px;flex-shrink:0;">查找</span>
          <input type="text" class="nopic-textreplace-input nopic-tr-edit-from" placeholder="要替换的文字" style="flex:1;font-size:11px;">
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="font-size:10px;color:rgba(255,255,255,0.5);width:40px;flex-shrink:0;">替换</span>
          <input type="text" class="nopic-textreplace-input nopic-tr-edit-to" placeholder="替换为" style="flex:1;font-size:11px;">
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="font-size:10px;color:rgba(255,255,255,0.5);width:40px;flex-shrink:0;">选项</span>
          <label style="font-size:10px;color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:4px;cursor:pointer;">
            <input type="checkbox" class="nopic-tr-edit-case" style="width:12px;height:12px;">
            区分大小写
          </label>
        </div>
        <div style="display:flex;gap:4px;justify-content:flex-end;">
          <button class="nopic-qt-cancel-btn" style="padding:2px 8px;background:rgba(255,255,255,0.1);border-radius:3px;color:#fff;font-size:10px;cursor:pointer;">取消</button>
          <button class="nopic-qt-save-btn" style="padding:2px 8px;background:rgba(96,165,250,0.3);border:1px solid rgba(96,165,250,0.5);border-radius:3px;color:#60a5fa;font-size:10px;cursor:pointer;">保存</button>
        </div>
      `;
      listEl.appendChild(editRow);

      const fromInput = editRow.querySelector(".nopic-tr-edit-from");
      const toInput = editRow.querySelector(".nopic-tr-edit-to");
      const caseCheck = editRow.querySelector(".nopic-tr-edit-case");
      const saveBtn = editRow.querySelector(".nopic-qt-save-btn");
      const cancelBtn = editRow.querySelector(".nopic-qt-cancel-btn");

      [fromInput, toInput].forEach((input) => {
        input.addEventListener("mousedown", (e) => e.stopPropagation());
        input.addEventListener("click", (e) => e.stopPropagation());
      });
      caseCheck.addEventListener("mousedown", (e) => e.stopPropagation());

      cancelBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        editRow.remove();
      });

      saveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const newFrom = fromInput.value.trim();
        const newTo = toInput.value;
        if (!newFrom) return;

        const cfg = getTextReplaceConfigByScope(scope);
        if (!cfg.rules) cfg.rules = [];
        cfg.rules.push({
          id:
            "tr_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
          from: newFrom,
          to: newTo,
          caseSensitive: caseCheck.checked,
        });
        setTextReplaceConfigByScope(scope, cfg);
        updateTextReplaceRulesList();
        applyTextReplace();
      });

      fromInput.focus();
    });
  });

  // 还原替换的内容
  function restoreReplacedElements() {
    textReplaceConfig.replacedElements.forEach((item) => {
      // 查找已替换的span元素
      const spans = document.querySelectorAll(".nopic-textreplace-span");
      spans.forEach((span) => {
        if (span.textContent === item.replacedText) {
          span.textContent = item.originalText;
        }
      });
    });
  }

  // // 保存配置按钮
  // const textReplaceSaveBtn = document.getElementById(
  //   "nopic-textreplace-save-btn",
  // );
  // if (textReplaceSaveBtn) {
  //   textReplaceSaveBtn.addEventListener("click", (e) => {
  //     e.stopPropagation();
  //     // 从输入框读取所有规则值
  //     const rulesList = document.getElementById("nopic-textreplace-rules-list");
  //     if (rulesList) {
  //       const ruleElements = rulesList.querySelectorAll(
  //         ".nopic-textreplace-rule",
  //       );
  //       textReplaceConfig.rules = [];
  //       ruleElements.forEach((ruleEl) => {
  //         const fromInput = ruleEl.querySelector("[data-rule-from]");
  //         const toInput = ruleEl.querySelector("[data-rule-to]");
  //         const from = fromInput ? fromInput.value : "";
  //         const to = toInput ? toInput.value : "";
  //         if (from && to) {
  //           textReplaceConfig.rules.push({
  //             id: Date.now() + Math.random(),
  //             from: from,
  //             to: to,
  //             caseSensitive: false,
  //           });
  //         }
  //       });
  //     }
  //     setTextReplaceConfig(textReplaceConfig);
  //     updateTextReplaceRulesList();
  //     // 重新启动观察器
  //     if (textReplaceConfig.enabled) {
  //       stopTextReplaceObserver();
  //       startTextReplaceObserver();
  //     }
  //   });
  // }

  // 场景切换事件（仅影响当前编辑的scope，不影响生效规则）
  textReplaceSubmenu.querySelectorAll("[data-scope]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const newScope = btn.dataset.scope;
      nopicSetConfigScope("nopic_textreplace", newScope);
      currentTextReplaceScope = newScope;
      textReplaceConfig = getTextReplaceConfigByScope(newScope);
      updateAllUI();
    });
  });

  // 文字替换观察器
  let textReplaceObserver = null;
  let textReplaceInterval = null;

  function startTextReplaceObserver() {
    if (!textReplaceConfig.enabled) return;
    if (textReplaceConfig.rules.length === 0) return;

    // 使用 MutationObserver 监听 DOM 变化
    textReplaceObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              processTextNode(node);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              processElement(node);
            }
          });
        } else if (mutation.type === "characterData") {
          if (mutation.target.nodeType === Node.TEXT_NODE) {
            processTextNode(mutation.target);
          }
        }
      });
    });

    textReplaceObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true,
    });

    // 初始处理
    processElement(document.body);

    // 定时扫描（作为备用）
    textReplaceInterval = setInterval(() => {
      processElement(document.body);
    }, 500);
  }

  function stopTextReplaceObserver() {
    if (textReplaceObserver) {
      textReplaceObserver.disconnect();
      textReplaceObserver = null;
    }
    if (textReplaceInterval) {
      clearInterval(textReplaceInterval);
      textReplaceInterval = null;
    }
  }

  // 处理元素中的文本
  function processElement(element) {
    // 获取所有文本节点
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        // 只处理可视区域内的文本
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const rect = parent.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0)
          return NodeFilter.FILTER_REJECT;
        // 检查是否在可视区域附近（扩展范围）
        if (rect.bottom < -100 || rect.top > window.innerHeight + 100) {
          return NodeFilter.FILTER_REJECT;
        }
        // 排除脚本、样式等
        const tagName = parent.tagName.toLowerCase();
        if (
          tagName === "script" ||
          tagName === "style" ||
          tagName === "noscript"
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        // 排除已经处理的span
        if (parent.classList.contains("nopic-textreplace-span")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    textNodes.forEach((node) => {
      processTextNode(node);
    });
  }

  // 处理单个文本节点
  function processTextNode(textNode) {
    if (!textNode || !textNode.parentElement) return;

    const parent = textNode.parentElement;
    // 排除已处理的元素
    if (parent.classList.contains("nopic-textreplace-span")) return;

    // 排除输入框等
    const tagName = parent.tagName.toLowerCase();
    if (tagName === "input" || tagName === "textarea" || tagName === "select")
      return;

    let text = textNode.textContent;
    let hasMatch = false;

    textReplaceConfig.rules.forEach((rule) => {
      if (!rule.from || !rule.to) return;

      // 严格区分大小写匹配
      if (text.includes(rule.from)) {
        hasMatch = true;
      }
    });

    if (!hasMatch) return;

    // 将文本节点拆分成多个部分，匹配的部分用span包裹
    const fragments = [];
    let remainingText = text;

    textReplaceConfig.rules.forEach((rule) => {
      if (!rule.from || !rule.to) return;

      while (remainingText) {
        // 严格区分大小写查找位置
        const index = remainingText.indexOf(rule.from);

        if (index === -1) break;

        // 前面的非匹配文本
        if (index > 0) {
          fragments.push({
            text: remainingText.substring(0, index),
            replace: null,
          });
        }

        // 匹配到的文本（保持原样大小写）
        fragments.push({
          text: remainingText.substring(index, index + rule.from.length),
          replace: rule.to,
        });

        // 剩余文本继续处理
        remainingText = remainingText.substring(index + rule.from.length);
      }
    });

    // 添加剩余文本
    if (remainingText) {
      fragments.push({ text: remainingText, replace: null });
    }

    if (fragments.length === 0) return;

    // 创建新的DOM结构
    const newNodes = fragments.map((fragment) => {
      if (fragment.replace) {
        const span = document.createElement("span");
        span.className = "nopic-textreplace-span";
        span.textContent = fragment.text;
        span.dataset.replaceTo = fragment.replace;
        span.style.transition = "filter 0.3s ease, opacity 0.3s ease";

        // 应用动画效果
        setTimeout(() => {
          span.style.filter = "blur(8px)";
          span.style.opacity = "0";

          setTimeout(() => {
            span.textContent = fragment.replace;
            span.style.filter = "blur(0)";
            span.style.opacity = "1";
            span.removeAttribute("data-replace-to");
          }, 300);
        }, 50);

        return span;
      } else {
        return document.createTextNode(fragment.text);
      }
    });

    // 替换原文本节点
    const parentElement = textNode.parentElement;
    textNode.remove();
    newNodes.forEach((node) => {
      parentElement.appendChild(node);
    });
  }

  // ===== 快捷文本全局监听 =====
  function getComboString(e) {
    let keys = [];
    if (e.ctrlKey || e.metaKey) keys.push("Ctrl");
    if (e.altKey) keys.push("Alt");
    if (e.shiftKey) keys.push("Shift");

    let mainKey = "";
    if (e instanceof MouseEvent) {
      const btnMap = {
        0: "鼠标左键",
        1: "鼠标中键",
        2: "鼠标右键",
        3: "鼠标后退键",
        4: "鼠标前进键",
      };
      mainKey = btnMap[e.button] || "鼠标按键" + e.button;
    } else {
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null;
      mainKey = e.key;
      if (mainKey === " ") mainKey = "Space";
      else if (mainKey.length === 1) mainKey = mainKey.toUpperCase();
      else if (mainKey.startsWith("Arrow"))
        mainKey = mainKey.replace("Arrow", "");
      else if (mainKey === "Escape") mainKey = "Esc";
      else if (mainKey === "Delete") mainKey = "Del";
      else if (mainKey === "Backspace") mainKey = "Back";
      else if (mainKey === "Enter") mainKey = "回车";
      else if (mainKey === "Tab") mainKey = "Tab";
      // F键及标点符号等保持原样
    }

    keys.push(mainKey);
    return keys.join("+");
  }

  // 统一的结束录制处理函数
  function finishRecording(combo) {
    if (!isRecordingShortcut || !recordingTarget) return false;
    if (combo) {
      recordingTarget.value = combo;
      isRecordingShortcut = false;
      recordingTarget = null;
      // 恢复所有录制按钮状态
      quickTextSubmenu
        .querySelectorAll(".nopic-qt-record-btn")
        .forEach((btn) => {
          btn.textContent = "录制";
          btn.style.background = "rgba(239,68,68,0.3)";
          btn.style.borderColor = "rgba(239,68,68,0.5)";
          btn.style.color = "#f87171";
        });
      return true;
    }
    return false;
  }

  // 键盘录制监听
  document.addEventListener("keydown", (e) => {
    if (isRecordingShortcut) {
      e.preventDefault();
      e.stopPropagation();
      const combo = getComboString(e);
      if (finishRecording(combo)) return;
    }

    // 功能未启用或不在输入框中，不拦截
    if (!quickTextEnabled) return;
    if (
      e.target.closest("#nopic-quicktext-submenu") ||
      e.target.closest("#nopic-menu") ||
      e.target.closest("#nopic-widget")
    )
      return;

    const tag = e.target.tagName ? e.target.tagName.toLowerCase() : "";
    if (tag !== "input" && tag !== "textarea" && !e.target.isContentEditable)
      return;

    const combo = getComboString(e);
    if (!combo) return;

    const items = getEffectiveQuickTextItems();
    const matchItem = items.find((i) => i.shortcut === combo);

    if (matchItem) {
      e.preventDefault();
      e.stopPropagation();
      insertTextToTarget(e.target, matchItem.text);
    }
  });

  // 鼠标录制与触发监听
  document.addEventListener(
    "mousedown",
    (e) => {
      // 1. 处理录制逻辑
      if (isRecordingShortcut) {
        e.preventDefault();
        e.stopPropagation();
        const combo = getComboString(e);
        if (finishRecording(combo)) return;
      }

      // 2. 处理全局触发逻辑
      if (!quickTextEnabled) return;
      if (
        e.target.closest("#nopic-quicktext-submenu") ||
        e.target.closest("#nopic-menu") ||
        e.target.closest("#nopic-widget")
      )
        return;

      const tag = e.target.tagName ? e.target.tagName.toLowerCase() : "";
      if (tag !== "input" && tag !== "textarea" && !e.target.isContentEditable)
        return;

      const combo = getComboString(e);
      if (!combo) return;

      const items = getEffectiveQuickTextItems();
      const matchItem = items.find((i) => i.shortcut === combo);

      if (matchItem) {
        e.preventDefault();
        e.stopPropagation();
        insertTextToTarget(e.target, matchItem.text);
      }
    },
    true,
  ); // 使用捕获阶段确保优先拦截

  // 抽离出的文本插入逻辑
  function insertTextToTarget(target, text) {
    // 如果是数字输入框，直接赋值并触发事件，不操作选择范围
    if (target.type === "number") {
      target.value = text;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    if (target.isContentEditable) {
      document.execCommand("insertText", false, text);
    } else {
      const start = target.selectionStart || 0;
      const end = target.selectionEnd || 0;
      const value = target.value || "";
      target.value = value.substring(0, start) + text + value.substring(end);
      target.selectionStart = target.selectionEnd = start + text.length;
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  // // 初始化自动点击器（页面加载后自动执行）
  // if (
  //   autoClickerConfig.enabled &&
  //   autoClickerConfig.autoStartOnLoad &&
  //   autoClickerConfig.steps.length > 0
  // ) {
  //   if (document.readyState === 'complete') {
  //     setTimeout(executeAutoClicker, 500);
  //   } else {
  //     window.addEventListener('load', () => {
  //       setTimeout(executeAutoClicker, 500);
  //     });
  //   }
  // }

  // // 启动页面监控器
  // setTimeout(() => {
  //   if (pageMonitorEnabled) {
  //     startAllPageMonitors();
  //   }
  // }, 1000);

  // ===== 新增：主体功能延迟启动 =====
  _nopicRunWhenReady(function () {
    // 1. 初始化存储（之前被注释掉了）
    _initStorage();

    // 2. 重新读取依赖存储的配置变量
    //    因为原来的代码在 (function() { ... })() 里已经执行过了，
    //    但那时 _initStorage() 还没执行，所以配置都是默认值
    //    现在重新读取一遍，覆盖之前的默认值

    showOutlineConfig = getLocalConfig("showOutline");
    hoverOnlyConfig = getLocalConfig("hoverOnly");
    hoverShowImgConfig = getLocalConfig("hoverShowImg");
    autoSnapConfig = getLocalConfig("autoSnap");
    autoHideIdleConfig = getLocalConfig("autoHideIdle");
    zoomModeConfig = getLocalConfig("zoomMode");
    zoomLeaveModeConfig = getLocalConfig("zoomLeaveMode");
    zoomPinModeConfig = getLocalConfig("zoomPinMode");
    disableAnimationConfig = getLocalConfig("disableAnimation");
    loadAnimationConfig =
      getGlobalConfig("loadAnimation") !== undefined
        ? getGlobalConfig("loadAnimation")
        : defaultConfig.loadAnimation;
    statsRangeConfig = getGlobalConfig("statsRange");

    configs = {
      time: getGlobalConfig("displayTime"),
      seconds: getGlobalConfig("displaySeconds"),
      count: getGlobalConfig("displayCount"),
      total: getGlobalConfig("displayTotal"),
      percent: getGlobalConfig("displayPercent"),
      host: getGlobalConfig("displayHost"),
      memory: getGlobalConfig("displayMemory"),
      loadTime: getGlobalConfig("displayLoadTime"),
      resCount: getGlobalConfig("displayResCount"),
      mouseDistance: getGlobalConfig("displayMouseDistance"),
      clickCount: getGlobalConfig("displayClickCount"),
      scrollDist: getGlobalConfig("displayScrollDist"),
      readChars: getGlobalConfig("displayReadChars"),
      adCount: getGlobalConfig("displayAdCount"),
    };

    // 重新获取配置
    maskConfig = getMaskConfig();
    disguiseConfig.enabled = nopicGetToggleState(
      "nopic_disguise",
      defaultDisguiseConfig.enabled,
    );
    quickTextEnabled = nopicGetToggleState("nopic_quicktext", true);
    pageMonitorEnabled = nopicGetToggleState("nopic_pagemonitor", true);
    autoClickerConfig = getAutoClickerConfig();
    autoClickerSafetyConfig = getAutoClickerSafetyConfig();
    privacyLockConfig.enabled = nopicGetToggleState("nopic_privacylock", true);

    // 3. 更新UI（只刷新显示，不重新扫描图片）
    updateAllUI();
    updateLampState();
    updateContent();

    // 4. 重新初始化非图片相关的功能
    initDisguise();
    startTextReplaceIfNeeded();
    loadSavedMasks();
    initPrivacyLock();

    // 5. 启动页面监控器和自动点击器
    if (pageMonitorEnabled) {
      startAllPageMonitors();
    }
    if (
      autoClickerConfig.enabled &&
      autoClickerConfig.autoStartOnLoad &&
      autoClickerConfig.steps.length > 0
    ) {
      setTimeout(executeAutoClicker, 500);
    }

    // 6. 关键：如果网站之前是开启状态，重新触发图片控制
    //    但要先清除之前的定时器，避免重复
    var wasEnabled = (localStorage.getItem("nopicValueList") || "")
      .split(",")
      .includes(location.host);
    if (wasEnabled && window.imgHidenSet === null) {
      // 如果之前是开启状态但当前是关闭状态，重新开启
      imgHiden();
      window.imgHidenSet = setInterval(imgHiden, 500);
      updateLampState();
      updateAllUI();
      updateContent();
    } else if (!wasEnabled && window.imgHidenSet !== null) {
      // 如果之前是关闭状态但当前是开启状态，关闭它
      clearInterval(window.imgHidenSet);
      window.imgHidenSet = null;
      imgShown();
      updateLampState();
      updateAllUI();
      updateContent();
    }
    // 如果状态一致，什么都不做

    console.log("[nopic] 主体功能已就绪");
  });
})();
