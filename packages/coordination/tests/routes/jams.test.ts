import { describe, expect, test } from "bun:test";
import {
  handleJamRoutes,
  listJamsForUser,
  type JamRouteContext,
} from "../../src/routes/jams";

function createContext(
  options: {
    user?: {
      id: string;
      email: string;
      login: string;
      name: string;
      avatar_url: string;
    };
    claimResult?:
      | { ok: true; jamId: string }
      | { ok: false; status: number; error: string };
    membership?: boolean;
    jamRecord?: Record<string, any>;
    visibleJams?: Record<string, any>[];
    onPutJamRecord?: (record: Record<string, any>) => void | Promise<void>;
    onUpdateJamState?: (
      id: string,
      state: string,
      ip?: string,
    ) => void | Promise<void>;
    compute?: Partial<JamRouteContext["compute"]>;
  } = {},
): JamRouteContext {
  const user = options.user;
  const jamRecord =
    options.jamRecord ||
    ({
      id: "abc123",
      provider: "ec2",
      instance_id: "i-123",
      creator_user_id: "owner_1",
      creator_login: "owner",
      creator_name: "Owner",
      creator_avatar: "",
      public_host: "abc123.jams.letsjam.now",
      secret_arn:
        "arn:aws:secretsmanager:us-east-1:123456789012:secret:jam-abc123",
      shared_secret: "shared-secret",
      deploy_secret: "deploy-secret",
      traffic_access_token: "traffic-token",
      target_group_arn: "tg-123",
      listener_rule_arn: "rule-123",
      state: "running",
      created_at: new Date().toISOString(),
      name: "Alpha",
    } as const);

  return {
    config: {
      port: 8080,
      serviceName: "jam-coordination",
      staticDir: "/tmp/static",
      databaseUrl: "postgresql://jam:jam@localhost:5432/jam",
      databaseSslCaPath: "/tmp/rds.pem",
      betterAuthSecret: "secret",
      jamRuntimePort: 7681,
      jamComputeProvider: "ec2",
      awsRegion: "us-east-1",
      jamAmiId: "ami-123",
      jamSecurityGroupId: "sg-123",
      jamInstanceType: "t3.medium",
      jamTagPrefix: "jam-",
      jamHostSuffix: "jams.letsjam.now",
      jamPreviewHostSuffix: "previews.letsjam.now",
      jamAlbListenerArn:
        "arn:aws:elasticloadbalancing:listener/app/jam/123/listener",
      jamVpcId: "vpc-123",
      e2bApiKey: "",
      e2bDomain: "e2b.letsjam.now",
      jamE2bTemplate: "",
      jamE2bTimeoutMs: 60 * 60 * 1000,
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
          response: user
            ? { user, session: { id: "sess_123", token: "token" } }
            : null,
        }),
      },
    } as any,
    jamRecords: {
      getJamRecord: async (jamId: string) =>
        jamId === jamRecord.id ? jamRecord : undefined,
      listActiveJamsVisibleToUser: async () => options.visibleJams || [],
      updateJamState: async (id: string, state: string, ip?: string) =>
        options.onUpdateJamState?.(id, state, ip),
      getActiveJamsByCreator: async () => [],
      putJamRecord: async (record: Record<string, any>) =>
        options.onPutJamRecord?.(record),
      scanActiveJamRecords: async () => [],
    } as any,
    jamAccess: {
      getMembership: async () =>
        options.membership
          ? { jam_id: "abc123", user_id: user?.id || "", role: "member" }
          : undefined,
      claimInviteLink: async () =>
        options.claimResult || { ok: true, jamId: "abc123" },
      addMember: async () => undefined,
      listMembers: async () => [],
      listInviteLinks: async () => [],
      createInviteLink: async () => undefined,
      revokeInviteLink: async () => undefined,
      removeMember: async () => undefined,
    } as any,
    jamSecrets: {
      createJamSecrets: async () => ({
        secretArn:
          "arn:aws:secretsmanager:us-east-1:123456789012:secret:jam-abc123",
      }),
      getJamSecrets: async () => ({
        sharedSecret: "shared-secret",
        deploySecret: "deploy-secret",
      }),
      deleteJamSecrets: async () => undefined,
    } as any,
    jamPreviews: {
      listPreviewsForJam: async () => [],
      createPreview: async (preview: any) => preview,
      deletePreview: async () => undefined,
      deletePreviewsForJam: async () => undefined,
    } as any,
    compute: {
      provider: "ec2",
      getRuntimeStatus: async () => "running",
      buildDeployUrl: (host: string) => `https://${host}/api/deploy`,
      launchJamEnvironment: async () => ({
        provider: "ec2",
        targetId: "i-123",
        publicHost: "abc123.jams.letsjam.now",
        trafficAccessToken: "traffic-token",
        targetGroupArn: "tg-123",
        listenerRuleArn: "rule-123",
      }),
      destroyJamEnvironment: async () => undefined,
      ...options.compute,
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
    expect(response?.headers.get("location")).toBe(
      "/auth/github?callback=%2Finvite%2Fclaim",
    );
    expect(response?.headers.get("set-cookie")).toContain(
      "jam_invite_claim=token_123",
    );
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
    expect(
      location.startsWith("https://abc123.jams.letsjam.now/bootstrap?token="),
    ).toBe(true);
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

  test("creates internal preview hosts for authenticated runtime callers", async () => {
    const response = await handleJamRoutes(
      new Request("https://letsjam.now/api/internal/jams/abc123/previews", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-jam-shared-secret": "shared-secret",
        },
        body: JSON.stringify({ port: 3000, label: "app" }),
      }),
      createContext(),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      host: expect.stringMatching(/\.previews\.letsjam\.now$/),
      url: expect.stringMatching(/^https:\/\//),
      port: 3000,
      label: "app",
    });
  });

  test("stores the launched EC2 IP on new jam records", async () => {
    let storedRecord: Record<string, any> | undefined;

    const response = await handleJamRoutes(
      new Request("https://letsjam.now/api/jams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Alpha" }),
      }),
      createContext({
        user: {
          id: "owner_1",
          email: "owner@example.com",
          login: "owner",
          name: "Owner",
          avatar_url: "",
        },
        onPutJamRecord(record) {
          storedRecord = record;
        },
        compute: {
          launchJamEnvironment: async () => ({
            provider: "ec2",
            targetId: "i-123",
            ip: "54.12.34.56",
            publicHost: "abc123.jams.letsjam.now",
            targetGroupArn: "tg-123",
            listenerRuleArn: "rule-123",
          }),
        },
      }),
    );

    expect(response?.status).toBe(200);
    expect(storedRecord?.ip).toBe("54.12.34.56");
  });

  test("backfills missing EC2 IPs while listing visible jams", async () => {
    const updates: Array<{ id: string; state: string; ip?: string }> = [];

    const context = createContext({
      visibleJams: [
        {
          id: "abc123",
          provider: "ec2",
          instance_id: "i-123",
          creator_user_id: "owner_1",
          creator_login: "owner",
          creator_name: "Owner",
          creator_avatar: "",
          public_host: "abc123.jams.letsjam.now",
          target_group_arn: "tg-123",
          listener_rule_arn: "rule-123",
          state: "running",
          created_at: new Date().toISOString(),
          name: "Alpha",
        },
      ],
      onUpdateJamState(id, state, ip) {
        updates.push({ id, state, ip });
      },
      compute: {
        getRuntimeStatus: async (handle: Record<string, any>) => {
          handle.ip = "54.12.34.56";
          return "running";
        },
      },
    });

    const jams = await listJamsForUser(context, "owner_1");

    expect(jams).toHaveLength(1);
    expect(updates).toEqual([
      { id: "abc123", state: "running", ip: "54.12.34.56" },
    ]);
  });
});
