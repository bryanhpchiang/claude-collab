type Encodable = Record<string, unknown>;

export function toBase64Url(bytes: Uint8Array) {
  return Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

export function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
}

export function fromUtf8(value: string) {
  return new TextEncoder().encode(value);
}

export async function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    fromUtf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function createRandomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", fromUtf8(token));
  return toBase64Url(new Uint8Array(digest));
}

export async function signToken(secret: string, payload: Encodable) {
  const encodedPayload = toBase64Url(fromUtf8(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, fromUtf8(encodedPayload));
  return `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyToken<T = Encodable>(secret: string, token: string): Promise<T | null> {
  if (!secret || !token) return null;
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  try {
    const key = await importHmacKey(secret);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(encodedSignature),
      fromUtf8(encodedPayload),
    );
    if (!isValid) return null;

    return JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as T;
  } catch {
    return null;
  }
}
