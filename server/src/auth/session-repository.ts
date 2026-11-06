import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/database.js";

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface SessionRepository {
  create(
    userId: string,
    tokenHash: string,
    expiresAt: string,
  ): Promise<SessionRecord>;
  findActiveByTokenHash(
    tokenHash: string,
    now: string,
  ): Promise<SessionRecord | null>;
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly database: AppDatabase) {}

  async create(
    userId: string,
    tokenHash: string,
    expiresAt: string,
  ): Promise<SessionRecord> {
    const record: SessionRecord = {
      id: randomUUID(),
      userId,
      tokenHash,
      createdAt: new Date().toISOString(),
      expiresAt,
      revokedAt: null,
    };

    this.database.connection
      .prepare(
        `INSERT INTO user_sessions (
          id, user_id, token_hash, created_at, expires_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        record.id,
        record.userId,
        record.tokenHash,
        record.createdAt,
        record.expiresAt,
      );

    return record;
  }

  async findActiveByTokenHash(
    tokenHash: string,
    now: string,
  ): Promise<SessionRecord | null> {
    const row = this.database.connection
      .prepare(
        `SELECT * FROM user_sessions
         WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
      )
      .get(tokenHash, now) as SessionRow | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  }
}
