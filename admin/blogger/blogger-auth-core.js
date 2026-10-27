export async function fetchBloggerJson(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body === undefined || typeof options.body === "string" ? options.body : JSON.stringify(options.body),
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error || "authentication_failed");
    error.code = body?.error || "authentication_failed";
    error.status = response.status;
    throw error;
  }
  return body;
}

export function setPasswordVisibility(input, control, visible) {
  input.type = visible ? "text" : "password";
  control.textContent = visible ? "Ocultar" : "Mostrar";
  control.setAttribute("aria-pressed", String(visible));
}

export async function consumeStudioLaunchFragment() {
  return false;
}

const SAFE_PASTE_ELEMENTS = new Set(["a", "b", "br", "em", "h2", "h3", "i", "li", "ol", "p", "strong", "ul"]);
const BLOCKED_PASTE_ELEMENTS = new Set(["embed", "iframe", "math", "object", "script", "style", "svg", "template"]);

function escapeText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function safeHref(value) {
  const href = String(value ?? "").trim();
  if (!href || /[\u0000-\u001f\u007f]/.test(href)) return "";
  if (/^(?:https?:|mailto:|\/|#)/i.test(href)) return href.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  return "";
}

function normalizeWithDocument(html, parseHtml) {
  const document = parseHtml(html);
  function serialize(node) {
    if (node.nodeType === 3) return escapeText(node.nodeValue);
    if (node.nodeType !== 1) return "";
    const name = node.tagName.toLowerCase();
    if (BLOCKED_PASTE_ELEMENTS.has(name)) return "";
    const children = [...node.childNodes].map(serialize).join("");
    if (!SAFE_PASTE_ELEMENTS.has(name)) return children;
    if (name === "br") return "<br>";
    if (name === "a") {
      const href = safeHref(node.getAttribute("href"));
      return href ? `<a href="${href}">${children}</a>` : children;
    }
    const normalizedName = name === "b" ? "strong" : name === "i" ? "em" : name;
    return `<${normalizedName}>${children}</${normalizedName}>`;
  }
  return [...document.body.childNodes].map(serialize).join("");
}

function normalizeWithoutDocument(html) {
  const stripped = String(html).replace(/<(script|style|svg|math|template|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  return (stripped.match(/<!--[^]*?-->|<\/?[A-Za-z][^>]*>|[^<]+|</g) ?? []).map((token) => {
    if (!token.startsWith("<")) return escapeText(token);
    if (token.startsWith("<!--")) return "";
    const match = token.match(/^<\s*(\/?)\s*([A-Za-z0-9]+)/);
    if (!match) return escapeText(token);
    const closing = Boolean(match[1]);
    const name = match[2].toLowerCase();
    if (!SAFE_PASTE_ELEMENTS.has(name)) return "";
    if (closing) return name === "br" ? "" : `</${name === "b" ? "strong" : name === "i" ? "em" : name}>`;
    if (name === "br") return "<br>";
    if (name === "a") {
      const href = safeHref(token.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)?.slice(1).find((value) => value !== undefined));
      return href ? `<a href="${href}">` : "";
    }
    return `<${name === "b" ? "strong" : name === "i" ? "em" : name}>`;
  }).join("");
}

export function normalizePastedHtml(html, {
  parseHtml = typeof DOMParser === "function"
    ? (value) => new DOMParser().parseFromString(value, "text/html")
    : null,
} = {}) {
  return parseHtml ? normalizeWithDocument(String(html), parseHtml) : normalizeWithoutDocument(html);
}
