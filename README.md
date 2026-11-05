# Role-Playing-Werewolf

角色扮演多智能体狼人杀微信小游戏。

## 项目文档

- [产品需求文档](docs/PRD.md)
- [总体开发计划](docs/DEVELOPMENT_PLAN.md)
- [微信小游戏客户端计划](docs/CLIENT_PLAN.md)
- [服务端与 AI 开发计划](docs/SERVER_PLAN.md)
- [客户端/服务端集成契约](docs/INTEGRATION_CONTRACT.md)

建议先阅读产品需求文档和总体开发计划，再按当前工作方向进入客户端或服务端计划；涉及接口、事件和状态时，以集成契约为准。

## 工程结构

```text
client/   微信小游戏客户端（独立 TypeScript 工程）
server/   服务端与 AI 编排（独立 TypeScript 工程）
docs/     产品、计划与跨端契约
```

## 启动

客户端：

```powershell
cd client
npm install
npm run build
```

构建后使用微信开发者工具打开 `client/`。

服务端：

```powershell
cd server
Copy-Item .env.example .env
npm install
npm run dev
```

默认服务地址为 `http://127.0.0.1:3000`，健康检查为 `GET /v1/health`。
