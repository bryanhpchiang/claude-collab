import http from "node:http";
import httpProxy from "http-proxy";
import type { ClientRequest, IncomingMessage } from "node:http";
import { loadConfig } from "./config";
import { createDatabasePool, createRouteLookup } from "./db";
import {
  type ProxyUpstreamTarget,
  resolveRequestTarget,
} from "./routing";

const config = loadConfig();
const pool = createDatabasePool(config);
const lookup = createRouteLookup(pool, config);

const UPSTREAM_TARGET = Symbol("upstream-target");
type RequestWithUpstream = IncomingMessage & {
  [UPSTREAM_TARGET]?: ProxyUpstreamTarget;
};

const proxy = httpProxy.createProxyServer({
  changeOrigin: true,
  proxyTimeout: 65_000,
  timeout: 65_000,
  ws: true,
  xfwd: true,
});

function applyUpstreamHeaders(
  proxyReq: ClientRequest,
  request: RequestWithUpstream,
) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto;
  if (protocol) {
    proxyReq.setHeader("x-forwarded-proto", protocol);
  }
  if (request.headers.host) {
    proxyReq.setHeader("x-forwarded-host", request.headers.host);
  }

  const upstream = request[UPSTREAM_TARGET];
  if (!upstream?.headers) return;
  for (const [key, value] of Object.entries(upstream.headers)) {
    proxyReq.setHeader(key, value);
  }
}

function sendText(
  response: http.ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string> = {},
) {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    ...headers,
  });
  response.end(body);
}

function sendUpgradeError(
  socket: import("node:net").Socket,
  status: number,
  body: string,
) {
  socket.write(
    `HTTP/1.1 ${status} ${status === 404 ? "Not Found" : "Bad Gateway"}\r\n` +
      "Content-Type: text/plain; charset=utf-8\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      "\r\n" +
      body,
  );
  socket.destroy();
}

proxy.on("proxyReq", (proxyReq, request) => {
  applyUpstreamHeaders(proxyReq, request as RequestWithUpstream);
});

proxy.on("proxyReqWs", (proxyReq, request) => {
  applyUpstreamHeaders(proxyReq, request as RequestWithUpstream);
});

proxy.on("error", (error, request, response) => {
  console.error("[jam-proxy] upstream proxy error", error);
  if (response instanceof http.ServerResponse && !response.headersSent) {
    sendText(response, 502, "upstream unavailable");
  } else if (response && "destroy" in response) {
    response.destroy();
  }
});

const server = http.createServer(async (request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, service: config.serviceName }));
    return;
  }

  try {
    const upstream = await resolveRequestTarget(
      request.headers.host || "",
      config,
      lookup,
    );
    if (!upstream) {
      sendText(response, 404, "unknown host");
      return;
    }

    (request as RequestWithUpstream)[UPSTREAM_TARGET] = upstream;
    proxy.web(request, response, { target: upstream.target });
  } catch (error) {
    console.error("[jam-proxy] request routing failed", error);
    sendText(response, 500, "internal error");
  }
});

server.on("upgrade", async (request, socket, head) => {
  try {
    const upstream = await resolveRequestTarget(
      request.headers.host || "",
      config,
      lookup,
    );
    if (!upstream) {
      sendUpgradeError(socket, 404, "unknown host");
      return;
    }

    (request as RequestWithUpstream)[UPSTREAM_TARGET] = upstream;
    proxy.ws(request, socket, head, { target: upstream.target });
  } catch (error) {
    console.error("[jam-proxy] websocket routing failed", error);
    sendUpgradeError(socket, 502, "upstream unavailable");
  }
});

server.listen(config.port, () => {
  console.log(
    `Jam proxy running on http://localhost:${config.port}`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    pool.end().catch(() => undefined);
    process.exit(0);
  });
}
