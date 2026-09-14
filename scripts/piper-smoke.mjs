import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(process.execPath, ["scripts/harness.mjs"], {
  cwd: root,
  env: { ...process.env, HARNESS_MODE: "piper" },
  stdio: "inherit",
});

process.exit(result.status ?? 1);
