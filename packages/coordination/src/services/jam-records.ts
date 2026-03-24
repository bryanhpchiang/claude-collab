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

    async scanActiveJamRecords(): Promise<JamRecord[]> {
      const result = await getActiveRecords();
      return result.map(toJamRecord);
    },
  };
}

export type JamRecordsService = ReturnType<typeof createJamRecordsService>;
