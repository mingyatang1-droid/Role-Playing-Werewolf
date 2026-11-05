import { CanvasRenderer } from "./presentation/canvas-renderer";

export class ClientApp {
  start(): void {
    const canvas = wx.createCanvas();
    const renderer = new CanvasRenderer(canvas);
    renderer.mount();
  }
}
