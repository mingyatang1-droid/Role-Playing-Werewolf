interface WechatCanvas {
  width: number;
  height: number;
  getContext(contextId: "2d"): CanvasRenderingContext2D | null;
}

interface WechatSystemInfo {
  windowWidth: number;
  windowHeight: number;
  pixelRatio: number;
}

interface WechatRequestOptions<T = unknown> {
  url: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  data?: unknown;
  header?: Record<string, string>;
  timeout?: number;
  success?: (response: { statusCode: number; data: T }) => void;
  fail?: (error: { errMsg: string }) => void;
}

interface WechatSocketTask {
  send(options: { data: string }): void;
  close(options?: { code?: number; reason?: string }): void;
  onOpen(callback: () => void): void;
  onMessage(callback: (event: { data: string }) => void): void;
  onError(callback: (event: { errMsg: string }) => void): void;
  onClose(callback: (event: { code: number; reason: string }) => void): void;
}

interface WechatApi {
  createCanvas(): WechatCanvas;
  getSystemInfoSync(): WechatSystemInfo;
  request<T = unknown>(options: WechatRequestOptions<T>): void;
  connectSocket(options: { url: string; protocols?: string[] }): WechatSocketTask;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
}

declare const wx: WechatApi;
