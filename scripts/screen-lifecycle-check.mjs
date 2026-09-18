import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const screen = readFileSync(join(ROOT, "shared/screen.js"), "utf8");
const controls = readFileSync(join(ROOT, "shared/controls.js"), "utf8");

const checks = [
  [screen.includes("const onManualAutoStop = () =>"), "manual auto-scroll stop handler must be named"],
  [screen.includes("window.removeEventListener(eventName, onManualAutoStop)"), "destroy must remove global manual-stop listeners"],
  [screen.includes("clearTimeout(saveTimer);"), "destroy must cancel pending profile saves"],
  [screen.includes("stopAuto();"), "destroy must stop auto-scroll and cancel its RAF"],
  [screen.includes("controls.destroy();"), "screen teardown must delegate controls cleanup"],
  [controls.includes("const onDocumentKeyDown = (e) =>"), "controls Escape handler must be named"],
  [controls.includes('document.removeEventListener("keydown", onDocumentKeyDown);'), "controls destroy must remove Escape listener"],
  [controls.includes("destroy() {"), "controls must expose destroy()"],
];
const failures = checks.filter(([ok]) => !ok);
for (const [, message] of failures) console.error("✗", message);
if (failures.length) process.exit(1);
console.log("✓ reading-screen teardown removes global listeners, timers, and auto-scroll work");
