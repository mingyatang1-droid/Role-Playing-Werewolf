import { getJson, HttpError, postJson } from "../network/http-client";

const ACTIVE_GAME_STORAGE_KEY = "werewolf.active_game_id";

export type GameRole =
  | "WEREWOLF"
  | "VILLAGER"
  | "SEER"
  | "WITCH"
  | "HUNTER";

export type GamePhase =
  | "NIGHT_WEREWOLF"
  | "NIGHT_SEER"
  | "NIGHT_WITCH"
  | "DAY_SPEECH"
  | "DAY_VOTE"
  | "HUNTER_SHOOT"
  | "GAME_OVER";

export interface GamePlayerSnapshot {
  seat_no: number;
  nickname: string;
  is_ai: boolean;
  alive: boolean;
  role?: GameRole;
}

export interface GameEvent {
  id: string;
  sequence: number;
  round: number;
  type: string;
  message: string;
  visibility: "PUBLIC" | "SELF";
  visibleToSeat?: number;
}

export interface GameLegalAction {
  type:
    | "WOLF_KILL"
    | "SEER_CHECK"
    | "WITCH_ACTION"
    | "HUNTER_SHOOT"
  | "SPEAK"
  | "SKIP_SPEECH"
    | "VOTE";
  target_seats: number[];
  can_save?: boolean;
}

export interface GameSnapshot {
  game_id: string;
  state_version: number;
  phase: GamePhase;
  round: number;
  current_speaker_seat: number | null;
  speech_order: number[];
  turn_deadline_at: string | null;
  self_seat: number;
  self_role: GameRole;
  self_alive: boolean;
  winner: "GOOD" | "WEREWOLF" | null;
  players: GamePlayerSnapshot[];
  events: GameEvent[];
  legal_action: GameLegalAction | null;
  private_info: {
    werewolf_teammates: number[];
    seer_checks: Array<{
      target_seat: number;
      is_werewolf: boolean;
      round: number;
    }>;
    witch: {
      wolf_target_seat: number | null;
      antidote_available: boolean;
      poison_available: boolean;
    } | null;
    pending_hunter_shot: boolean;
  };
}

export type GameActionInput =
  | { action_type: "WOLF_KILL"; target_seat: number }
  | { action_type: "SEER_CHECK"; target_seat: number }
  | {
      action_type: "WITCH_ACTION";
      save: boolean;
      poison_target_seat: number | null;
    }
  | { action_type: "HUNTER_SHOOT"; target_seat: number }
  | { action_type: "SPEAK"; text: string }
  | { action_type: "SKIP_SPEECH" }
  | { action_type: "VOTE"; target_seat: number | null };

export async function startGame(
  accessToken: string,
  roomId: string,
): Promise<GameSnapshot> {
  const response = await postJson<GameSnapshot>(
    `/v1/rooms/${roomId}/start`,
    {},
    accessToken,
  );
  storeActiveGameId(response.data.game_id);
  return response.data;
}

export async function getGameSnapshot(
  accessToken: string,
  gameId: string,
): Promise<GameSnapshot> {
  const response = await getJson<GameSnapshot>(
    `/v1/games/${gameId}/snapshot`,
    accessToken,
  );
  return response.data;
}

export async function submitGameAction(
  accessToken: string,
  snapshot: GameSnapshot,
  action: GameActionInput,
): Promise<GameSnapshot> {
  const response = await postJson<GameSnapshot>(
    `/v1/games/${snapshot.game_id}/actions`,
    {
      expected_version: snapshot.state_version,
      ...action,
    },
    accessToken,
  );
  return response.data;
}

export async function tickGame(
  accessToken: string,
  snapshot: GameSnapshot,
): Promise<GameSnapshot> {
  const response = await postJson<GameSnapshot>(
    `/v1/games/${snapshot.game_id}/tick`,
    { expected_version: snapshot.state_version },
    accessToken,
  );
  return response.data;
}

export function getStoredActiveGameId(): string | null {
  const value = wx.getStorageSync(ACTIVE_GAME_STORAGE_KEY);
  return typeof value === "string" && value ? value : null;
}

export function storeActiveGameId(gameId: string): void {
  wx.setStorageSync(ACTIVE_GAME_STORAGE_KEY, gameId);
}

export function clearStoredActiveGameId(): void {
  wx.removeStorageSync(ACTIVE_GAME_STORAGE_KEY);
}

export function isGameUnavailable(error: unknown): boolean {
  return (
    error instanceof HttpError &&
    (error.statusCode === 404 || error.statusCode === 410)
  );
}
