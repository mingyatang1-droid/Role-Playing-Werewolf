import { createHash, randomBytes } from "node:crypto";
import type { ServerEnvironment } from "../config/environment.js";
import { ApiError } from "../errors/api-error.js";
import type {
  UserRecord,
  UserRepository,
} from "../users/user-repository.js";
import type { WechatAuthProvider } from "./wechat-provider.js";
import type { SessionRepository } from "./session-repository.js";

export interface PublicUser {
  id: string;
  publicId: string;
  nickname: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface LoginResult {
  accessToken: string;
  expiresAt: string;
  isNewUser: boolean;
  user: PublicUser;
}

function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    publicId: user.publicId,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly wechat: WechatAuthProvider,
    private readonly sessionTtlDays: number,
  ) {}

  async login(code: string): Promise<LoginResult> {
    const identity = await this.wechat.exchangeCode(code);
    const result = await this.users.findOrCreate(identity);
    const accessToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(
      Date.now() + this.sessionTtlDays * 24 * 60 * 60 * 1_000,
    ).toISOString();

    await this.sessions.create(
      result.user.id,
      hashToken(accessToken),
      expiresAt,
    );

    return {
      accessToken,
      expiresAt,
      isNewUser: result.isNewUser,
      user: toPublicUser(result.user),
    };
  }

  async getCurrentUser(accessToken: string): Promise<PublicUser> {
    const session = await this.sessions.findActiveByTokenHash(
      hashToken(accessToken),
      new Date().toISOString(),
    );
    if (!session) {
      throw new ApiError(401, "AUTH_INVALID", "登录状态已失效，请重新登录");
    }

    const user = await this.users.findById(session.userId);
    if (!user) {
      throw new ApiError(401, "AUTH_INVALID", "登录用户不存在");
    }

    return toPublicUser(user);
  }

  async updateNickname(
    accessToken: string,
    nickname: string,
  ): Promise<PublicUser> {
    const trimmedNickname = nickname.trim();
    if (
      trimmedNickname.length < 1 ||
      trimmedNickname.length > 32 ||
      /[\u0000-\u001f\u007f]/.test(trimmedNickname)
    ) {
      throw new ApiError(
        400,
        "NICKNAME_INVALID",
        "昵称长度应为 1～32 个字符且不能包含控制字符",
      );
    }

    const currentUser = await this.getCurrentUser(accessToken);
    const updated = await this.users.updateNickname(
      currentUser.id,
      trimmedNickname,
    );
    if (!updated) {
      throw new ApiError(404, "USER_NOT_FOUND", "用户不存在");
    }

    return toPublicUser(updated);
  }
}

export function createAuthService(
  environment: ServerEnvironment,
  users: UserRepository,
  sessions: SessionRepository,
  wechat: WechatAuthProvider,
): AuthService {
  return new AuthService(
    users,
    sessions,
    wechat,
    environment.sessionTtlDays,
  );
}
