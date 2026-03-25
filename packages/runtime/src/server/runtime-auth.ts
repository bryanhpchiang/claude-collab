import {
  clearCookie,
  getCookie,
  isSecureRequest,
  serializeCookie,
  signToken,
  verifyToken,
} from "shared";
import {
  COORDINATION_BASE_URL,
  JAM_ID,
  JAM_SHARED_SECRET,
} from "../config";

export { clearCookie, isSecureRequest, serializeCookie } from "shared";

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

function getJamId() {
  return process.env.JAM_ID || JAM_ID;
}

function getSharedSecret() {
  return process.env.JAM_SHARED_SECRET || JAM_SHARED_SECRET;
}

function getCoordinationBaseUrl() {
  return process.env.COORDINATION_BASE_URL || COORDINATION_BASE_URL;
}

export async function signRuntimeSession(
  user: AuthenticatedRuntimeUser,
  ttlMs = SESSION_TTL_MS,
) {
  const payload: JamTokenPayload = {
    kind: "session",
    jamId: getJamId(),
    user,
    exp: Date.now() + ttlMs,
  };
  return signToken(getSharedSecret(), payload);
}

export async function verifyJamToken(token: string): Promise<JamTokenPayload | null> {
  const sharedSecret = getSharedSecret();
  const jamId = getJamId();
  const payload = await verifyToken<JamTokenPayload>(sharedSecret, token);
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
