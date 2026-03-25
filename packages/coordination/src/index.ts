import { getVersionInfo } from "shared";
import { loadConfig } from "./config";
import { handleAuthRoutes } from "./routes/auth";
import { handleJamRoutes } from "./routes/jams";
import { handlePageRoutes } from "./routes/pages";
import { createAuth, runAuthMigrations } from "./services/auth";
import { createJamAccessService } from "./services/jam-access";
import { createDatabase, ensureCoordinationTables } from "./services/db";
import { createEc2Service } from "./services/ec2";
import { createJamRecordsService } from "./services/jam-records";
import { createJamSecretsService } from "./services/jam-secrets";

const config = loadConfig();
const db = createDatabase(config);
const auth = createAuth(config, db);

await runAuthMigrations(auth);
await ensureCoordinationTables(db);

const context = {
  config,
  auth,
  ec2: createEc2Service(config),
  jamAccess: createJamAccessService(db),
  jamRecords: createJamRecordsService(db),
  jamSecrets: createJamSecretsService(config),
};

async function migratePlaintextJamSecrets() {
  const legacyRecords = await context.jamRecords.scanJamRecordsWithPlaintextSecrets();

  for (const record of legacyRecords) {
    if (record.secret_arn) {
      await context.jamRecords.clearPlaintextJamSecrets(record.id);
      continue;
    }

    if (record.state === "terminated") {
      await context.jamRecords.clearPlaintextJamSecrets(record.id);
      continue;
    }

    if (!record.shared_secret || !record.deploy_secret) continue;

    const secret = await context.jamSecrets.createJamSecrets(record.id, {
      sharedSecret: record.shared_secret,
      deploySecret: record.deploy_secret,
    });
    await context.jamRecords.assignJamSecretArn(record.id, secret.secretArn);
  }
}

await migratePlaintextJamSecrets();

const server = Bun.serve({
  port: config.port,
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const { version, commit } = getVersionInfo();
      return Response.json({
        ok: true,
        service: config.serviceName,
        version,
        commit,
      });
    }

    if (url.pathname === "/api/version" && request.method === "GET") {
      return Response.json(getVersionInfo());
    }

    const authResponse = await handleAuthRoutes(request, context);
    if (authResponse) return authResponse;

    const jamResponse = await handleJamRoutes(request, context);
    if (jamResponse) return jamResponse;

    const pageResponse = await handlePageRoutes(request, context);
    if (pageResponse) return pageResponse;

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Jam coordination server running on http://localhost:${server.port}`);
