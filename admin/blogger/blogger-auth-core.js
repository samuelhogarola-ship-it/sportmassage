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
  if (!response.ok) throw new Error(body?.error || "authentication_failed");
  return body;
}

export async function consumeStudioLaunchFragment({ location, replaceUrl, request }) {
  const url = new URL(location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const code = fragment.get("code");
  if (!code) return false;
  url.hash = "";
  replaceUrl(`${url.pathname}${url.search}`);
  await request("/admin/blogger/launch", { method: "POST", body: JSON.stringify({ code }) });
  return true;
}
