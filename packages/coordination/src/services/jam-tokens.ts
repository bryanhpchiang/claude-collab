type Encodable = Record<string, unknown>;

function toBase64Url(bytes: Uint8Array) {
  return Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function fromUtf8(value: string) {
  return new TextEncoder().encode(value);
}

async function importHmacKey(secret: string) {
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

export async function hashInviteToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", fromUtf8(token));
  return toBase64Url(new Uint8Array(digest));
}

export async function signJamToken(secret: string, payload: Encodable) {
  const encodedPayload = toBase64Url(fromUtf8(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, fromUtf8(encodedPayload));
  return `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
}
