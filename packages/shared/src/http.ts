export type CookieOptions = {
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: "Lax" | "Strict" | "None";
  secure?: boolean;
};

export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {},
) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  parts.push(`Path=${options.path || "/"}`);
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure !== false) parts.push("Secure");

  return parts.join("; ");
}

export function clearCookie(name: string, options: Omit<CookieOptions, "maxAge"> = {}) {
  return serializeCookie(name, "", { ...options, maxAge: 0 });
}

export function getCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") || "";
  const match = cookies.match(new RegExp(`(?:^|; )${escapeRegex(name)}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isSecureRequest(request: Request, fallbackBaseUrl?: string) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) return forwardedProto.includes("https");
  if (new URL(request.url).protocol === "https:") return true;
  if (fallbackBaseUrl) return fallbackBaseUrl.startsWith("https://");
  return false;
}
