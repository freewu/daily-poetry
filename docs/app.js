/* 每日诗词 · 官网交互
 * 1. 深浅色：跟随系统 / 浅色 / 深色，三态循环；取不到系统偏好时按深色
 * 2. 简繁：整页文本按 i18n.js 的字典替换（字典由 tool/docs-i18n.mjs 生成）
 * 3. 截图灯箱、滚动显现、导航高亮
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var mq = window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;
  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------ 主题 */
  var THEME_ORDER = ["auto", "light", "dark"];
  var THEME_LABEL = {
    hans: { auto: "跟随系统", light: "浅色", dark: "深色" },
    hant: { auto: "跟隨系統", light: "淺色", dark: "深色" },
  };
  var THEME_ARIA = {
    hans: {
      auto: "主题：跟随系统，点击切到浅色",
      light: "主题：浅色，点击切到深色",
      dark: "主题：深色，点击切到跟随系统",
    },
    hant: {
      auto: "主題：跟隨系統，點擊切到淺色",
      light: "主題：淺色，點擊切到深色",
      dark: "主題：深色，點擊切到跟隨系統",
    },
  };
  /* 图标：跟随系统 = 半明半暗，浅色 = 太阳，深色 = 月亮 */
  var ICON = {
    auto: '<circle cx="12" cy="12" r="8.5" fill="none"/><path d="M12 3.5v17" stroke-linecap="round"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none"/>',
    light:
      '<circle cx="12" cy="12" r="4.2" fill="none"/><path d="M12 2.2v2.4M12 19.4v2.4M2.2 12h2.4M19.4 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19" stroke-linecap="round"/>',
    dark: '<path d="M20 14.3A8.6 8.6 0 0 1 9.7 4a8.7 8.7 0 1 0 10.3 10.3Z" fill="none" stroke-linejoin="round"/>',
  };

  var themeToggle = document.getElementById("theme-toggle");
  var themeLabel = document.getElementById("theme-label");
  var themeIcon = document.getElementById("theme-icon");

  function storedTheme() {
    try {
      var v = localStorage.getItem("dp-theme");
      return v === "light" || v === "dark" ? v : "auto";
    } catch (e) {
      return "auto";
    }
  }

  var themeMode =
    root.getAttribute("data-theme") === "light" ? "light" : "dark";
  /* 首屏内联脚本已经定过一次；这里把「手动钉住」和「跟随系统」区分开 */
  var mode = storedTheme();

  function effectiveTheme(m) {
    if (m === "light" || m === "dark") return m;
    /* auto：系统说浅色才算浅色；说不清（没有 matchMedia）一律深色 */
    if (!mq) return "dark";
    return mq.matches ? "dark" : "light";
  }

  function applyTheme(m, persist) {
    mode = m;
    themeMode = effectiveTheme(m);
    root.setAttribute("data-theme", themeMode);
    applyShotTheme(themeMode);
    if (themeToggle) {
      themeToggle.setAttribute("aria-label", THEME_ARIA[currentLang()][m]);
    }
    if (themeIcon) themeIcon.innerHTML = ICON[m];
    if (themeLabel) themeLabel.textContent = THEME_LABEL[currentLang()][m];
    if (persist) {
      try {
        if (m === "auto") localStorage.removeItem("dp-theme");
        else localStorage.setItem("dp-theme", m);
      } catch (e) {
        /* 隐私模式里存不了，只影响「记住」，不影响本次 */
      }
    }
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var next =
        THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length];
      applyTheme(next, true);
    });
  }

  /* 跟随系统时，系统切了要跟着变 */
  var onSystemChange = function () {
    if (mode === "auto") applyTheme("auto", false);
  };
  if (mq) {
    if (mq.addEventListener) mq.addEventListener("change", onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange);
  }

  /* ------------------------------------------------------------ 简繁 */
  var DICT = window.DP_I18N || {};
  var HANS_TO_HANT = DICT;
  var TEXT_ENTRIES = []; /* { node, hans } */
  var ATTR_ENTRIES = []; /* { el, attr, hans } */
  var hansTitle = document.title;
  var META_ENTRIES = [];

  function skipped(el) {
    return !!(el && el.closest && el.closest("[data-no-i18n]"));
  }

  function collect() {
    var walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          var el = node.parentElement;
          if (!el) return NodeFilter.FILTER_REJECT;
          var tag = el.tagName;
          if (tag === "SCRIPT" || tag === "STYLE")
            return NodeFilter.FILTER_REJECT;
          if (skipped(el)) return NodeFilter.FILTER_REJECT;
          return node.nodeValue && node.nodeValue.trim()
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      },
    );

    var node;
    while ((node = walker.nextNode())) {
      TEXT_ENTRIES.push({
        node: node,
        hans: node.nodeValue,
        key: node.nodeValue.trim(),
      });
    }

    var els = document.querySelectorAll(
      "[alt], [aria-label], [title], [placeholder]",
    );
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (skipped(el)) continue;
      ["alt", "aria-label", "title", "placeholder"].forEach(function (attr) {
        var v = el.getAttribute(attr);
        if (v && v.trim())
          ATTR_ENTRIES.push({ el: el, attr: attr, hans: v, key: v.trim() });
      });
    }

    var metas = document.querySelectorAll(
      "meta[name='description'], meta[property^='og:']",
    );
    for (var j = 0; j < metas.length; j++) {
      var c = metas[j].getAttribute("content");
      if (c && c.trim())
        META_ENTRIES.push({ el: metas[j], hans: c, key: c.trim() });
    }
  }

  function swap(entries, lang, kind) {
    entries.forEach(function (e) {
      if (lang === "hant") {
        var out = HANS_TO_HANT[e.key];
        if (!out) return;
        if (kind === "text") {
          var raw = e.hans;
          var lead = raw.match(/^\s*/)[0];
          var tail = raw.match(/\s*$/)[0];
          e.node.nodeValue = lead + out + tail;
        } else if (kind === "attr") {
          e.el.setAttribute(e.attr, out);
        } else {
          e.el.setAttribute("content", out);
        }
      } else {
        if (kind === "text") e.node.nodeValue = e.hans;
        else if (kind === "attr") e.el.setAttribute(e.attr, e.hans);
        else e.el.setAttribute("content", e.hans);
      }
    });
  }

  function currentLang() {
    return root.getAttribute("data-lang") === "hant" ? "hant" : "hans";
  }

  var langToggle = document.getElementById("lang-toggle");
  var langLabel = document.getElementById("lang-label");

  function applyLang(lang, persist) {
    root.setAttribute("data-lang", lang);
    root.setAttribute("lang", lang === "hant" ? "zh-Hant" : "zh-Hans");

    swap(TEXT_ENTRIES, lang, "text");
    swap(ATTR_ENTRIES, lang, "attr");
    swap(META_ENTRIES, lang, "meta");

    var titleOut = lang === "hant" ? HANS_TO_HANT[hansTitle.trim()] : null;
    document.title = titleOut || hansTitle;

    if (langLabel) langLabel.textContent = lang === "hant" ? "简体" : "繁體";
    if (langToggle) {
      langToggle.setAttribute(
        "aria-label",
        lang === "hant" ? "切換到简体中文" : "切换到繁體中文",
      );
    }
    if (themeToggle)
      themeToggle.setAttribute("aria-label", THEME_ARIA[lang][mode]);
    if (themeLabel) themeLabel.textContent = THEME_LABEL[lang][mode];

    if (persist) {
      try {
        localStorage.setItem("dp-lang", lang);
      } catch (e) {
        /* 同上 */
      }
    }
  }

  if (langToggle) {
    langToggle.addEventListener("click", function () {
      applyLang(currentLang() === "hant" ? "hans" : "hant", true);
    });
  }

  /* ------------------------------------------- 截图跟主题（浅色 / 深色两套） */
  /* 每张图都带了 data-dark（同一屏的深色版）：换主题时连截图一起换，
     不然白天主题里配一张黑乎乎的手机、夜里配一张亮纸，都不像这个 App。 */
  var shotImgs = Array.prototype.slice.call(
    document.querySelectorAll("img[data-dark]"),
  );
  shotImgs.forEach(function (img) {
    img.dataset.light = img.getAttribute("src");
  });

  function applyShotTheme(theme) {
    shotImgs.forEach(function (img) {
      var next = theme === "dark" ? img.dataset.dark : img.dataset.light;
      if (next && img.getAttribute("src") !== next) {
        img.setAttribute("src", next);
      }
    });
  }

  collect();
  /* 首屏内联脚本已按系统语言定过 data-lang，这里把文本对上去 */
  var bootLang = currentLang();
  applyTheme(mode, false);
  applyLang(bootLang, false);

  /* 深色那套图等页面空下来再预取，换主题时才不会闪一下空框 */
  var darkSources = [];
  shotImgs.forEach(function (img) {
    if (img.dataset.dark && darkSources.indexOf(img.dataset.dark) < 0) {
      darkSources.push(img.dataset.dark);
    }
  });
  var preloadDark = function () {
    darkSources.forEach(function (src) {
      var probe = new Image();
      probe.decoding = "async";
      probe.src = src;
    });
  };
  if (darkSources.length) {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(preloadDark, { timeout: 5000 });
    } else {
      window.setTimeout(preloadDark, 2500);
    }
  }

  /* ------------------------------------------------ 首屏预览：点菜单换图 */
  var heroFrames = Array.prototype.slice.call(
    document.querySelectorAll(".hero__frames > .hero__frame"),
  );
  var previews = {};
  heroFrames.forEach(function (frame) {
    if (frame.dataset.preview) previews[frame.dataset.preview] = frame;
  });

  function showPreview(key) {
    var target = previews[key];
    if (!target || target.classList.contains("is-on")) return;
    heroFrames.forEach(function (frame) {
      frame.classList.toggle("is-on", frame === target);
    });
  }

  Array.prototype.forEach.call(
    document.querySelectorAll("#nav a[data-preview]"),
    function (link) {
      var key = link.getAttribute("data-preview");
      /* 悬停 / 键盘聚焦就先换（按下之前看得到），点击后再换一次定住 */
      ["mouseenter", "focus", "click"].forEach(function (ev) {
        link.addEventListener(ev, function () {
          showPreview(key);
        });
      });
    },
  );

  /* ------------------------------------------------------------ 灯箱 */
  /* 同一张图在首屏预览和正文章节里各出现一次，按 src 去重，翻页不会原地踏步 */
  var seenShot = {};
  var shots = Array.prototype.slice
    .call(document.querySelectorAll("[data-shot]"))
    .filter(function (btn) {
      var img = btn.querySelector("img");
      var src = img && (img.getAttribute("src") || "");
      if (!src || seenShot[src]) return false;
      seenShot[src] = true;
      return true;
    });
  var lb = document.getElementById("lightbox");
  var lbImg = document.getElementById("lb-img");
  var lbCap = document.getElementById("lb-cap");
  var lbIndex = 0;
  var lastFocus = null;

  function captionOf(btn) {
    var fig = btn.closest("figure");
    var cap = fig && fig.querySelector("figcaption");
    return cap ? cap.textContent.trim() : "";
  }

  function showShot(i) {
    if (!lb || !shots.length) return;
    lbIndex = (i + shots.length) % shots.length;
    var btn = shots[lbIndex];
    var img = btn.querySelector("img");
    if (!img) return;
    lbImg.src = img.currentSrc || img.src;
    lbImg.alt = img.alt || "";
    lbCap.textContent = captionOf(btn);
    lb.setAttribute("aria-label", img.alt || "截图预览");
  }

  function openLightbox(i) {
    if (!lb) return;
    lastFocus = document.activeElement;
    showShot(i);
    lb.setAttribute("data-open", "true");
    document.body.style.overflow = "hidden";
    var close = document.getElementById("lb-close");
    if (close) close.focus();
  }

  function closeLightbox() {
    if (!lb) return;
    lb.setAttribute("data-open", "false");
    document.body.style.overflow = "";
    lbImg.removeAttribute("src");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  shots.forEach(function (btn, i) {
    btn.addEventListener("click", function () {
      openLightbox(i);
    });
  });

  if (lb) {
    var closeBtn = document.getElementById("lb-close");
    var prevBtn = document.getElementById("lb-prev");
    var nextBtn = document.getElementById("lb-next");
    if (closeBtn) closeBtn.addEventListener("click", closeLightbox);
    if (prevBtn)
      prevBtn.addEventListener("click", function () {
        showShot(lbIndex - 1);
      });
    if (nextBtn)
      nextBtn.addEventListener("click", function () {
        showShot(lbIndex + 1);
      });
    lb.addEventListener("click", function (e) {
      if (e.target === lb) closeLightbox();
    });
    document.addEventListener("keydown", function (e) {
      if (lb.getAttribute("data-open") !== "true") return;
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft") showShot(lbIndex - 1);
      else if (e.key === "ArrowRight") showShot(lbIndex + 1);
    });
  }

  /* ------------------------------------------------------------ 显现 */
  var revealEls = Array.prototype.slice.call(
    document.querySelectorAll(".reveal"),
  );
  if (!("IntersectionObserver" in window) || reduceMotion) {
    revealEls.forEach(function (el) {
      el.classList.add("in");
    });
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    revealEls.forEach(function (el) {
      io.observe(el);
    });
  }

  /* ------------------------------------------------------------ 导航 */
  var topbar = document.getElementById("topbar");
  var onScroll = function () {
    if (topbar) topbar.classList.toggle("stuck", window.scrollY > 6);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll("#nav a"),
  );
  var targets = navLinks
    .map(function (a) {
      var id = a.getAttribute("href").slice(1);
      var el = document.getElementById(id);
      return el ? { link: a, el: el } : null;
    })
    .filter(Boolean);

  if ("IntersectionObserver" in window && targets.length) {
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          targets.forEach(function (t) {
            t.link.classList.toggle("active", t.el === entry.target);
          });
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
    );
    targets.forEach(function (t) {
      spy.observe(t.el);
    });
  }
})();
