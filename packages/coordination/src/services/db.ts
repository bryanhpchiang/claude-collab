import { existsSync, readFileSync } from "fs";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool, type PoolConfig } from "pg";
import type { CoordinationConfig } from "../config";

export type JamRecordRow = {
  id: string;
  instance_id: string;
  creator_user_id: string;
  creator_login: string;
  creator_name: string;
  creator_avatar: string;
  ip: string | null;
  state: string;
  created_at: string;
  name: string | null;
};

export type CoordinationDatabase = {
  jam_records: JamRecordRow;
};

const SSL_QUERY_PARAMS = ["sslmode", "sslcert", "sslkey", "sslrootcert"];

export function stripDatabaseSslParams(databaseUrl: string) {
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

export function buildDatabasePoolConfig(
  config: CoordinationConfig,
): PoolConfig {
  const poolConfig: PoolConfig = {
    connectionString: stripDatabaseSslParams(config.databaseUrl),
    ssl: {
      rejectUnauthorized: true,
    },
  };

  if (config.databaseSslCaPath && existsSync(config.databaseSslCaPath)) {
    poolConfig.ssl = {
      rejectUnauthorized: true,
      ca: readFileSync(config.databaseSslCaPath, "utf8"),
    };
  }

  return poolConfig;
}

export function createDatabase(config: CoordinationConfig) {
  return new Kysely<CoordinationDatabase>({
    dialect: new PostgresDialect({
      pool: new Pool(buildDatabasePoolConfig(config)),
    }),
  });
}

export async function ensureCoordinationTables(
  db: Kysely<CoordinationDatabase>,
) {
  await db.schema
    .createTable("jam_records")
    .ifNotExists()
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("instance_id", "text", (column) => column.notNull().unique())
    .addColumn("creator_user_id", "text", (column) => column.notNull())
    .addColumn("creator_login", "text", (column) => column.notNull())
    .addColumn("creator_name", "text", (column) => column.notNull())
    .addColumn("creator_avatar", "text", (column) => column.notNull())
    .addColumn("ip", "text")
    .addColumn("state", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("name", "text")
    .execute();

  await db.schema
    .createIndex("jam_records_creator_state_idx")
    .ifNotExists()
    .on("jam_records")
    .columns(["creator_user_id", "state"])
    .execute();

  await db.schema
    .createIndex("jam_records_state_idx")
    .ifNotExists()
    .on("jam_records")
    .column("state")
    .execute();

  await sql`
    alter table jam_records
    drop constraint if exists jam_records_state_check
  `.execute(db);

  await sql`
    alter table jam_records
    add constraint jam_records_state_check
    check (state in ('pending', 'running', 'terminated'))
  `.execute(db);
}
