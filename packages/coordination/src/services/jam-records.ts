import type { Kysely } from "kysely";
import type { CoordinationDatabase, JamRecordRow } from "./db";

export type JamRecord = {
  id: string;
  instance_id: string;
  creator_user_id: string;
  creator_login: string;
  creator_name: string;
  creator_avatar: string;
  ip?: string;
  public_host?: string;
  secret_arn?: string;
  shared_secret?: string;
  deploy_secret?: string;
  target_group_arn?: string;
  listener_rule_arn?: string;
  state: string;
  created_at: string;
  name?: string;
};

function toJamRecord(row: JamRecordRow): JamRecord {
  return {
    id: row.id,
    instance_id: row.instance_id,
    creator_user_id: row.creator_user_id,
    creator_login: row.creator_login,
    creator_name: row.creator_name,
    creator_avatar: row.creator_avatar,
    ...(row.ip ? { ip: row.ip } : {}),
    ...(row.public_host ? { public_host: row.public_host } : {}),
    ...(row.secret_arn ? { secret_arn: row.secret_arn } : {}),
    ...(row.shared_secret ? { shared_secret: row.shared_secret } : {}),
    ...(row.deploy_secret ? { deploy_secret: row.deploy_secret } : {}),
    ...(row.target_group_arn ? { target_group_arn: row.target_group_arn } : {}),
    ...(row.listener_rule_arn ? { listener_rule_arn: row.listener_rule_arn } : {}),
    state: row.state,
    created_at: row.created_at,
    ...(row.name ? { name: row.name } : {}),
  };
}

export function createJamRecordsService(db: Kysely<CoordinationDatabase>) {
  async function getActiveRecords() {
    return db
      .selectFrom("jam_records")
      .selectAll()
      .where("state", "in", ["pending", "running"])
      .execute();
  }

  return {
    async putJamRecord(item: JamRecord) {
      await db
        .insertInto("jam_records")
        .values({
          ...item,
          creator_avatar: item.creator_avatar || "",
          ip: item.ip || null,
          public_host: item.public_host || null,
          secret_arn: item.secret_arn || null,
          shared_secret: item.shared_secret || null,
          deploy_secret: item.deploy_secret || null,
          target_group_arn: item.target_group_arn || null,
          listener_rule_arn: item.listener_rule_arn || null,
          name: item.name || null,
        })
        .executeTakeFirst();
    },

    async getJamRecord(id: string): Promise<JamRecord | undefined> {
      const result = await db
        .selectFrom("jam_records")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return result ? toJamRecord(result) : undefined;
    },

    async getActiveJamsByCreator(userId: string): Promise<JamRecord[]> {
      const records = await db
        .selectFrom("jam_records")
        .selectAll()
        .where("creator_user_id", "=", userId)
        .where("state", "in", ["pending", "running"])
        .execute();

      return records.map(toJamRecord);
    },

    async updateJamState(id: string, state: string, ip?: string) {
      await db
        .updateTable("jam_records")
        .set({
          state,
          ...(ip === undefined ? {} : { ip }),
        })
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async assignJamSecretArn(id: string, secretArn: string) {
      await db
        .updateTable("jam_records")
        .set({
          secret_arn: secretArn,
          shared_secret: null,
          deploy_secret: null,
        })
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async clearPlaintextJamSecrets(id: string) {
      await db
        .updateTable("jam_records")
        .set({
          shared_secret: null,
          deploy_secret: null,
        })
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async listActiveJamsVisibleToUser(userId: string): Promise<JamRecord[]> {
      const result = await db
        .selectFrom("jam_records")
        .leftJoin("jam_members", (join) =>
          join
            .onRef("jam_members.jam_id", "=", "jam_records.id")
            .on("jam_members.user_id", "=", userId),
        )
        .selectAll("jam_records")
        .where("jam_records.state", "in", ["pending", "running"])
        .where((eb) =>
          eb.or([
            eb("jam_records.creator_user_id", "=", userId),
            eb("jam_members.user_id", "=", userId),
          ]),
        )
        .distinct()
        .execute();

      return result.map(toJamRecord);
    },

    async scanActiveJamRecords(): Promise<JamRecord[]> {
      const result = await getActiveRecords();
      return result.map(toJamRecord);
    },

    async scanJamRecordsWithPlaintextSecrets(): Promise<JamRecord[]> {
      const result = await db
        .selectFrom("jam_records")
        .selectAll()
        .where((eb) =>
          eb.or([
            eb("shared_secret", "is not", null),
            eb("deploy_secret", "is not", null),
          ]),
        )
        .execute();

      return result.map(toJamRecord);
    },
  };
}

export type JamRecordsService = ReturnType<typeof createJamRecordsService>;
