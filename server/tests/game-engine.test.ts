import { describe, expect, it } from "vitest";
import {
  createGameState,
  createBotGame,
  expireHumanSpeechTurn,
  getLegalAction,
  RuleError,
  submitHumanAction,
  type GameParticipant,
} from "../src/game/engine.js";
import { createGameSnapshot } from "../src/game/snapshot.js";
import type { RoleConfig } from "../src/rooms/room-model.js";

const NINE_PLAYER_ROLES: RoleConfig = {
  werewolf: 3,
  villager: 3,
  seer: 1,
  witch: 1,
  hunter: 1,
};

function participants(): GameParticipant[] {
  return Array.from({ length: 9 }, (_, index) => ({
    seatNo: index + 1,
    nickname: index === 0 ? "真人玩家" : `AI ${index + 1}`,
    isAi: index !== 0,
  }));
}

describe("deterministic game engine", () => {
  it("assigns the configured roles deterministically", () => {
    const first = createGameState({
      humanSeat: 1,
      participants: participants(),
      roleConfig: NINE_PLAYER_ROLES,
      seed: "same-seed",
    });
    const second = createGameState({
      humanSeat: 1,
      participants: participants(),
      roleConfig: NINE_PLAYER_ROLES,
      seed: "same-seed",
    });

    expect(second.players.map((player) => player.role)).toEqual(
      first.players.map((player) => player.role),
    );
    expect(
      first.players.filter((player) => player.role === "WEREWOLF"),
    ).toHaveLength(3);
    expect(
      first.players.filter((player) => player.role === "VILLAGER"),
    ).toHaveLength(3);
  });

  it("does not expose other players' roles in a live snapshot", () => {
    const state = createGameState({
      humanSeat: 1,
      participants: participants(),
      roleConfig: NINE_PLAYER_ROLES,
      seed: "privacy-seed",
    });
    const snapshot = createGameSnapshot(state, "game-private", 1);
    const otherPlayers = snapshot.players.filter(
      (player) => player.seat_no !== 1,
    );

    expect(snapshot.self_role).toBeTruthy();
    expect(otherPlayers.every((player) => player.role === undefined)).toBe(true);
  });

  it("rejects illegal actions outside the human player's turn", () => {
    const state = createGameState({
      humanSeat: 1,
      participants: participants(),
      roleConfig: NINE_PLAYER_ROLES,
      seed: "action-seed",
    });
    const legal = getLegalAction(state);

    if (!legal) {
      expect(() =>
        submitHumanAction(state, 1, { type: "VOTE", targetSeat: null }),
      ).toThrow(RuleError);
      return;
    }

    expect(() =>
      submitHumanAction(state, 2, {
        type: legal.type,
        targetSeat: legal.targetSeats[0] ?? 0,
      } as never),
    ).toThrow(RuleError);
  });

  it("runs 1,000 all-bot games to a terminal state", () => {
    const bots = participants().map((player) => ({ ...player, isAi: true }));

    for (let index = 0; index < 1_000; index += 1) {
      const state = createBotGame({
        humanSeat: 1,
        participants: bots,
        roleConfig: NINE_PLAYER_ROLES,
        seed: `bot-game-${index}`,
      });

      expect(state.phase).toBe("GAME_OVER");
      expect(state.winner === "GOOD" || state.winner === "WEREWOLF").toBe(true);
    }
  });

  it("handles ordered human speech, text validation and timeout", () => {
    let state = createGameState({
      humanSeat: 1,
      participants: participants(),
      roleConfig: NINE_PLAYER_ROLES,
      seed: "speech-seed-0",
      currentTime: "2026-11-07T00:00:00.000Z",
    });
    let attempts = 0;
    while (state.phase !== "DAY_SPEECH" && attempts < 2_000) {
      state = createGameState({
        humanSeat: 1,
        participants: participants(),
        roleConfig: NINE_PLAYER_ROLES,
        seed: `speech-seed-${attempts}`,
        currentTime: "2026-11-07T00:00:00.000Z",
      });
      attempts += 1;
    }
    expect(state.phase).toBe("DAY_SPEECH");

    expect(state.speechOrder.length).toBeGreaterThan(0);
    expect(new Set(state.speechOrder).size).toBe(state.speechOrder.length);

    state.phase = "DAY_SPEECH";
    state.currentSpeakerSeat = 1;
    state.speechOrder = [
      1,
      ...state.players
        .filter((player) => player.alive && player.seatNo !== 1)
        .map((player) => player.seatNo),
    ];
    state.speechIndex = 0;
    state.turnDeadlineAt = "2026-11-07T00:01:00.000Z";

    expect(() =>
      submitHumanAction(state, 1, { type: "SPEAK", text: "   " }),
    ).toThrow(RuleError);

    submitHumanAction(
      state,
      1,
      { type: "SPEAK", text: "我先听听大家的判断。" },
      "2026-11-07T00:00:10.000Z",
    );
    expect(state.speeches.some((speech) => speech.seatNo === 1)).toBe(true);

    const timeoutState = createGameState({
      humanSeat: 1,
      participants: participants(),
      roleConfig: NINE_PLAYER_ROLES,
      seed: "speech-timeout-seed",
      currentTime: "2026-11-07T00:00:00.000Z",
    });
    timeoutState.phase = "DAY_SPEECH";
    timeoutState.currentSpeakerSeat = 1;
    timeoutState.speechOrder = [
      1,
      ...timeoutState.players
        .filter((player) => player.alive && player.seatNo !== 1)
        .map((player) => player.seatNo),
    ];
    timeoutState.speechIndex = 0;
    timeoutState.turnDeadlineAt = "2026-11-07T00:01:00.000Z";
    expect(
      expireHumanSpeechTurn(
        timeoutState,
        "2026-11-07T00:01:01.000Z",
      ),
    ).toBe(true);
    expect(
      timeoutState.speeches.some((speech) =>
        speech.text.includes("超时"),
      ),
    ).toBe(true);
  });

  it("runs bot games with 6 and 12 player role decks", () => {
    const configs = [
      {
        count: 6,
        roles: {
          werewolf: 2,
          villager: 2,
          seer: 1,
          witch: 1,
          hunter: 0,
        },
      },
      {
        count: 12,
        roles: {
          werewolf: 4,
          villager: 5,
          seer: 1,
          witch: 1,
          hunter: 1,
        },
      },
    ];

    for (const config of configs) {
      const bots = Array.from({ length: config.count }, (_, index) => ({
        seatNo: index + 1,
        nickname: `AI ${index + 1}`,
        isAi: true,
      }));
      for (let index = 0; index < 100; index += 1) {
        const state = createBotGame({
          humanSeat: 1,
          participants: bots,
          roleConfig: config.roles,
          seed: `${config.count}-player-${index}`,
        });
        expect(state.phase).toBe("GAME_OVER");
      }
    }
  });
});
