import { existsSync, readFileSync } from "fs";
import { Pool } from "pg";
import type { JamProxyConfig } from "./config";

type JamRouteRow = {
  provider: "ec2" | "e2b";
  target_id: string;
  ip: string | null;
  traffic_access_token: string | null;
  state: string;
};

type PreviewRouteRow = JamRouteRow & {
  port: number;
  access_mode: string;
};

const SSL_QUERY_PARAMS = ["sslmode", "sslcert", "sslkey", "sslrootcert"];

function stripDatabaseSslParams(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    for (const key of SSL_QUERY_PARAMS) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

export type JamRouteRecord = {
  provider: "ec2" | "e2b";
  targetId: string;
  ip?: string;
  trafficAccessToken?: string;
  port: number;
};

function toJamRouteRecord(row: JamRouteRow, port: number): JamRouteRecord {
  return {
    provider: row.provider,
    targetId: row.target_id,
    ...(row.ip ? { ip: row.ip } : {}),
    ...(row.traffic_access_token
      ? { trafficAccessToken: row.traffic_access_token }
      : {}),
    port,
  };
}

export function createDatabasePool(config: JamProxyConfig) {
  const ssl = existsSync(config.databaseSslCaPath)
    ? {
        rejectUnauthorized: true,
        ca: readFileSync(config.databaseSslCaPath, "utf8"),
      }
    : { rejectUnauthorized: true };

  return new Pool({
    connectionString: stripDatabaseSslParams(config.databaseUrl),
    ssl,
  });
}

export function createRouteLookup(pool: Pool, config: JamProxyConfig) {
  return {
    async getJamRoute(jamId: string): Promise<JamRouteRecord | undefined> {
      const result = await pool.query<JamRouteRow>(
        `
          select
            provider,
            instance_id as target_id,
            ip,
            traffic_access_token,
            state
          from jam_records
          where id = $1
          limit 1
        `,
        [jamId],
      );
      const row = result.rows[0];
      if (!row || row.state === "terminated") return undefined;
      return toJamRouteRecord(row, config.jamRuntimePort);
    },

    async getPreviewRoute(host: string): Promise<JamRouteRecord | undefined> {
      const result = await pool.query<PreviewRouteRow>(
        `
          select
            r.provider,
            r.instance_id as target_id,
            r.ip,
            r.traffic_access_token,
            r.state,
            p.port,
            p.access_mode
          from jam_previews p
          join jam_records r on r.id = p.jam_id
          where p.host = $1
          limit 1
        `,
        [host],
      );
      const row = result.rows[0];
      if (!row || row.state === "terminated" || row.access_mode !== "public") {
        return undefined;
      }
      return toJamRouteRecord(row, row.port);
    },
  };
}

export type JamRouteLookup = ReturnType<typeof createRouteLookup>;
