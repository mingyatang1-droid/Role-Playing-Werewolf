import type { GameState } from "./engine.js";

export interface GameRecord {
  id: string;
  roomId: string;
  ownerUserId: string;
  state: GameState;
  stateVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface GameRepository {
  createForRoom(
    roomId: string,
    ownerUserId: string,
    state: GameState,
  ): Promise<GameRecord | null>;
  findByRoomForOwner(
    roomId: string,
    ownerUserId: string,
  ): Promise<GameRecord | null>;
  findByIdForOwner(
    gameId: string,
    ownerUserId: string,
  ): Promise<GameRecord | null>;
  updateState(
    gameId: string,
    ownerUserId: string,
    state: GameState,
    expectedVersion: number,
  ): Promise<GameRecord | null>;
}

export interface GameRow {
  id: string;
  room_id: string;
  owner_user_id: string;
  state_json: string;
  state_version: number;
  created_at: string;
  updated_at: string;
}

export function mapGameRow(row: GameRow): GameRecord {
  return {
    id: row.id,
    roomId: row.room_id,
    ownerUserId: row.owner_user_id,
    state: JSON.parse(row.state_json) as GameState,
    stateVersion: row.state_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
