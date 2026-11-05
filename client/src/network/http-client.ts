import { getClientEnvironment } from "../config/env";

export interface HttpResponse<T> {
  statusCode: number;
  data: T;
}

export function getJson<T>(path: string): Promise<HttpResponse<T>> {
  const environment = getClientEnvironment();

  return new Promise((resolve, reject) => {
    wx.request<T>({
      url: `${environment.apiBaseUrl}${path}`,
      method: "GET",
      timeout: 10_000,
      success: (response) => resolve(response),
      fail: (error) => reject(new Error(error.errMsg)),
    });
  });
}
