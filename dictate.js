/*
 * ReadTune — talk to type (dictation)
 *
 * Injected on demand (activeTab) by the popup button or Alt+D. Uses the
 * browser's speech recognition to type what you say into whatever text field
 * you're working in — an email, a doc, a form, a comment box. Injecting again,
 * pressing Stop, or Esc removes it cleanly.
 *
 * Speech recognition in Chrome sends audio to Google's servers to transcribe;
 * that is the browser's engine, not ReadTune's. Nothing is stored.
 */

(() => {
  if (window.__readtuneDictate) {
    window.__readtuneDictate.stop();
    return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const EDITABLE = 'input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], input[type="password"], textarea, [contenteditable=""], [contenteditable="true"]';

  const COMMANDS = [
    [/\bnew paragraph\b/gi, "\n\n"],
    [/\bnew line\b/gi, "\n"],
    [/\b(full stop|period)\b/gi, "."],
    [/\bcomma\b/gi, ","],
    [/\bquestion mark\b/gi, "?"],
    [/\b(exclamation mark|exclamation point)\b/gi, "!"],
    [/\bcolon\b/gi, ":"],
    [/\bsemicolon\b/gi, ";"],
    [/\b(open quote|close quote|quote)\b/gi, '"'],
    [/\b(hyphen|dash)\b/gi, "-"],
  ];

  function applyCommands(text) {
    let out = " " + text + " ";
    for (const [re, rep] of COMMANDS) out = out.replace(re, rep);
    // tidy spaces around inserted punctuation
    out = out.replace(/\s+([.,?!:;])/g, "$1").replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n");
    return out.replace(/[ \t]{2,}/g, " ").trim();
  }

  function isEditable(node) {
    return !!node && node.nodeType === 1 && node.matches && node.matches(EDITABLE) && !node.disabled && !node.readOnly;
  }

  function fieldLabel(node) {
    if (!node) return "";
    const aria = node.getAttribute && node.getAttribute("aria-label");
    if (aria) return aria.trim().slice(0, 40);
    if (node.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(node.id)}"]`);
      if (lbl && lbl.textContent.trim()) return lbl.textContent.trim().slice(0, 40);
    }
    if (node.placeholder) return node.placeholder.trim().slice(0, 40);
    if (node.name) return node.name;
    return node.tagName === "TEXTAREA" ? "text area" : node.isContentEditable ? "editor" : "text field";
  }

  function insertText(target, text) {
    if (!target || !text) return;
    target.focus();
    const needsLeadingSpace = (s) => {
      const last = s.slice(-1);
      return last && !/\s/.test(last) && !/^[.,?!:;\n]/.test(text);
    };
    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      const before = target.value.slice(0, start);
      const chunk = (needsLeadingSpace(before) ? " " : "") + text;
      target.setRangeText(chunk, start, end, "end");
      target.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      const sel = window.getSelection();
      let before = "";
      if (sel && sel.anchorNode && sel.anchorNode.nodeType === 3) before = sel.anchorNode.textContent.slice(0, sel.anchorOffset);
      const chunk = (needsLeadingSpace(before) ? " " : "") + text;
      const ok = document.execCommand && document.execCommand("insertText", false, chunk);
      if (!ok && sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(chunk));
        range.collapse(false);
      }
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  /* ---------- floating panel (shadow DOM, isolated from page CSS) ---------- */
  const host = document.createElement("div");
  host.id = "readtune-dictate-host";
  host.style.cssText = "position:fixed;z-index:2147483647;right:16px;bottom:16px;all:initial";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host{ all:initial }
      .p{ font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        width:300px; background:#14201e; color:#f4efe4; border-radius:14px; padding:12px 14px;
        box-shadow:0 12px 40px rgba(0,0,0,.35); }
      .top{ display:flex; align-items:center; gap:8px; }
      .dot{ width:9px;height:9px;border-radius:50%;background:#7d8a80;flex:none }
      .p[data-state="listening"] .dot{ background:#5ad1a8; box-shadow:0 0 0 0 rgba(90,209,168,.6); animation:pulse 1.5s infinite }
      .p[data-state="error"] .dot{ background:#e0836a }
      @keyframes pulse{ to{ box-shadow:0 0 0 8px rgba(90,209,168,0) } }
      .title{ font-weight:600; flex:1 }
      button{ all:unset; cursor:pointer; font:inherit; font-weight:600; padding:5px 10px; border-radius:999px;
        background:#e0836a; color:#14201e }
      button:focus-visible{ outline:2px solid #fff; outline-offset:2px }
      .meta{ margin-top:7px; font-size:12px; color:#b9c3ba }
      .interim{ margin-top:6px; min-height:18px; font-size:13px; color:#dfe7de; font-style:italic }
      .hint{ margin-top:8px; font-size:11px; color:#8f9a90 }
    </style>
    <div class="p" data-state="idle">
      <div class="top">
        <span class="dot"></span>
        <span class="title">ReadTune dictation</span>
        <button type="button" id="stop">Stop</button>
      </div>
      <div class="meta" id="meta">Starting…</div>
      <div class="interim" id="interim"></div>
      <div class="hint">Say “period”, “comma”, “new line”. Press Esc to stop.</div>
    </div>`;
  (document.body || document.documentElement).appendChild(host);
  const panel = root.querySelector(".p");
  const metaEl = root.getElementById("meta");
  const interimEl = root.getElementById("interim");
  root.getElementById("stop").addEventListener("click", () => api.stop());

  function setState(state, meta) {
    panel.dataset.state = state;
    if (meta != null) metaEl.textContent = meta;
  }

  /* ---------- recognition ---------- */
  let target = isEditable(document.activeElement) ? document.activeElement : null;
  let running = false;
  let stopped = false;
  let rec = null;

  const onFocusIn = (e) => {
    if (isEditable(e.target)) {
      target = e.target;
      if (running) setState("listening", `Typing into: ${fieldLabel(target)}`);
    }
  };
  document.addEventListener("focusin", onFocusIn, true);

  const onKey = (e) => {
    if (e.key === "Escape") api.stop();
  };
  document.addEventListener("keydown", onKey, true);

  function start() {
    if (!SR) {
      setState("error", "This browser has no speech recognition. Try Chrome.");
      return;
    }
    rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = document.documentElement.lang && /^[a-z]{2}(-[A-Z]{2})?$/.test(document.documentElement.lang)
      ? document.documentElement.lang : "en-US";
    rec.onstart = () => {
      running = true;
      setState("listening", target ? `Typing into: ${fieldLabel(target)}` : "Click a text field, then talk");
    };
    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          const text = applyCommands(res[0].transcript.trim());
          if (!target || !document.contains(target)) {
            target = isEditable(document.activeElement) ? document.activeElement : null;
          }
          if (target) insertText(target, text);
          else setState("listening", "Click a text field — then what you said will go there");
        } else {
          interim += res[0].transcript;
        }
      }
      interimEl.textContent = interim;
    };
    rec.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setState("error", "Allow the microphone for this site, then start dictation again.");
        stopped = true;
      } else if (event.error === "network") {
        setState("error", "Speech service is unreachable. Check your connection.");
      } else {
        setState("error", `Dictation error: ${event.error}`);
      }
    };
    rec.onend = () => {
      running = false;
      interimEl.textContent = "";
      if (!stopped) {
        try { rec.start(); } catch { /* retry on next tick */ setTimeout(() => { if (!stopped) try { rec.start(); } catch {} }, 400); }
      }
    };
    try {
      rec.start();
      setState("listening", "Starting…");
    } catch (err) {
      setState("error", "Couldn't start dictation. Reload the page and try again.");
    }
  }

  const api = {
    stop() {
      stopped = true;
      running = false;
      try { if (rec) { rec.onend = null; rec.stop(); } } catch {}
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("keydown", onKey, true);
      host.remove();
      delete window.__readtuneDictate;
    },
  };
  window.__readtuneDictate = api;
  start();
})();
