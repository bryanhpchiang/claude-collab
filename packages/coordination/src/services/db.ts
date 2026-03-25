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
  public_host: string | null;
  shared_secret: string | null;
  deploy_secret: string | null;
  target_group_arn: string | null;
  listener_rule_arn: string | null;
  state: string;
  created_at: string;
  name: string | null;
};

export type JamMemberRow = {
  jam_id: string;
  user_id: string;
  role: string;
  created_at: string;
};

export type JamInviteLinkRow = {
  id: string;
  jam_id: string;
  token_hash: string;
  created_by_user_id: string;
  created_at: string;
  claimed_by_user_id: string | null;
  claimed_at: string | null;
  revoked_at: string | null;
};

export type CoordinationDatabase = {
  jam_records: JamRecordRow;
  jam_members: JamMemberRow;
  jam_invite_links: JamInviteLinkRow;
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
    add column if not exists public_host text
  `.execute(db);

  await sql`
    alter table jam_records
    add column if not exists shared_secret text
  `.execute(db);

  await sql`
    alter table jam_records
    add column if not exists deploy_secret text
  `.execute(db);

  await sql`
    alter table jam_records
    add column if not exists target_group_arn text
  `.execute(db);

  await sql`
    alter table jam_records
    add column if not exists listener_rule_arn text
  `.execute(db);

  await sql`
    alter table jam_records
    drop constraint if exists jam_records_state_check
  `.execute(db);

  await sql`
    alter table jam_records
    add constraint jam_records_state_check
    check (state in ('pending', 'running', 'terminated'))
  `.execute(db);

  await db.schema
    .createTable("jam_members")
    .ifNotExists()
    .addColumn("jam_id", "text", (column) => column.notNull())
    .addColumn("user_id", "text", (column) => column.notNull())
    .addColumn("role", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createIndex("jam_members_user_idx")
    .ifNotExists()
    .on("jam_members")
    .column("user_id")
    .execute();

  await db.schema
    .createIndex("jam_members_jam_idx")
    .ifNotExists()
    .on("jam_members")
    .column("jam_id")
    .execute();

  await db.schema
    .createIndex("jam_members_jam_user_idx")
    .ifNotExists()
    .on("jam_members")
    .columns(["jam_id", "user_id"])
    .unique()
    .execute();

  await sql`
    alter table jam_members
    drop constraint if exists jam_members_role_check
  `.execute(db);

  await sql`
    alter table jam_members
    add constraint jam_members_role_check
    check (role in ('creator', 'member'))
  `.execute(db);

  await db.schema
    .createTable("jam_invite_links")
    .ifNotExists()
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("jam_id", "text", (column) => column.notNull())
    .addColumn("token_hash", "text", (column) => column.notNull())
    .addColumn("created_by_user_id", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("claimed_by_user_id", "text")
    .addColumn("claimed_at", "text")
    .addColumn("revoked_at", "text")
    .execute();

  await db.schema
    .createIndex("jam_invite_links_jam_idx")
    .ifNotExists()
    .on("jam_invite_links")
    .column("jam_id")
    .execute();

  await db.schema
    .createIndex("jam_invite_links_token_hash_idx")
    .ifNotExists()
    .on("jam_invite_links")
    .column("token_hash")
    .unique()
    .execute();
}
