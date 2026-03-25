import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import type { Kysely } from "kysely";
import type { CoordinationConfig } from "../config";
import type { CoordinationDatabase } from "./db";
import { mergeHeaders } from "./http";

type BetterAuthSession = {
  user: {
    id: string;
    email: string;
    login?: string | null;
    name: string;
    image?: string | null;
  };
  session: {
    id: string;
    token: string;
  };
} | null;

export type SessionUser = {
  id: string;
  email: string;
  login: string;
  name: string;
  avatar_url: string;
};

export type SessionLookup = {
  headers: Headers;
  user: SessionUser | undefined;
};

export function isGitHubOAuthEnabled(config: CoordinationConfig) {
  return Boolean(config.githubClientId && config.githubClientSecret);
}

export function normalizeAuthCallback(value?: string | null) {
  if (!value || !value.startsWith("/")) return "/dashboard";
  if (value.startsWith("//")) return "/dashboard";
  return value;
}

function toSessionUser(session: BetterAuthSession): SessionUser | undefined {
  const user = session?.user;
  if (!user) return undefined;

  return {
    id: user.id,
    email: user.email,
    login: user.login || user.email,
    name: user.name || user.login || user.email,
    avatar_url: user.image || "",
  };
}

function redirectWithCookies(source: Response, location: string) {
  return new Response(null, {
    status: 302,
    headers: mergeHeaders(source.headers, {
      Location: location,
    }),
  });
}

export function createAuth(
  config: CoordinationConfig,
  db: Kysely<CoordinationDatabase>,
) {
  return betterAuth({
    baseURL: config.baseUrl,
    basePath: "/api/auth",
    secret: config.betterAuthSecret,
    database: {
      db,
      type: "postgres",
    },
    user: {
      additionalFields: {
        login: {
          type: "string",
          required: false,
          input: false,
        },
      },
    },
    socialProviders: isGitHubOAuthEnabled(config)
      ? {
          github: {
            clientId: config.githubClientId,
            clientSecret: config.githubClientSecret,
            mapProfileToUser: (profile: { login?: string | null }) => ({
              login: profile.login || undefined,
            }),
          },
        }
      : {},
  });
}

export type CoordinationAuth = ReturnType<typeof createAuth>;

export async function runAuthMigrations(auth: CoordinationAuth) {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}

export async function getSessionLookup(
  request: Request,
  auth: CoordinationAuth,
): Promise<SessionLookup> {
  const result = await auth.api.getSession({
    headers: request.headers,
    returnHeaders: true,
  });

  return {
    headers: result.headers,
    user: toSessionUser(result.response as BetterAuthSession),
  };
}

export async function startGitHubSignIn(
  request: Request,
  auth: CoordinationAuth,
  callbackURL = "/dashboard",
) {
  const response = await auth.api.signInSocial({
    body: {
      provider: "github",
      callbackURL: normalizeAuthCallback(callbackURL),
    },
    headers: request.headers,
    asResponse: true,
  });

  const location = response.headers.get("location");
  return location ? redirectWithCookies(response, location) : response;
}

export async function signOutAndRedirect(
  request: Request,
  auth: CoordinationAuth,
) {
  const response = await auth.api.signOut({
    headers: request.headers,
    asResponse: true,
  });

  return redirectWithCookies(response, "/");
}
