/*
 * ReadTune — talk to type (dictation)
 *
 * Injected on demand (activeTab) by the popup button or Alt+Shift+D. Uses the
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
  // Password fields are intentionally excluded. Chrome's speech recognition
  // sends microphone audio to Google's speech service, so credentials should
  // never be accepted as a dictation target.
  const EDITABLE = 'input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], textarea, [contenteditable=""], [contenteditable="true"]';

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

  function isPasswordField(node) {
    return !!node && node.nodeType === 1 && node.matches && node.matches('input[type="password"]');
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