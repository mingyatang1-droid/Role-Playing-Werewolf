export type SocketState = "idle" | "connecting" | "open" | "closed" | "error";

export class SocketClient {
  private task: WechatSocketTask | null = null;

  connect(url: string): void {
    this.disconnect();

    this.task = wx.connectSocket({ url });
    this.task.onOpen(() => undefined);
    this.task.onMessage(() => undefined);
    this.task.onError(() => undefined);
    this.task.onClose(() => {
      this.task = null;
    });
  }

  send(payload: unknown): boolean {
    if (!this.task) {
      return false;
    }

    this.task.send({ data: JSON.stringify(payload) });
    return true;
  }

  disconnect(): void {
    this.task?.close();
    this.task = null;
  }
}
