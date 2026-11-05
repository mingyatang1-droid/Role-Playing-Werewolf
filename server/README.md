# 服务端工程

这是与 `client/` 独立的服务端工程，使用 Node.js、TypeScript 和 Fastify。

## 当前内容

- `GET /v1/health`：健康检查和契约版本。
- `WS /v1/ws`：WebSocket 握手占位与心跳响应。
- 统一的基础目录：配置、路由、实时连接、测试。

当前尚未接入数据库、Redis、鉴权、规则引擎、DS API 或 ASR。这些能力按服务端计划分阶段实现。

## 开发

```powershell
cd server
Copy-Item .env.example .env
npm install
npm run dev
```

默认监听 `http://127.0.0.1:3000`。

```powershell
npm run typecheck
npm run test
npm run build
npm start
```

## 目录

```text
src/
  app.ts                  Fastify 应用组装
  index.ts                服务启动与关闭
  config/                 环境配置
  routes/                 HTTP 路由
  realtime/               WebSocket 路由
tests/                    契约与单元测试
```
