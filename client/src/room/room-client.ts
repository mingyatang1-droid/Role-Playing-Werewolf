import { postJson } from "../network/http-client";
import type { RoleConfig } from "./room-config";

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
