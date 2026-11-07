import {
  getJson,
  HttpError,
  patchJson,
  postJson,
} from "../network/http-client";
import type { RoleConfig } from "./room-config";

const ACTIVE_ROOM_STORAGE_KEY = "werewolf.active_room_id";

export interface RoomResponse {
  id: string;
  room_code: string;
  mode: "SOLO" | "FRIENDS";
  status: "CONFIGURING" | "READY" | "IN_GAME" | "ENDED" | "CLOSED";
  total_seats: number;
  human_seats: number;
  ai_seats: number;
  role_config: RoleConfig;
  config_version: number;
  created_at: string;
  updated_at: string;
}

export async function createSoloRoom(
  accessToken: string,
  totalSeats: number,
  roles: RoleConfig,
): Promise<RoomResponse> {
  const response = await postJson<RoomResponse>(
    "/v1/rooms",
    {
      mode: "SOLO",
      total_seats: totalSeats,
      human_seats: 1,
      ai_seats: totalSeats - 1,
      role_config: roles,
    },
    accessToken,
  );

  return response.data;
}

export async function getRoom(
  accessToken: string,
  roomId: string,
): Promise<RoomResponse> {
  const response = await getJson<RoomResponse>(
    `/v1/rooms/${roomId}`,
    accessToken,
  );
  return response.data;
}

export async function updateSoloRoom(
  accessToken: string,
  room: RoomResponse,
  totalSeats: number,
  roles: RoleConfig,
): Promise<RoomResponse> {
  const response = await patchJson<RoomResponse>(
    `/v1/rooms/${room.id}/config`,
    {
      expected_version: room.config_version,
      mode: "SOLO",
      total_seats: totalSeats,
      human_seats: 1,
      ai_seats: totalSeats - 1,
      role_config: roles,
    },
    accessToken,
  );
  return response.data;
}

export function getStoredActiveRoomId(): string | null {
  const value = wx.getStorageSync(ACTIVE_ROOM_STORAGE_KEY);
  return typeof value === "string" && value ? value : null;
}

export function storeActiveRoomId(roomId: string): void {
  wx.setStorageSync(ACTIVE_ROOM_STORAGE_KEY, roomId);
}

export function clearStoredActiveRoomId(): void {
  wx.removeStorageSync(ACTIVE_ROOM_STORAGE_KEY);
}

export function isRoomUnavailable(error: unknown): boolean {
  return error instanceof HttpError && (error.statusCode === 404 || error.statusCode === 410);
}
