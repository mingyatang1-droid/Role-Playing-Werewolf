import type { AuthService } from "../auth/auth-service.js";
import { ApiError } from "../errors/api-error.js";
import {
  assertValidRoomConfig,
  type CreateRoomInput,
  type RoomRecord,
  type RoomRepository,
} from "./room-model.js";

export class RoomService {
  constructor(
    private readonly authService: AuthService,
    private readonly rooms: RoomRepository,
  ) {}

  async createRoom(
    accessToken: string,
    input: CreateRoomInput,
  ): Promise<RoomRecord> {
    const user = await this.authService.getCurrentUser(accessToken);
    assertValidRoomConfig(input);
    return this.rooms.create(user.id, input);
  }

  async getOwnedRoom(
    accessToken: string,
    roomId: string,
  ): Promise<RoomRecord> {
    const user = await this.authService.getCurrentUser(accessToken);
    const room = await this.rooms.findByIdForOwner(roomId, user.id);
    if (!room) {
      throw new ApiError(404, "ROOM_NOT_FOUND", "房间不存在");
    }

    return room;
  }
}
