const FIRST_PARTY_ORIGINS = new Set([
  "https://readtune.tech",
  "https://www.readtune.tech",
]);

const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

export function isAllowedRelayOrigin(origin) {
  if (!origin) return true; // curl/server/tests: CORS is a browser boundary, not auth
  return FIRST_PARTY_ORIGINS.has(origin) || EXTENSION_ORIGIN.test(origin);
}

export function applyRelayCors(req, res) {
  const origin = typeof req?.headers?.origin === "string" ? req.headers.origin : "";
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (origin && isAllowedRelayOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  return isAllowedRelayOrigin(origin);
}
