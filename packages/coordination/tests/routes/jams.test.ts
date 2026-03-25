import { describe, expect, test } from "bun:test";
import { handleJamRoutes, type JamRouteContext } from "../../src/routes/jams";

function createContext(options: {
  user?: {
    id: string;
    email: string;
    login: string;
    name: string;
    avatar_url: string;
  };
  claimResult?: { ok: true; jamId: string } | { ok: false; status: number; error: string };
  membership?: boolean;
} = {}): JamRouteContext {
  const user = options.user;

  return {
    config: {
      port: 8080,
      serviceName: "jam-coordination",
      staticDir: "/tmp/static",
      databaseUrl: "postgresql://jam:jam@localhost:5432/jam",
      databaseSslCaPath: "/tmp/rds.pem",
      betterAuthSecret: "secret",
      jamRuntimePort: 7681,
      awsRegion: "us-east-1",
      jamAmiId: "ami-123",
      jamSecurityGroupId: "sg-123",
      jamInstanceType: "t3.medium",
      jamTagPrefix: "jam-",
      jamHostSuffix: "jams.letsjam.now",
      jamAlbListenerArn: "arn:aws:elasticloadbalancing:listener/app/jam/123/listener",
      jamVpcId: "vpc-123",
      githubClientId: "client-id",
      githubClientSecret: "client-secret",
      githubWebhookSecret: "",
      baseUrl: "https://letsjam.now",
      jamRepoUrl: "https://github.com/example/jam.git",
      jamInstallDir: "/opt/jam",
      jamGitUserName: "Jam",
      jamGitUserEmail: "jam@letsjam.now",
      jamRuntimeStartCommand: "bun run runtime:start",
    },
    auth: {
      api: {
        getSession: async () => ({
          headers: new Headers(),
          response: user ? { user, session: { id: "sess_123", token: "token" } } : null,
        }),
      },
    } as any,
    jamRecords: {
      getJamRecord: async (jamId: string) =>
        jamId === "abc123"
          ? {
              id: "abc123",
              instance_id: "i-123",
              creator_user_id: "owner_1",
              creator_login: "owner",
              creator_name: "Owner",
              creator_avatar: "",
              public_host: "abc123.jams.letsjam.now",
              secret_arn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:jam-abc123",
              shared_secret: "shared-secret",
              deploy_secret: "deploy-secret",
              target_group_arn: "tg-123",
              listener_rule_arn: "rule-123",
              state: "running",
              created_at: new Date().toISOString(),
              name: "Alpha",
            }
          : undefined,
      listActiveJamsVisibleToUser: async () => [],
      updateJamState: async () => undefined,
      getActiveJamsByCreator: async () => [],
      putJamRecord: async () => undefined,
      scanActiveJamRecords: async () => [],
    } as any,
    jamAccess: {
      getMembership: async () =>
        options.membership ? { jam_id: "abc123", user_id: user?.id || "", role: "member" } : undefined,
      claimInviteLink: async () => options.claimResult || { ok: true, jamId: "abc123" },
      addMember: async () => undefined,
      listMembers: async () => [],
      listInviteLinks: async () => [],
      createInviteLink: async () => undefined,
      revokeInviteLink: async () => undefined,
      removeMember: async () => undefined,
    } as any,
    jamSecrets: {
      createJamSecrets: async () => ({
        secretArn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:jam-abc123",
      }),
      getJamSecrets: async () => ({
        sharedSecret: "shared-secret",
        deploySecret: "deploy-secret",
      }),
      deleteJamSecrets: async () => undefined,
    } as any,
    ec2: {
      probeRuntime: async () => true,
      buildJamHost: (jamId: string) => `${jamId}.jams.letsjam.now`,
      buildDeployUrl: (host: string) => `https://${host}/api/deploy`,
      launchJamInstance: async () => "i-123",
      attachJamTarget: async () => ({
        publicHost: "abc123.jams.letsjam.now",
        targetGroupArn: "tg-123",
        listenerRuleArn: "rule-123",
      }),
      removeJamTarget: async () => undefined,
      terminateInstance: async () => undefined,
    } as any,
  };
}

describe("handleJamRoutes", () => {
  test("requires authentication to list jams", async () => {
    const response = await handleJamRoutes(
      new Request("https://letsjam.now/api/jams"),
      createContext(),
    );

    expect(response?.status).toBe(401);
  });

  test("stores invite claims in a secure cookie and redirects to auth", async () => {
    const response = await handleJamRoutes(
      new Request("https://letsjam.now/invite/token_123"),
      createContext(),
    );

    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toBe("/auth/github?callback=%2Finvite%2Fclaim");
    expect(response?.headers.get("set-cookie")).toContain("jam_invite_claim=token_123");
  });

  test("claims invite links for signed-in users and redirects into the jam gate", async () => {
    const response = await handleJamRoutes(
      new Request("https://letsjam.now/invite/claim", {
        headers: {
          cookie: "jam_invite_claim=token_123",
        },
      }),
      createContext({
        user: {
          id: "member_1",
          email: "member@example.com",
          login: "member",
          name: "Member",
          avatar_url: "",
        },
      }),
    );

    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toBe("/j/abc123");
    expect(response?.headers.get("set-cookie")).toContain("jam_invite_claim=");
    expect(response?.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("redirects authorized members to the jam bootstrap endpoint", async () => {
    const response = await handleJamRoutes(
      new Request("https://letsjam.now/j/abc123?s=General"),
      createContext({
        user: {
          id: "member_1",
          email: "member@example.com",
          login: "member",
          name: "Member",
          avatar_url: "",
        },
        membership: true,
      }),
    );

    expect(response?.status).toBe(302);
    const location = response?.headers.get("location") || "";
    expect(location.startsWith("https://abc123.jams.letsjam.now/bootstrap?token=")).toBe(true);
  });

  test("rejects signed-in users who are not members", async () => {
    const response = await handleJamRoutes(
      new Request("https://letsjam.now/j/abc123"),
      createContext({
        user: {
          id: "random_user",
          email: "random@example.com",
          login: "random",
          name: "Random",
          avatar_url: "",
        },
      }),
    );

    expect(response?.status).toBe(403);
  });
});
