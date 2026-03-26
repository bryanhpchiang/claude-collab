import type { Kysely } from "kysely";
import type { CoordinationDatabase, JamPreviewRow } from "./db";

export type JamPreview = {
  id: string;
  jam_id: string;
  host: string;
  port: number;
  access_mode: "public";
  created_by_user_id?: string;
  created_at: string;
  label?: string;
};

function toJamPreview(row: JamPreviewRow): JamPreview {
  return {
    id: row.id,
    jam_id: row.jam_id,
    host: row.host,
    port: row.port,
    access_mode: "public",
    ...(row.created_by_user_id
      ? { created_by_user_id: row.created_by_user_id }
      : {}),
    created_at: row.created_at,
    ...(row.label ? { label: row.label } : {}),
  };
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: string }).code) === "23505"
  );
}

export function createJamPreviewsService(db: Kysely<CoordinationDatabase>) {
  async function getPreviewByPort(jamId: string, port: number) {
    const row = await db
      .selectFrom("jam_previews")
      .selectAll()
      .where("jam_id", "=", jamId)
      .where("port", "=", port)
      .executeTakeFirst();
    return row ? toJamPreview(row) : undefined;
  }

  return {
    async getPreviewByHost(host: string): Promise<JamPreview | undefined> {
      const row = await db
        .selectFrom("jam_previews")
        .selectAll()
        .where("host", "=", host)
        .executeTakeFirst();
      return row ? toJamPreview(row) : undefined;
    },

    async listPreviewsForJam(jamId: string): Promise<JamPreview[]> {
      const rows = await db
        .selectFrom("jam_previews")
        .selectAll()
        .where("jam_id", "=", jamId)
        .orderBy("created_at", "asc")
        .execute();
      return rows.map(toJamPreview);
    },

    async createPreview(
      preview: JamPreview,
    ): Promise<JamPreview> {
      const existing = await getPreviewByPort(preview.jam_id, preview.port);
      if (existing) return existing;

      try {
        await db
          .insertInto("jam_previews")
          .values({
            ...preview,
            created_by_user_id: preview.created_by_user_id || null,
            label: preview.label || null,
          })
          .executeTakeFirst();
        return preview;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const retry = await getPreviewByPort(preview.jam_id, preview.port);
        if (retry) return retry;
        throw error;
      }
    },

    async deletePreview(jamId: string, previewId: string) {
      await db
        .deleteFrom("jam_previews")
        .where("jam_id", "=", jamId)
        .where("id", "=", previewId)
        .executeTakeFirst();
    },

    async deletePreviewsForJam(jamId: string) {
      await db
        .deleteFrom("jam_previews")
        .where("jam_id", "=", jamId)
        .executeTakeFirst();
    },
  };
}

export type JamPreviewsService = ReturnType<typeof createJamPreviewsService>;
