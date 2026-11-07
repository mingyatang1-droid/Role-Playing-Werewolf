import {
  ROLE_KEYS,
  ROLE_META,
  roleTotal,
  type RoleConfig,
  type RoleKey,
} from "../room/room-config";
import type { GamePhase, GameRole, GameSnapshot } from "../game/game-client";

export interface AuthenticatedView {
  nickname: string;
  publicId: string;
}

export interface LoginViewState {
  screen: "login";
  status: "idle" | "loading" | "error";
  message?: string;
}

export interface HomeViewState {
  screen: "home";
  user: AuthenticatedView;
  notice?: string;
  activeRoom?: {
    code: string;
    totalSeats: number;
    status: string;
  };
  activeGame?: {
    phase: GamePhase;
    round: number;
  };
}

export interface RoomSetupViewState {
  screen: "room-setup";
  seatCount: number;
  roles: RoleConfig;
  isSubmitting: boolean;
  isEditing: boolean;
  error?: string;
}

export interface CreatedRoomView {
  code: string;
  totalSeats: number;
  roles: RoleConfig;
}

export interface RoomCreatedViewState {
  screen: "room-created";
  room: CreatedRoomView;
  isStarting?: boolean;
  error?: string;
}

export interface GameViewState {
  screen: "game";
  snapshot: GameSnapshot;
  selectedTarget: number | null;
  isSubmitting: boolean;
  nowMs: number;
  error?: string;
}

export interface GameResultViewState {
  screen: "game-result";
  snapshot: GameSnapshot;
  replayPage: number;
  replayPageCount: number;
}

export type AppViewState =
  | LoginViewState
  | HomeViewState
  | RoomSetupViewState
  | RoomCreatedViewState
  | GameViewState
  | GameResultViewState;

export type AppAction =
  | "login"
  | "start-solo"
  | "back-home"
  | "back-home-top"
  | "continue-room"
  | "continue-game"
  | "edit-room"
  | "start-game"
  | "game-submit"
  | "game-abstain"
  | "game-speak"
  | "game-skip-speech"
  | "game-witch-save"
  | "game-witch-skip"
  | "replay-prev"
  | "replay-next"
  | `game-target-${number}`
  | "seat-minus"
  | "seat-plus"
  | "create-room"
  | `role-minus-${RoleKey}`
  | `role-plus-${RoleKey}`;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextOptions {
  color?: string;
  font?: string;
  align?: CanvasTextAlign;
}

const COLORS = {
  backgroundTop: "#070d19",
  backgroundBottom: "#111827",
  panel: "rgba(20, 29, 43, 0.92)",
  panelSoft: "rgba(38, 49, 65, 0.58)",
  gold: "#d7b777",
  goldBright: "#f2d79c",
  cream: "#f4ead7",
  text: "#f8fafc",
  muted: "#94a3b8",
  faint: "#64748b",
  crimson: "#9f3542",
  crimsonDark: "#71242f",
  emerald: "#2f8f68",
  shadow: "rgba(0, 0, 0, 0.42)",
};

const STARS = [
  [0.08, 0.12, 1.2], [0.18, 0.07, 1.8], [0.31, 0.16, 1],
  [0.42, 0.09, 1.4], [0.58, 0.14, 1.1], [0.69, 0.06, 1.7],
  [0.82, 0.18, 1.2], [0.91, 0.09, 1], [0.13, 0.29, 1],
  [0.27, 0.35, 1.4], [0.51, 0.28, 1], [0.73, 0.32, 1.6],
  [0.88, 0.38, 1.2], [0.06, 0.47, 1.3], [0.38, 0.45, 1],
] as const;

export class CanvasRenderer {
  private readonly canvas: WechatCanvas;
  private readonly context: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private topInset = 24;
  private topBarTop = 24;
  private topBarHeight = 32;
  private actions: Partial<Record<AppAction, Rect>> = {};

  constructor(canvas: WechatCanvas) {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context is unavailable.");
    }

    this.canvas = canvas;
    this.context = context;
  }

  mount(): void {
    const system = wx.getSystemInfoSync();
    this.canvas.width = Math.floor(system.windowWidth * system.pixelRatio);
    this.canvas.height = Math.floor(system.windowHeight * system.pixelRatio);

    this.context.scale(system.pixelRatio, system.pixelRatio);
    this.width = system.windowWidth;
    this.height = system.windowHeight;

    const menuButton = wx.getMenuButtonBoundingClientRect?.();
    this.topBarTop = menuButton?.top ?? (system.statusBarHeight ?? 20) + 4;
    this.topBarHeight = menuButton?.height ?? 32;
    this.topInset = Math.max(
      (system.statusBarHeight ?? 20) + 10,
      menuButton ? menuButton.bottom + 10 : 0,
    );
  }

  render(view: AppViewState): void {
    this.actions = {};
    this.drawBackground();

    switch (view.screen) {
      case "login":
        this.drawLogin(view);
        break;
      case "home":
        this.drawHome(view);
        break;
      case "room-setup":
        this.drawRoomSetup(view);
        break;
      case "room-created":
        this.drawRoomCreated(view);
        break;
      case "game":
        this.drawGameTable(view);
        break;
      case "game-result":
        this.drawGameResult(view);
        break;
    }
  }

  hitTestAction(x: number, y: number): AppAction | null {
    for (const [action, rect] of Object.entries(this.actions)) {
      if (
        rect &&
        x >= rect.x &&
        x <= rect.x + rect.width &&
        y >= rect.y &&
        y <= rect.y + rect.height
      ) {
        return action as AppAction;
      }
    }

    return null;
  }

  private drawBackground(): void {
    const background = this.context.createLinearGradient(
      0,
      0,
      this.width * 0.3,
      this.height,
    );
    background.addColorStop(0, COLORS.backgroundTop);
    background.addColorStop(0.58, "#0c1422");
    background.addColorStop(1, COLORS.backgroundBottom);
    this.context.fillStyle = background;
    this.context.fillRect(0, 0, this.width, this.height);

    const moonGlow = this.context.createRadialGradient(
      this.width - 48,
      94,
      8,
      this.width - 48,
      94,
      155,
    );
    moonGlow.addColorStop(0, "rgba(219, 190, 125, 0.28)");
    moonGlow.addColorStop(0.45, "rgba(167, 132, 76, 0.09)");
    moonGlow.addColorStop(1, "rgba(7, 13, 25, 0)");
    this.context.fillStyle = moonGlow;
    this.context.fillRect(0, 0, this.width, 270);

    for (const [x, y, radius] of STARS) {
      this.context.beginPath();
      this.context.arc(
        this.width * x,
        this.height * y,
        radius,
        0,
        Math.PI * 2,
      );
      this.context.fillStyle =
        radius > 1.4 ? "rgba(244, 234, 215, 0.72)" : "rgba(215, 183, 119, 0.35)";
      this.context.fill();
    }

    const haze = this.context.createLinearGradient(
      0,
      this.height * 0.55,
      0,
      this.height,
    );
    haze.addColorStop(0, "rgba(13, 24, 39, 0)");
    haze.addColorStop(1, "rgba(4, 8, 15, 0.92)");
    this.context.fillStyle = haze;
    this.context.fillRect(0, 0, this.width, this.height);

    this.drawTreeLine();
  }

  private drawTreeLine(): void {
    const baseline = this.height - 4;
    const treeHeight = Math.min(104, this.height * 0.13);
    this.context.fillStyle = "rgba(3, 7, 13, 0.9)";
    this.context.beginPath();
    this.context.moveTo(0, baseline);

    const step = this.width / 9;
    for (let index = 0; index <= 9; index += 1) {
      const x = index * step;
      const peak = baseline - treeHeight * (0.48 + ((index * 7) % 5) / 10);
      this.context.lineTo(x - step * 0.34, baseline);
      this.context.lineTo(x, peak);
      this.context.lineTo(x + step * 0.34, baseline);
    }

    this.context.lineTo(this.width, this.height);
    this.context.lineTo(0, this.height);
    this.context.closePath();
    this.context.fill();
  }

  private drawLogin(view: LoginViewState): void {
    const centerX = this.width / 2;
    const compact = this.height < 700;
    const cardWidth = Math.min(this.width - 40, 430);
    const cardX = (this.width - cardWidth) / 2;
    const cardY = this.topInset + (compact ? 138 : 158);
    const cardHeight = compact ? 238 : 270;

    this.drawPill("角色扮演 · 社交推理", centerX, this.topInset + 8);

    this.setText({
      color: COLORS.cream,
      font: `bold ${compact ? 30 : 34}px serif`,
      align: "center",
    });
    this.context.fillText(
      "暗夜狼人杀",
      centerX,
      this.topInset + (compact ? 68 : 76),
    );

    this.setText({
      color: COLORS.muted,
      font: "14px serif",
      align: "center",
    });
    this.context.fillText(
      "以人物之名入局，以言辞之刃破晓",
      centerX,
      this.topInset + (compact ? 97 : 106),
    );

    this.drawDivider(
      centerX,
      this.topInset + (compact ? 119 : 132),
      compact ? 94 : 120,
    );
    this.drawPanel(cardX, cardY, cardWidth, cardHeight);
    this.drawWolfMoon(centerX, cardY + (compact ? 56 : 65), compact ? 28 : 34);

    this.setText({
      color: COLORS.cream,
      font: "bold 19px serif",
      align: "center",
    });
    this.context.fillText(
      "今夜，谁在说谎？",
      centerX,
      cardY + (compact ? 112 : 130),
    );

    this.setText({
      color: COLORS.muted,
      font: "12px sans-serif",
      align: "center",
    });
    this.context.fillText(
      "真人推理 · AI 演绎 · 自定义故事世界",
      centerX,
      cardY + (compact ? 137 : 158),
    );

    const buttonY = cardY + cardHeight - (compact ? 68 : 76);
    const actionLabel =
      view.status === "loading"
        ? "正在进入..."
        : view.status === "error"
          ? "重新尝试"
          : "微信安全登录";
    this.drawButton(
      "login",
      centerX - 104,
      buttonY,
      208,
      48,
      view.status === "loading" ? COLORS.panelSoft : COLORS.gold,
      view.status === "loading" ? COLORS.muted : "#16130d",
      actionLabel,
    );

    if (view.status === "error" && view.message) {
      this.setText({
        color: "#e8a2a9",
        font: "12px sans-serif",
        align: "center",
      });
      this.context.fillText(
        this.fitText(view.message, cardWidth - 52),
        centerX,
        buttonY - 17,
      );
    }

    this.setText({
      color: COLORS.faint,
      font: "11px sans-serif",
      align: "center",
    });
    this.context.fillText(
      "登录仅用于识别账号，不会获取你的微信号",
      centerX,
      this.height - 36,
    );
  }

  private drawHome(view: HomeViewState): void {
    const margin = 20;
    const contentWidth = this.width - margin * 2;
    const compact = this.height < 640;

    this.setText({
      color: COLORS.cream,
      font: "bold 23px serif",
    });
    this.context.fillText("暗夜狼人杀", margin, this.topInset + 21);

    this.setText({
      color: COLORS.gold,
      font: "10px sans-serif",
    });
    this.context.fillText(
      "WEREWOLF · NIGHTFALL",
      margin,
      this.topInset + 39,
    );

    const userCardY = this.topInset + 49;
    this.drawUserCard(view.user, margin, userCardY, contentWidth);

    const heroY = userCardY + (compact ? 112 : 120);
    this.setText({
      color: COLORS.cream,
      font: `bold ${compact ? 22 : 26}px serif`,
    });
    this.context.fillText("今夜，谁来赴局？", margin, heroY);

    this.context.beginPath();
    this.context.moveTo(margin, heroY + 15);
    this.context.lineTo(margin + 28, heroY + 15);
    this.context.strokeStyle = "rgba(215, 183, 119, 0.55)";
    this.context.lineWidth = 1;
    this.context.stroke();

    this.setText({
      color: COLORS.muted,
      font: "13px sans-serif",
    });
    this.context.fillText("选择你的身份，让每一句话都成为线索。", margin, heroY + 42);

    const soloY = heroY + 60;
    this.drawSoloCard(margin, soloY, contentWidth, compact ? 116 : 142);

    if (view.notice) {
      const noticeY = soloY + (compact ? 128 : 157);
      this.drawNotice(margin, noticeY, contentWidth, view.notice);
    }

    const secondaryY = soloY + (compact ? 163 : 198);
    const gap = 10;
    const tileWidth = (contentWidth - gap) / 2;
    this.drawInfoTile(
      margin,
      secondaryY,
      tileWidth,
      compact ? 72 : 82,
      "好友房",
      "邀请真人 · 后续开放",
      COLORS.gold,
    );
    this.drawInfoTile(
      margin + tileWidth + gap,
      secondaryY,
      tileWidth,
      compact ? 72 : 82,
      view.activeGame
        ? "继续对局"
        : view.activeRoom
          ? "继续房间"
          : "最近对局",
      view.activeGame
        ? `第 ${view.activeGame.round} 轮 · ${this.phaseLabel(view.activeGame.phase)}`
        : view.activeRoom
          ? `${view.activeRoom.code} · ${view.activeRoom.totalSeats} 人`
          : "暂无对局记录",
      view.activeGame || view.activeRoom ? COLORS.gold : "#6fa8dc",
      view.activeGame
        ? "continue-game"
        : view.activeRoom
          ? "continue-room"
          : undefined,
    );

    if (!compact) {
      this.drawInfoTile(
        margin,
        secondaryY + 98,
        contentWidth,
        70,
        "江湖未启",
        "更多角色与故事将在后续版本开放",
        COLORS.emerald,
      );
    }

    if (!compact) {
      this.setText({
        color: COLORS.faint,
        font: "10px sans-serif",
        align: "center",
      });
      this.context.fillText(
        "月色渐沉 · 真相仍在沉默",
        this.width / 2,
        this.height - 24,
      );
    }
  }

  private drawRoomSetup(view: RoomSetupViewState): void {
    const margin = 20;
    const contentWidth = this.width - margin * 2;
    const compact = this.height < 700;
    const assigned = roleTotal(view.roles);

    this.drawBackButton(
      "back-home",
      margin,
      this.topBarTop + (this.topBarHeight - 30) / 2,
    );

    this.setText({
      color: COLORS.cream,
      font: "bold 22px serif",
      align: "center",
    });
    this.context.fillText(
      view.isEditing ? "修改单人房" : "创建单人房",
      this.width / 2,
      this.topBarTop + this.topBarHeight / 2 + 7,
    );

    this.setText({
      color: COLORS.muted,
      font: "11px sans-serif",
      align: "center",
    });
    this.context.fillText(
      view.isEditing
        ? "调整人数与角色，保存后继续下一步"
        : "设置人数与角色，开始编织今晚的故事",
      this.width / 2,
      this.topInset + 11,
    );

    const seatY = this.topInset + (compact ? 32 : 36);
    const seatHeight = compact ? 60 : 68;
    this.drawPanel(margin, seatY, contentWidth, seatHeight, 14);

    this.setText({
      color: COLORS.cream,
      font: "bold 15px serif",
    });
    this.context.fillText("游戏人数", margin + 16, seatY + 25);
    this.setText({
      color: COLORS.faint,
      font: "10px sans-serif",
    });
    this.context.fillText("1 名真人 · AI 自动补位", margin + 16, seatY + 44);

    const seatControlY = seatY + (seatHeight - 30) / 2;
    const decrementSeatX = margin + contentWidth - 114;
    const incrementSeatX = margin + contentWidth - 38;
    const seatCountX =
      (decrementSeatX + 30 + incrementSeatX) / 2;
    if (view.seatCount > 6) {
      this.drawStepperButton("seat-minus", decrementSeatX, seatControlY);
    } else {
      this.drawStepperButton(null, decrementSeatX, seatControlY);
    }
    if (view.seatCount < 12) {
      this.drawStepperButton("seat-plus", incrementSeatX, seatControlY);
    } else {
      this.drawStepperButton(null, incrementSeatX, seatControlY);
    }

    this.setText({
      color: COLORS.goldBright,
      font: "bold 19px sans-serif",
      align: "center",
    });
    this.context.fillText(
      String(view.seatCount),
      seatCountX,
      seatControlY + 21,
    );

    const roleTitleY = seatY + seatHeight + (compact ? 21 : 25);
    this.setText({
      color: COLORS.cream,
      font: "bold 15px serif",
    });
    this.context.fillText("角色配置", margin, roleTitleY);

    this.setText({
      color: assigned === view.seatCount ? COLORS.gold : COLORS.muted,
      font: "11px sans-serif",
      align: "right",
    });
    this.context.fillText(
      `已配置 ${assigned} / ${view.seatCount}`,
      margin + contentWidth,
      roleTitleY,
    );

    const rowStartY = roleTitleY + 12;
    const rowHeight = compact ? 34 : 42;
    const rowGap = compact ? 4 : 6;

    ROLE_META.forEach((role, index) => {
      const rowY = rowStartY + index * (rowHeight + rowGap);
      this.drawRoleRow(
        role.key,
        role.label,
        role.description,
        role.color,
        view.roles[role.key],
        view.seatCount,
        role.unique,
        margin,
        rowY,
        contentWidth,
        rowHeight,
        compact,
      );
    });

    const rowsBottom =
      rowStartY + ROLE_KEYS.length * rowHeight + (ROLE_KEYS.length - 1) * rowGap;
    const summaryY = rowsBottom + (compact ? 19 : 23);
    this.setText({
      color: assigned === view.seatCount ? COLORS.gold : "#e8a2a9",
      font: "11px sans-serif",
      align: "center",
    });
    this.context.fillText(
      assigned === view.seatCount
        ? "人数配置完成，可以创建房间"
        : `还需调整 ${Math.abs(view.seatCount - assigned)} 人`,
      this.width / 2,
      summaryY,
    );

    if (view.error) {
      this.setText({
        color: "#e8a2a9",
        font: "11px sans-serif",
        align: "center",
      });
      this.context.fillText(
        this.fitText(view.error, contentWidth - 16),
        this.width / 2,
        summaryY + 20,
      );
    }

    const buttonY = Math.min(
      this.height - 66,
      summaryY + (view.error ? 44 : 30),
    );
    this.drawButton(
      "create-room",
      margin,
      buttonY,
      contentWidth,
      48,
      view.isSubmitting ? COLORS.panelSoft : COLORS.crimson,
      view.isSubmitting ? COLORS.muted : COLORS.cream,
      view.isSubmitting
        ? "正在保存..."
        : view.isEditing
          ? "保存修改"
          : "创建房间",
    );
  }

  private drawRoomCreated(view: RoomCreatedViewState): void {
    const margin = 20;
    const contentWidth = this.width - margin * 2;
    const compact = this.height < 700;
    const cardY = this.topInset + (compact ? 72 : 118);
    const cardHeight = compact ? 300 : 330;

    this.drawBackButton(
      "back-home-top",
      margin,
      this.topBarTop + (this.topBarHeight - 30) / 2,
    );
    this.setText({
      color: COLORS.cream,
      font: "bold 22px serif",
      align: "center",
    });
    this.context.fillText(
      "房间已创建",
      this.width / 2,
      this.topBarTop + this.topBarHeight / 2 + 7,
    );

    this.drawPanel(
      margin,
      cardY,
      contentWidth,
      cardHeight,
      18,
      "rgba(20, 29, 43, 0.96)",
    );
    this.drawWolfMoon(this.width / 2, cardY + 54, 27);

    this.setText({
      color: COLORS.gold,
      font: "11px sans-serif",
      align: "center",
    });
    this.context.fillText("ROOM READY", this.width / 2, cardY + 105);

    this.setText({
      color: COLORS.cream,
      font: "bold 28px monospace",
      align: "center",
    });
    this.context.fillText(view.room.code, this.width / 2, cardY + 143);

    this.setText({
      color: COLORS.faint,
      font: "11px sans-serif",
      align: "center",
    });
    this.context.fillText(
      `${view.room.totalSeats} 人局 · 1 真人 + ${view.room.totalSeats - 1} AI`,
      this.width / 2,
      cardY + 169,
    );

    this.drawRoleSummary(
      view.room.roles,
      margin + 18,
      cardY + 196,
      contentWidth - 36,
    );

    this.setText({
      color: COLORS.muted,
      font: "11px sans-serif",
      align: "center",
    });
    this.context.fillText(
      view.error
        ? this.fitText(view.error, contentWidth - 24)
        : "身份分配与规则引擎已就绪",
      this.width / 2,
      cardY + cardHeight - 46,
    );

    const buttonGap = 10;
    const actionWidth = (contentWidth - buttonGap) / 2;
    const actionY = cardY + cardHeight + 22;
    this.drawButton(
      "start-game",
      margin,
      actionY,
      actionWidth,
      46,
      view.isStarting ? COLORS.panelSoft : COLORS.crimson,
      view.isStarting ? COLORS.muted : COLORS.cream,
      view.isStarting ? "正在进入..." : "开始游戏",
    );
    this.drawButton(
      "edit-room",
      margin + actionWidth + buttonGap,
      actionY,
      actionWidth,
      46,
      COLORS.panelSoft,
      COLORS.goldBright,
      "修改配置",
    );
  }

  private drawGameTable(view: GameViewState): void {
    const game = view.snapshot;
    const margin = 14;
    const contentWidth = this.width - margin * 2;
    const compact = this.height < 700;
    const topY = this.topInset + 9;

    this.drawBackButton(
      "back-home-top",
      margin,
      this.topBarTop + (this.topBarHeight - 30) / 2,
    );

    this.setText({
      color: COLORS.cream,
      font: "bold 21px serif",
      align: "center",
    });
    this.context.fillText(
      this.phaseLabel(game.phase),
      this.width / 2,
      this.topBarTop + this.topBarHeight / 2 + 7,
    );

    this.setText({
      color: COLORS.faint,
      font: "10px sans-serif",
      align: "center",
    });
    this.context.fillText(
      this.gameTurnLabel(game, view.nowMs),
      this.width / 2,
      this.topInset + 6,
    );

    const selfCardY = topY + 10;
    const selfCardHeight = compact ? 48 : 54;
    this.drawPanel(
      margin,
      selfCardY,
      contentWidth,
      selfCardHeight,
      13,
      "rgba(30, 41, 59, 0.86)",
    );

    this.context.beginPath();
    this.context.arc(
      margin + 22,
      selfCardY + selfCardHeight / 2,
      14,
      0,
      Math.PI * 2,
    );
    this.context.fillStyle =
      game.self_role === "WEREWOLF" ? COLORS.crimson : COLORS.emerald;
    this.context.fill();

    this.setText({
      color: COLORS.cream,
      font: "bold 13px serif",
    });
    this.context.fillText(
      this.roleLabel(game.self_role),
      margin + 44,
      selfCardY + 21,
    );
    this.setText({
      color: COLORS.faint,
      font: "10px sans-serif",
    });
    this.context.fillText(
      game.self_alive ? "你的身份 · 存活" : "你的身份 · 已出局",
      margin + 44,
      selfCardY + 39,
    );

    let privateHint = "";
    if (game.private_info.werewolf_teammates.length > 0) {
      privateHint = `狼队友 ${game.private_info.werewolf_teammates.join("、")} 号`;
    } else if (game.self_role === "WITCH" && game.private_info.witch) {
      privateHint =
        game.private_info.witch.wolf_target_seat === null
          ? "今夜无人被狼人选中"
          : `狼人目标：${game.private_info.witch.wolf_target_seat} 号`;
    } else if (game.private_info.seer_checks.length > 0) {
      const lastCheck =
        game.private_info.seer_checks[
          game.private_info.seer_checks.length - 1
        ];
      if (lastCheck) {
        privateHint = `查验 ${lastCheck.target_seat} 号：${
          lastCheck.is_werewolf ? "狼人" : "好人"
        }`;
      }
    }
    if (privateHint) {
      this.setText({
        color: COLORS.gold,
        font: "10px sans-serif",
        align: "right",
      });
      this.context.fillText(
        this.fitText(privateHint, contentWidth - 164),
        margin + contentWidth - 14,
        selfCardY + selfCardHeight / 2 + 4,
      );
    }

    const gridGap = 6;
    const columns = 4;
    const tileWidth = (contentWidth - gridGap * (columns - 1)) / columns;
    const tileHeight = compact ? 49 : 56;
    const gridY = selfCardY + selfCardHeight + 10;
    const legalTargets = game.legal_action?.target_seats ?? [];
    const canSelectTarget =
      game.legal_action?.type !== "WITCH_ACTION" ||
      game.private_info.witch?.poison_available !== false;

    game.players.forEach((player, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = margin + column * (tileWidth + gridGap);
      const y = gridY + row * (tileHeight + gridGap);
      const selectable =
        canSelectTarget &&
        legalTargets.includes(player.seat_no) &&
        !view.isSubmitting;
      this.drawGamePlayer(
        player,
        x,
        y,
        tileWidth,
        tileHeight,
        player.seat_no === game.self_seat,
        player.seat_no === game.current_speaker_seat,
        selectable,
        view.selectedTarget === player.seat_no,
      );
      if (selectable) {
        this.actions[`game-target-${player.seat_no}`] = {
          x,
          y,
          width: tileWidth,
          height: tileHeight,
        };
      }
    });

    const rows = Math.ceil(game.players.length / columns);
    const eventY = gridY + rows * (tileHeight + gridGap) + 4;
    const actionY = this.height - (compact ? 62 : 68);
    const eventHeight = Math.max(
      42,
      Math.min(80, actionY - eventY - 42),
    );
    this.drawEventPanel(
      margin,
      eventY,
      contentWidth,
      eventHeight,
      game.events,
    );

    this.drawGameActionPanel(
      view,
      margin,
      contentWidth,
      actionY,
      Math.min(44, this.height - actionY - 16),
    );
  }

  private drawGamePlayer(
    player: GameSnapshot["players"][number],
    x: number,
    y: number,
    width: number,
    height: number,
    isSelf: boolean,
    isSpeaking: boolean,
    selectable: boolean,
    selected: boolean,
  ): void {
    const fill = !player.alive
      ? "rgba(31, 41, 55, 0.34)"
      : selected
        ? "rgba(159, 53, 66, 0.74)"
        : "rgba(30, 41, 59, 0.8)";
    this.drawRoundedRect(x, y, width, height, 10, fill);
    this.strokeRoundedRect(
      x,
      y,
      width,
      height,
      10,
      selected
        ? COLORS.goldBright
        : isSpeaking
          ? "#7dd3fc"
        : selectable
          ? "rgba(215, 183, 119, 0.5)"
          : isSelf
            ? "rgba(47, 143, 104, 0.7)"
            : "rgba(148, 163, 184, 0.15)",
    );

    this.setText({
      color: player.alive ? COLORS.gold : COLORS.faint,
      font: "bold 11px monospace",
    });
    this.context.fillText(`${player.seat_no}号`, x + 8, y + 16);

    this.setText({
      color: player.alive ? COLORS.cream : COLORS.faint,
      font: "11px sans-serif",
    });
    this.context.fillText(
      this.fitText(player.nickname, width - 16),
      x + 8,
      y + 32,
    );

    this.setText({
      color: COLORS.faint,
      font: "9px sans-serif",
      align: "right",
    });
    this.context.fillText(
      player.alive ? (player.is_ai ? "AI" : "真人") : "出局",
      x + width - 7,
      y + 16,
    );

    if (player.role) {
      this.setText({
        color: COLORS.gold,
        font: "9px sans-serif",
      });
      this.context.fillText(this.roleLabel(player.role), x + 8, y + height - 7);
    }
  }

  private drawEventPanel(
    x: number,
    y: number,
    width: number,
    height: number,
    events: GameSnapshot["events"],
    maxEvents = 3,
  ): void {
    this.drawRoundedRect(x, y, width, height, 11, "rgba(8, 15, 28, 0.7)");
    this.setText({
      color: COLORS.gold,
      font: "bold 10px sans-serif",
    });
    this.context.fillText("公开事件", x + 12, y + 16);

    const recent = events.slice(-maxEvents);
    recent.forEach((event, index) => {
      this.setText({
        color: index === recent.length - 1 ? COLORS.text : COLORS.muted,
        font: "10px sans-serif",
      });
      this.context.fillText(
        this.fitText(`· ${event.message}`, width - 24),
        x + 12,
        y + 33 + index * 14,
      );
    });
  }

  private drawGameActionPanel(
    view: GameViewState,
    x: number,
    width: number,
    y: number,
    height: number,
  ): void {
    const game = view.snapshot;
    const action = game.legal_action;

    if (game.phase === "GAME_OVER" || game.winner) {
      this.setText({
        color: game.winner === "GOOD" ? "#86efac" : "#fca5a5",
        font: "bold 17px serif",
        align: "center",
      });
      this.context.fillText(
        game.winner === "GOOD" ? "好人阵营获胜" : "狼人阵营获胜",
        this.width / 2,
        y - 17,
      );
      this.drawButton(
        "back-home",
        x,
        y,
        width,
        height,
        COLORS.panelSoft,
        COLORS.cream,
        "返回首页",
      );
      return;
    }

    if (!action) {
      this.setText({
        color: COLORS.muted,
        font: "11px sans-serif",
        align: "center",
      });
      this.context.fillText(
        game.self_alive ? "等待其他玩家行动" : "你已出局，对局自动推进",
        this.width / 2,
        y - 16,
      );
      return;
    }

    const prompt =
      action.type === "WOLF_KILL"
        ? "选择今晚的袭击目标"
        : action.type === "SEER_CHECK"
          ? "选择要查验的玩家"
          : action.type === "WITCH_ACTION"
            ? view.selectedTarget === null
              ? "使用解药、选择毒药目标或跳过"
              : `已选择 ${view.selectedTarget} 号作为毒药目标`
            : action.type === "HUNTER_SHOOT"
              ? "选择开枪目标"
              : action.type === "SPEAK"
                ? "轮到你发言"
                : "选择本轮放逐目标";
    this.setText({
      color: view.error ? "#fca5a5" : COLORS.muted,
      font: "11px sans-serif",
      align: "center",
    });
    this.context.fillText(
      this.fitText(view.error ?? prompt, width - 24),
      this.width / 2,
      y - 14,
    );

    if (view.isSubmitting) {
      return;
    }

    if (action.type === "WITCH_ACTION") {
      const witch = game.private_info.witch;
      const allButtons: Array<{
        action: AppAction;
        label: string;
        color: string;
        enabled: boolean;
      }> = [
        {
          action: "game-witch-save",
          label: "使用解药",
          color: COLORS.emerald,
          enabled: action.can_save === true,
        },
        {
          action: "game-submit",
          label: "使用毒药",
          color: COLORS.crimson,
          enabled:
            witch?.poison_available === true &&
            view.selectedTarget !== null,
        },
        {
          action: "game-witch-skip",
          label: "不用药",
          color: COLORS.panelSoft,
          enabled: true,
        },
      ];
      const buttons = allButtons.filter(
        (button) =>
          button.action !== "game-witch-save" || action.can_save === true,
      );
      this.drawActionRow(buttons, x, width, y, height);
      return;
    }

    if (action.type === "SPEAK") {
      const remainingSeconds = this.remainingSeconds(
        game.turn_deadline_at,
        view.nowMs,
      );
      this.setText({
        color: remainingSeconds <= 10 ? "#fca5a5" : COLORS.goldBright,
        font: "11px sans-serif",
        align: "center",
      });
      this.context.fillText(
        remainingSeconds > 0
          ? `轮到你发言，剩余 ${remainingSeconds} 秒`
          : "发言时间已结束",
        this.width / 2,
        y - 14,
      );
      if (remainingSeconds <= 0) {
        return;
      }
      this.drawActionRow(
        [
          {
            action: "game-speak",
            label: "输入发言",
            color: COLORS.emerald,
            enabled: true,
          },
          {
            action: "game-skip-speech",
            label: "跳过",
            color: COLORS.panelSoft,
            enabled: true,
          },
        ],
        x,
        width,
        y,
        height,
      );
      return;
    }

    if (action.type === "VOTE") {
      this.drawActionRow(
        [
          {
            action: "game-submit",
            label: "确认投票",
            color: COLORS.crimson,
            enabled: view.selectedTarget !== null,
          },
          {
            action: "game-abstain",
            label: "弃票",
            color: COLORS.panelSoft,
            enabled: true,
          },
        ],
        x,
        width,
        y,
        height,
      );
      return;
    }

    const label =
      action.type === "WOLF_KILL"
        ? "确认袭击"
        : action.type === "SEER_CHECK"
          ? "确认查验"
          : "发动猎枪";
    this.drawButton(
      "game-submit",
      x,
      y,
      width,
      height,
      view.selectedTarget === null ? COLORS.panelSoft : COLORS.crimson,
      view.selectedTarget === null ? COLORS.muted : COLORS.cream,
      view.selectedTarget === null ? "请先选择目标" : label,
    );
    if (view.selectedTarget === null) {
      delete this.actions["game-submit"];
    }
  }

  private drawActionRow(
    buttons: Array<{
      action: AppAction;
      label: string;
      color: string;
      enabled: boolean;
    }>,
    x: number,
    width: number,
    y: number,
    height: number,
  ): void {
    const gap = 7;
    const buttonWidth = (width - gap * (buttons.length - 1)) / buttons.length;
    buttons.forEach((button, index) => {
      const buttonX = x + index * (buttonWidth + gap);
      this.drawButton(
        button.action,
        buttonX,
        y,
        buttonWidth,
        height,
        button.enabled ? button.color : COLORS.panelSoft,
        button.enabled ? COLORS.cream : COLORS.faint,
        button.label,
      );
      if (!button.enabled) {
        delete this.actions[button.action];
      }
    });
  }

  private drawGameResult(view: GameResultViewState): void {
    const game = view.snapshot;
    const margin = 16;
    const contentWidth = this.width - margin * 2;
    const compact = this.height < 700;
    const backY = this.topBarTop + (this.topBarHeight - 30) / 2;

    this.drawBackButton("back-home-top", margin, backY);
    this.setText({
      color: COLORS.cream,
      font: "bold 22px serif",
      align: "center",
    });
    this.context.fillText(
      "对局结算",
      this.width / 2,
      this.topBarTop + this.topBarHeight / 2 + 7,
    );

    const resultY = this.topInset + 12;
    const resultHeight = compact ? 76 : 88;
    this.drawPanel(
      margin,
      resultY,
      contentWidth,
      resultHeight,
      16,
      game.winner === "GOOD"
        ? "rgba(24, 70, 55, 0.9)"
        : "rgba(91, 31, 42, 0.9)",
    );
    this.setText({
      color: COLORS.cream,
      font: "bold 24px serif",
      align: "center",
    });
    this.context.fillText(
      game.winner === "GOOD" ? "好人阵营获胜" : "狼人阵营获胜",
      this.width / 2,
      resultY + 36,
    );
    this.setText({
      color: "rgba(244, 234, 215, 0.7)",
      font: "11px sans-serif",
      align: "center",
    });
    this.context.fillText(
      `第 ${game.round} 轮结束 · 你的身份：${this.roleLabel(game.self_role)}`,
      this.width / 2,
      resultY + 59,
    );

    const roleTitleY = resultY + resultHeight + 22;
    this.setText({
      color: COLORS.gold,
      font: "bold 12px sans-serif",
    });
    this.context.fillText("全员身份", margin, roleTitleY);

    const roleStartY = roleTitleY + 10;
    const gap = 6;
    const rowGap = compact ? 5 : 6;
    const columns = 2;
    const roleWidth = (contentWidth - gap) / columns;
    const roleHeight = compact ? 29 : 36;
    game.players.forEach((player, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = margin + column * (roleWidth + gap);
      const y = roleStartY + row * (roleHeight + rowGap);
      this.drawRoundedRect(
        x,
        y,
        roleWidth,
        roleHeight,
        9,
        player.alive
          ? "rgba(30, 41, 59, 0.8)"
          : "rgba(30, 41, 59, 0.42)",
      );
      this.setText({
        color: player.alive ? COLORS.cream : COLORS.faint,
        font: "10px sans-serif",
      });
      this.context.fillText(
        this.fitText(
          `${player.seat_no}号 ${player.nickname}`,
          roleWidth - 70,
        ),
        x + 10,
        y + 20,
      );
      this.setText({
        color:
          player.role === "WEREWOLF" ? "#fca5a5" : COLORS.goldBright,
        font: "10px sans-serif",
        align: "right",
      });
      this.context.fillText(
        player.role ? this.roleLabel(player.role) : "未知",
        x + roleWidth - 10,
        y + 20,
      );
    });

    const roleRows = Math.ceil(game.players.length / columns);
    const timelineY =
      roleStartY + roleRows * (roleHeight + rowGap) + (compact ? 2 : 6);
    const actionY = this.height - 62;
    const timelineHeight = Math.max(
      48,
      Math.min(compact ? 62 : 88, actionY - timelineY - 34),
    );
    this.drawEventPanel(
      margin,
      timelineY,
      contentWidth,
      timelineHeight,
      game.events.slice(
        view.replayPage * 2,
        view.replayPage * 2 + 2,
      ),
      2,
    );

    const pageY = actionY - 24;
    this.setText({
      color: COLORS.faint,
      font: "10px sans-serif",
      align: "center",
    });
    this.context.fillText(
      `复盘 ${view.replayPage + 1} / ${view.replayPageCount}`,
      this.width / 2,
      pageY + 14,
    );
    if (view.replayPage > 0) {
      this.actions["replay-prev"] = {
        x: margin,
        y: pageY,
        width: 62,
        height: 24,
      };
      this.setText({
        color: COLORS.gold,
        font: "10px sans-serif",
      });
      this.context.fillText("上一页", margin, pageY + 14);
    }
    if (view.replayPage + 1 < view.replayPageCount) {
      const nextX = margin + contentWidth - 62;
      this.actions["replay-next"] = {
        x: nextX,
        y: pageY,
        width: 62,
        height: 24,
      };
      this.setText({
        color: COLORS.gold,
        font: "10px sans-serif",
        align: "right",
      });
      this.context.fillText("下一页", nextX + 62, pageY + 14);
    }

    this.drawButton(
      "back-home",
      margin,
      actionY,
      contentWidth,
      44,
      COLORS.panelSoft,
      COLORS.cream,
      "返回首页",
    );
  }

  private phaseLabel(phase: GamePhase): string {
    const labels: Record<GamePhase, string> = {
      NIGHT_WEREWOLF: "狼人行动",
      NIGHT_SEER: "预言家查验",
      NIGHT_WITCH: "女巫用药",
      DAY_SPEECH: "白天发言",
      DAY_VOTE: "放逐投票",
      HUNTER_SHOOT: "猎人开枪",
      GAME_OVER: "对局结束",
    };
    return labels[phase];
  }

  private gameTurnLabel(
    game: GameSnapshot,
    nowMs: number,
  ): string {
    if (
      game.phase === "DAY_SPEECH" &&
      game.current_speaker_seat !== null
    ) {
      const remaining = this.remainingSeconds(
        game.turn_deadline_at,
        nowMs,
      );
      return `第 ${game.round} 轮 · ${game.current_speaker_seat} 号发言${
        remaining > 0 ? ` · ${remaining}s` : ""
      }`;
    }
    return `第 ${game.round} 轮`;
  }

  private remainingSeconds(
    deadlineAt: string | null,
    nowMs: number,
  ): number {
    if (!deadlineAt) {
      return 0;
    }
    return Math.max(
      0,
      Math.ceil((new Date(deadlineAt).getTime() - nowMs) / 1_000),
    );
  }

  private roleLabel(role: GameRole): string {
    const labels: Record<GameRole, string> = {
      WEREWOLF: "狼人",
      VILLAGER: "村民",
      SEER: "预言家",
      WITCH: "女巫",
      HUNTER: "猎人",
    };
    return labels[role];
  }

  private drawBackButton(
    action: "back-home" | "back-home-top",
    x: number,
    y: number,
  ): void {
    const width = 54;
    const height = 30;
    this.actions[action] = { x, y, width, height };

    this.drawRoundedRect(x, y, width, height, 15, COLORS.panelSoft);
    this.setText({
      color: COLORS.muted,
      font: "12px sans-serif",
      align: "center",
    });
    this.context.fillText("‹ 返回", x + width / 2, y + 19);
  }

  private drawStepperButton(
    action: "seat-minus" | "seat-plus" | null,
    x: number,
    y: number,
  ): void {
    this.drawRoundedRect(
      x,
      y,
      30,
      30,
      9,
      action ? "rgba(215, 183, 119, 0.16)" : "rgba(100, 116, 139, 0.08)",
    );
    if (action) {
      this.actions[action] = { x, y, width: 30, height: 30 };
    }
    this.setText({
      color: action ? COLORS.goldBright : COLORS.faint,
      font: "bold 18px sans-serif",
      align: "center",
    });
    this.context.fillText(action === "seat-plus" ? "+" : "-", x + 15, y + 21);
  }

  private drawRoleRow(
    key: RoleKey,
    label: string,
    description: string,
    color: string,
    count: number,
    totalSeats: number,
    unique: boolean,
    x: number,
    y: number,
    width: number,
    height: number,
    compact: boolean,
  ): void {
    this.drawRoundedRect(x, y, width, height, 10, COLORS.panelSoft);

    this.context.beginPath();
    this.context.arc(x + 16, y + height / 2, 3.5, 0, Math.PI * 2);
    this.context.fillStyle = color;
    this.context.fill();

    this.setText({
      color: COLORS.cream,
      font: "bold 13px serif",
    });
    this.context.fillText(label, x + 28, y + height / 2 + (compact ? 5 : -1));

    if (!compact) {
      this.setText({
        color: COLORS.faint,
        font: "10px sans-serif",
      });
      this.context.fillText(description, x + 78, y + height / 2 + 4);
    }

    const controlSize = 26;
    const plusX = x + width - 38;
    const minusX = plusX - controlSize - 36;
    const countX = (minusX + controlSize + plusX) / 2;
    const controlY = y + (height - 26) / 2;
    const canDecrease = count > 0;
    const canIncrease = count < totalSeats && (!unique || count < 1);
    this.drawRoleControl(
      canDecrease ? `role-minus-${key}` : null,
      minusX,
      controlY,
    );
    this.drawRoleControl(
      canIncrease ? `role-plus-${key}` : null,
      plusX,
      controlY,
    );

    this.setText({
      color: count > 0 ? COLORS.goldBright : COLORS.faint,
      font: "bold 15px monospace",
      align: "center",
    });
    this.context.fillText(String(count), countX, y + height / 2 + 5);
  }

  private drawRoleControl(
    action:
      | `role-minus-${RoleKey}`
      | `role-plus-${RoleKey}`
      | null,
    x: number,
    y: number,
  ): void {
    this.drawRoundedRect(
      x,
      y,
      26,
      26,
      8,
      action ? "rgba(215, 183, 119, 0.13)" : "rgba(100, 116, 139, 0.06)",
    );
    if (action) {
      this.actions[action] = { x, y, width: 26, height: 26 };
    }
    this.setText({
      color: action ? COLORS.goldBright : COLORS.faint,
      font: "bold 16px sans-serif",
      align: "center",
    });
    this.context.fillText(
      action?.startsWith("role-plus") ? "+" : "-",
      x + 13,
      y + 18,
    );
  }

  private drawRoleSummary(
    roles: RoleConfig,
    x: number,
    y: number,
    width: number,
  ): void {
    const firstLine = [
      `狼人 ${roles.werewolf}`,
      `村民 ${roles.villager}`,
      `预言家 ${roles.seer}`,
    ].join("     ");
    const secondLine = [
      `女巫 ${roles.witch}`,
      `猎人 ${roles.hunter}`,
    ].join("     ");

    this.setText({
      color: COLORS.muted,
      font: "12px sans-serif",
      align: "center",
    });
    this.context.fillText(
      this.fitText(firstLine, width),
      x + width / 2,
      y,
    );
    this.context.fillText(
      this.fitText(secondLine, width),
      x + width / 2,
      y + 24,
    );
  }

  private drawUserCard(
    user: AuthenticatedView,
    x: number,
    y: number,
    width: number,
  ): void {
    this.drawPanel(x, y, width, 74, 14);

    this.context.save();
    this.context.shadowColor = "rgba(215, 183, 119, 0.25)";
    this.context.shadowBlur = 12;
    this.context.beginPath();
    this.context.arc(x + 38, y + 37, 23, 0, Math.PI * 2);
    this.context.fillStyle = "#273447";
    this.context.fill();
    this.context.restore();

    this.context.beginPath();
    this.context.arc(x + 38, y + 37, 20, 0, Math.PI * 2);
    this.context.strokeStyle = COLORS.gold;
    this.context.lineWidth = 1.5;
    this.context.stroke();

    this.setText({
      color: COLORS.cream,
      font: "bold 19px serif",
      align: "center",
    });
    this.context.fillText(
      Array.from(user.nickname)[0] ?? "狼",
      x + 38,
      y + 44,
    );

    this.setText({
      color: COLORS.text,
      font: "bold 16px sans-serif",
    });
    this.context.fillText(
      this.fitText(user.nickname, width - 134),
      x + 72,
      y + 30,
    );

    this.setText({
      color: COLORS.faint,
      font: "11px monospace",
    });
    this.context.fillText(`推理编号  ${user.publicId}`, x + 72, y + 50);

    this.setText({
      color: COLORS.gold,
      font: "10px sans-serif",
      align: "right",
    });
    this.context.fillText("已登录", x + width - 18, y + 31);
  }

  private drawSoloCard(
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const gradient = this.context.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, COLORS.crimson);
    gradient.addColorStop(1, COLORS.crimsonDark);

    this.context.save();
    this.context.shadowColor = "rgba(128, 38, 51, 0.34)";
    this.context.shadowBlur = 22;
    this.context.shadowOffsetY = 8;
    this.drawRoundedRect(x, y, width, height, 18, gradient);
    this.context.restore();
    this.strokeRoundedRect(x, y, width, height, 18, "rgba(242, 215, 156, 0.34)");

    this.context.beginPath();
    this.context.arc(x + 52, y + 53, 28, 0, Math.PI * 2);
    this.context.fillStyle = "rgba(18, 14, 16, 0.3)";
    this.context.fill();
    this.context.strokeStyle = "rgba(242, 215, 156, 0.52)";
    this.context.lineWidth = 1;
    this.context.stroke();
    this.drawWolfMoon(x + 52, y + 53, 18, false);

    this.setText({
      color: COLORS.cream,
      font: "bold 22px serif",
    });
    this.context.fillText("单人开局", x + 94, y + 45);

    this.setText({
      color: "rgba(255, 244, 226, 0.72)",
      font: "12px sans-serif",
    });
    this.context.fillText("1 名真人 · AI 自动补位", x + 94, y + 68);

    this.setText({
      color: COLORS.goldBright,
      font: "bold 12px sans-serif",
    });
    this.context.fillText("进入故事  →", x + 94, y + height - 24);

    this.actions["start-solo"] = { x, y, width, height };
  }

  private drawInfoTile(
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    description: string,
    accent: string,
    action?: AppAction,
  ): void {
    this.drawPanel(x, y, width, height, 14, COLORS.panelSoft);
    if (action) {
      this.actions[action] = { x, y, width, height };
    }

    this.context.beginPath();
    this.context.arc(x + 20, y + 24, 4, 0, Math.PI * 2);
    this.context.fillStyle = accent;
    this.context.fill();

    this.setText({
      color: COLORS.cream,
      font: "bold 15px serif",
    });
    this.context.fillText(title, x + 32, y + 29);

    this.setText({
      color: COLORS.faint,
      font: "11px sans-serif",
    });
    this.context.fillText(
      this.fitText(description, width - 28),
      x + 16,
      y + height - 18,
    );
  }

  private drawNotice(
    x: number,
    y: number,
    width: number,
    message: string,
  ): void {
    this.drawRoundedRect(x, y, width, 30, 9, "rgba(215, 183, 119, 0.12)");
    this.context.beginPath();
    this.context.arc(x + 16, y + 15, 3, 0, Math.PI * 2);
    this.context.fillStyle = COLORS.gold;
    this.context.fill();

    this.setText({
      color: COLORS.goldBright,
      font: "11px sans-serif",
    });
    this.context.fillText(this.fitText(message, width - 42), x + 27, y + 19);
  }

  private drawPill(label: string, centerX: number, y: number): void {
    this.context.save();
    this.context.font = "10px sans-serif";
    const width = this.context.measureText(label).width + 32;
    this.drawRoundedRect(
      centerX - width / 2,
      y,
      width,
      25,
      12.5,
      "rgba(215, 183, 119, 0.1)",
    );
    this.strokeRoundedRect(
      centerX - width / 2,
      y,
      width,
      25,
      12.5,
      "rgba(215, 183, 119, 0.3)",
    );
    this.context.restore();

    this.setText({
      color: COLORS.gold,
      font: "10px sans-serif",
      align: "center",
    });
    this.context.fillText(label, centerX, y + 17);
  }

  private drawDivider(centerX: number, y: number, halfWidth: number): void {
    this.context.beginPath();
    this.context.moveTo(centerX - halfWidth, y);
    this.context.lineTo(centerX - 12, y);
    this.context.moveTo(centerX + 12, y);
    this.context.lineTo(centerX + halfWidth, y);
    this.context.strokeStyle = "rgba(215, 183, 119, 0.4)";
    this.context.lineWidth = 1;
    this.context.stroke();

    this.context.save();
    this.context.translate(centerX, y);
    this.context.rotate(Math.PI / 4);
    this.context.fillStyle = COLORS.gold;
    this.context.fillRect(-3, -3, 6, 6);
    this.context.restore();
  }

  private drawPanel(
    x: number,
    y: number,
    width: number,
    height: number,
    radius = 18,
    fill = COLORS.panel,
  ): void {
    this.context.save();
    this.context.shadowColor = COLORS.shadow;
    this.context.shadowBlur = 18;
    this.context.shadowOffsetY = 7;
    this.drawRoundedRect(x, y, width, height, radius, fill);
    this.context.restore();
    this.strokeRoundedRect(
      x,
      y,
      width,
      height,
      radius,
      "rgba(215, 183, 119, 0.18)",
    );
  }

  private drawWolfMoon(
    centerX: number,
    centerY: number,
    radius: number,
    withEars = true,
  ): void {
    if (withEars) {
      this.context.fillStyle = "rgba(215, 183, 119, 0.86)";
      this.context.beginPath();
      this.context.moveTo(centerX - radius * 0.76, centerY - radius * 0.44);
      this.context.lineTo(centerX - radius * 0.48, centerY - radius * 1.1);
      this.context.lineTo(centerX - radius * 0.08, centerY - radius * 0.58);
      this.context.closePath();
      this.context.fill();

      this.context.beginPath();
      this.context.moveTo(centerX + radius * 0.76, centerY - radius * 0.44);
      this.context.lineTo(centerX + radius * 0.48, centerY - radius * 1.1);
      this.context.lineTo(centerX + radius * 0.08, centerY - radius * 0.58);
      this.context.closePath();
      this.context.fill();
    }

    const moon = this.context.createRadialGradient(
      centerX - radius * 0.25,
      centerY - radius * 0.25,
      2,
      centerX,
      centerY,
      radius,
    );
    moon.addColorStop(0, COLORS.cream);
    moon.addColorStop(1, COLORS.gold);
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.context.fillStyle = moon;
    this.context.fill();

    this.context.beginPath();
    this.context.arc(
      centerX + radius * 0.34,
      centerY - radius * 0.12,
      radius * 0.82,
      0,
      Math.PI * 2,
    );
    this.context.fillStyle = withEars ? "#172235" : "rgba(81, 26, 34, 0.82)";
    this.context.fill();
  }

  private drawButton(
    action: AppAction,
    x: number,
    y: number,
    width: number,
    height: number,
    backgroundColor: string,
    textColor: string,
    label: string,
  ): void {
    this.actions[action] = { x, y, width, height };

    this.context.save();
    this.context.shadowColor = "rgba(215, 183, 119, 0.2)";
    this.context.shadowBlur = 16;
    this.context.shadowOffsetY = 5;
    this.drawRoundedRect(x, y, width, height, 12, backgroundColor);
    this.context.restore();
    this.strokeRoundedRect(
      x,
      y,
      width,
      height,
      12,
      "rgba(255, 255, 255, 0.12)",
    );

    this.setText({
      color: textColor,
      font: "bold 16px sans-serif",
      align: "center",
    });
    this.context.fillText(label, x + width / 2, y + height / 2 + 5);
  }

  private drawRoundedRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: string | CanvasGradient,
  ): void {
    this.createRoundedPath(x, y, width, height, radius);
    this.context.fillStyle = fill;
    this.context.fill();
  }

  private strokeRoundedRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    color: string,
  ): void {
    this.createRoundedPath(x, y, width, height, radius);
    this.context.strokeStyle = color;
    this.context.lineWidth = 1;
    this.context.stroke();
  }

  private createRoundedPath(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    const resolvedRadius = Math.min(radius, width / 2, height / 2);
    this.context.beginPath();
    this.context.moveTo(x + resolvedRadius, y);
    this.context.lineTo(x + width - resolvedRadius, y);
    this.context.quadraticCurveTo(x + width, y, x + width, y + resolvedRadius);
    this.context.lineTo(x + width, y + height - resolvedRadius);
    this.context.quadraticCurveTo(
      x + width,
      y + height,
      x + width - resolvedRadius,
      y + height,
    );
    this.context.lineTo(x + resolvedRadius, y + height);
    this.context.quadraticCurveTo(x, y + height, x, y + height - resolvedRadius);
    this.context.lineTo(x, y + resolvedRadius);
    this.context.quadraticCurveTo(x, y, x + resolvedRadius, y);
    this.context.closePath();
  }

  private setText(options: TextOptions): void {
    this.context.fillStyle = options.color ?? COLORS.text;
    this.context.font = options.font ?? "14px sans-serif";
    this.context.textAlign = options.align ?? "left";
  }

  private fitText(value: string, maxWidth: number): string {
    if (this.context.measureText(value).width <= maxWidth) {
      return value;
    }

    const characters = Array.from(value);
    while (
      characters.length > 0 &&
      this.context.measureText(`${characters.join("")}…`).width > maxWidth
    ) {
      characters.pop();
    }

    return `${characters.join("")}…`;
  }
}
