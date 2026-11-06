import { randomBytes, randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/database.js";

export interface UserRecord {
  id: string;
  publicId: string;
  wechatOpenId: string;
  wechatUnionId: string | null;
  nickname: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}

export interface WechatIdentity {
  openId: string;
  unionId: string | null;
}

export interface UserRepository {
  findOrCreate(identity: WechatIdentity): Promise<{
    user: UserRecord;
    isNewUser: boolean;
  }>;
  findById(userId: string): Promise<UserRecord | null>;
  updateNickname(userId: string, nickname: string): Promise<UserRecord | null>;
}

export interface UserRow {
  id: string;
  public_id: string;
  wechat_openid: string;
  wechat_unionid: string | null;
  nickname: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string;
}

export function mapUserRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    wechatOpenId: row.wechat_openid,
    wechatUnionId: row.wechat_unionid,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

function createPublicId(): string {
  return `W-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function createDefaultUserRecord(
  identity: WechatIdentity,
  now: string,
): UserRecord {
  const id = randomUUID();
  const publicId = createPublicId();

  return {
    id,
    publicId,
    wechatOpenId: identity.openId,
    wechatUnionId: identity.unionId,
    nickname: `玩家${publicId.slice(-4)}`,
    avatarUrl: null,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };
}

export class SqliteUserRepository implements UserRepository {
  constructor(private readonly database: AppDatabase) {}

  async findOrCreate(identity: WechatIdentity): Promise<{
    user: UserRecord;
    isNewUser: boolean;
  }> {
    const existing = await this.findByOpenId(identity.openId);
    if (existing) {
      const now = new Date().toISOString();
      this.database.connection
        .prepare(
          "UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?",
        )
        .run(now, now, existing.id);

      return {
        user: { ...existing, lastLoginAt: now, updatedAt: now },
        isNewUser: false,
      };
    }

    const user = createDefaultUserRecord(identity, new Date().toISOString());

    try {
      this.database.connection
        .prepare(
          `INSERT INTO users (
            id, public_id, wechat_openid, wechat_unionid, nickname, avatar_url,
            created_at, updated_at, last_login_at
          ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        )
        .run(
          user.id,
          user.publicId,
          user.wechatOpenId,
          user.wechatUnionId,
          user.nickname,
          user.createdAt,
          user.updatedAt,
          user.lastLoginAt,
        );
    } catch (error) {
      const concurrentlyCreated = await this.findByOpenId(identity.openId);
      if (concurrentlyCreated) {
        return { user: concurrentlyCreated, isNewUser: false };
      }
      throw error;
    }

    return { user, isNewUser: true };
  }

  async findById(userId: string): Promise<UserRecord | null> {
    const row = this.database.connection
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(userId) as UserRow | undefined;

    return row ? mapUserRow(row) : null;
  }

  async updateNickname(
    userId: string,
    nickname: string,
  ): Promise<UserRecord | null> {
    const now = new Date().toISOString();
    const result = this.database.connection
      .prepare(
        "UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?",
      )
      .run(nickname, now, userId);

    if (result.changes === 0) {
      return null;
    }

    return this.findById(userId);
  }

  private async findByOpenId(openId: string): Promise<UserRecord | null> {
    const row = this.database.connection
      .prepare("SELECT * FROM users WHERE wechat_openid = ?")
      .get(openId) as UserRow | undefined;

    return row ? mapUserRow(row) : null;
  }
}
