import {
  COORDINATION_BASE_URL,
  JAM_ID,
  JAM_SHARED_SECRET,
} from "../config";

export const DEPLOY_HEADER_NAME = "x-jam-deploy-secret";
export const SESSION_COOKIE_NAME = "jam_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AuthenticatedRuntimeUser = {
  id: string;
  email: string;
  login: string;
  name: string;
  avatar_url: string;
};

type JamTokenPayload = {
  kind: string;
  jamId: string;
  user: AuthenticatedRuntimeUser;
  redirectPath?: string;
  exp: number;
};

function toBase64Url(bytes: Uint8Array) {
  return Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
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

function getCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") || "";
  const match = cookies.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function getJamId() {
  return process.env.JAM_ID || JAM_ID;
}

function getSharedSecret() {
  return process.env.JAM_SHARED_SECRET || JAM_SHARED_SECRET;
}

function getCoordinationBaseUrl() {
  return process.env.COORDINATION_BASE_URL || COORDINATION_BASE_URL;
}

export function isSecureRequest(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) return forwardedProto.includes("https");
  return new URL(request.url).protocol === "https:";
}

export function serializeCookie(
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    sameSite?: "Lax" | "Strict" | "None";
    secure?: boolean;
  } = {},
) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  parts.push(`Path=${options.path || "/"}`);
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure !== false) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(
  name: string,
  options: Omit<Parameters<typeof serializeCookie>[2], "maxAge"> = {},
) {
  return serializeCookie(name, "", { ...options, maxAge: 0 });
}

export async function signRuntimeSession(
  user: AuthenticatedRuntimeUser,
  ttlMs = SESSION_TTL_MS,
) {
  const jamId = getJamId();
  const sharedSecret = getSharedSecret();
  const payload: JamTokenPayload = {
    kind: "session",
    jamId,
    user,
    exp: Date.now() + ttlMs,
  };
  const encodedPayload = toBase64Url(fromUtf8(JSON.stringify(payload)));
  const key = await importHmacKey(sharedSecret);
  const signature = await crypto.subtle.sign("HMAC", key, fromUtf8(encodedPayload));
  return `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyJamToken(token: string): Promise<JamTokenPayload | null> {
  const sharedSecret = getSharedSecret();
  const jamId = getJamId();
  if (!sharedSecret || !token) return null;
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  try {
    const key = await importHmacKey(sharedSecret);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(encodedSignature),
      fromUtf8(encodedPayload),
    );
    if (!isValid) return null;

    const payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as JamTokenPayload;
    if (
      !payload ||
      payload.jamId !== jamId ||
      typeof payload.exp !== "number" ||
      payload.exp <= Date.now() ||
      !payload.user?.id ||
      !payload.user?.login
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function getAuthenticatedUser(request: Request) {
  const token = getCookie(request, SESSION_COOKIE_NAME);
  const payload = await verifyJamToken(token);
  if (!payload || payload.kind !== "session") return null;
  return payload.user;
}

export function buildCoordinationGateUrl(request: Request) {
  const target = new URL(`${getCoordinationBaseUrl().replace(/\/$/, "")}/j/${getJamId()}`);
  const current = new URL(request.url);
  if (current.pathname === "/" || current.pathname === "/app") {
    target.search = current.search;
  }
  return target.toString();
}
