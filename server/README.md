# 服务端工程

这是与 `client/` 独立的服务端工程，使用 Node.js、TypeScript 和 Fastify。

## 当前内容

- `GET /v1/health`：健康检查和契约版本。
- `WS /v1/ws`：WebSocket 握手占位与心跳响应。
- `POST /v1/auth/wechat`：微信 code 登录、稳定用户识别和会话签发。
- `GET /v1/me`：读取当前登录用户。
- `PATCH /v1/me/profile`：设置昵称。
- `POST /v1/rooms`：创建并保存单人房间配置。
- `GET /v1/rooms/:room_id`：读取当前用户拥有的房间。
- `PATCH /v1/rooms/:room_id/config`：按配置版本修改未开始房间。
- `POST /v1/rooms/:room_id/start`：分配角色并开始规则对局。
- `GET /v1/games/:game_id/snapshot`：读取权限裁剪后的对局快照。
- `POST /v1/games/:game_id/actions`：提交夜晚行动、猎人开枪或投票。
- `POST /v1/games/:game_id/tick`：推进已经到期的真人发言计时。
- 本地 SQLite 持久化用户、微信身份标识和会话哈希。
- SQLite/PostgreSQL 持久化房间、席位和角色配置。
- SQLite/PostgreSQL 持久化可回放的游戏状态 JSON 和状态版本。
- 规则引擎支持白天发言顺序、60 秒截止时间、文本发言和超时跳过。
- 统一的基础目录：配置、路由、实时连接、测试。

当前尚未接入 Redis、房间、规则引擎、DS API 或 ASR。用户及相关会话数据已落盘。

## PostgreSQL / Docker

推荐开发环境使用 Docker Desktop 或 Docker Engine 启动 PostgreSQL。

```powershell
cd server
npm install
npm run db:up
Copy-Item .env.example .env
# 然后将 .env 中的 DATABASE_DRIVER 改为 postgres
# 并取消 DATABASE_URL 注释
npm run dev
```

`docker compose` 会启动 PostgreSQL 17，创建 `werewolf` 数据库和
`werewolf_postgres_data` 持久卷。服务端启动时会自动执行
`migrations/001_initial.sql`，重复启动不会重复建表。

`npm run db:up` 使用了 `--wait`，会在 PostgreSQL 健康检查通过后才返回。

Docker 模式连接配置：

```text
DATABASE_DRIVER=postgres
DATABASE_URL=postgresql://werewolf:werewolf_dev@127.0.0.1:5432/werewolf
```

这些数据库账号和密码只用于本地开发。生产环境必须使用独立强密码、密钥管理服务和
平台的 PostgreSQL 服务，不能直接沿用 Compose 中的凭据。

不需要 Docker 时，将 `.env` 改为：

```text
DATABASE_DRIVER=sqlite
DATABASE_PATH=./data/werewolf.db
```

常用命令：

```powershell
npm run db:logs
npm run db:down
$env:TEST_POSTGRES_URL="postgresql://werewolf:werewolf_dev@127.0.0.1:5432/werewolf"
npm run test:postgres
```

`docker compose down` 保留数据卷；只有显式执行
`docker compose down -v` 才会删除本地数据库数据。

## 开发

```powershell
cd server
Copy-Item .env.example .env
npm install
npm run dev
```

默认监听 `http://127.0.0.1:3000`。

默认 `WECHAT_AUTH_MODE=mock`，本地任意 `wx.login` code 都会映射到
`WECHAT_MOCK_OPENID` 指定的稳定测试用户。接入真实微信登录时设置：

```text
WECHAT_AUTH_MODE=live
WECHAT_APP_ID=你的 AppID
WECHAT_APP_SECRET=你的 AppSecret
```

`WECHAT_APP_SECRET` 只能放在服务端环境变量或密钥管理服务中，不能提交到 Git。

无 Docker 时默认使用 SQLite，数据写入 `server/data/werewolf.db`。两种实现
共享异步仓储接口，业务路由无需修改。

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
  auth/                   微信身份、登录和会话
  db/                     SQLite 连接与 Schema
  users/                  用户仓储
  routes/                 HTTP 路由
  realtime/               WebSocket 路由
tests/                    契约与单元测试
migrations/               数据库结构
```
