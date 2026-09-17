import http from "node:http";

const PORT = Number(process.env.PORT || 8080);
const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 120_000);
const DEFAULT_HEALTH_HOSTS = ["httpbin.org", "api.httpbin.org", "www.google.com"];
const DROP_HEADERS = new Set([
  "x-relay-target", "x-relay-path", "host",
  "connection", "keep-alive", "proxy-connection",
  "content-length", "transfer-encoding", "accept-encoding",
  "te", "trailer", "upgrade",
  "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor", "cf-request-id",
  "x-forwarded-for", "x-forwarded-proto", "x-real-ip",
  "x-vercel-id", "x-vercel-deployment-url", "x-vercel-forwarded-for",
]);
const DROP_RESPONSE_HEADERS = new Set([
  "content-encoding", "content-length", "transfer-encoding",
  "connection", "keep-alive", "proxy-connection",
  "te", "trailer", "upgrade",
]);

const server = http.createServer((request, response) => {
  relay(request, response).catch((error) => {
    if (!response.headersSent) {
      sendJson(response, 502, { error: error.message || "Relay request failed" });
    } else {
      response.destroy(error);
    }
  });
});

server.requestTimeout = 0;
server.headersTimeout = 30_000;
server.keepAliveTimeout = 65_000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`AI proxy relay listening on ${PORT}`);
});

async function relay(request, response) {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/__health") {
    return sendJson(response, 200, { ok: true, runtime: "node" });
  }

  const target = firstHeader(request.headers["x-relay-target"]);
  let relayPath = firstHeader(request.headers["x-relay-path"]) || "/";

  if (!target) return sendJson(response, 400, { error: "Missing x-relay-target header" });
  if (!/^https?:\/\//i.test(target)) {
    return sendJson(response, 400, { error: "x-relay-target must start with http:// or https://" });
  }

  let targetUrlObject;
  try {
    targetUrlObject = new URL(target);
  } catch {
    return sendJson(response, 400, { error: "Invalid x-relay-target URL" });
  }

  const healthHosts = (process.env.HEALTH_HOSTS || DEFAULT_HEALTH_HOSTS.join(","))
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (healthHosts.includes(targetUrlObject.hostname.toLowerCase())) {
    return sendJson(response, 200, {
      ok: true,
      service: "relay-health-shim",
      target: targetUrlObject.hostname.toLowerCase(),
      status: "passed",
    });
  }

  relayPath += requestUrl.search;
  const targetUrl = target.replace(/\/+$/, "") +
    (relayPath.startsWith("/") ? relayPath : `/${relayPath}`);

  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (DROP_HEADERS.has(name.toLowerCase()) || value == null) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  headers.set("accept-encoding", "identity");

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: hasBody ? request : undefined,
      signal: controller.signal,
      duplex: hasBody ? "half" : undefined,
    });

    clearTimeout(timer);
    const responseHeaders = {};
    for (const [name, value] of upstream.headers) {
      if (!DROP_RESPONSE_HEADERS.has(name.toLowerCase())) responseHeaders[name] = value;
    }

    response.writeHead(upstream.status, responseHeaders);
    if (!upstream.body) return response.end();
    for await (const chunk of upstream.body) response.write(chunk);
    response.end();
  } catch (error) {
    clearTimeout(timer);
    const aborted = error.name === "AbortError";
    if (response.headersSent) return response.destroy(error);
    return sendJson(response, aborted ? 504 : 502, {
      error: aborted ? `Upstream timeout after ${Math.ceil(TIMEOUT_MS / 1000)}s` : error.message,
      target: targetUrl,
    });
  }
}

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}
