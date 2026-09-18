import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "store", "assets");

function pngInfo(path) {
  const b = readFileSync(path);
  const sig = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  if (b.length < 24 || !b.subarray(0,8).equals(sig)) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

let failures = 0;
for (const [name,w,h] of [["promo-small.png",440,280],["promo-marquee.png",1400,560]]) {
  const path = join(ASSETS,name);
  if (!existsSync(path)) { console.error("✗ missing store asset:", name); failures++; continue; }
  const info = pngInfo(path);
  if (!info) { console.error("✗", name, "is not real PNG data"); failures++; continue; }
  if (info.width !== w || info.height !== h) {
    console.error(`✗ ${name} is ${info.width}x${info.height}; expected ${w}x${h}`);
    failures++;
  }
}
for (const name of ["01-reader-view.png","02-focus-ruler.png","03-read-along.png","04-restyle-page.png"]) {
  const path = join(ASSETS,name);
  if (!existsSync(path)) continue;
  const info = pngInfo(path);
  if (!info) { console.error("✗", name, "has .png extension but is not PNG data"); failures++; continue; }
  const ok = (info.width === 1280 && info.height === 800) || (info.width === 640 && info.height === 400);
  if (!ok) { console.error(`✗ ${name} is ${info.width}x${info.height}; Store screenshots must be 1280x800 or 640x400`); failures++; }
}
const icon=pngInfo(join(ROOT,"icons","icon128.png"));
if (!icon || icon.width !== 128 || icon.height !== 128) {
  console.error("✗ icons/icon128.png must be a real 128x128 PNG");
  failures++;
}
if (failures) process.exit(1);
console.log("✓ Chrome Web Store image files have valid PNG signatures and required dimensions");
