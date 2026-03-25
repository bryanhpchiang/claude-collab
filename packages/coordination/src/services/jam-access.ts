import { sql, type Kysely } from "kysely";
import type { CoordinationDatabase } from "./db";

export type JamMember = {
  jam_id: string;
  user_id: string;
  role: string;
  created_at: string;
  login: string;
  email: string;
  name: string;
  avatar_url: string;
};

export type JamInviteLink = {
  id: string;
  jam_id: string;
  created_by_user_id: string;
  created_at: string;
  claimed_by_user_id?: string;
  claimed_at?: string;
  revoked_at?: string;
};

type MemberRow = {
  jam_id: string;
  user_id: string;
  role: string;
  created_at: string;
  login: string | null;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
};

function toMember(row: MemberRow): JamMember {
  return {
    jam_id: row.jam_id,
    user_id: row.user_id,
    role: row.role,
    created_at: row.created_at,
    login: row.login || row.email || row.user_id,
    email: row.email || "",
    name: row.name || row.login || row.email || row.user_id,
    avatar_url: row.avatar_url || "",
  };
}

export function createJamAccessService(db: Kysely<CoordinationDatabase>) {
  return {
    async addMember(
      jamId: string,
      userId: string,
      role: "creator" | "member",
      createdAt = new Date().toISOString(),
    ) {
      await db
        .insertInto("jam_members")
        .values({
          jam_id: jamId,
          user_id: userId,
          role,
          created_at: createdAt,
        })
        .onConflict((oc) => oc.columns(["jam_id", "user_id"]).doNothing())
        .executeTakeFirst();
    },

    async removeMember(jamId: string, userId: string) {
      await db
        .deleteFrom("jam_members")
        .where("jam_id", "=", jamId)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },

    async getMembership(jamId: string, userId: string) {
      return db
        .selectFrom("jam_members")
        .selectAll()
        .where("jam_id", "=", jamId)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },

    async listMembers(jamId: string): Promise<JamMember[]> {
      const result = await sql<MemberRow>`
        select
          jm.jam_id,
          jm.user_id,
          jm.role,
          jm.created_at,
          coalesce(u.login, u.email) as login,
          u.email,
          u.name,
          u.image as avatar_url
        from jam_members jm
        left join "user" u on u.id = jm.user_id
        where jm.jam_id = ${jamId}
        order by case when jm.role = 'creator' then 0 else 1 end, jm.created_at asc
      `.execute(db);

      return result.rows.map(toMember);
    },

    async createInviteLink(
      link: {
        id: string;
        jam_id: string;
        token_hash: string;
        created_by_user_id: string;
        created_at: string;
      },
    ) {
      await db.insertInto("jam_invite_links").values(link).executeTakeFirst();
    },

    async listInviteLinks(jamId: string): Promise<JamInviteLink[]> {
      const rows = await db
        .selectFrom("jam_invite_links")
        .selectAll()
        .where("jam_id", "=", jamId)
        .orderBy("created_at", "desc")
        .execute();

      return rows.map((row) => ({
        id: row.id,
        jam_id: row.jam_id,
        created_by_user_id: row.created_by_user_id,
        created_at: row.created_at,
        ...(row.claimed_by_user_id ? { claimed_by_user_id: row.claimed_by_user_id } : {}),
        ...(row.claimed_at ? { claimed_at: row.claimed_at } : {}),
        ...(row.revoked_at ? { revoked_at: row.revoked_at } : {}),
      }));
    },

    async getInviteLinkByTokenHash(tokenHash: string) {
      return db
        .selectFrom("jam_invite_links")
        .selectAll()
        .where("token_hash", "=", tokenHash)
        .executeTakeFirst();
    },

    async revokeInviteLink(jamId: string, inviteLinkId: string, revokedAt = new Date().toISOString()) {
      await db
        .updateTable("jam_invite_links")
        .set({ revoked_at: revokedAt })
        .where("jam_id", "=", jamId)
        .where("id", "=", inviteLinkId)
        .where("revoked_at", "is", null)
        .executeTakeFirst();
    },

    async claimInviteLink(tokenHash: string, userId: string, claimedAt = new Date().toISOString()) {
      return db.transaction().execute(async (trx) => {
        const link = await trx
          .selectFrom("jam_invite_links")
          .selectAll()
          .where("token_hash", "=", tokenHash)
          .forUpdate()
          .executeTakeFirst();

        if (!link) {
          return { ok: false as const, status: 404, error: "Invite link not found" };
        }

        if (link.revoked_at) {
          return { ok: false as const, status: 410, error: "Invite link has been revoked" };
        }

        if (link.claimed_at || link.claimed_by_user_id) {
          return { ok: false as const, status: 409, error: "Invite link has already been claimed" };
        }

        await trx
          .insertInto("jam_members")
          .values({
            jam_id: link.jam_id,
            user_id: userId,
            role: "member",
            created_at: claimedAt,
          })
          .onConflict((oc) => oc.columns(["jam_id", "user_id"]).doNothing())
          .executeTakeFirst();

        await trx
          .updateTable("jam_invite_links")
          .set({
            claimed_by_user_id: userId,
            claimed_at: claimedAt,
          })
          .where("id", "=", link.id)
          .where("claimed_at", "is", null)
          .where("revoked_at", "is", null)
          .executeTakeFirst();

        return { ok: true as const, jamId: link.jam_id };
      });
    },
  };
}

export type JamAccessService = ReturnType<typeof createJamAccessService>;
