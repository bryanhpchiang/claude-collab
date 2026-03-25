import {
  SESSION_COOKIE_NAME,
  isSecureRequest,
  serializeCookie,
  signRuntimeSession,
  verifyJamToken,
} from "../runtime-auth";

function normalizeRedirectPath(value?: string) {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

export async function handleAuthRoute(req: Request, url: URL) {
  if (url.pathname !== "/bootstrap" || req.method !== "GET") return null;

  const token = url.searchParams.get("token") || "";
  const payload = await verifyJamToken(token);
  if (!payload || payload.kind !== "bootstrap") {
    return new Response("Invalid bootstrap token", { status: 401 });
  }

  const sessionToken = await signRuntimeSession(payload.user);
  return new Response(null, {
    status: 302,
    headers: {
      Location: normalizeRedirectPath(payload.redirectPath),
      "Set-Cookie": serializeCookie(SESSION_COOKIE_NAME, sessionToken, {
        maxAge: 7 * 24 * 60 * 60,
        secure: isSecureRequest(req),
      }),
    },
  });
}
