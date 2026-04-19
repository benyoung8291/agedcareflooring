// Markdown for Agents: negotiate text/markdown responses for requests that
// explicitly ask for them, while keeping HTML as the default for browsers.
// Reference: https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/

const HTML_TO_MARKDOWN = {
  "/": "/index.md",
  "/index.html": "/index.md",
};

const LINK_HEADER = [
  '</sitemap.xml>; rel="sitemap"; type="application/xml"',
  '</index.md>; rel="alternate"; type="text/markdown"; title="Markdown version for agents"',
  '</contact.html>; rel="author"; title="Contact Premrest Aged Care Flooring"',
  '</privacy-policy.html>; rel="privacy-policy"',
  '</robots.txt>; rel="describedby"; type="text/plain"',
].join(", ");

function wantsMarkdown(accept) {
  if (!accept) return false;
  // Honour an explicit Accept: text/markdown, including quality-valued lists
  // where markdown ranks at least as high as text/html.
  const entries = accept.split(",").map((part) => {
    const [type, ...params] = part.trim().split(";").map((s) => s.trim());
    const qParam = params.find((p) => p.toLowerCase().startsWith("q="));
    const q = qParam ? parseFloat(qParam.slice(2)) : 1;
    return { type: type.toLowerCase(), q: Number.isFinite(q) ? q : 1 };
  });
  const md = entries.find((e) => e.type === "text/markdown");
  if (!md || md.q <= 0) return false;
  const html = entries.find((e) => e.type === "text/html");
  return !html || md.q >= html.q;
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const markdownPath = HTML_TO_MARKDOWN[url.pathname];

  if (markdownPath && wantsMarkdown(request.headers.get("Accept"))) {
    const mdUrl = new URL(markdownPath, url);
    const mdResponse = await fetch(mdUrl.toString(), {
      headers: { "Accept": "text/markdown" },
    });
    if (mdResponse.ok) {
      const body = await mdResponse.text();
      const headers = new Headers({
        "Content-Type": "text/markdown; charset=utf-8",
        "Vary": "Accept",
        "Link": LINK_HEADER,
        "x-markdown-tokens": String(body.length),
      });
      return new Response(body, { status: 200, headers });
    }
  }

  const response = await next();
  const headers = new Headers(response.headers);
  if (url.pathname === "/" || url.pathname === "/index.html") {
    headers.set("Link", LINK_HEADER);
    const vary = headers.get("Vary");
    headers.set("Vary", vary ? `${vary}, Accept` : "Accept");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
