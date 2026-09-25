(function() {
  var TRANSLATOR_ID = "orbit-translator";
  var DONATE_ID = "orbit-donate";
  var LIVE_MODEL = "models/gemini-3.5-live-translate-preview";
  var LIVE_SOCKET_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
  var POLL_MS = 1000;
  var DONATION_AMOUNTS = [10, 25, 50, 100];
  var panel = { active: null, target: "en", languages: null, languagesLoading: false, audioSource: "auto", micStream: null, isRunning: false };
  var translation = {
    status: "idle",
    error: "",
    source: "",
    translated: "",
    signature: "",
    generation: 0,
    socket: null,
    input: null,
    output: null,
    sourceNodes: [],
    mixerNode: null,
    processor: null,
    nextTime: 0,
    playing: [],
    token: "",
    model: "",
    target: "",
    mediaTracks: [],
    sessionHandle: "",
    reconnectTimer: null,
    reconnectAttempts: 0,
    sourceCount: 0,
    remoteAudioCount: 0,
    shareAudioCount: 0,
    screenShareActive: false,
    packetsSent: 0,
    lastInputPeak: 0
  };
  var lastAction = { key: "", time: 0 };

  function appStore() {
    if (window.APP && window.APP.store) {
      return window.APP.store;
    }
    return null;
  }

  function appApi() {
    if (window.APP && window.APP.API) {
      return window.APP.API;
    }
    return null;
  }

  function element(name, attributes, children) {
    var node = document.createElement(name);
    var key;
    if (attributes) {
      for (key in attributes) {
        if (!Object.prototype.hasOwnProperty.call(attributes, key)) {
          continue;
        }
        if (key === "text") {
          node.textContent = attributes[key];
        } else if (key === "htmlFor") {
          node.setAttribute("for", attributes[key]);
        } else {
          node.setAttribute(key, attributes[key]);
        }
      }
    }
    (children || []).forEach(function(child) {
      if (typeof child === "string") {
        node.appendChild(document.createTextNode(child));
      } else if (child) {
        node.appendChild(child);
      }
    });
    return node;
  }

  function injectSidebarStyles() {
    if (document.getElementById("orbit-custom-sidebar-styles")) {
      return;
    }
    var style = document.createElement("style");
    style.id = "orbit-custom-sidebar-styles";
    style.textContent = [
      "#orbit-custom-sidebar {",
      "  position: fixed;",
      "  top: 0;",
      "  bottom: 0;",
      "  left: 0;",
      "  width: 380px;",
      "  max-width: calc(100vw - 24px);",
      "  background: #121214;",
      "  border-right: 1px solid rgba(255,255,255,0.12);",
      "  box-shadow: 4px 0 32px rgba(0,0,0,0.65);",
      "  z-index: 10005;",
      "  display: flex;",
      "  flex-direction: column;",
      "  color: #f4f4f5;",
      "  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;",
      "  transform: translateX(-105%);",
      "  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), visibility 0.28s;",
      "  visibility: hidden;",
      "  overflow: hidden;",
      "}",
      "#orbit-custom-sidebar.orbit-open {",
      "  transform: translateX(0) !important;",
      "  visibility: visible !important;",
      "}",
      "#orbit-custom-sidebar[data-side='right'] {",
      "  left: auto;",
      "  right: 0;",
      "  border-right: none;",
      "  border-left: 1px solid rgba(255,255,255,0.12);",
      "  transform: translateX(105%);",
      "}",
      ".orbit-lang-item:hover { background: rgba(255,255,255,0.07); }",
      ".orbit-lang-item.orbit-selected { background: rgba(231,233,238,0.16); color: #fff; font-weight: 600; }",
      ".orbit-eq-bar { display: inline-block; width: 3px; height: 12px; background: #e7e9ee; border-radius: 1px; animation: orbit-eq 0.8s ease-in-out infinite alternate; }",
      ".orbit-eq-bar:nth-child(2) { animation-delay: 0.15s; }",
      ".orbit-eq-bar:nth-child(3) { animation-delay: 0.3s; }",
      "@keyframes orbit-eq { from { transform: scaleY(0.3); } to { transform: scaleY(1); } }",
      "#orbit-custom-backdrop {",
      "  position: fixed;",
      "  inset: 0;",
      "  background: rgba(0,0,0,0.4);",
      "  z-index: 10004;",
      "  display: none;",
      "}",
      "#orbit-custom-backdrop.orbit-open { display: block; }"
    ].join("\n");
    document.head.appendChild(style);
  }

  function getSidebarContainer() {
    var sidebar = document.getElementById("orbit-custom-sidebar");
    var backdrop = document.getElementById("orbit-custom-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "orbit-custom-backdrop";
      backdrop.addEventListener("click", closeWrapper);
      document.body.appendChild(backdrop);
    }
    if (!sidebar) {
      sidebar = document.createElement("aside");
      sidebar.id = "orbit-custom-sidebar";
      document.body.appendChild(sidebar);
    }
    return sidebar;
  }

  function closeWrapper() {
    var sidebar = getSidebarContainer();
    var backdrop = document.getElementById("orbit-custom-backdrop");
    panel.active = null;
    sidebar.classList.remove("orbit-open");
    if (backdrop) {
      backdrop.classList.remove("orbit-open");
    }
    var store = appStore();
    try {
      if (store) {
        store.dispatch({ type: "CUSTOM_PANEL_CLOSE" });
      }
    } catch (ignored) {
      // Ignore
    }
  }

  function openPanel(mode) {
    var sidebar = getSidebarContainer();
    var backdrop = document.getElementById("orbit-custom-backdrop");
    panel.active = mode;
    sidebar.setAttribute("data-side", mode === "translator" ? "left" : "right");
    sidebar.classList.add("orbit-open");
    if (backdrop && window.innerWidth < 768) {
      backdrop.classList.add("orbit-open");
    }
    renderActivePanel();
  }

  function togglePanel(mode) {
    if (panel.active === mode) {
      closeWrapper();
    } else {
      if (mode === "translator") {
        primeTranslationAudio();
      }
      openPanel(mode);
    }
  }

  function normalizeKey(value) {
    if (typeof value === "string") {
      return value;
    }
    if (value && typeof value === "object") {
      return value.key || value.id || value.buttonKey || value.buttonId || "";
    }
    return "";
  }

  function handleToolbarKey(key) {
    if (key === TRANSLATOR_ID || key === DONATE_ID) {
      lastAction = { key: key, time: Date.now() };
      togglePanel(key === TRANSLATOR_ID ? "translator" : "donate");
    }
  }

  function wrapNotify() {
    var api = appApi();
    if (!api || typeof api.notifyToolbarButtonClicked !== "function" || api.notifyToolbarButtonClicked.orbitWrapped) {
      return;
    }
    var original = api.notifyToolbarButtonClicked;
    var wrapped = function() {
      try {
        handleToolbarKey(normalizeKey(arguments.length > 0 ? arguments[0] : ""));
      } catch (ignored) {
        return original.apply(this, arguments);
      }
      return original.apply(this, arguments);
    };
    wrapped.orbitWrapped = true;
    api.notifyToolbarButtonClicked = wrapped;
  }

  function buttonLabel(node) {
    var label = node.getAttribute("aria-label") || node.getAttribute("title") || node.getAttribute("data-testid") || "";
    if (!label) {
      label = node.textContent || "";
    }
    return String(label).trim().toLowerCase();
  }

  function documentClick(event) {
    var node = event.target && event.target.closest ? event.target.closest("button,[role='button'],.toolbox-button") : null;
    var image;
    var source;
    if (!node) {
      return;
    }
    image = node.querySelector("img");
    source = image ? String(image.getAttribute("src") || "") : "";
    var label = buttonLabel(node);
    if (source.indexOf("orbit-translator.svg") !== -1 || label.indexOf("translator") !== -1 || label.indexOf("translate") !== -1) {
      if (Date.now() - lastAction.time < 400 && lastAction.key === TRANSLATOR_ID) {
        return;
      }
      handleToolbarKey(TRANSLATOR_ID);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (source.indexOf("orbit-donate.svg") !== -1 || label.indexOf("donate") !== -1) {
      if (Date.now() - lastAction.time < 400 && lastAction.key === DONATE_ID) {
        return;
      }
      handleToolbarKey(DONATE_ID);
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function renderActivePanel() {
    var host = getSidebarContainer();
    if (!panel.active) {
      return;
    }
    host.innerHTML = "";
    if (panel.active === "translator") {
      host.appendChild(renderTranslator());
    } else if (panel.active === "donate") {
      host.appendChild(renderDonate());
    }
  }

  function panelShell(title, body) {
    var wrapper = element("div", { style: "display:flex;flex-direction:column;height:100%;min-height:0;background:#121214;color:#f4f4f5;font-size:14px;" });
    var header = element("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.12);" });
    header.appendChild(element("div", { style: "font-size:16px;font-weight:600;letter-spacing:-0.01em;" }, [title]));
    var close = element("button", {
      type: "button",
      "aria-label": "Close panel",
      style: "display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid rgba(255,255,255,0.15);border-radius:8px;background:rgba(255,255,255,0.06);color:#f4f4f5;font-size:18px;line-height:1;cursor:pointer;transition:all 0.15s;"
    }, ["✕"]);
    close.addEventListener("click", closeWrapper);
    header.appendChild(close);
    wrapper.appendChild(header);
    wrapper.appendChild(body);
    return wrapper;
  }

  function loadLanguages(done) {
    if (panel.languages) {
      done(panel.languages);
      return;
    }
    if (panel.languagesLoading) {
      var waiter = window.setInterval(function() {
        if (panel.languages || !panel.languagesLoading) {
          window.clearInterval(waiter);
          done(panel.languages || []);
        }
      }, 200);
      return;
    }
    panel.languagesLoading = true;
    fetch("/api/translation-languages", { headers: { accept: "application/json" } })
      .then(function(response) {
        if (!response.ok) throw new Error("languages");
        return response.json();
      })
      .then(function(languages) {
        panel.languages = Array.isArray(languages) ? languages : [];
        panel.languagesLoading = false;
        done(panel.languages);
      })
      .catch(function() {
        panel.languages = [
          { name: "English", code: "en" },
          { name: "Spanish", code: "es" },
          { name: "French", code: "fr" },
          { name: "German", code: "de" },
          { name: "Japanese", code: "ja" },
          { name: "Chinese (Simplified)", code: "zh-Hans" }
        ];
        panel.languagesLoading = false;
        done(panel.languages);
      });
  }

  function renderTranslator() {
    var body = element("div", { style: "display:flex;flex-direction:column;min-height:0;flex:1;background:#121214;" });

    // Target Language Selector with searchable dropdown
    var langSection = element("div", { style: "padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.1);position:relative;" });
    var label = element("label", { style: "display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#a1a1aa;margin-bottom:8px;" }, ["Target Language"]);
    langSection.appendChild(label);

    var triggerBtn = element("button", {
      type: "button",
      id: "orbit-lang-trigger",
      style: "width:100%;height:44px;border:1px solid rgba(255,255,255,0.18);border-radius:10px;background:#0a0a0b;color:#f4f4f5;padding:0 12px;font-size:14px;font-weight:500;display:flex;align-items:center;justify-content:space-between;cursor:pointer;"
    });
    var currentLangDisplay = element("span", { id: "orbit-lang-display", text: "English (en)" });
    var arrowIcon = element("span", { style: "font-size:11px;color:#a1a1aa;" }, ["▼"]);
    triggerBtn.appendChild(currentLangDisplay);
    triggerBtn.appendChild(arrowIcon);
    langSection.appendChild(triggerBtn);

    // Dropdown list container
    var dropdownMenu = element("div", {
      id: "orbit-lang-dropdown",
      style: "display:none;position:absolute;top:100%;left:16px;right:16px;max-height:280px;background:#18181b;border:1px solid rgba(255,255,255,0.2);border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.7);z-index:100;overflow:hidden;flex-direction:column;"
    });

    var searchWrap = element("div", { style: "padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.1);" });
    var searchInput = element("input", {
      type: "text",
      placeholder: "Search 80+ languages…",
      style: "width:100%;height:34px;background:#0a0a0b;border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#f4f4f5;padding:0 10px;font-size:13px;outline:none;"
    });
    searchWrap.appendChild(searchInput);
    dropdownMenu.appendChild(searchWrap);

    var listWrap = element("div", { id: "orbit-lang-list", style: "flex:1;overflow-y:auto;max-height:220px;padding:4px;" });
    dropdownMenu.appendChild(listWrap);
    langSection.appendChild(dropdownMenu);
    body.appendChild(langSection);

    // Start / Stop Translator Button
    var startBtnWrap = element("div", { style: "padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);" });
    var btnStartTranslator = element("button", {
      type: "button",
      id: "orbit-btn-start-translator",
      style: "width:100%;height:40px;border-radius:8px;border:none;background:" + (panel.isRunning ? "rgba(196,84,76,0.2)" : "#e7e9ee") + ";color:" + (panel.isRunning ? "#fff7f6" : "#0a0a0b") + ";font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:opacity 0.15s ease;" + (panel.isRunning ? "border:1px solid rgba(196,84,76,0.4);" : ""),
      text: panel.isRunning ? "Stop Translator" : "Start Translator"
    });
    btnStartTranslator.addEventListener("click", function() {
      panel.isRunning = !panel.isRunning;
      if (panel.isRunning) {
        btnStartTranslator.textContent = "Stop Translator";
        btnStartTranslator.style.background = "rgba(196,84,76,0.2)";
        btnStartTranslator.style.color = "#fff7f6";
        btnStartTranslator.style.border = "1px solid rgba(196,84,76,0.4)";
        syncTranslation();
      } else {
        btnStartTranslator.textContent = "Start Translator";
        btnStartTranslator.style.background = "#e7e9ee";
        btnStartTranslator.style.color = "#0a0a0b";
        btnStartTranslator.style.border = "none";
        stopTranslation(true);
        setTranslationStatus("Ready — click 'Start Translator'", "#71717a");
      }
    });
    startBtnWrap.appendChild(btnStartTranslator);
    body.appendChild(startBtnWrap);

    function populateLanguages(languages, filter) {
      listWrap.innerHTML = "";
      var q = (filter || "").toLowerCase().trim();
      var filtered = languages.filter(function(l) {
        return !q || l.name.toLowerCase().indexOf(q) !== -1 || l.code.toLowerCase().indexOf(q) !== -1;
      });

      if (!filtered.length) {
        listWrap.appendChild(element("div", { style: "padding:12px;text-align:center;font-size:12px;color:#a1a1aa;" }, ["No matching languages"]));
        return;
      }

      filtered.forEach(function(lang) {
        var isSelected = lang.code === panel.target;
        var item = element("button", {
          type: "button",
          className: "orbit-lang-item" + (isSelected ? " orbit-selected" : ""),
          style: "width:100%;display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border:none;border-radius:6px;background:transparent;color:#f4f4f5;font-size:13px;cursor:pointer;text-align:left;"
        });
        item.appendChild(element("span", {}, [
          element("span", { style: "display:inline-block;width:24px;font-size:11px;color:#71717a;" }, [lang.code]),
          lang.name
        ]));
        if (isSelected) {
          item.appendChild(element("span", { style: "color:#e7e9ee;font-weight:700;" }, ["✓"]));
        }
        item.addEventListener("click", function() {
          panel.target = lang.code;
          currentLangDisplay.textContent = lang.name + " (" + lang.code + ")";
          dropdownMenu.style.display = "none";
          syncTranslation();
        });
        listWrap.appendChild(item);
      });
    }

    triggerBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      var isShowing = dropdownMenu.style.display === "flex";
      dropdownMenu.style.display = isShowing ? "none" : "flex";
      if (!isShowing) {
        searchInput.value = "";
        searchInput.focus();
        loadLanguages(function(langs) {
          populateLanguages(langs, "");
        });
      }
    });

    searchInput.addEventListener("input", function() {
      loadLanguages(function(langs) {
        populateLanguages(langs, searchInput.value);
      });
    });

    document.addEventListener("click", function(e) {
      if (!langSection.contains(e.target)) {
        dropdownMenu.style.display = "none";
      }
    });

    // Model & Audio Indicator Strip
    var indicatorStrip = element("div", { style: "display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.1);font-size:12px;" });
    var statusWrap = element("div", { style: "display:flex;align-items:center;gap:8px;" });
    var statusDot = element("span", { id: "orbit-status-dot", style: "width:8px;height:8px;border-radius:50%;background:#71717a;" });
    var statusText = element("span", { id: "orbit-translation-status", text: "Ready" });
    statusWrap.appendChild(statusDot);
    statusWrap.appendChild(statusText);
    indicatorStrip.appendChild(statusWrap);

    var eqWrap = element("div", { id: "orbit-eq-wrap", style: "display:flex;align-items:center;" });
    indicatorStrip.appendChild(eqWrap);
    body.appendChild(indicatorStrip);

    // Audio Source Mode Switch (Remote & Shared Audio vs Microphone test mode)
    var audioToggleWrap = element("div", { style: "padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;gap:8px;" });
    var btnRoomAudio = element("button", {
      type: "button",
      id: "orbit-source-room",
      style: "flex:1;height:34px;border:1px solid " + (panel.audioSource === "auto" ? "#e7e9ee" : "rgba(255,255,255,0.15)") + ";border-radius:8px;background:" + (panel.audioSource === "auto" ? "rgba(255,255,255,0.12)" : "transparent") + ";color:#f4f4f5;font-size:12px;font-weight:500;cursor:pointer;",
      text: "👥 Remote & Shared Audio"
    });
    var btnMicAudio = element("button", {
      type: "button",
      id: "orbit-source-mic",
      style: "flex:1;height:34px;border:1px solid " + (panel.audioSource === "mic" ? "#e7e9ee" : "rgba(255,255,255,0.15)") + ";border-radius:8px;background:" + (panel.audioSource === "mic" ? "rgba(255,255,255,0.12)" : "transparent") + ";color:#f4f4f5;font-size:12px;font-weight:500;cursor:pointer;",
      text: "🎤 Test Mic Mode"
    });

    btnRoomAudio.addEventListener("click", function() {
      panel.audioSource = "auto";
      btnRoomAudio.style.borderColor = "#e7e9ee";
      btnRoomAudio.style.background = "rgba(255,255,255,0.12)";
      btnMicAudio.style.borderColor = "rgba(255,255,255,0.15)";
      btnMicAudio.style.background = "transparent";
      stopTranslation(true);
      syncTranslation();
    });

    btnMicAudio.addEventListener("click", function() {
      panel.audioSource = "mic";
      btnMicAudio.style.borderColor = "#e7e9ee";
      btnMicAudio.style.background = "rgba(255,255,255,0.12)";
      btnRoomAudio.style.borderColor = "rgba(255,255,255,0.15)";
      btnRoomAudio.style.background = "transparent";
      if (!panel.micStream) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function(s) {
          panel.micStream = s;
          stopTranslation(true);
          syncTranslation();
        }).catch(function() {
          setTranslationError("Microphone permission denied.");
        });
      } else {
        stopTranslation(true);
        syncTranslation();
      }
    });

    audioToggleWrap.appendChild(btnRoomAudio);
    audioToggleWrap.appendChild(btnMicAudio);
    body.appendChild(audioToggleWrap);

    // Transcripts and Live State Scroll Area
    var scroll = element("div", { style: "flex:1;min-height:0;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;" });

    // Original Speech Card
    var origCard = element("div", { style: "background:#1a1a1e;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px;" });
    origCard.appendChild(element("div", { style: "font-size:11px;font-weight:700;text-transform:uppercase;color:#a1a1aa;letter-spacing:0.04em;margin-bottom:6px;" }, ["Original Speech"]));
    var sourceText = element("div", { id: "orbit-source-text", style: "font-size:13.5px;line-height:1.45;color:#a1a1aa;user-select:text;", text: "Listening for remote participant & shared audio…" });
    origCard.appendChild(sourceText);
    scroll.appendChild(origCard);

    // Translation Speech Card
    var transCard = element("div", { style: "background:#1a1a1e;border:1px solid rgba(255,255,255,0.22);border-radius:10px;padding:12px;" });
    var transHeader = element("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;" });
    transHeader.appendChild(element("div", { id: "orbit-target-label", style: "font-size:11px;font-weight:700;text-transform:uppercase;color:#e7e9ee;letter-spacing:0.04em;" }, ["Translated Speech"]));
    transHeader.appendChild(element("div", { style: "font-size:10px;padding:2px 5px;background:rgba(255,255,255,0.1);border-radius:4px;color:#a1a1aa;", text: "Live Playout" }));
    transCard.appendChild(transHeader);
    var transText = element("div", { id: "orbit-translated-text", style: "font-size:14px;font-weight:500;line-height:1.45;color:#f4f4f5;user-select:text;", text: "Translated speech will play and appear here in real time." });
    transCard.appendChild(transText);
    scroll.appendChild(transCard);

    // Debug & Stats
    var debugNode = element("div", {
      id: "orbit-translation-debug",
      style: "font-size:11px;line-height:1.4;color:#71717a;margin-top:auto;"
    }, ["Remote audio sources: 0 • Packets sent: 0"]);
    scroll.appendChild(debugNode);

    // Retry Button
    var retryBtn = element("button", {
      id: "orbit-retry",
      type: "button",
      style: "display:none;width:100%;height:40px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#f4f4f5;font-size:13px;font-weight:600;cursor:pointer;margin-top:8px;",
      text: "↻ Reconnect live translator"
    });
    retryBtn.addEventListener("click", function() {
      stopTranslation(true);
      primeTranslationAudio();
      syncTranslation();
    });
    scroll.appendChild(retryBtn);

    body.appendChild(scroll);

    // Initial load of language list
    loadLanguages(function(languages) {
      if (!languages.length) return;
      var sel = languages.find(function(l) { return l.code === panel.target; }) || languages[0];
      currentLangDisplay.textContent = sel.name + " (" + sel.code + ")";
      populateLanguages(languages, "");
      syncTranslation();
    });

    window.setTimeout(syncTranslation, 80);
    return panelShell("Live Translator", body);
  }

  function renderDonate() {
    var body = element("div", { style: "flex:1;min-height:0;overflow-y:auto;padding:16px;background:#121214;" });
    var card = element("div", { style: "border:1px solid rgba(255,255,255,0.12);background:#1a1a1e;border-radius:12px;padding:14px;margin-bottom:16px;" });
    card.appendChild(element("div", { style: "font-size:15px;font-weight:700;margin-bottom:6px;" }, ["Support Orbit"]));
    card.appendChild(element("div", { style: "font-size:13px;line-height:1.45;color:#a1a1aa;" }, ["Help keep simple, private meetings open to everyone."]));
    body.appendChild(card);
    body.appendChild(element("div", { style: "font-size:13px;font-weight:600;margin-bottom:8px;" }, ["Donation amount"]));
    var grid = element("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;" });
    DONATION_AMOUNTS.forEach(function(amount) {
      var choice = element("button", { type: "button", "data-orbit-amount": String(amount), style: "height:42px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:#f4f4f5;font-size:14px;font-weight:600;cursor:pointer;" }, ["$" + amount]);
      choice.addEventListener("click", function() {
        var input = body.querySelector("#orbit-custom-amount");
        if (input) input.value = "";
        donate(amount, body);
      });
      grid.appendChild(choice);
    });
    body.appendChild(grid);
    var customLabel = element("label", { htmlFor: "orbit-custom-amount", style: "display:block;font-size:13px;font-weight:600;margin-bottom:6px;" }, ["Custom amount"]);
    var custom = element("input", { id: "orbit-custom-amount", type: "number", min: "5", max: "500", value: "25", style: "width:100%;height:42px;border:1px solid rgba(255,255,255,0.18);border-radius:8px;background:#0a0a0b;color:#f4f4f5;padding:0 12px;font-size:14px;margin-bottom:14px;outline:none;" });
    body.appendChild(customLabel);
    body.appendChild(custom);
    var donateButton = element("button", { type: "button", style: "width:100%;height:44px;border:0;border-radius:8px;background:#e7e9ee;color:#0a0a0b;font-size:14px;font-weight:700;cursor:pointer;" }, ["Continue to Stripe"]);
    donateButton.addEventListener("click", function() {
      var amount = Number(custom.value);
      if (!Number.isInteger(amount) || amount < 5 || amount > 500) {
        setDonateMessage(body, "Choose an amount from $5 to $500.", true);
        return;
      }
      donate(amount, body);
    });
    body.appendChild(donateButton);
    body.appendChild(element("div", { id: "orbit-donate-message", role: "status", style: "display:none;margin-top:12px;border:1px solid rgba(255,255,255,0.15);background:#1a1a1e;border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.4;" }));
    return panelShell("Support Orbit", body);
  }

  function setDonateMessage(body, message, isError) {
    var node = body.querySelector("#orbit-donate-message");
    if (!node) return;
    node.style.display = "block";
    node.style.color = isError ? "#c4544c" : "inherit";
    node.textContent = message;
  }

  function donate(amount, body) {
    var buttons = body.querySelectorAll("button");
    var index;
    for (index = 0; index < buttons.length; index += 1) {
      buttons[index].disabled = true;
    }
    setDonateMessage(body, "Opening checkout…", false);
    fetch("/api/donate", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "*/*" },
      body: JSON.stringify({ amount: amount, returnPath: window.location.pathname || "/" })
    })
      .then(function(response) {
        return response.json().then(function(payload) {
          return { ok: response.ok, payload: payload || {} };
        });
      })
      .then(function(result) {
        var i;
        for (i = 0; i < buttons.length; i += 1) {
          buttons[i].disabled = false;
        }
        if (!result.ok) {
          setDonateMessage(body, result.payload.error || "Checkout could not be created.", true);
          return;
        }
        if (result.payload.mode === "live" && result.payload.url) {
          window.location.assign(result.payload.url);
          return;
        }
        setDonateMessage(body, "Demo donation of $" + amount + " prepared. No payment was taken.", false);
      })
      .catch(function() {
        var i;
        for (i = 0; i < buttons.length; i += 1) {
          buttons[i].disabled = false;
        }
        setDonateMessage(body, "Checkout could not be created.", true);
      });
  }

  function audioContextConstructor() {
    return window.AudioContext || window.webkitAudioContext || null;
  }

  function ensureAudioContexts() {
    var Constructor = audioContextConstructor();
    if (!Constructor) throw new Error("AudioContext is unavailable");
    if (!translation.input || translation.input.state === "closed") {
      translation.input = new Constructor();
    }
    if (!translation.output || translation.output.state === "closed") {
      translation.output = new Constructor({ sampleRate: 24000 });
    }
    return { input: translation.input, output: translation.output };
  }

  function primeTranslationAudio() {
    try {
      var contexts = ensureAudioContexts();
      contexts.input.resume().catch(function() { return null; });
      contexts.output.resume().catch(function() { return null; });
    } catch (ignored) {
      // Ignored
    }
  }

  function clearReconnectTimer() {
    if (translation.reconnectTimer) {
      window.clearTimeout(translation.reconnectTimer);
      translation.reconnectTimer = null;
    }
  }

  function disconnectInput() {
    (translation.sourceNodes || []).forEach(function(node) {
      try { node.disconnect(); } catch (ignored) { /* Ignore */ }
    });
    translation.sourceNodes = [];
    if (translation.processor) {
      try { translation.processor.disconnect(); } catch (ignored) { /* Ignore */ }
      translation.processor.onaudioprocess = null;
      translation.processor = null;
    }
    if (translation.mixerNode) {
      try { translation.mixerNode.disconnect(); } catch (ignored) { /* Ignore */ }
      translation.mixerNode = null;
    }
  }

  function stopOutputPlayback() {
    (translation.playing || []).forEach(function(source) {
      try { source.stop(); } catch (ignored) { /* Ignore */ }
    });
    translation.playing = [];
    if (translation.output) {
      translation.nextTime = translation.output.currentTime;
    }
  }

  function closeSocket() {
    var socket = translation.socket;
    if (!socket) return;
    translation.socket = null;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try { socket.close(); } catch (ignored) { /* Ignore */ }
  }

  function stopTranslation(keepAudio) {
    translation.generation += 1;
    translation.status = "idle";
    translation.error = "";
    translation.signature = "";
    translation.token = "";
    translation.model = "";
    translation.target = "";
    translation.mediaTracks = [];
    translation.sessionHandle = "";
    translation.reconnectAttempts = 0;
    translation.sourceCount = 0;
    translation.remoteAudioCount = 0;
    translation.shareAudioCount = 0;
    translation.screenShareActive = false;
    translation.packetsSent = 0;
    translation.lastInputPeak = 0;
    updateTranslationDebug();
    clearReconnectTimer();
    closeSocket();
    disconnectInput();
    stopOutputPlayback();
    if (!keepAudio) {
      if (translation.input) {
        translation.input.close().catch(function() { return null; });
        translation.input = null;
      }
      if (translation.output) {
        translation.output.close().catch(function() { return null; });
        translation.output = null;
      }
    }
  }

  function floatToBase64(input) {
    var bytes = new Uint8Array(input.length * 2);
    var view = new DataView(bytes.buffer);
    var index;
    for (index = 0; index < input.length; index += 1) {
      var sample = Math.max(-1, Math.min(1, input[index]));
      view.setInt16(index * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    }
    var binary = "";
    for (index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    var binary = atob(value);
    var bytes = new Uint8Array(binary.length);
    var index;
    for (index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function scheduleOutput(bytes, output, next) {
    var samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    var buffer = output.createBuffer(1, samples.length, 24000);
    var channel = buffer.getChannelData(0);
    var index;
    for (index = 0; index < samples.length; index += 1) {
      channel[index] = samples[index] / 32768;
    }
    if (next.value > output.currentTime + 2) {
      next.value = output.currentTime + 0.03;
    }
    var source = output.createBufferSource();
    source.buffer = buffer;
    source.connect(output.destination);
    var startAt = Math.max(output.currentTime + 0.03, next.value);
    source.start(startAt);
    next.value = startAt + buffer.duration;
    translation.playing.push(source);
    source.onended = function() {
      translation.playing = translation.playing.filter(function(item) {
        return item !== source;
      });
      if (!translation.playing.length && translation.status === "playing") {
        translation.status = "listening";
        setTranslationStatus("Listening for speech…", "#8aa892");
      }
    };
  }

  function translationMedia() {
    if (panel.audioSource === "mic" && panel.micStream) {
      var micTracks = panel.micStream.getAudioTracks().filter(function(t) { return t.readyState === "live"; });
      return {
        tracks: micTracks,
        signature: ["mic:" + (micTracks[0] ? micTracks[0].id : "mic")].join("|"),
        seen: {},
        remoteAudioCount: 0,
        shareAudioCount: 0,
        screenShareActive: false
      };
    }

    var store = appStore();
    var result = {
      tracks: [],
      signature: [],
      seen: {},
      remoteAudioCount: 0,
      shareAudioCount: 0,
      screenShareActive: false
    };
    if (!store) return result;

    var state = store.getState();
    var tracks = state["features/base/tracks"] || [];

    tracks.forEach(function(track) {
      var jitsiTrack = track && track.jitsiTrack;
      var mediaTrack = null;
      var participantId = track && track.participantId ? track.participantId : "remote";
      var sourceName = "";
      var trackId = "";

      if (!track || !jitsiTrack) return;

      // EXCLUDE current user's own microphone to prevent self-translation and feedback loops!
      if (track.local) {
        return;
      }

      if (track.mediaType === "video" && (track.videoType === "desktop" || (jitsiTrack.getVideoType && jitsiTrack.getVideoType() === "desktop"))) {
        result.screenShareActive = true;
        if (typeof jitsiTrack.getOriginalStream === "function") {
          try {
            var orig = jitsiTrack.getOriginalStream();
            if (orig && typeof orig.getAudioTracks === "function") {
              orig.getAudioTracks().forEach(function(audioTrack) {
                if (audioTrack && audioTrack.kind === "audio" && audioTrack.readyState === "live") {
                  var id = audioTrack.id || "share";
                  if (!result.seen[id]) {
                    result.seen[id] = true;
                    result.tracks.push(audioTrack);
                    result.signature.push("share:" + id);
                    result.shareAudioCount += 1;
                  }
                }
              });
            }
          } catch (ignored) { /* Ignore */ }
        }
      }

      if (track.mediaType !== "audio" || track.muted || typeof jitsiTrack.getTrack !== "function") return;

      try {
        mediaTrack = jitsiTrack.getTrack();
        if (typeof jitsiTrack.getParticipantId === "function") participantId = jitsiTrack.getParticipantId() || participantId;
        if (typeof jitsiTrack.getSourceName === "function") sourceName = jitsiTrack.getSourceName() || "";
        trackId = jitsiTrack.getTrackId ? jitsiTrack.getTrackId() : (mediaTrack ? mediaTrack.id : "");
      } catch (ignored) {
        mediaTrack = null;
      }

      if (mediaTrack && mediaTrack.kind === "audio" && mediaTrack.readyState === "live") {
        var sigId = String(participantId) + ":" + String(sourceName) + ":" + String(trackId);
        if (!result.seen[sigId]) {
          result.seen[sigId] = true;
          result.tracks.push(mediaTrack);
          result.signature.push(sigId);
          if (!track.local) result.remoteAudioCount += 1;
        }
      }
    });

    result.signature = result.signature.sort().join("|");
    return result;
  }

  function setTranslationStatus(text, color) {
    var status = document.querySelector("#orbit-translation-status");
    var dot = document.querySelector("#orbit-status-dot");
    var eq = document.querySelector("#orbit-eq-wrap");
    if (status) status.textContent = text;
    if (dot) dot.style.background = color || "#71717a";
    if (eq) {
      eq.style.display = "flex";
      eq.innerHTML = "";
      var isActive = translation.status === "playing" || translation.status === "listening" || translation.status === "connecting";
      var svgNS = "http://www.w3.org/2000/svg";
      var svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("width", "72");
      svg.setAttribute("height", "22");
      svg.setAttribute("style", "overflow:visible;color:#e7e9ee;");
      var barCount = 8;
      var width = 72;
      var height = 22;
      for (var i = 0; i < barCount; i++) {
        var rect = document.createElementNS(svgNS, "rect");
        var val = isActive ? Math.random() * 0.75 + 0.25 : 0.15;
        rect.setAttribute("x", String(i * (width / barCount)));
        rect.setAttribute("y", String(height * (1 - val)));
        rect.setAttribute("width", String(Math.max(2, (width / barCount) - 2)));
        rect.setAttribute("height", String(height * val));
        rect.setAttribute("rx", "1.5");
        rect.setAttribute("fill", "currentColor");
        rect.setAttribute("opacity", isActive ? "0.9" : "0.4");
        svg.appendChild(rect);
      }
      eq.appendChild(svg);
    }
    var retry = document.querySelector("#orbit-retry");
    if (retry) retry.style.display = translation.status === "error" ? "block" : "none";
  }

  function setTranslationDebug(text) {
    var node = document.querySelector("#orbit-translation-debug");
    if (node) node.textContent = text;
  }

  function updateTranslationDebug() {
    setTranslationDebug("Remote audio sources: " + translation.sourceCount + " • Packets sent: " + translation.packetsSent);
  }

  function setTranslationText(kind, text) {
    var node = document.querySelector(kind === "source" ? "#orbit-source-text" : "#orbit-translated-text");
    if (node) node.textContent = text;
  }

  function setTranslationError(message) {
    translation.status = "error";
    translation.error = message;
    setTranslationStatus("Translation error", "#c4544c");
    setTranslationText("translated", message);
  }

  function syncTranslation() {
    var media = translationMedia();
    translation.sourceCount = media.tracks.length;
    translation.remoteAudioCount = media.remoteAudioCount;
    translation.shareAudioCount = media.shareAudioCount;
    translation.screenShareActive = media.screenShareActive;
    updateTranslationDebug();

    if (!panel.isRunning) {
      if (translation.signature || translation.status === "connecting" || translation.status === "listening" || translation.status === "playing") {
        stopTranslation(true);
      }
      translation.status = "idle";
      setTranslationStatus("Ready — click 'Start Translator'", "#71717a");
      return;
    }

    if (!media.tracks.length) {
      if (translation.signature || translation.status === "connecting" || translation.status === "listening" || translation.status === "playing") {
        stopTranslation(true);
      }
      translation.status = "idle";
      setTranslationStatus("Waiting for audio input…", "#71717a");
      setTranslationText("source", panel.audioSource === "mic" ? "Test mic active. Speak to translate." : "Waiting for remote participants or shared media…");
      return;
    }

    var expectedSignature = media.signature + "|" + panel.target;
    if (translation.signature === expectedSignature && (translation.socket || translation.reconnectTimer || translation.status === "connecting")) {
      return;
    }

    stopTranslation(true);
    translation.sourceCount = media.tracks.length;
    startTranslation(media.tracks, expectedSignature, panel.target);
  }

  function startTranslation(mediaTracks, signature, target) {
    var generation = translation.generation + 1;
    var contexts;
    translation.generation = generation;
    translation.status = "connecting";
    translation.error = "";
    translation.signature = signature;
    translation.target = target;
    translation.mediaTracks = mediaTracks.slice();
    translation.sessionHandle = "";
    translation.reconnectAttempts = 0;
    translation.packetsSent = 0;
    updateTranslationDebug();
    setTranslationStatus("Connecting to Gemini 3.5 Live…", "#eab308");
    setTranslationText("source", "Listening for speech…");
    setTranslationText("translated", "Translation will appear here in real time.");

    try {
      contexts = ensureAudioContexts();
      contexts.input.resume().catch(function() { return null; });
      contexts.output.resume().catch(function() { return null; });
      translation.nextTime = contexts.output.currentTime;
    } catch (contextError) {
      setTranslationError("Browser audio system could not be initialized.");
      return;
    }

    fetch("/api/translate-token", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ targetLanguageCode: target })
    })
      .then(function(response) {
        return response.json().then(function(payload) {
          return { ok: response.ok, payload: payload || {} };
        });
      })
      .then(function(result) {
        if (generation !== translation.generation) return;
        if (!result.ok || !result.payload.token || !result.payload.model) {
          setTranslationError(result.payload.error || "Translation could not start. Please try again.");
          return;
        }
        translation.token = result.payload.token;
        translation.model = result.payload.model;
        openLiveSocket(mediaTracks, result.payload.token, result.payload.model, target, generation, "");
      })
      .catch(function() {
        if (generation !== translation.generation) return;
        setTranslationError("Translation service unavailable.");
      });
  }

  function openLiveSocket(mediaTracks, token, model, target, generation, sessionHandle) {
    var socket;
    var url = LIVE_SOCKET_URL + "?key=" + encodeURIComponent(token);
    try {
      socket = new WebSocket(url);
    } catch (socketError) {
      setTranslationError("WebSocket connection to Gemini Live failed.");
      return;
    }
    translation.socket = socket;

    socket.onopen = function() {
      if (generation !== translation.generation) {
        try { socket.close(); } catch (ignored) { /* Ignore */ }
        return;
      }
      var setup = {
        model: model.indexOf("models/") === 0 ? model : "models/" + model,
        generationConfig: {
          responseModalities: ["AUDIO"],
          mediaResolution: "MEDIA_RESOLUTION_MEDIUM",
          contextWindowCompression: {
            triggerTokens: "0",
            slidingWindow: { targetTokens: "0" }
          },
          translationConfig: {
            targetLanguageCode: target,
            echoTargetLanguage: true
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        sessionResumption: sessionHandle ? { handle: sessionHandle } : {}
      };
      socket.send(JSON.stringify({ setup: setup }));
    };

    socket.onmessage = function(event) {
      if (generation !== translation.generation) return;
      var data;
      try {
        data = JSON.parse(event.data);
      } catch (parseError) {
        return;
      }

      if (data.sessionResumption && data.sessionResumption.handle) {
        translation.sessionHandle = data.sessionResumption.handle;
      }

      var serverContent = data.serverContent;
      if (serverContent) {
        if (serverContent.interrupted) {
          stopOutputPlayback();
        }
        if (serverContent.inputTranscription && serverContent.inputTranscription.text) {
          translation.source = serverContent.inputTranscription.text;
          setTranslationText("source", translation.source);
        }
        if (serverContent.outputTranscription && serverContent.outputTranscription.text) {
          translation.translated = serverContent.outputTranscription.text;
          setTranslationText("translated", translation.translated);
        }

        var parts = (serverContent.modelTurn && serverContent.modelTurn.parts) || [];
        parts.forEach(function(part) {
          if (part.text && !translation.translated) {
            translation.translated = part.text;
            setTranslationText("translated", part.text);
          }
          var audio = part.inlineData;
          if (audio && audio.data && audio.mimeType && audio.mimeType.indexOf("audio/") === 0) {
            translation.status = "playing";
            setTranslationStatus("Speaking translated audio…", "#e7e9ee");
            if (translation.output) {
              var next = { value: translation.nextTime };
              scheduleOutput(base64ToBytes(audio.data), translation.output, next);
              translation.nextTime = next.value;
            }
          }
        });

        if (serverContent.turnComplete && translation.status !== "playing") {
          translation.status = "listening";
          setTranslationStatus("Listening for speech…", "#8aa892");
        }
      }

      if (data.setupComplete) {
        translation.status = "listening";
        setTranslationStatus("Listening & translating…", "#8aa892");
        startInput(mediaTracks, generation);
      }
    };

    socket.onerror = function() {
      if (generation !== translation.generation) return;
      setTranslationError("Gemini live connection failed.");
    };

    socket.onclose = function() {
      if (generation !== translation.generation) return;
      translation.status = "idle";
      setTranslationStatus("Connection closed. Reconnecting…", "#eab308");
      window.setTimeout(function() {
        syncTranslation();
      }, 1500);
    };
  }

  function downsample(input, rate) {
    if (rate === 16000) return input;
    var ratio = rate / 16000;
    var length = Math.max(1, Math.floor(input.length / ratio));
    var output = new Float32Array(length);
    for (var index = 0; index < length; index += 1) {
      var start = Math.floor(index * ratio);
      var end = Math.min(input.length, Math.floor((index + 1) * ratio));
      var total = 0;
      var count = 0;
      while (start < end) {
        total += input[start];
        start += 1;
        count += 1;
      }
      output[index] = count ? total / count : 0;
    }
    return output;
  }

  function startInput(mediaTracks, generation) {
    var input = translation.input;
    var socket = translation.socket;
    if (!input || !socket || generation !== translation.generation) return;
    disconnectInput();

    var liveTracks = mediaTracks.filter(function(t) { return t && t.kind === "audio" && t.readyState === "live"; });
    if (!liveTracks.length) {
      setTranslationError("No active audio tracks to translate.");
      return;
    }

    try {
      var mixer = input.createGain();
      mixer.gain.value = 1 / Math.max(1, Math.sqrt(liveTracks.length));
      translation.sourceNodes = liveTracks.map(function(track) {
        var source = input.createMediaStreamSource(new MediaStream([track]));
        source.connect(mixer);
        return source;
      });

      var processor = input.createScriptProcessor(1024, 1, 1);
      processor.onaudioprocess = function(event) {
        if (generation !== translation.generation || !translation.socket || translation.socket.readyState !== 1) return;
        event.outputBuffer.getChannelData(0).fill(0);
        if (translation.socket.bufferedAmount > 512 * 1024) return;

        var live = downsample(event.inputBuffer.getChannelData(0), input.sampleRate);
        translation.packetsSent += 1;
        if (translation.packetsSent === 1 || translation.packetsSent % 15 === 0) {
          updateTranslationDebug();
        }

        translation.socket.send(JSON.stringify({
          realtimeInput: {
            audio: { data: floatToBase64(live), mimeType: "audio/pcm;rate=16000" }
          }
        }));
      };

      mixer.connect(processor);
      processor.connect(input.destination);
      translation.mixerNode = mixer;
      translation.processor = processor;
      input.resume().catch(function() { return null; });
    } catch (inputError) {
      disconnectInput();
      setTranslationError("Failed to capture audio stream for translation.");
    }
  }

  function poll() {
    wrapNotify();
    syncTranslation();
  }

  function handleKeyDown(event) {
    if (event.key === "Escape" && panel.active) {
      closeWrapper();
      return;
    }
    if ((event.key === "x" || event.key === "X") && !event.ctrlKey && !event.metaKey && !event.altKey) {
      var target = event.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      togglePanel("translator");
    }
  }

  function boot() {
    injectSidebarStyles();
    wrapNotify();
    document.addEventListener("click", documentClick, true);
    document.addEventListener("keydown", handleKeyDown, true);
    window.setInterval(poll, POLL_MS);
    window.setTimeout(poll, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
