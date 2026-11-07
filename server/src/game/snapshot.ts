import {
  getLegalAction,
  type GameEvent,
  type GameRole,
  type GameState,
  type LegalAction,
} from "./engine.js";

export interface PublicPlayerSnapshot {
  seat_no: number;
  nickname: string;
  is_ai: boolean;
  alive: boolean;
  role?: GameRole;
}

export interface GameSnapshot {
  game_id: string;
  state_version: number;
  phase: GameState["phase"];
  round: number;
  current_speaker_seat: number | null;
  speech_order: number[];
  turn_deadline_at: string | null;
  self_seat: number;
  self_role: GameRole;
  self_alive: boolean;
  winner: GameState["winner"];
  players: PublicPlayerSnapshot[];
  events: GameEvent[];
  legal_action: {
    type: LegalAction["type"];
    target_seats: number[];
    can_save?: boolean;
  } | null;
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

export function createGameSnapshot(
  state: GameState,
  gameId: string,
  stateVersion: number,
): GameSnapshot {
  const human = state.players.find(
    (player) => player.seatNo === state.humanSeat,
  );
  if (!human) {
    throw new Error("Human seat is missing from game state.");
  }

  const gameOver = state.phase === "GAME_OVER";
  const humanIsWolf = human.role === "WEREWOLF";
  const visibleEvents = state.events.filter(
    (event) =>
      event.visibility === "PUBLIC" ||
      (event.visibility === "SELF" && event.visibleToSeat === human.seatNo),
  );

  return {
    game_id: gameId,
    state_version: stateVersion,
    phase: state.phase,
    round: state.round,
    current_speaker_seat: state.currentSpeakerSeat,
    speech_order: [...state.speechOrder],
    turn_deadline_at: state.turnDeadlineAt,
    self_seat: human.seatNo,
    self_role: human.role,
    self_alive: human.alive,
    winner: state.winner,
    players: state.players.map((player) => ({
      seat_no: player.seatNo,
      nickname: player.nickname,
      is_ai: player.isAi,
      alive: player.alive,
      ...(gameOver ? { role: player.role } : {}),
    })),
    events: visibleEvents,
    legal_action: normaliseLegalAction(getLegalAction(state)),
    private_info: {
      werewolf_teammates: humanIsWolf
        ? state.players
            .filter(
              (player) =>
                player.role === "WEREWOLF" &&
                player.seatNo !== human.seatNo,
            )
            .map((player) => player.seatNo)
        : [],
      seer_checks:
        human.role === "SEER"
          ? state.seerResults
              .filter((result) => result.seerSeat === human.seatNo)
              .map((result) => ({
                target_seat: result.targetSeat,
                is_werewolf: result.isWerewolf,
                round: result.round,
              }))
          : [],
      witch:
        human.role === "WITCH" && state.witchResources
          ? {
              wolf_target_seat: state.wolfTargetSeat,
              antidote_available:
                state.witchResources.antidoteAvailable,
              poison_available: state.witchResources.poisonAvailable,
            }
          : null,
      pending_hunter_shot: state.pendingHunterSeat === human.seatNo,
    },
  };
}

function normaliseLegalAction(action: LegalAction | null): GameSnapshot["legal_action"] {
  if (!action) {
    return null;
  }

  return {
    type: action.type,
    target_seats: action.targetSeats,
    ...(action.canSave === undefined ? {} : { can_save: action.canSave }),
  };
}
