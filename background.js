// 网页控制大师 - 后台服务
// 目前只负责「瞬切手势」：内容脚本没有操作标签页的能力，必须由后台代劳。
// 说明：chrome.tabs.query / update / remove 在只读取 id、index 时不需要 "tabs" 权限，
// 所以这里刻意不申请任何额外权限。

// 连续滚轮的去抖：chrome.tabs.update 是异步的，紧挨着的两次滚轮很可能都查到
// 同一个「当前标签页」，结果两次都切到同一个邻居，看起来就像卡住了。
// 这里记住刚刚切过去的目标，短时间内把它当作「当前位置」，保证能一路滚下去。
const nopicPendingActive = { windowId: null, tabId: null, at: 0 };
const NOPIC_PENDING_TTL = 900;

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

      const next = (cur + dir + tabs.length) % tabs.length;
      if (tabs[next] && tabs[next].id != null) {
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
});
