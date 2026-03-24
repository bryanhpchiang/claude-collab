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
