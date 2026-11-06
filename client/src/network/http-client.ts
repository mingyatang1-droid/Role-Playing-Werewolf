import { getClientEnvironment } from "../config/env";

export interface ApiEnvelope<T> {
  code: string;
  message: string;
  request_id: string;
  data: T;
}

interface ErrorEnvelope {
  code?: string;
  message?: string;
  request_id?: string;
}

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function requestJson<T>(
  method: "GET" | "PATCH" | "POST",
  path: string,
  data?: unknown,
  accessToken?: string,
): Promise<ApiEnvelope<T>> {
  const environment = getClientEnvironment();
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return new Promise((resolve, reject) => {
    wx.request<ApiEnvelope<T> | ErrorEnvelope>({
      url: `${environment.apiBaseUrl}${path}`,
      method,
      data,
      header: headers,
      timeout: 10_000,
      success: (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data as ApiEnvelope<T>);
          return;
        }

        const error = response.data as ErrorEnvelope;
        reject(
          new HttpError(
            response.statusCode,
            error.code ?? "REQUEST_FAILED",
            error.message ?? "请求失败，请稍后重试",
          ),
        );
      },
      fail: (error) => reject(new Error(error.errMsg)),
    });
  });
}

export function getJson<T>(
  path: string,
  accessToken?: string,
): Promise<ApiEnvelope<T>> {
  return requestJson<T>("GET", path, undefined, accessToken);
}

export function postJson<T>(
  path: string,
  data: unknown,
  accessToken?: string,
): Promise<ApiEnvelope<T>> {
  return requestJson<T>("POST", path, data, accessToken);
}

export function patchJson<T>(
  path: string,
  data: unknown,
  accessToken: string,
): Promise<ApiEnvelope<T>> {
  return requestJson<T>("PATCH", path, data, accessToken);
}
