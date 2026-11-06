# 微信小游戏客户端

这是与 `server/` 独立的微信小游戏客户端工程，使用 TypeScript 和微信小游戏原生 Canvas API。

## 目录

```text
game.js                  微信小游戏入口
game.json                小游戏运行配置
project.config.json      微信开发者工具项目配置
src/
  app.ts                 客户端启动入口
  config/                环境配置
  network/               HTTP 与 WebSocket 基础封装
  presentation/          Canvas 渲染层
```

## 开发

```powershell
cd client
npm install
npm run build
```

构建完成后，用微信开发者工具打开 `client/` 目录。开发阶段访问本机服务端时，需要在开发者工具中关闭域名校验；正式环境必须使用已配置的 HTTPS/WSS 域名。

`npm run watch` 会持续把 `src/` 编译到 `dist/`。`project.private.config.json` 保留当前微信项目的本地开发配置。

## 当前范围

当前已开始阶段 C0/C1：

- 微信小游戏 Canvas 登录页可启动。
- 点击“微信登录”后调用 `wx.login`，通过服务端创建或复用用户。
- 首次登录可设置昵称，登录后进入首页。
- 首页显示昵称、应用内 `public_id`、单人开局入口、好友房占位和最近对局占位。
- 支持自定义 6～12 人单人局和狼人/村民/预言家/女巫/猎人数量。
- 创建房间前执行本地配置校验，创建后展示房间编号和角色摘要。
- 已有会话启动时自动恢复。
- 包含基础环境配置、HTTP 请求和 WebSocket 客户端封装。
- 背景角色、完整对局和录音将在后续客户端阶段实现。

客户端不会请求或显示用户微信号，也不会把 `openid` 暴露到客户端。
