import { randomUUID } from "node:crypto";
import type { AuthService } from "../auth/auth-service.js";
import { ApiError } from "../errors/api-error.js";
import type { RoomRepository } from "../rooms/room-model.js";
import {
  createGameState,
  expireHumanSpeechTurn,
  RuleError,
  submitHumanAction,
  type HumanAction,
} from "./engine.js";
import type { GameRepository } from "./game-repository.js";
import { createGameSnapshot, type GameSnapshot } from "./snapshot.js";

export class GameService {
  constructor(
    private readonly authService: AuthService,
    private readonly rooms: RoomRepository,
    private readonly games: GameRepository,
  ) {}

  async startGame(accessToken: string, roomId: string): Promise<GameSnapshot> {
    const user = await this.authService.getCurrentUser(accessToken);
    const room = await this.rooms.findByIdForOwner(roomId, user.id);
    if (!room) {
      throw new ApiError(404, "ROOM_NOT_FOUND", "房间不存在");
    }

    const existing = await this.games.findByRoomForOwner(room.id, user.id);
    if (existing) {
      return createGameSnapshot(
        existing.state,
        existing.id,
        existing.stateVersion,
      );
    }
    if (room.status !== "CONFIGURING") {
      throw new ApiError(
        409,
        "ROOM_NOT_STARTABLE",
        "当前房间状态不能开始游戏",
      );
    }

    const participants = Array.from(
      { length: room.totalSeats },
      (_, index) => {
        const seatNo = index + 1;
        return {
          seatNo,
          nickname: seatNo === 1 ? user.nickname : `AI ${seatNo}`,
          isAi: seatNo !== 1,
        };
      },
    );
    const state = createGameState({
      humanSeat: 1,
      participants,
      roleConfig: room.roleConfig,
      seed: `${room.id}:${randomUUID()}`,
      currentTime: new Date().toISOString(),
    });
    const game = await this.games.createForRoom(room.id, user.id, state);
    if (!game) {
      const concurrentlyCreated = await this.games.findByRoomForOwner(
        room.id,
        user.id,
      );
      if (concurrentlyCreated) {
        return createGameSnapshot(
          concurrentlyCreated.state,
          concurrentlyCreated.id,
          concurrentlyCreated.stateVersion,
        );
      }

      throw new ApiError(
        409,
        "ROOM_NOT_STARTABLE",
        "房间已经开始或不能再次开始",
      );
    }

    return createGameSnapshot(game.state, game.id, game.stateVersion);
  }

  async getSnapshot(
    accessToken: string,
    gameId: string,
  ): Promise<GameSnapshot> {
    const user = await this.authService.getCurrentUser(accessToken);
    const game = await this.games.findByIdForOwner(gameId, user.id);
    if (!game) {
      throw new ApiError(404, "GAME_NOT_FOUND", "对局不存在");
    }
    return createGameSnapshot(game.state, game.id, game.stateVersion);
  }

  async submitAction(
    accessToken: string,
    gameId: string,
    expectedVersion: number,
    action: HumanAction,
  ): Promise<GameSnapshot> {
    const user = await this.authService.getCurrentUser(accessToken);
    const game = await this.games.findByIdForOwner(gameId, user.id);
    if (!game) {
      throw new ApiError(404, "GAME_NOT_FOUND", "对局不存在");
    }
    if (game.stateVersion !== expectedVersion) {
      throw new ApiError(
        409,
        "GAME_VERSION_CONFLICT",
        "对局状态已更新，请刷新后重试",
      );
    }

    const nowIso = new Date().toISOString();
    if (expireHumanSpeechTurn(game.state, nowIso)) {
      await this.games.updateState(
        game.id,
        user.id,
        game.state,
        expectedVersion,
      );
      throw new ApiError(
        409,
        "TURN_EXPIRED",
        "发言时间已结束，系统已自动跳过",
      );
    }

    try {
      submitHumanAction(game.state, game.state.humanSeat, action, nowIso);
    } catch (error) {
      if (error instanceof RuleError) {
        throw new ApiError(400, error.code, error.message);
      }
      throw error;
    }

    const updated = await this.games.updateState(
      game.id,
      user.id,
      game.state,
      expectedVersion,
    );
    if (!updated) {
      throw new ApiError(
        409,
        "GAME_VERSION_CONFLICT",
        "对局状态已更新，请刷新后重试",
      );
    }

    return createGameSnapshot(
      updated.state,
      updated.id,
      updated.stateVersion,
    );
  }

  async tick(
    accessToken: string,
    gameId: string,
    expectedVersion: number,
  ): Promise<GameSnapshot> {
    const user = await this.authService.getCurrentUser(accessToken);
    const game = await this.games.findByIdForOwner(gameId, user.id);
    if (!game) {
      throw new ApiError(404, "GAME_NOT_FOUND", "对局不存在");
    }
    if (game.stateVersion !== expectedVersion) {
      throw new ApiError(
        409,
        "GAME_VERSION_CONFLICT",
        "对局状态已更新，请刷新后重试",
      );
    }

    const updatedState = expireHumanSpeechTurn(
      game.state,
      new Date().toISOString(),
    );
    if (!updatedState) {
      return createGameSnapshot(
        game.state,
        game.id,
        game.stateVersion,
      );
    }

    const updated = await this.games.updateState(
      game.id,
      user.id,
      game.state,
      expectedVersion,
    );
    if (!updated) {
      throw new ApiError(
        409,
        "GAME_VERSION_CONFLICT",
        "对局状态已更新，请刷新后重试",
      );
    }
    return createGameSnapshot(
      updated.state,
      updated.id,
      updated.stateVersion,
    );
  }
}
