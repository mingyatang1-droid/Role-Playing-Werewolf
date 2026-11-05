export class CanvasRenderer {
  private readonly canvas: WechatCanvas;
  private readonly context: CanvasRenderingContext2D;

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
    this.drawPlaceholder(system.windowWidth, system.windowHeight);
  }

  private drawPlaceholder(width: number, height: number): void {
    this.context.fillStyle = "#111827";
    this.context.fillRect(0, 0, width, height);

    this.context.fillStyle = "#f9fafb";
    this.context.font = "bold 28px sans-serif";
    this.context.textAlign = "center";
    this.context.fillText("Role-Playing Werewolf", width / 2, height / 2 - 18);

    this.context.fillStyle = "#9ca3af";
    this.context.font = "16px sans-serif";
    this.context.fillText("微信小游戏客户端骨架已启动", width / 2, height / 2 + 24);
  }
}
