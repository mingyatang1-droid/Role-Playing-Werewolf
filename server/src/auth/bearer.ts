import { ApiError } from "../errors/api-error.js";

export function readBearerToken(authorization: string | undefined): string {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new ApiError(401, "AUTH_REQUIRED", "请先登录");
  }

  return match[1];
}
