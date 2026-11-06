import {
  getJson,
  HttpError,
  patchJson,
  postJson,
} from "../network/http-client";

const ACCESS_TOKEN_STORAGE_KEY = "werewolf.access_token";

export interface AuthUser {
  id: string;
  public_id: string;
  nickname: string;
  avatar_url: string | null;
  created_at: string;
}

export interface LoginResult {
  access_token: string;
  token_type: "Bearer";
  expires_at: string;
  is_new_user: boolean;
  user: AuthUser;
}

function requestWechatLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      timeout: 10_000,
      success: (result) => {
        if (result.code) {
          resolve(result.code);
        } else {
          reject(new Error("微信登录未返回有效 code"));
        }
      },
      fail: (error) => reject(new Error(error.errMsg)),
    });
  });
}

export function getStoredAccessToken(): string | null {
  const value = wx.getStorageSync(ACCESS_TOKEN_STORAGE_KEY);
  return typeof value === "string" && value ? value : null;
}

export function clearStoredAccessToken(): void {
  wx.removeStorageSync(ACCESS_TOKEN_STORAGE_KEY);
}

export async function loginWithWechat(): Promise<LoginResult> {
  const code = await requestWechatLoginCode();
  const response = await postJson<LoginResult>("/v1/auth/wechat", { code });
  wx.setStorageSync(ACCESS_TOKEN_STORAGE_KEY, response.data.access_token);
  return response.data;
}

export async function getCurrentUser(
  accessToken: string,
): Promise<AuthUser> {
  const response = await getJson<{ user: AuthUser }>("/v1/me", accessToken);
  return response.data.user;
}

export async function updateNickname(
  accessToken: string,
  nickname: string,
): Promise<AuthUser> {
  const response = await patchJson<{ user: AuthUser }>(
    "/v1/me/profile",
    { nickname },
    accessToken,
  );
  return response.data.user;
}

export function isSessionExpired(error: unknown): boolean {
  return error instanceof HttpError && error.statusCode === 401;
}
