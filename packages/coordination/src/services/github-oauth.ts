import type { CoordinationConfig } from "../config";

export type SessionUser = {
  login: string;
  name: string;
  avatar_url: string;
};

export type SessionStore = Map<string, SessionUser>;

type GitHubTokenResponse = {
  access_token?: string;
  error?: string;
};

type GitHubUserResponse = {
  login: string;
  name: string | null;
  avatar_url: string;
};

export function isGitHubOAuthEnabled(config: CoordinationConfig) {
  return Boolean(config.githubClientId && config.githubClientSecret);
}

export function createSessionToken() {
  return crypto.randomUUID().replaceAll("-", "");
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};

  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const [rawKey, ...rawValue] = pair.trim().split("=");
    if (!rawKey) continue;
    cookies[rawKey] = rawValue.join("=");
  }
  return cookies;
}

export function getBaseUrl(config: CoordinationConfig, request: Request) {
  return config.baseUrl || new URL(request.url).origin;
}

export function getSecureCookieAttribute(
  config: CoordinationConfig,
  request: Request,
) {
  return getBaseUrl(config, request).startsWith("https://") ? "; Secure" : "";
}

export function getSessionUser(request: Request, sessions: SessionStore) {
  const token = parseCookies(request.headers.get("cookie")).jam_session;
  return token ? sessions.get(token) : undefined;
}

export function buildGitHubAuthorizeUrl(
  config: CoordinationConfig,
  request: Request,
) {
  const redirectUri = `${getBaseUrl(config, request)}/auth/github/callback`;
  const params = new URLSearchParams({
    client_id: config.githubClientId,
    redirect_uri: redirectUri,
    scope: "read:user",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForSessionUser(
  config: CoordinationConfig,
  code: string,
): Promise<SessionUser> {
  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: config.githubClientId,
        client_secret: config.githubClientSecret,
        code,
      }),
    },
  );

  const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;
  if (!tokenData.access_token) {
    throw new Error(`OAuth failed: ${tokenData.error || "unknown"}`);
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "User-Agent": "jam-coordination-server",
    },
  });

  if (!userResponse.ok) {
    throw new Error("Failed to load GitHub user");
  }

  const userData = (await userResponse.json()) as GitHubUserResponse;
  return {
    login: userData.login,
    name: userData.name || userData.login,
    avatar_url: userData.avatar_url,
  };
}
