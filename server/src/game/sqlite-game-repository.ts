import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/database.js";
import type { GameState } from "./engine.js";
import {
  mapGameRow,
  type GameRecord,
  type GameRepository,
  type GameRow,
} from "./game-repository.js";

export class SqliteGameRepository implements GameRepository {
  constructor(private readonly database: AppDatabase) {}

  async createForRoom(
    roomId: string,
    ownerUserId: string,
    state: GameState,
  ): Promise<GameRecord | null> {
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

    this.database.connection.exec("BEGIN IMMEDIATE;");
    try {
      const updated = this.database.connection
        .prepare(
          `UPDATE rooms SET status = 'IN_GAME', updated_at = ?
           WHERE id = ? AND owner_user_id = ? AND status = 'CONFIGURING'`,
        )
        .run(now, roomId, ownerUserId);
      if (updated.changes === 0) {
        this.database.connection.exec("ROLLBACK;");
        return null;
      }

      this.database.connection
        .prepare(
          `INSERT INTO games (
            id, room_id, owner_user_id, state_json, state_version,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.id,
          roomId,
          ownerUserId,
          JSON.stringify(state),
          record.stateVersion,
          now,
          now,
        );

      this.database.connection.exec("COMMIT;");
      return record;
    } catch (error) {
      this.database.connection.exec("ROLLBACK;");
      throw error;
    }
  }

  async findByRoomForOwner(
    roomId: string,
    ownerUserId: string,
  ): Promise<GameRecord | null> {
    const row = this.database.connection
      .prepare("SELECT * FROM games WHERE room_id = ? AND owner_user_id = ?")
      .get(roomId, ownerUserId) as GameRow | undefined;
    return row ? mapGameRow(row) : null;
  }

  async findByIdForOwner(
    gameId: string,
    ownerUserId: string,
  ): Promise<GameRecord | null> {
    const row = this.database.connection
      .prepare("SELECT * FROM games WHERE id = ? AND owner_user_id = ?")
      .get(gameId, ownerUserId) as GameRow | undefined;
    return row ? mapGameRow(row) : null;
  }

  async updateState(
    gameId: string,
    ownerUserId: string,
    state: GameState,
    expectedVersion: number,
  ): Promise<GameRecord | null> {
    const now = new Date().toISOString();
    const result = this.database.connection
      .prepare(
        `UPDATE games SET state_json = ?, state_version = state_version + 1,
          updated_at = ?
         WHERE id = ? AND owner_user_id = ? AND state_version = ?`,
      )
      .run(
        JSON.stringify(state),
        now,
        gameId,
        ownerUserId,
        expectedVersion,
      );
    if (result.changes === 0) {
      return null;
    }
    return this.findByIdForOwner(gameId, ownerUserId);
  }
}
