import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  SessionRecord,
  SessionRepository,
} from "./session-repository.js";

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly pool: Pool) {}

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
    const result = await this.pool.query<SessionRow>(
      `INSERT INTO user_sessions (
        id, user_id, token_hash, created_at, expires_at, revoked_at
      ) VALUES ($1, $2, $3, $4, $5, NULL)
      RETURNING *`,
      [
        record.id,
        record.userId,
        record.tokenHash,
        record.createdAt,
        record.expiresAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to create session.");
    }

    return mapSession(row);
  }

  async findActiveByTokenHash(
    tokenHash: string,
    now: string,
  ): Promise<SessionRecord | null> {
    const result = await this.pool.query<SessionRow>(
      `SELECT * FROM user_sessions
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2`,
      [tokenHash, now],
    );
    const row = result.rows[0];
    return row ? mapSession(row) : null;
  }
}
