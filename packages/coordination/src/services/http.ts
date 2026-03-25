function getSetCookies(headers: Headers) {
  const source = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof source.getSetCookie === "function") {
    return source.getSetCookie();
  }

  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

export function mergeHeaders(...parts: Array<HeadersInit | undefined>) {
  const merged = new Headers();

  for (const part of parts) {
    if (!part) continue;

    const headers = part instanceof Headers ? part : new Headers(part);
    for (const value of getSetCookies(headers)) {
      merged.append("Set-Cookie", value);
    }

    headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") return;
      merged.set(key, value);
    });
  }

  return merged;
}

type CookieOptions = {
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
