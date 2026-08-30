/*
 * ReadTune — small shared UI helpers
 */

/** Fill `host` with a centered message card. `actions` = [{label, onClick?, href?, primary?}]. */
export function showMessage(host, { title, body, actions = [] }) {
  host.replaceChildren();
  host.hidden = false;

  const card = document.createElement("div");
  card.className = "rt-message-card";

  const h = document.createElement("h2");
  h.textContent = title;
  card.appendChild(h);

  if (body) {
    const p = document.createElement("p");
    p.textContent = body;
    card.appendChild(p);
  }

  for (const a of actions) {
    const node = document.createElement(a.href ? "a" : "button");
    node.className = "rt-btn" + (a.primary ? " rt-primary" : "");
    node.textContent = a.label;
    if (a.href) {
      node.href = a.href;
      node.target = "_blank";
      node.rel = "noopener";
    } else {
      node.type = "button";
      node.addEventListener("click", a.onClick);
    }
    card.appendChild(node);
  }

  const wrap = document.createElement("div");
  wrap.className = "rt-message";
  wrap.appendChild(card);
  host.appendChild(wrap);
}

export function hideMessage(host) {
  host.replaceChildren();
  host.hidden = true;
}

/** hostname without the leading www. */
export function prettyHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
