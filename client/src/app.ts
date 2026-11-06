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
import { createSoloRoom, type RoomResponse } from "./room/room-client";
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
  private currentScreen: AppViewState["screen"] = "login";
  private isBusy = false;
  private isCreatingRoom = false;

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
    if (!action || this.isBusy || this.isCreatingRoom) {
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
      this.renderRoomSetup();
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
      this.createdRoom = await createSoloRoom(
        this.accessToken,
        this.seatCount,
        this.roles,
      );
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
      this.isBusy = false;
      this.renderHome();
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

      this.loginStatus = "idle";
      this.renderHome();
    } catch (error) {
      this.loginStatus = "error";
      this.loginMessage =
        error instanceof Error ? error.message : "登录失败，请稍后重试";
      this.renderLogin();
    } finally {
      this.isBusy = false;
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
    });
  }

  private render(view: AppViewState): void {
    this.currentScreen = view.screen;
    this.renderer.render(view);
  }
}
