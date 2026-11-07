import { randomBytes, randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/database.js";
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

function createRoomCode(): string {
  return `R-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export class SqliteRoomRepository implements RoomRepository {
  constructor(private readonly database: AppDatabase) {}

  async create(
    ownerUserId: string,
    input: CreateRoomInput,
  ): Promise<RoomRecord> {
    const now = new Date().toISOString();
    const room: RoomRecord = {
      id: randomUUID(),
      publicId: createRoomCode(),
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

    this.database.connection.exec("BEGIN IMMEDIATE;");
    try {
      this.database.connection
        .prepare(
          `INSERT INTO rooms (
            id, public_id, owner_user_id, mode, status, total_seats,
            human_seats, ai_seats, werewolf_count, villager_count, seer_count,
            witch_count, hunter_count, config_version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
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
        );

      const insertSeat = this.database.connection.prepare(
        `INSERT INTO room_seats (
          id, room_id, seat_no, occupant_type, user_id, ready, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (let seatNo = 1; seatNo <= room.totalSeats; seatNo += 1) {
        insertSeat.run(
          randomUUID(),
          room.id,
          seatNo,
          seatNo === 1 ? "HUMAN" : "AI",
          seatNo === 1 ? ownerUserId : null,
          seatNo === 1 ? 1 : 0,
          now,
        );
      }

      this.database.connection.exec("COMMIT;");
      return room;
    } catch (error) {
      this.database.connection.exec("ROLLBACK;");
      throw error;
    }
  }

  async findByIdForOwner(
    roomId: string,
    ownerUserId: string,
  ): Promise<RoomRecord | null> {
    const row = this.database.connection
      .prepare("SELECT * FROM rooms WHERE id = ? AND owner_user_id = ?")
      .get(roomId, ownerUserId) as RoomRow | undefined;

    return row ? mapRoom(row) : null;
  }

  async updateConfig(
    roomId: string,
    ownerUserId: string,
    input: CreateRoomInput,
    expectedVersion: number,
  ): Promise<RoomRecord | null> {
    const now = new Date().toISOString();
    this.database.connection.exec("BEGIN IMMEDIATE;");

    try {
      const result = this.database.connection
        .prepare(
          `UPDATE rooms SET
            mode = ?, total_seats = ?, human_seats = ?, ai_seats = ?,
            werewolf_count = ?, villager_count = ?, seer_count = ?,
            witch_count = ?, hunter_count = ?, config_version = config_version + 1,
            updated_at = ?
          WHERE id = ? AND owner_user_id = ? AND status = 'CONFIGURING'
            AND config_version = ?`,
        )
        .run(
          input.mode,
          input.totalSeats,
          input.humanSeats,
          input.aiSeats,
          input.roleConfig.werewolf,
          input.roleConfig.villager,
          input.roleConfig.seer,
          input.roleConfig.witch,
          input.roleConfig.hunter,
          now,
          roomId,
          ownerUserId,
          expectedVersion,
        );

      if (result.changes === 0) {
        this.database.connection.exec("ROLLBACK;");
        return null;
      }

      this.database.connection
        .prepare("DELETE FROM room_seats WHERE room_id = ?")
        .run(roomId);

      const insertSeat = this.database.connection.prepare(
        `INSERT INTO room_seats (
          id, room_id, seat_no, occupant_type, user_id, ready, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (let seatNo = 1; seatNo <= input.totalSeats; seatNo += 1) {
        insertSeat.run(
          randomUUID(),
          roomId,
          seatNo,
          seatNo === 1 ? "HUMAN" : "AI",
          seatNo === 1 ? ownerUserId : null,
          seatNo === 1 ? 1 : 0,
          now,
        );
      }

      this.database.connection.exec("COMMIT;");
      return this.findByIdForOwner(roomId, ownerUserId);
    } catch (error) {
      this.database.connection.exec("ROLLBACK;");
      throw error;
    }
  }
}
