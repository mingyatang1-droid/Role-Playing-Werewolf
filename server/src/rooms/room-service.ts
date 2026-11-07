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

  async updateRoomConfig(
    accessToken: string,
    roomId: string,
    input: CreateRoomInput,
    expectedVersion: number,
  ): Promise<RoomRecord> {
    const user = await this.authService.getCurrentUser(accessToken);
    assertValidRoomConfig(input);

    const current = await this.rooms.findByIdForOwner(roomId, user.id);
    if (!current) {
      throw new ApiError(404, "ROOM_NOT_FOUND", "房间不存在");
    }
    if (current.status !== "CONFIGURING") {
      throw new ApiError(
        409,
        "ROOM_NOT_EDITABLE",
        "房间已经开始或关闭，不能修改配置",
      );
    }
    if (current.configVersion !== expectedVersion) {
      throw new ApiError(
        409,
        "ROOM_VERSION_CONFLICT",
        "房间配置已在其他位置修改，请刷新后重试",
      );
    }

    const updated = await this.rooms.updateConfig(
      roomId,
      user.id,
      input,
      expectedVersion,
    );
    if (!updated) {
      throw new ApiError(
        409,
        "ROOM_VERSION_CONFLICT",
        "房间配置已在其他位置修改，请刷新后重试",
      );
    }

    return updated;
  }
}
