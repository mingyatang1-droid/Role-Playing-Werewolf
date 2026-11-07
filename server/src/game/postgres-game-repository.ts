import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { GameState } from "./engine.js";
import {
  mapGameRow,
  type GameRecord,
  type GameRepository,
  type GameRow,
} from "./game-repository.js";

export class PostgresGameRepository implements GameRepository {
  constructor(private readonly pool: Pool) {}

  async createForRoom(
    roomId: string,
    ownerUserId: string,
    state: GameState,
  ): Promise<GameRecord | null> {
    const client = await this.pool.connect();
    const now = new Date().toISOString();
    const record: GameRecord = {
      id: randomUUID(),
      roomId,
      ownerUserId,
      state,
      stateVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await client.query("BEGIN");
      const updatedRoom = await client.query(
        `UPDATE rooms SET status = 'IN_GAME', updated_at = $1
         WHERE id = $2 AND owner_user_id = $3 AND status = 'CONFIGURING'`,
        [now, roomId, ownerUserId],
      );
      if (updatedRoom.rowCount === 0) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
        `INSERT INTO games (
          id, room_id, owner_user_id, state_json, state_version,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          record.id,
          roomId,
          ownerUserId,
          JSON.stringify(state),
          record.stateVersion,
          now,
          now,
        ],
      );
      await client.query("COMMIT");
      return record;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findByRoomForOwner(
    roomId: string,
    ownerUserId: string,
  ): Promise<GameRecord | null> {
    const result = await this.pool.query<GameRow>(
      "SELECT * FROM games WHERE room_id = $1 AND owner_user_id = $2",
      [roomId, ownerUserId],
    );
    return result.rows[0] ? mapGameRow(result.rows[0]) : null;
  }

  async findByIdForOwner(
    gameId: string,
    ownerUserId: string,
  ): Promise<GameRecord | null> {
    const result = await this.pool.query<GameRow>(
      "SELECT * FROM games WHERE id = $1 AND owner_user_id = $2",
      [gameId, ownerUserId],
    );
    return result.rows[0] ? mapGameRow(result.rows[0]) : null;
  }

  async updateState(
    gameId: string,
    ownerUserId: string,
    state: GameState,
    expectedVersion: number,
  ): Promise<GameRecord | null> {
    const result = await this.pool.query<GameRow>(
      `UPDATE games SET
        state_json = $1, state_version = state_version + 1, updated_at = $2
       WHERE id = $3 AND owner_user_id = $4 AND state_version = $5
       RETURNING *`,
      [
        JSON.stringify(state),
        new Date().toISOString(),
        gameId,
        ownerUserId,
        expectedVersion,
      ],
    );
    return result.rows[0] ? mapGameRow(result.rows[0]) : null;
  }
}
