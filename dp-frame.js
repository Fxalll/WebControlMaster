// 网页控制大师 · 子框架主题探针（拖动速览专用）
//
// 为什么需要这个文件：
//   「拖动速览」窗口右上角的三个按钮要跟着 iframe 里那个网页的深浅色走。
//   跨域 iframe 的 DOM 在父页面里是读不到的，所以只能派一个极小的脚本进到
//   每个子框架里，等父窗口来问的时候把算好的深 / 浅报回去。
//
// 设计约束：
//   1. 这个脚本会被注入到所有页面的所有子框架（广告位、统计 iframe 都算），
//      所以必须足够小、足够懒 —— 只挂一个 message 监听，不问不算。
//   2. 只回答自己的父窗口，别的窗口发来的一律不理。
//   3. 顶层框架直接退出，什么都不做。
//
// 顺带一个副作用（有意为之）：Chrome 拒绝内嵌时会把框架换成内部错误页，
// 那种页面不会注入内容脚本，于是父页面永远等不到回信 ——
// 父页面正是靠「探针没回话」来判断这个站点内嵌失败的。

(function () {
  "use strict";

  // 注：预览 iframe 加载的目标站点「主框架」也需要响应主题探针（它的背景色才是
  // 我们想贴近的颜色），所以这里不再 early-return。所有能力都靠「只回答自己父窗口」
  // 的 parent 校验兜底，不会误伤宿主页面（宿主页不会被 content.js 主动发探针 / 转发指令）。

  function firstOpaqueBg() {
    var node = document.body || document.documentElement;
    var guard = 0;
    while (node && guard++ < 6) {
      var c = "";
      try {
        c = window.getComputedStyle(node).backgroundColor || "";
      } catch (e) {}
      if (c && c !== "transparent") {
        var m = c.match(/[\d.]+/g);
        if (m && m.length >= 3) {
          var a = m.length > 3 ? parseFloat(m[3]) : 1;
          if (a >= 0.35) return m;
        }
      }
      node = node.parentElement;
    }
    return null;
  }

  // 返回 { theme, bg, lum }：
  //   theme —— "light" / "dark" 兜底分类（无背景色时靠 color-scheme 推断）
  //   bg    —— 页面首个不透明背景色的 [r,g,b]；没有则 null（交给 light/dark 默认配色）
  //   lum   —— 该背景色的相对亮度，便于父窗口据此决定文字 / 按钮配色
  function computeThemeInfo() {
    var m = firstOpaqueBg();
    if (!m) {
      // 页面没有显式背景 → 看它声明的 color-scheme，再退回浏览器默认白底
      var cs = "";
      try {
        cs =
          window.getComputedStyle(document.documentElement).colorScheme || "";
      } catch (e) {}
      if (/\bdark\b/.test(cs) && !/\blight\b/.test(cs))
        return { theme: "dark", bg: null, lum: null };
      try {
        if (
          /\bdark\b/.test(cs) &&
          window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches
        )
          return { theme: "dark", bg: null, lum: null };
      } catch (e) {}
      return { theme: "light", bg: null, lum: null };
    }
    var r = parseFloat(m[0]);
    var g = parseFloat(m[1]);
    var b = parseFloat(m[2]);
    var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return { theme: lum >= 0.6 ? "light" : "dark", bg: [r, g, b], lum: lum };
  }

  function computeTheme() {
    return computeThemeInfo().theme;
  }

  window.addEventListener(
    "message",
    function (e) {
      var d = e && e.data;
      if (!d || d.__nopicDp !== "probe" || !d.id) return;
      // 只认自己的父窗口
      try {
        if (e.source !== window.parent) return;
      } catch (err) {
        return;
      }
      var info = { theme: "light", bg: null, lum: null };
      try {
        info = computeThemeInfo();
      } catch (err) {}
      try {
        e.source.postMessage(
          {
            __nopicDp: "probe-result",
            id: d.id,
            theme: info.theme,
            bg: info.bg,
            lum: info.lum,
          },
          "*",
        );
      } catch (err) {}
    },
    false,
  );

  // ---------- 摇晃撤销的鼠标位置转发 ----------
  // 父页面的 dragover 收不到「指针停在跨域 iframe 上」的那段移动，
  // 所以这里把子框架内部的 dragover / mousemove 转发出去，
  // 让父页面在「拖动途中」也能据此判断摇晃手势（松手后父页面会忽略这些转发）。
  // 平时不挂监听，只有父页面发来 {__nopicDp:"shake", on:true} 时才开始转发。
  var _shakeOn = false;
  var _shakeHandler = function (e) {
    try {
      window.parent.postMessage(
        { __nopicDp: "shake-move", x: e.clientX, t: Date.now() },
        "*",
      );
    } catch (err) {}
  };
  function _shakeSet(on) {
    on = !!on;
    if (on === _shakeOn) return;
    _shakeOn = on;
    if (on) {
      window.addEventListener("mousemove", _shakeHandler, true);
      window.addEventListener("dragover", _shakeHandler, true);
    } else {
      window.removeEventListener("mousemove", _shakeHandler, true);
      window.removeEventListener("dragover", _shakeHandler, true);
    }
  }

  window.addEventListener(
    "message",
    function (e) {
      var d = e && e.data;
      if (!d || d.__nopicDp !== "shake") return;
      try {
        if (e.source !== window.parent) return;
      } catch (err) {
        return;
      }
      _shakeSet(d.on);
    },
    false,
  );

  // ---------- 拖拽速览内链接拦截：新标签意图 → 改在当前预览窗内新增 iframe ----------
  // 父页面（content.js）只在「拖拽速览」的预览 iframe 上发 {__nopicDp:"capture-links",on:true}，
  // 所以普通子框架不会受影响；本文件默认不挂监听，收到指令才开启。
  var _linkCapOn = false;
  var _linkCapHandler = function (e) {
    if (e.defaultPrevented) return;
    // 修饰键 / 非左键 → 用户明确想用新标签，放行
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
      return;
    // 找到被点的 <a>
    var a = e.target;
    while (a && a !== document && a.tagName !== "A") a = a.parentElement;
    if (!a || a.tagName !== "A") return;
    var href = a.getAttribute("href");
    if (!href) return;
    var abs = a.href; // 自带绝对化
    // 只拦截真正的网页跳转（http/https），放过 # / javascript: / mailto: / tel: 等
    if (!/^https?:\/\//i.test(abs)) return;
    // 一律在本预览窗内新增一层 iframe 继续打开，形成可返回的浏览历史
    e.preventDefault();
    e.stopPropagation();
    try {
      window.parent.postMessage({ __nopicDp: "open-url", url: abs }, "*");
    } catch (err) {}
  };
  function _linkCapSet(on) {
    on = !!on;
    if (on === _linkCapOn) return;
    _linkCapOn = on;
    if (on) document.addEventListener("click", _linkCapHandler, true);
    else document.removeEventListener("click", _linkCapHandler, true);
  }

  window.addEventListener(
    "message",
    function (e) {
      var d = e && e.data;
      if (!d || d.__nopicDp !== "capture-links") return;
      try {
        if (e.source !== window.parent) return;
      } catch (err) {
        return;
      }
      _linkCapSet(d.on);
    },
    false,
  );

})();
