import { ApiError } from "../errors/api-error.js";
import type { WechatIdentity } from "../users/user-repository.js";

export interface WechatAuthProvider {
  exchangeCode(code: string): Promise<WechatIdentity>;
}

export class MockWechatAuthProvider implements WechatAuthProvider {
  constructor(private readonly openId: string) {}

  async exchangeCode(code: string): Promise<WechatIdentity> {
    if (!code.trim()) {
      throw new ApiError(400, "WECHAT_CODE_REQUIRED", "微信登录 code 不能为空");
    }

    return {
      openId: this.openId,
      unionId: null,
    };
  }
}

interface WechatSessionResponse {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

export class LiveWechatAuthProvider implements WechatAuthProvider {
  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
  ) {
    if (!appId || !appSecret) {
      throw new Error(
        "WECHAT_APP_ID and WECHAT_APP_SECRET are required in live mode.",
      );
    }
  }

  async exchangeCode(code: string): Promise<WechatIdentity> {
    if (!code.trim()) {
      throw new ApiError(400, "WECHAT_CODE_REQUIRED", "微信登录 code 不能为空");
    }

    const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
    url.searchParams.set("appid", this.appId);
    url.searchParams.set("secret", this.appSecret);
    url.searchParams.set("js_code", code);
    url.searchParams.set("grant_type", "authorization_code");

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new ApiError(
        502,
        "WECHAT_LOGIN_UNAVAILABLE",
        "微信登录服务暂时不可用",
      );
    }

    if (!response.ok) {
      throw new ApiError(
        502,
        "WECHAT_LOGIN_UNAVAILABLE",
        "微信登录服务暂时不可用",
      );
    }

    const payload = (await response.json()) as WechatSessionResponse;
    if (payload.errcode || !payload.openid) {
      throw new ApiError(
        401,
        "WECHAT_LOGIN_FAILED",
        "微信登录失败，请重新发起登录",
      );
    }

    return {
      openId: payload.openid,
      unionId: payload.unionid ?? null,
    };
  }
}
