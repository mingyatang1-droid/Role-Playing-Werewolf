import type { Pool } from "pg";
import {
  createDefaultUserRecord,
  mapUserRow,
  type UserRecord,
  type UserRepository,
  type UserRow,
  type WechatIdentity,
} from "./user-repository.js";

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async findOrCreate(identity: WechatIdentity): Promise<{
    user: UserRecord;
    isNewUser: boolean;
  }> {
    const existing = await this.findByOpenId(identity.openId);
    if (existing) {
      const now = new Date().toISOString();
      const updated = await this.pool.query<UserRow>(
        `UPDATE users
         SET last_login_at = $1, updated_at = $1
         WHERE id = $2
         RETURNING *`,
        [now, existing.id],
      );

      return {
        user: mapUserRow(updated.rows[0] ?? this.toRow(existing)),
        isNewUser: false,
      };
    }

    const user = createDefaultUserRecord(identity, new Date().toISOString());
    const inserted = await this.pool.query<UserRow>(
      `INSERT INTO users (
        id, public_id, wechat_openid, wechat_unionid, nickname, avatar_url,
        created_at, updated_at, last_login_at
      ) VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8)
      ON CONFLICT (wechat_openid) DO NOTHING
      RETURNING *`,
      [
        user.id,
        user.publicId,
        user.wechatOpenId,
        user.wechatUnionId,
        user.nickname,
        user.createdAt,
        user.updatedAt,
        user.lastLoginAt,
      ],
    );

    if (inserted.rows[0]) {
      return { user: mapUserRow(inserted.rows[0]), isNewUser: true };
    }

    const concurrentUser = await this.findByOpenId(identity.openId);
    if (!concurrentUser) {
      throw new Error("Failed to create or find user.");
    }

    return { user: concurrentUser, isNewUser: false };
  }

  async findById(userId: string): Promise<UserRecord | null> {
    const result = await this.pool.query<UserRow>(
      "SELECT * FROM users WHERE id = $1",
      [userId],
    );
    return result.rows[0] ? mapUserRow(result.rows[0]) : null;
  }

  async updateNickname(
    userId: string,
    nickname: string,
  ): Promise<UserRecord | null> {
    const result = await this.pool.query<UserRow>(
      `UPDATE users
       SET nickname = $1, updated_at = $2
       WHERE id = $3
       RETURNING *`,
      [nickname, new Date().toISOString(), userId],
    );

    return result.rows[0] ? mapUserRow(result.rows[0]) : null;
  }

  private async findByOpenId(openId: string): Promise<UserRecord | null> {
    const result = await this.pool.query<UserRow>(
      "SELECT * FROM users WHERE wechat_openid = $1",
      [openId],
    );
    return result.rows[0] ? mapUserRow(result.rows[0]) : null;
  }

  private toRow(user: UserRecord): UserRow {
    return {
      id: user.id,
      public_id: user.publicId,
      wechat_openid: user.wechatOpenId,
      wechat_unionid: user.wechatUnionId,
      nickname: user.nickname,
      avatar_url: user.avatarUrl,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
      last_login_at: user.lastLoginAt,
    };
  }
}
