import { randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  CreateRoomInput,
  RoomRecord,
  RoomRepository,
} from "./room-model.js";

interface RoomRow {
  id: string;
  public_id: string;
  owner_user_id: string;
  mode: RoomRecord["mode"];
  status: RoomRecord["status"];
  total_seats: number;
  human_seats: number;
  ai_seats: number;
  werewolf_count: number;
  villager_count: number;
  seer_count: number;
  witch_count: number;
  hunter_count: number;
  config_version: number;
  created_at: string;
  updated_at: string;
}

function mapRoom(row: RoomRow): RoomRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    ownerUserId: row.owner_user_id,
    mode: row.mode,
    status: row.status,
    totalSeats: row.total_seats,
    humanSeats: row.human_seats,
    aiSeats: row.ai_seats,
    roleConfig: {
      werewolf: row.werewolf_count,
      villager: row.villager_count,
      seer: row.seer_count,
      witch: row.witch_count,
      hunter: row.hunter_count,
    },
    configVersion: row.config_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresRoomRepository implements RoomRepository {
  constructor(private readonly pool: Pool) {}

  async create(
    ownerUserId: string,
    input: CreateRoomInput,
  ): Promise<RoomRecord> {
    const client = await this.pool.connect();
    const now = new Date().toISOString();
    const room: RoomRecord = {
      id: randomUUID(),
      publicId: `R-${randomBytes(4).toString("hex").toUpperCase()}`,
      ownerUserId,
      mode: input.mode,
      status: "CONFIGURING",
      totalSeats: input.totalSeats,
      humanSeats: input.humanSeats,
      aiSeats: input.aiSeats,
      roleConfig: input.roleConfig,
      configVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO rooms (
          id, public_id, owner_user_id, mode, status, total_seats,
          human_seats, ai_seats, werewolf_count, villager_count, seer_count,
          witch_count, hunter_count, config_version, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16
        )`,
        [
          room.id,
          room.publicId,
          room.ownerUserId,
          room.mode,
          room.status,
          room.totalSeats,
          room.humanSeats,
          room.aiSeats,
          room.roleConfig.werewolf,
          room.roleConfig.villager,
          room.roleConfig.seer,
          room.roleConfig.witch,
          room.roleConfig.hunter,
          room.configVersion,
          room.createdAt,
          room.updatedAt,
        ],
      );

      for (let seatNo = 1; seatNo <= room.totalSeats; seatNo += 1) {
        await client.query(
          `INSERT INTO room_seats (
            id, room_id, seat_no, occupant_type, user_id, ready, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            randomUUID(),
            room.id,
            seatNo,
            seatNo === 1 ? "HUMAN" : "AI",
            seatNo === 1 ? ownerUserId : null,
            seatNo === 1 ? 1 : 0,
            now,
          ],
        );
      }

      await client.query("COMMIT");
      return room;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findByIdForOwner(
    roomId: string,
    ownerUserId: string,
  ): Promise<RoomRecord | null> {
    const result = await this.pool.query<RoomRow>(
      "SELECT * FROM rooms WHERE id = $1 AND owner_user_id = $2",
      [roomId, ownerUserId],
    );
    return result.rows[0] ? mapRoom(result.rows[0]) : null;
  }
}
