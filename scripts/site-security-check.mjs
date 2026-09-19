import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
const headers = Object.fromEntries((config.headers?.[0]?.headers || []).map((h) => [h.key.toLowerCase(), h.value]));
const csp = headers["content-security-policy"] || "";
let failures = 0;
const check = (ok, msg) => {
  if (!ok) {
    console.error(`✗ ${msg}`);
    failures += 1;
  }
};

check(/script-src 'self'/.test(csp), "CSP must restrict scripts to local code plus exact hashes");
check(!/script-src[^;]*'unsafe-inline'/.test(csp), "script-src must not allow unsafe-inline");
check(csp.includes("object-src 'none'"), "CSP must block plugin/object content");
check(csp.includes("frame-ancestors 'none'"), "CSP must block framing");
check(headers["x-content-type-options"] === "nosniff", "nosniff header must remain enabled");
check(headers["x-frame-options"] === "DENY", "legacy frame protection must remain enabled");
check(!!headers["referrer-policy"], "Referrer-Policy must remain configured");
check(!!headers["permissions-policy"], "Permissions-Policy must remain configured");

const home = readFileSync(join(ROOT, "index.html"), "utf8");
check(home.includes('<link rel="canonical" href="https://readtune.tech/"'), "home page must canonically identify readtune.tech");
check(home.includes('<meta property="og:site_name" content="ReadTune"'), "home page must declare ReadTune as og:site_name");
check(home.includes('itemtype="https://schema.org/WebSite"'), "home page must expose WebSite structured data");
check(home.includes('<meta itemprop="name" content="ReadTune"'), "WebSite structured data must name ReadTune");
check(home.includes('<meta itemprop="alternateName" content="readtune.tech"'), "WebSite structured data must include readtune.tech as alternate name");

for (const [file, canonical] of [
  ["privacy.html", "https://readtune.tech/privacy.html"],
  ["school.html", "https://readtune.tech/school.html"],
  ["terms.html", "https://readtune.tech/terms.html"],
]) {
  const html = readFileSync(join(ROOT, file), "utf8");
  check(html.includes(`<link rel="canonical" href="${canonical}"`), `${file} must point to its readtune.tech canonical URL`);
  check(html.includes('<meta property="og:site_name" content="ReadTune"'), `${file} must preserve ReadTune site-name identity`);
}
const robots = readFileSync(join(ROOT, "robots.txt"), "utf8");
const sitemap = readFileSync(join(ROOT, "sitemap.xml"), "utf8");
check(robots.includes("Sitemap: https://readtune.tech/sitemap.xml"), "robots.txt must advertise the production sitemap");
check(sitemap.includes("<loc>https://readtune.tech/</loc>"), "sitemap must include the canonical ReadTune home page");

for (const file of ["index.html", "privacy.html", "school.html"]) {
  const html = readFileSync(join(ROOT, file), "utf8");
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of inline) {
    const digest = createHash("sha256").update(match[1]).digest("base64");
    check(csp.includes(`'sha256-${digest}'`), `${file} inline boot script must have an exact CSP hash`);
  }
}

if (failures) process.exit(1);
console.log("✓ public site has strict script CSP and baseline security headers");