// 网页控制大师 - 后台服务
// 目前只负责「瞬切手势」：内容脚本没有操作标签页的能力，必须由后台代劳。
// 说明：chrome.tabs.query / update / remove 在只读取 id、index 时不需要 "tabs" 权限，
// 所以这里刻意不申请任何额外权限。

// 连续滚轮的去抖：chrome.tabs.update 是异步的，紧挨着的两次滚轮很可能都查到
// 同一个「当前标签页」，结果两次都切到同一个邻居，看起来就像卡住了。
// 这里记住刚刚切过去的目标，短时间内把它当作「当前位置」，保证能一路滚下去。
const nopicPendingActive = { windowId: null, tabId: null, at: 0 };
const NOPIC_PENDING_TTL = 900;

// 判断某个标签页能不能用「瞬切手势」：内容脚本只注入 http(s) 页面，
// chrome://、扩展页、about:blank 等受限页面注入不了，手势自然也用不了。
function nopicCanSwitchTab(tab) {
  if (!tab) return false;
  const u = tab.url || tab.pendingUrl || "";
  return /^https?:\/\//i.test(u);
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;

  // 切换到上一个 / 下一个标签页（在当前窗口内循环）
  if (msg.type === "nopic-tab-switch") {
    const dir = msg.dir === -1 ? -1 : 1;
    const windowId =
      sender && sender.tab
        ? sender.tab.windowId
        : chrome.windows.WINDOW_ID_CURRENT;
    chrome.tabs.query({ windowId: windowId }, function (tabs) {
      if (chrome.runtime.lastError || !tabs || !tabs.length) return;
      tabs.sort(function (a, b) {
        return a.index - b.index;
      });

      const findById = function (id) {
        for (let i = 0; i < tabs.length; i++) {
          if (tabs[i].id === id) return i;
        }
        return -1;
      };

      let cur = -1;
      // 1) 刚发出去还没生效的切换目标优先（连续滚轮时最准）
      if (
        nopicPendingActive.tabId != null &&
        nopicPendingActive.windowId === windowId &&
        Date.now() - nopicPendingActive.at < NOPIC_PENDING_TTL
      ) {
        cur = findById(nopicPendingActive.tabId);
      }
      // 2) 其次以浏览器当前真正激活的标签页为准
      //    （事件有时还残留在旧页上，用 sender 会原地打转）
      if (cur === -1) {
        for (let i = 0; i < tabs.length; i++) {
          if (tabs[i].active) {
            cur = i;
            break;
          }
        }
      }
      // 3) 兜底才用消息发送方
      if (cur === -1 && sender && sender.tab) cur = findById(sender.tab.id);
      if (cur === -1) return;

      // 跳过「瞬切手势用不了」的页面（chrome://、扩展页、空白等无法注入内容脚本的页面），
      // 沿 dir 方向一路找到下一个能正常用瞬切手势的标签页；整圈都找不到就不动。
      let next = cur;
      for (let i = 0; i < tabs.length; i++) {
        next = (next + dir + tabs.length) % tabs.length;
        if (next === cur) break;
        if (nopicCanSwitchTab(tabs[next])) break;
      }
      if (
        next !== cur &&
        tabs[next] &&
        tabs[next].id != null &&
        nopicCanSwitchTab(tabs[next])
      ) {
        nopicPendingActive.windowId = windowId;
        nopicPendingActive.tabId = tabs[next].id;
        nopicPendingActive.at = Date.now();
        chrome.tabs.update(tabs[next].id, { active: true }, function () {
          void chrome.runtime.lastError;
        });
      }
    });
    sendResponse && sendResponse({ ok: true });
    return;
  }

  // 关闭当前标签页
  if (msg.type === "nopic-tab-close") {
    if (sender && sender.tab && sender.tab.id != null) {
      if (nopicPendingActive.tabId === sender.tab.id) {
        nopicPendingActive.tabId = null;
      }
      chrome.tabs.remove(sender.tab.id, function () {
        void chrome.runtime.lastError;
      });
    }
    sendResponse && sendResponse({ ok: true });
    return;
  }

  // ===== 拖动速览：给目标域名放行内嵌 =====
  if (msg.type === "nopic-dp-allow-frame") {
    const tabId = sender && sender.tab ? sender.tab.id : null;
    nopicDpAllowFrame(tabId, msg.url, function () {
      sendResponse && sendResponse({ ok: true });
    });
    return true; // 异步回包
  }

  // 该标签页已经没有预览窗了 → 把规则收回去
  if (msg.type === "nopic-dp-release-frame") {
    const tabId = sender && sender.tab ? sender.tab.id : null;
    nopicDpReleaseTab(tabId);
    sendResponse && sendResponse({ ok: true });
    return;
  }

  // 「进入」按钮：在新标签页打开预览里的地址
  if (msg.type === "nopic-dp-open-tab") {
    const url = typeof msg.url === "string" ? msg.url : "";
    if (/^https?:\/\//i.test(url)) {
      const opts = { url: url, active: true };
      if (sender && sender.tab) {
        if (sender.tab.index != null) opts.index = sender.tab.index + 1;
        if (sender.tab.windowId != null) opts.windowId = sender.tab.windowId;
      }
      chrome.tabs.create(opts, function () {
        void chrome.runtime.lastError;
      });
    }
    sendResponse && sendResponse({ ok: true });
    return;
  }
});

// ============================================================
// ===== 工具栏角标：显示「当前标签页隐藏图片数量」 =====
//   内容脚本定时上报本页隐藏图片数（按 tabId 区分），后台只在「激活标签页」
//   变化时把对应数字写到角标上；切换标签页角标即随之变化。
//   角标底色用蓝色同色系。
// ============================================================
const nopicBadgeCounts = {}; // tabId -> 隐藏图片数
const NOPIC_BADGE_COLOR = "#407ffc"; // 蓝色同色系

function nopicBadgeApply(tabId) {
  try {
    const n = nopicBadgeCounts[tabId] || 0;
    const text = n > 0 ? String(n > 999 ? "999+" : n) : "";
    chrome.action.setBadgeText({ tabId: tabId, text: text });
  } catch (e) {}
}

try {
  chrome.action.setBadgeBackgroundColor({ color: NOPIC_BADGE_COLOR });
  chrome.action.setBadgeTextColor({ color: "#ebf3fd" });
} catch (e) {}

try {
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.type !== "nopic-badge-set") return;
    const tabId = sender && sender.tab ? sender.tab.id : null;
    if (tabId == null) return;
    const count =
      typeof msg.count === "number" && msg.count > 0 ? msg.count : 0;
    nopicBadgeCounts[tabId] = count;
    nopicBadgeApply(tabId); // 若正好是激活标签，立即刷新
    if (sendResponse) sendResponse({ ok: true });
  });
} catch (e) {}

try {
  chrome.tabs.onActivated.addListener(function (activeInfo) {
    if (activeInfo && activeInfo.tabId != null)
      nopicBadgeApply(activeInfo.tabId);
  });
  chrome.tabs.onRemoved.addListener(function (tabId) {
    delete nopicBadgeCounts[tabId];
  });
} catch (e) {}

// ============================================================
// ===== 拖动速览 · 内嵌放行（declarativeNetRequest 会话规则） =====
//
// 绝大多数站点（含各大搜索引擎）都会用 X-Frame-Options / CSP frame-ancestors
// 拒绝被别人 iframe，不去掉这些响应头，预览窗里只会是一片「已拒绝连接」。
//
// 为了尽量少影响安全性，这里的规则做了三重收窄：
//   1. 只用 session 规则（浏览器一关就没了，不落盘）；
//   2. 用 tabIds 限定到「发起预览的那个标签页」；
//   3. 用 requestDomains 限定到「正在预览的那个域名」；
//   4. 只对 sub_frame 请求生效，主框架完全不碰；
//   5. 该标签页最后一个预览窗关掉 / 标签页刷新或关闭时立刻撤掉规则。
// ============================================================
const NOPIC_DP_RULE_BASE = 9200; // 规则 id 起始值，避开将来可能有的其它规则
const NOPIC_DP_RULE_MAX = 40; // 同时最多放行 40 个 tab+域名组合
const nopicDpRules = new Map(); // "tabId|domain" -> ruleId
let nopicDpRuleSeq = 0;

function nopicDpDomainOf(url) {
  try {
    const h = new URL(url).hostname;
    return h || null;
  } catch (e) {
    return null;
  }
}

function nopicDpHasDNR() {
  return (
    typeof chrome !== "undefined" &&
    chrome.declarativeNetRequest &&
    chrome.declarativeNetRequest.updateSessionRules
  );
}

function nopicDpAllowFrame(tabId, url, done) {
  const finish = function () {
    try {
      done && done();
    } catch (e) {}
  };
  if (tabId == null || !nopicDpHasDNR()) {
    finish();
    return;
  }
  const domain = nopicDpDomainOf(url);
  if (!domain) {
    finish();
    return;
  }
  const key = tabId + "|" + domain;
  if (nopicDpRules.has(key)) {
    finish();
    return;
  }

  // 规则太多了先回收最早的，避免无限堆积
  const stale = [];
  while (nopicDpRules.size >= NOPIC_DP_RULE_MAX) {
    const firstKey = nopicDpRules.keys().next().value;
    stale.push(nopicDpRules.get(firstKey));
    nopicDpRules.delete(firstKey);
  }

  const ruleId = NOPIC_DP_RULE_BASE + (nopicDpRuleSeq++ % 1000);
  // id 循环用满一圈后可能撞上还挂着的旧规则，先把同 id 的旧记录抹掉
  nopicDpRules.forEach(function (rid, k) {
    if (rid === ruleId) nopicDpRules.delete(k);
  });
  nopicDpRules.set(key, ruleId);

  chrome.declarativeNetRequest.updateSessionRules(
    {
      removeRuleIds: stale.concat([ruleId]),
      addRules: [
        {
          id: ruleId,
          priority: 1,
          action: {
            type: "modifyHeaders",
            responseHeaders: [
              { header: "x-frame-options", operation: "remove" },
              { header: "frame-options", operation: "remove" },
              { header: "content-security-policy", operation: "remove" },
              {
                header: "content-security-policy-report-only",
                operation: "remove",
              },
            ],
          },
          condition: {
            resourceTypes: ["sub_frame"],
            tabIds: [tabId],
            requestDomains: [domain],
          },
        },
      ],
    },
    function () {
      if (chrome.runtime.lastError) {
        // 没权限 / 规则被拒 → 记录清掉，让内容脚本走「无法内嵌」提示
        nopicDpRules.delete(key);
      }
      finish();
    },
  );
}

function nopicDpReleaseTab(tabId) {
  if (tabId == null || !nopicDpHasDNR()) return;
  const ids = [];
  const keys = [];
  const prefix = tabId + "|";
  nopicDpRules.forEach(function (ruleId, key) {
    if (key.indexOf(prefix) === 0) {
      ids.push(ruleId);
      keys.push(key);
    }
  });
  if (!ids.length) return;
  keys.forEach(function (k) {
    nopicDpRules.delete(k);
  });
  try {
    chrome.declarativeNetRequest.updateSessionRules(
      { removeRuleIds: ids },
      function () {
        void chrome.runtime.lastError;
      },
    );
  } catch (e) {}
}

// 标签页关闭 / 导航到新页面 → 预览窗肯定没了，规则跟着撤
try {
  chrome.tabs.onRemoved.addListener(function (tabId) {
    nopicDpReleaseTab(tabId);
  });
  chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
    // 一开始 loading 就说明整页在换，预览窗随之消失
    if (changeInfo && changeInfo.status === "loading") {
      nopicDpReleaseTab(tabId);
    }
  });
} catch (e) {}
