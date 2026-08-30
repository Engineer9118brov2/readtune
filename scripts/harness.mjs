/*
 * Run test/harness.html in headless Chrome and exit non-zero if any assertion
 * failed. Used by CI and `npm test`. No dependencies — talks to Chrome over the
 * DevTools protocol directly.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2",
  ".pdf": "application/pdf", ".png": "image/png",
};

const server = createServer(async (req, res) => {
  const path = join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!path.startsWith(ROOT) || !existsSync(path)) {
    res.writeHead(404);
    return res.end("not found");
  }
  try {
    const body = await readFile(path);
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end("err");
  }
});

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/test/harness.html`;

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]) {
    const r = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split("\n")[0];
  }
  return null;
}

const CHROME = findChrome();
if (!CHROME) {
  console.error("No Chrome/Chromium found. Set CHROME_BIN to its path.");
  process.exit(1);
}

const dbgPort = 9222 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
  `--remote-debugging-port=${dbgPort}`, "--user-data-dir=" + join(ROOT, ".chrome-ci"),
  "about:blank",
], { stdio: "ignore" });

function cleanup(code) {
  try { chrome.kill("SIGKILL"); } catch {}
  server.close();
  process.exit(code);
}

try {
  // wait for CDP
  let ver;
  for (let i = 0; i < 50; i++) {
    try {
      ver = await fetch(`http://127.0.0.1:${dbgPort}/json/version`).then((r) => r.json());
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  if (!ver) throw new Error("Chrome DevTools endpoint never came up");

  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pend = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id);
      pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const i = ++id;
      pend.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params, sessionId }));
    });

  const { targetId } = await send("Target.createTarget", { url });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Runtime.enable", {}, sessionId);

  let done = false;
  let fails = -1;
  for (let i = 0; i < 100; i++) {
    const r = await send(
      "Runtime.evaluate",
      { expression: "({done: !!window.__DONE, fails: window.__FAILS ?? -1})", returnByValue: true },
      sessionId
    );
    ({ done, fails } = r.result.value);
    if (done) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  const summary = await send(
    "Runtime.evaluate",
    { expression: `[...document.querySelectorAll('#results li')].map(l=>l.textContent).join('\\n')`, returnByValue: true },
    sessionId
  );
  console.log(summary.result.value);

  if (!done) {
    console.error("\n✗ harness did not finish");
    cleanup(1);
  } else if (fails > 0) {
    console.error(`\n✗ ${fails} assertion(s) failed`);
    cleanup(1);
  } else {
    console.log("\n✓ harness passed");
    cleanup(0);
  }
} catch (err) {
  console.error("harness runner error:", err.message);
  cleanup(1);
}
