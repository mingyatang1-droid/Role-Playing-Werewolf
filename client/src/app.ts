import {
  clearStoredAccessToken,
  getCurrentUser,
  getStoredAccessToken,
  isSessionExpired,
  loginWithWechat,
  updateNickname,
  type AuthUser,
} from "./auth/auth-client";
import {
  CanvasRenderer,
  type AppAction,
  type AppViewState,
} from "./presentation/canvas-renderer";
import {
  clearStoredActiveGameId,
  getGameSnapshot,
  getStoredActiveGameId,
  isGameUnavailable,
  startGame,
  submitGameAction,
  tickGame,
  type GameActionInput,
  type GameSnapshot,
} from "./game/game-client";
import {
  clearStoredActiveRoomId,
  createSoloRoom,
  getRoom,
  getStoredActiveRoomId,
  isRoomUnavailable,
  storeActiveRoomId,
  updateSoloRoom,
  type RoomResponse,
} from "./room/room-client";
import {
  ROLE_KEYS,
  createRoleTemplate,
  validateRoleConfig,
  type RoleConfig,
  type RoleKey,
} from "./room/room-config";

type LoginStatus = "idle" | "loading" | "error";

export class ClientApp {
  private readonly renderer: CanvasRenderer;
  private accessToken: string | null = null;
  private user: AuthUser | null = null;
  private loginStatus: LoginStatus = "idle";
  private loginMessage: string | undefined;
  private homeNotice: string | undefined;
  private seatCount = 9;
  private roles: RoleConfig = createRoleTemplate(9);
  private roomError: string | undefined;
  private createdRoom: RoomResponse | null = null;
  private activeRoom: RoomResponse | null = null;
  private editingRoom: RoomResponse | null = null;
  private currentScreen: AppViewState["screen"] = "login";
  private gameSnapshot: GameSnapshot | null = null;
  private selectedTarget: number | null = null;
  private gameError: string | undefined;
  private replayPage = 0;
  private nowMs = Date.now();
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private countdownDeadline: string | null = null;
  private isTickingGame = false;
  private isBusy = false;
  private isCreatingRoom = false;
  private isStartingGame = false;
  private isSubmittingGameAction = false;

  constructor() {
    const canvas = wx.createCanvas();
    this.renderer = new CanvasRenderer(canvas);
  }

  async start(): Promise<void> {
    this.renderer.mount();
    if (getStoredAccessToken()) {
      this.isBusy = true;
      this.loginStatus = "loading";
    }
    this.renderLogin();

    wx.onTouchEnd((event) => {
      const touch = event.changedTouches[0];
      if (!touch) {
        return;
      }

      const action = this.renderer.hitTestAction(
        touch.clientX,
        touch.clientY,
      );
      this.handleAction(action);
    });

    await this.restoreSession();
  }

  private handleAction(action: AppAction | null): void {
    if (
      !action ||
      this.isBusy ||
      this.isCreatingRoom ||
      this.isStartingGame ||
      this.isSubmittingGameAction ||
      this.isTickingGame
    ) {
      return;
    }

    if (action === "login") {
      void this.login();
      return;
    }

    if (action === "start-solo" && this.user) {
      this.seatCount = 9;
      this.roles = createRoleTemplate(9);
      this.roomError = undefined;
      this.homeNotice = undefined;
      this.editingRoom = null;
      this.renderRoomSetup();
      return;
    }

    if (action === "continue-room" && this.activeRoom) {
      this.openRoomEditor(this.activeRoom);
      return;
    }

    if (action === "continue-game" && this.gameSnapshot) {
      this.renderGame();
      return;
    }

    if (action === "edit-room" && this.createdRoom) {
      this.openRoomEditor(this.createdRoom);
      return;
    }

    if (action === "start-game" && this.createdRoom) {
      void this.startRoomGame();
      return;
    }

    if (action.startsWith("game-target-")) {
      const seatNo = Number(action.slice("game-target-".length));
      if (
        Number.isInteger(seatNo) &&
        this.gameSnapshot?.legal_action?.target_seats.includes(seatNo)
      ) {
        this.selectedTarget = seatNo;
        this.gameError = undefined;
        this.renderGame();
      }
      return;
    }

    if (action === "game-submit") {
      this.submitSelectedGameAction();
      return;
    }

    if (action === "game-speak") {
      void this.promptAndSubmitSpeech();
      return;
    }

    if (action === "game-skip-speech") {
      void this.submitGame({ action_type: "SKIP_SPEECH" });
      return;
    }

    if (action === "game-abstain") {
      void this.submitGame({ action_type: "VOTE", target_seat: null });
      return;
    }

    if (action === "game-witch-save") {
      void this.submitGame({
        action_type: "WITCH_ACTION",
        save: true,
        poison_target_seat: null,
      });
      return;
    }

    if (action === "game-witch-skip") {
      void this.submitGame({
        action_type: "WITCH_ACTION",
        save: false,
        poison_target_seat: null,
      });
      return;
    }

    if (
      (action === "replay-prev" || action === "replay-next") &&
      this.gameSnapshot
    ) {
      const pageCount = Math.max(
        1,
        Math.ceil(this.gameSnapshot.events.length / 2),
      );
      this.replayPage =
        action === "replay-prev"
          ? Math.max(0, this.replayPage - 1)
          : Math.min(pageCount - 1, this.replayPage + 1);
      this.renderGameResult();
      return;
    }

    if (action === "back-home" || action === "back-home-top") {
      this.homeNotice =
        this.currentScreen === "room-created" && this.createdRoom
          ? `房间 ${this.createdRoom.room_code} 已创建`
          : undefined;
      this.renderHome();
      return;
    }

    if (action === "seat-minus") {
      if (this.seatCount > 6) {
        this.changeSeatCount(this.seatCount - 1);
      }
      return;
    }

    if (action === "seat-plus") {
      if (this.seatCount < 12) {
        this.changeSeatCount(this.seatCount + 1);
      }
      return;
    }

    if (action === "create-room") {
      void this.createRoom();
      return;
    }

    if (action.startsWith("role-minus-")) {
      this.changeRole(action.slice("role-minus-".length), -1);
      return;
    }

    if (action.startsWith("role-plus-")) {
      this.changeRole(action.slice("role-plus-".length), 1);
    }
  }

  private changeSeatCount(nextCount: number): void {
    this.seatCount = nextCount;
    this.roles = createRoleTemplate(nextCount);
    this.roomError = undefined;
    this.renderRoomSetup();
  }

  private openRoomEditor(room: RoomResponse): void {
    this.editingRoom = room;
    this.seatCount = room.total_seats;
    this.roles = { ...room.role_config };
    this.roomError = undefined;
    this.renderRoomSetup();
  }

  private changeRole(roleName: string, delta: -1 | 1): void {
    if (!ROLE_KEYS.includes(roleName as RoleKey)) {
      return;
    }

    const key = roleName as RoleKey;
    const nextCount = this.roles[key] + delta;
    const isUnique = key === "seer" || key === "witch" || key === "hunter";
    if (
      nextCount < 0 ||
      nextCount > this.seatCount ||
      (isUnique && nextCount > 1)
    ) {
      return;
    }

    this.roles = {
      ...this.roles,
      [key]: nextCount,
    };
    this.roomError = undefined;
    this.renderRoomSetup();
  }

  private async startRoomGame(): Promise<void> {
    if (!this.createdRoom || !this.accessToken) {
      return;
    }

    this.isStartingGame = true;
    this.roomError = undefined;
    this.renderRoomCreated();

    try {
      this.gameSnapshot = await startGame(
        this.accessToken,
        this.createdRoom.id,
      );
      if (this.gameSnapshot.phase === "GAME_OVER") {
        clearStoredActiveGameId();
      }
      this.isStartingGame = false;
      this.selectedTarget = null;
      this.gameError = undefined;
      this.replayPage = 0;
      this.activeRoom = null;
      clearStoredActiveRoomId();
      this.renderGame();
    } catch (error) {
      this.isStartingGame = false;
      if (isSessionExpired(error)) {
        clearStoredAccessToken();
        this.accessToken = null;
        this.user = null;
        this.renderLogin();
        return;
      }

      this.roomError =
        error instanceof Error ? error.message : "进入游戏失败，请稍后重试";
      this.renderRoomCreated();
    }
  }

  private submitSelectedGameAction(): void {
    const game = this.gameSnapshot;
    const action = game?.legal_action;
    if (!game || !action || this.selectedTarget === null) {
      return;
    }

    let payload: GameActionInput;
    if (action.type === "WOLF_KILL") {
      payload = { action_type: "WOLF_KILL", target_seat: this.selectedTarget };
    } else if (action.type === "SEER_CHECK") {
      payload = {
        action_type: "SEER_CHECK",
        target_seat: this.selectedTarget,
      };
    } else if (action.type === "HUNTER_SHOOT") {
      payload = {
        action_type: "HUNTER_SHOOT",
        target_seat: this.selectedTarget,
      };
    } else if (action.type === "VOTE") {
      payload = { action_type: "VOTE", target_seat: this.selectedTarget };
    } else {
      payload = {
        action_type: "WITCH_ACTION",
        save: false,
        poison_target_seat: this.selectedTarget,
      };
    }

    void this.submitGame(payload);
  }

  private async promptAndSubmitSpeech(): Promise<void> {
    const text = await new Promise<string | null>((resolve) => {
      wx.showModal({
        title: "轮到你发言",
        editable: true,
        placeholderText: "输入 1～300 字的发言",
        confirmText: "发送",
        cancelText: "取消",
        success: (result) => {
          const content = result.content?.trim();
          resolve(result.confirm && content ? content : null);
        },
        fail: () => resolve(null),
      });
    });

    if (text) {
      await this.submitGame({ action_type: "SPEAK", text });
    }
  }

  private async submitGame(action: GameActionInput): Promise<void> {
    if (!this.accessToken || !this.gameSnapshot) {
      return;
    }

    this.isSubmittingGameAction = true;
    this.gameError = undefined;
    this.renderGame();

    try {
      this.gameSnapshot = await submitGameAction(
        this.accessToken,
        this.gameSnapshot,
        action,
      );
      this.selectedTarget = null;
      this.isSubmittingGameAction = false;
      if (this.gameSnapshot.phase === "GAME_OVER") {
        clearStoredActiveGameId();
      }
      this.renderGame();
    } catch (error) {
      this.isSubmittingGameAction = false;
      if (isSessionExpired(error)) {
        clearStoredAccessToken();
        this.accessToken = null;
        this.user = null;
        this.renderLogin();
        return;
      }

      this.gameError =
        error instanceof Error ? error.message : "行动提交失败，请稍后重试";
      this.renderGame();
    }
  }

  private async tickCurrentGame(): Promise<void> {
    if (!this.accessToken || !this.gameSnapshot || this.isTickingGame) {
      return;
    }

    this.isTickingGame = true;
    try {
      this.gameSnapshot = await tickGame(
        this.accessToken,
        this.gameSnapshot,
      );
      this.selectedTarget = null;
      this.isTickingGame = false;
      if (this.gameSnapshot.phase === "GAME_OVER") {
        clearStoredActiveGameId();
      }
      this.renderGame();
    } catch (error) {
      this.isTickingGame = false;
      this.gameError =
        error instanceof Error ? error.message : "发言计时推进失败";
      this.renderGame();
    }
  }

  private syncGameCountdown(): void {
    const deadline = this.gameSnapshot?.turn_deadline_at ?? null;
    this.nowMs = Date.now();
    if (!deadline) {
      this.stopGameCountdown();
      return;
    }
    if (this.countdownTimer && this.countdownDeadline === deadline) {
      return;
    }

    this.stopGameCountdown();
    this.countdownDeadline = deadline;
    this.countdownTimer = setInterval(() => {
      this.nowMs = Date.now();
      if (this.currentScreen !== "game" || !this.gameSnapshot) {
        this.stopGameCountdown();
        return;
      }
      this.renderer.render({
        screen: "game",
        snapshot: this.gameSnapshot,
        selectedTarget: this.selectedTarget,
        isSubmitting: this.isSubmittingGameAction,
        nowMs: this.nowMs,
        error: this.gameError,
      });
      if (this.nowMs >= new Date(deadline).getTime()) {
        this.stopGameCountdown();
        void this.tickCurrentGame();
      }
    }, 1_000);
  }

  private stopGameCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.countdownDeadline = null;
  }

  private async createRoom(): Promise<void> {
    const validationError = validateRoleConfig(this.seatCount, this.roles);
    if (validationError) {
      this.roomError = validationError;
      this.renderRoomSetup();
      return;
    }
    if (!this.accessToken) {
      this.renderLogin();
      return;
    }

    this.isCreatingRoom = true;
    this.roomError = undefined;
    this.renderRoomSetup();

    try {
      this.createdRoom = this.editingRoom
        ? await updateSoloRoom(
            this.accessToken,
            this.editingRoom,
            this.seatCount,
            this.roles,
          )
        : await createSoloRoom(
            this.accessToken,
            this.seatCount,
            this.roles,
          );
      this.activeRoom = this.createdRoom;
      storeActiveRoomId(this.createdRoom.id);
      this.isCreatingRoom = false;
      this.renderRoomCreated();
    } catch (error) {
      this.isCreatingRoom = false;
      if (isSessionExpired(error)) {
        clearStoredAccessToken();
        this.accessToken = null;
        this.user = null;
        this.renderLogin();
        return;
      }

      this.roomError =
        error instanceof Error ? error.message : "房间创建失败，请稍后重试";
      this.renderRoomSetup();
    }
  }

  private async restoreSession(): Promise<void> {
    const token = getStoredAccessToken();
    if (!token) {
      this.isBusy = false;
      this.renderLogin();
      return;
    }

    try {
      this.user = await getCurrentUser(token);
      this.accessToken = token;
      const hasActiveGame = await this.restoreActiveGame(token);
      if (!hasActiveGame) {
        await this.restoreActiveRoom(token);
      }
      this.isBusy = false;
      if (hasActiveGame) {
        this.renderGame();
      } else {
        this.renderHome();
      }
    } catch (error) {
      if (isSessionExpired(error)) {
        clearStoredAccessToken();
      }
      this.isBusy = false;
      this.renderLogin();
    }
  }

  private async login(): Promise<void> {
    this.isBusy = true;
    this.loginStatus = "loading";
    this.loginMessage = undefined;
    this.renderLogin();

    try {
      const result = await loginWithWechat();
      this.accessToken = result.access_token;
      this.user = result.user;

      if (result.is_new_user) {
        await this.promptForNickname();
      }

      let hasActiveGame = false;
      if (this.accessToken) {
        hasActiveGame = await this.restoreActiveGame(this.accessToken);
        if (!hasActiveGame) {
          await this.restoreActiveRoom(this.accessToken);
        }
      }
      this.loginStatus = "idle";
      if (hasActiveGame) {
        this.renderGame();
      } else {
        this.renderHome();
      }
    } catch (error) {
      this.loginStatus = "error";
      this.loginMessage =
        error instanceof Error ? error.message : "登录失败，请稍后重试";
      this.renderLogin();
    } finally {
      this.isBusy = false;
    }
  }

  private async restoreActiveRoom(accessToken: string): Promise<void> {
    const roomId = getStoredActiveRoomId();
    if (!roomId) {
      this.activeRoom = null;
      return;
    }

    try {
      const room = await getRoom(accessToken, roomId);
      if (room.status === "CONFIGURING") {
        this.activeRoom = room;
        return;
      }

      this.activeRoom = null;
      clearStoredActiveRoomId();
    } catch (error) {
      if (isSessionExpired(error)) {
        throw error;
      }
      if (isRoomUnavailable(error)) {
        this.activeRoom = null;
        clearStoredActiveRoomId();
        return;
      }

      this.activeRoom = null;
      this.homeNotice = "未开始房间暂时无法恢复，请稍后重试";
    }
  }

  private async restoreActiveGame(accessToken: string): Promise<boolean> {
    const gameId = getStoredActiveGameId();
    if (!gameId) {
      this.gameSnapshot = null;
      return false;
    }

    try {
      const snapshot = await getGameSnapshot(accessToken, gameId);
      if (snapshot.phase !== "GAME_OVER") {
        this.gameSnapshot = snapshot;
        return true;
      }

      this.gameSnapshot = null;
      clearStoredActiveGameId();
      return false;
    } catch (error) {
      if (isSessionExpired(error)) {
        throw error;
      }
      if (isGameUnavailable(error)) {
        this.gameSnapshot = null;
        clearStoredActiveGameId();
        return false;
      }

      this.gameSnapshot = null;
      this.homeNotice = "进行中的对局暂时无法恢复，请稍后重试";
      return false;
    }
  }

  private async promptForNickname(): Promise<void> {
    if (!this.accessToken) {
      return;
    }

    const nickname = await new Promise<string | null>((resolve) => {
      wx.showModal({
        title: "设置昵称",
        editable: true,
        placeholderText: "请输入狼人杀中显示的昵称",
        confirmText: "保存",
        cancelText: "稍后设置",
        success: (result) => {
          const content = result.content?.trim();
          resolve(result.confirm && content ? content : null);
        },
        fail: () => resolve(null),
      });
    });

    if (nickname && this.accessToken) {
      this.user = await updateNickname(this.accessToken, nickname);
    }
  }

  private renderLogin(): void {
    this.render({
      screen: "login",
      status: this.loginStatus,
      message: this.loginMessage,
    });
  }

  private renderHome(): void {
    if (!this.user) {
      this.renderLogin();
      return;
    }

    this.render({
      screen: "home",
      user: {
        nickname: this.user.nickname,
        publicId: this.user.public_id,
      },
      notice: this.homeNotice,
      activeRoom: this.activeRoom
        ? {
            code: this.activeRoom.room_code,
            totalSeats: this.activeRoom.total_seats,
            status: this.activeRoom.status,
          }
        : undefined,
      activeGame:
        this.gameSnapshot && this.gameSnapshot.phase !== "GAME_OVER"
          ? {
              phase: this.gameSnapshot.phase,
              round: this.gameSnapshot.round,
            }
          : undefined,
    });
  }

  private renderRoomSetup(): void {
    if (!this.user) {
      this.renderLogin();
      return;
    }

    this.render({
      screen: "room-setup",
      seatCount: this.seatCount,
      roles: this.roles,
      isSubmitting: this.isCreatingRoom,
      isEditing: this.editingRoom !== null,
      error: this.roomError,
    });
  }

  private renderRoomCreated(): void {
    if (!this.createdRoom) {
      this.renderHome();
      return;
    }

    this.render({
      screen: "room-created",
      room: {
        code: this.createdRoom.room_code,
        totalSeats: this.createdRoom.total_seats,
        roles: this.createdRoom.role_config,
      },
      isStarting: this.isStartingGame,
      error: this.roomError,
    });
  }

  private renderGame(): void {
    if (!this.gameSnapshot) {
      this.renderHome();
      return;
    }
    if (this.gameSnapshot.phase === "GAME_OVER") {
      this.renderGameResult();
      return;
    }

    this.render({
      screen: "game",
      snapshot: this.gameSnapshot,
      selectedTarget: this.selectedTarget,
      isSubmitting: this.isSubmittingGameAction,
      nowMs: this.nowMs,
      error: this.gameError,
    });
  }

  private renderGameResult(): void {
    if (!this.gameSnapshot || this.gameSnapshot.phase !== "GAME_OVER") {
      this.renderHome();
      return;
    }

    this.stopGameCountdown();
    const pageCount = Math.max(
      1,
      Math.ceil(this.gameSnapshot.events.length / 2),
    );
    this.replayPage = Math.min(this.replayPage, pageCount - 1);
    this.render({
      screen: "game-result",
      snapshot: this.gameSnapshot,
      replayPage: this.replayPage,
      replayPageCount: pageCount,
    });
  }

  private render(view: AppViewState): void {
    this.currentScreen = view.screen;
    this.renderer.render(view);
    if (view.screen === "game") {
      this.syncGameCountdown();
    } else {
      this.stopGameCountdown();
    }
  }
}
