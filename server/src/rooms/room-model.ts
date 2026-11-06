import { ApiError } from "../errors/api-error.js";

export interface RoleConfig {
  werewolf: number;
  villager: number;
  seer: number;
  witch: number;
  hunter: number;
}

export interface CreateRoomInput {
  mode: "SOLO" | "FRIENDS";
  totalSeats: number;
  humanSeats: number;
  aiSeats: number;
  roleConfig: RoleConfig;
}

export interface RoomRecord {
  id: string;
  publicId: string;
  ownerUserId: string;
  mode: "SOLO" | "FRIENDS";
  status: "CONFIGURING" | "READY" | "IN_GAME" | "ENDED" | "CLOSED";
  totalSeats: number;
  humanSeats: number;
  aiSeats: number;
  roleConfig: RoleConfig;
  configVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomRepository {
  create(ownerUserId: string, input: CreateRoomInput): Promise<RoomRecord>;
  findByIdForOwner(
    roomId: string,
    ownerUserId: string,
  ): Promise<RoomRecord | null>;
}

export function roleTotal(roleConfig: RoleConfig): number {
  return (
    roleConfig.werewolf +
    roleConfig.villager +
    roleConfig.seer +
    roleConfig.witch +
    roleConfig.hunter
  );
}

export function assertValidRoomConfig(input: CreateRoomInput): void {
  if (
    !Number.isInteger(input.totalSeats) ||
    input.totalSeats < 6 ||
    input.totalSeats > 12
  ) {
    throw new ApiError(
      400,
      "ROOM_SEAT_COUNT_INVALID",
      "游戏人数必须为 6～12 人",
    );
  }

  if (input.mode !== "SOLO") {
    throw new ApiError(400, "ROOM_MODE_UNAVAILABLE", "当前仅开放单人房间");
  }

  if (input.humanSeats !== 1 || input.aiSeats !== input.totalSeats - 1) {
    throw new ApiError(
      400,
      "ROOM_OCCUPANT_COUNT_INVALID",
      "单人房必须配置 1 名真人和其余 AI",
    );
  }

  const roles = input.roleConfig;
  const roleValues = [
    roles.werewolf,
    roles.villager,
    roles.seer,
    roles.witch,
    roles.hunter,
  ];
  if (roleValues.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new ApiError(400, "ROOM_ROLE_COUNT_INVALID", "角色数量不合法");
  }

  if (roleTotal(roles) !== input.totalSeats) {
    throw new ApiError(
      400,
      "ROOM_ROLE_TOTAL_MISMATCH",
      "角色总人数必须与游戏人数一致",
    );
  }

  if (roles.werewolf < 1) {
    throw new ApiError(400, "ROOM_WEREWOLF_REQUIRED", "至少需要 1 名狼人");
  }

  if (roles.villager + roles.seer + roles.witch + roles.hunter < 1) {
    throw new ApiError(400, "ROOM_GOOD_REQUIRED", "至少需要 1 名非狼人");
  }

  if (roles.seer > 1 || roles.witch > 1 || roles.hunter > 1) {
    throw new ApiError(
      400,
      "ROOM_UNIQUE_ROLE_EXCEEDED",
      "预言家、女巫和猎人最多各 1 名",
    );
  }
}
