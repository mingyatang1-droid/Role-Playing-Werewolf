# 客户端与服务端集成契约

| 项目 | 内容 |
| --- | --- |
| 契约版本 | v1.0 |
| 适用版本 | P0 |
| 需求基线 | `PRD.md` v1.1 |
| 总计划 | `DEVELOPMENT_PLAN.md` |
| 客户端计划 | `CLIENT_PLAN.md` |
| 服务端计划 | `SERVER_PLAN.md` |
| 更新原则 | 先修改契约，再同步修改客户端与服务端 |

> 本文是微信小游戏客户端和服务端之间唯一的接口、事件、状态和联调依据。若代码实现与本文冲突，以评审通过后的最新契约为准；不得只在某一端修改字段后继续联调。

---

## 1. 契约边界

### 1.1 客户端负责

- 提交用户意图，包括创建房间、准备、夜间行动、发言和投票。
- 使用服务端返回的玩家视角快照渲染 UI。
- 处理事件顺序、断线重连和错误提示。
- 发起录音和音频上传，编辑并确认最终转写文本。

### 1.2 服务端负责

- 身份认证、房间成员关系、游戏阶段和游戏角色分配。
- 验证行动合法性、计算死亡、票数和胜负。
- 生成每个玩家对应的裁剪快照。
- 生成 AI 行动和发言；执行内容安全、事实和名称审核。
- 处理 ASR Session、临时音频和清理。

### 1.3 共同原则

1. 客户端不自行推算胜负，不自行确认 AI 发言。
2. 服务端不接受客户端传入的游戏角色、阶段、存活状态和私有结果。
3. 先约定契约，再并行实现两端。
4. 每个事件必须可去重，所有写请求必须有幂等键。
5. 私有信息在接口序列化前裁剪，不依赖客户端隐藏。
6. AI 公开发言使用背景角色名，不使用席位编号。
7. 原始音频不进入公共事件、复盘或 AI Prompt。

---

## 2. 版本与兼容

### 2.1 版本字段

- HTTP 路径使用 `/v1`。
- WebSocket 握手中提交 `contract_version`。
- 数据库持久化 `game_engine_version`、`contract_version` 和 `prompt_version`。

### 2.2 兼容规则

- 新增可选字段属于向后兼容变更。
- 删除字段、修改语义、改变枚举含义或改变事件顺序必须升级契约主版本。
- 客户端必须忽略未知事件类型和未知可选字段。
- 服务端对不支持的主版本返回 `CONTRACT_VERSION_UNSUPPORTED`。
- 契约变更必须同时更新本文、`CLIENT_PLAN.md`、`SERVER_PLAN.md` 和测试用例。

### 2.3 类型共享方式

两端独立工程时，推荐由服务端维护 OpenAPI 和 JSON Schema，生成 TypeScript 类型供客户端使用。若暂不生成代码，至少保留以下文件：

- `openapi.yaml`
- `events.schema.json`
- `agent-output.schema.json`
- `error-codes.json`

---

## 3. 鉴权与会话

### 3.1 健康检查

`GET /v1/health`

```json
{
  "code": "OK",
  "data": {
    "status": "ok",
    "api_version": "v1",
    "contract_version": "1.0",
    "server_time": "2026-11-05T13:59:00Z"
  }
}
```

### 3.2 登录

`POST /v1/auth/wechat`

请求：

```json
{
  "code": "wx.login 返回的一次性 code"
}
```

响应：

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_123",
  "data": {
    "user_id": "usr_123",
    "access_token": "signed-token",
    "expires_at": "2026-11-05T14:00:00Z"
  }
}
```

- HTTP 使用 `Authorization: Bearer <access_token>`。
- WebSocket 握手通过 `token` 查询参数或首帧鉴权提交会话；Token 不得出现在日志中。
- 会话过期返回 `AUTH_EXPIRED`，客户端重新登录；重新登录不能改变当前房间席位。

### 3.3 统一响应

```json
{
  "code": "OK",
  "message": "success",
  "request_id": "req_123",
  "data": {}
}
```

错误响应：

```json
{
  "code": "ACTION_NOT_ALLOWED",
  "message": "当前阶段不能执行该操作",
  "request_id": "req_123",
  "details": {
    "phase": "DAY_SPEECH"
  }
}
```

---

## 4. 数据枚举

### 4.1 房间状态

| 值 | 含义 |
| --- | --- |
| `CONFIGURING` | 正在配置阵容 |
| `READY` | 配置完成，等待开始 |
| `IN_GAME` | 对局进行中 |
| `ENDED` | 对局已经结束 |
| `CLOSED` | 房间已关闭 |

### 4.2 游戏阶段

| 值 | 含义 |
| --- | --- |
| `ROLE_REVEAL` | 身份揭示 |
| `NIGHT_WEREWOLF` | 狼人行动 |
| `NIGHT_SEER` | 预言家查验 |
| `NIGHT_WITCH` | 女巫用药 |
| `NIGHT_RESOLVE` | 夜晚结算 |
| `DAY_ANNOUNCE` | 天亮公告 |
| `DAY_LAST_WORDS` | 遗言 |
| `DAY_SPEECH` | 白天发言 |
| `DAY_VOTE` | 放逐投票 |
| `DAY_VOTE_RESOLVE` | 票型和放逐结算 |
| `HUNTER_SHOOT` | 猎人发动技能 |
| `GAME_OVER` | 对局结束 |

### 4.3 游戏角色

- `WEREWOLF`
- `VILLAGER`
- `SEER`
- `WITCH`
- `HUNTER`

P1 角色不在当前契约中下发。

### 4.4 信息可见范围

| 范围 | 可见对象 |
| --- | --- |
| `PUBLIC` | 房间全部玩家 |
| `SELF` | 当前玩家席位 |
| `WEREWOLF_TEAM` | 存活狼人及其团队内部记录 |
| `SYSTEM` | 仅服务端与受权后台 |

---

## 5. 房间接口

### 5.1 创建房间

`POST /v1/rooms`

```json
{
  "mode": "SOLO",
  "total_seats": 9,
  "human_seats": 1,
  "ai_seats": 8,
  "role_deck": {
    "WEREWOLF": 3,
    "VILLAGER": 3,
    "SEER": 1,
    "WITCH": 1,
    "HUNTER": 1
  }
}
```

- `mode`：`SOLO` 或 `FRIENDS`。
- 返回 `room_id`、`room_version`、房主席位和房间快照。
- 服务端必须重新校验人数与角色牌堆。

### 5.2 读取和修改

- `GET /v1/rooms/{room_id}`
- `PATCH /v1/rooms/{room_id}/config`，带 `expected_version`。
- 配置冲突返回 `ROOM_VERSION_CONFLICT` 和最新版本号。
- 修改角色配置后客户端应使用响应快照，不自行猜测状态。

### 5.3 加入、准备和开始

- `POST /v1/rooms/join`
- `POST /v1/rooms/{room_id}/ready`
- `POST /v1/rooms/{room_id}/start`

开始响应：

```json
{
  "code": "OK",
  "data": {
    "game_id": "game_123",
    "phase": "ROLE_REVEAL",
    "self_seat_no": 1,
    "game_version": 1
  }
}
```

开始响应不得包含其他玩家的游戏角色。

---

## 6. 主题与角色接口

### 6.1 生成主题草稿

`POST /v1/rooms/{room_id}/theme-drafts`

```json
{
  "theme_prompt": "三国演义，群雄争霸",
  "desired_character": "诸葛亮"
}
```

响应：

```json
{
  "theme_id": "theme_123",
  "theme_version": 1,
  "theme_name": "三国演义",
  "world_rules": [
    "使用三国时代称谓和战争意象",
    "不出现现代网络流行语"
  ],
  "characters": [
    {
      "character_id": "three_kingdoms_zhuge_liang",
      "display_name": "诸葛亮",
      "speech_reference_name": "诸葛亮",
      "aliases": ["孔明"],
      "traits": ["谨慎", "善谋", "自持"],
      "short_description": "蜀汉军师，言辞克制而善于设局",
      "style_example": "此局若有破绽，必先起于言辞之间。",
      "is_user_character": true
    }
  ],
  "fallback_used": false
}
```

约束：

- 同场 `display_name`、`speech_reference_name` 和用于识别的别名不得冲突。
- 用户指定角色不能分配给 AI。
- 删除候选后重新生成时，已锁定角色保持不变。
- 角色卡可公开的字段不能包含隐藏 Prompt、关系评分或其他 AI 私有策略。

### 6.2 生成错误

| 错误码 | 客户端处理 |
| --- | --- |
| `THEME_MODERATION_BLOCKED` | 提示修改输入 |
| `THEME_GENERATION_TIMEOUT` | 允许取消、重试或使用兜底 |
| `THEME_GENERATION_FAILED` | 显示可理解失败，不暴露上游原文 |
| `THEME_ROLE_CONFLICT` | 展示冲突角色和建议 |
| `THEME_GENERATION_LIMIT` | 提示达到 3 次生成上限 |

---

## 7. 对局快照

### 7.1 获取快照

`GET /v1/games/{game_id}/snapshot`

```json
{
  "game_id": "game_123",
  "contract_version": "1.0",
  "game_engine_version": "classic_9_tubian_v1",
  "room_version": 5,
  "game_version": 18,
  "last_event_sequence": 87,
  "phase": "DAY_SPEECH",
  "round_no": 2,
  "self": {
    "seat_no": 3,
    "background_character": {
      "display_name": "张飞",
      "speech_reference_name": "张飞"
    },
    "game_role": "WEREWOLF",
    "camp": "WEREWOLF",
    "alive": true
  },
  "players": [
    {
      "seat_no": 1,
      "display_name": "玩家一",
      "background_character_name": "诸葛亮",
      "speaker_reference_name": "诸葛亮",
      "occupant_type": "HUMAN",
      "alive": true,
      "speech_state": "IDLE",
      "vote_state": "NOT_VOTED"
    }
  ],
  "public_timeline": [],
  "private_state": {
    "seer_result_ids": [],
    "witch_resources": null,
    "hunter_available": false
  },
  "legal_action": {
    "type": "SPEAK",
    "targets": []
  },
  "deadline_at": "2026-11-05T14:00:00Z"
}
```

### 7.2 字段权限

- `self.game_role` 仅在当前玩家视图出现。
- `players[].game_role` 不得出现在未结束的普通玩家快照中。
- 预言家查验通过 `private_state` 只返回自己的结果。
- 狼人队友通过 `private_state.werewolf_teammates` 返回，仅限狼人。
- `public_timeline` 只能包含已审核并广播的事件。
- 复盘接口只有在 `GAME_OVER` 后可以返回全员游戏角色。

### 7.3 快照完整度

客户端收到快照后：

1. 用 `last_event_sequence` 作为后续事件起点。
2. 清除旧对局状态，不合并已失效的本地阶段。
3. 若服务端返回版本高于客户端支持版本，提示更新客户端。
4. 保存未提交输入草稿，但身份和阶段以新快照为准。

---

## 8. 行动与发言

### 8.1 提交行动

`POST /v1/games/{game_id}/actions`

```json
{
  "idempotency_key": "seat3-night2-kill",
  "expected_game_version": 18,
  "action_type": "WEREWOLF_KILL",
  "target_seat": 6
}
```

- `target_seat` 只用于机器定位目标，不作为 AI 公共文本。
- 服务端校验用户、席位、存活、阶段、角色、目标和版本。
- 重复幂等键返回第一次结果，不重复改变状态。

### 8.2 提交文字发言

`POST /v1/games/{game_id}/speeches`

```json
{
  "idempotency_key": "seat3-day2-speech",
  "expected_game_version": 24,
  "text": "我认为诸葛亮此前的发言前后矛盾。"
}
```

真人可输入 `3 号`，服务端按用户文本原样保存；AI 后续发言必须转换为该席位对应的背景角色名。

### 8.3 AI 输出契约

Strategy Agent：

```json
{
  "action_type": "VOTE",
  "target_seat": 5,
  "target_reference_name": "曹操",
  "public_intent": "质疑诸葛亮的预言家身份，并把焦点引向曹操",
  "stance": "COUNTERCLAIM",
  "claims_own_role": false,
  "forbidden_public_facts": [
    "孙权和司马懿是狼人队友",
    "系统真实查验结果"
  ],
  "confidence": 0.72
}
```

Dialogue 输出：

```json
{
  "public_speech": "俺觉得诸葛亮这军师当得不实。昨夜折的是周瑜，你却急着保关羽。俺先听你怎么自证；自证不清，今日这一票便落曹操身上。",
  "referenced_event_ids": ["evt_day2_death", "evt_1_claim_seer"],
  "style_tags": ["short_sentences", "direct", "impulsive"],
  "no_repeat": true
}
```

Reviewer 必检：

- `HIDDEN_INFO_LEAK`
- `UNKNOWN_GAME_FACT`
- `SEAT_NUMBER_REFERENCE`
- `AMBIGUOUS_CHARACTER_REFERENCE`
- `PERSONA_BREAK`
- `PROMPT_INJECTION_FOLLOWED`
- `SAFETY_BLOCK`
- `REPETITION`

### 8.4 背景角色名规则

- 每条 AI 公共发言首次指代某位玩家时，必须使用该席位的 `speech_reference_name`。
- 同段后文可使用代词或全房唯一别名。
- 禁止使用“1 号”“三号”“5 位”等席位编号指代玩家。
- `seat_no`、`target_seat` 和数据库 ID 不得直接写入 `public_speech`。
- 真人历史发言中的号码只作为理解线索，AI 输出必须映射成背景角色名。
- 名称不存在、重复或无法消歧时不得广播原文。

---

## 9. 语音转写

### 9.1 创建会话

`POST /v1/asr/sessions`

```json
{
  "game_id": "game_123",
  "expected_game_version": 24,
  "duration_ms": 18300
}
```

返回 `session_id`、允许的格式、上传地址和过期时间。

### 9.2 上传音频

`POST /v1/asr/sessions/{session_id}/audio`

- 使用 `multipart/form-data` 或服务端签发的短期上传凭证。
- 单次音频 1～60 秒。
- 服务端校验用户、当前发言阶段、音频大小和 MIME。
- 返回：

```json
{
  "session_id": "asr_123",
  "status": "TRANSCRIBED",
  "text": "我认为诸葛亮这几轮的判断前后不一",
  "edited_by_user": false
}
```

- 转写结果不自动成为公开发言。
- 客户端必须让用户编辑并确认。
- 最终通过 Speech 接口发送。
- 原始音频在转写和审核后清理，最长不超过 24 小时。

---

## 10. WebSocket 连接与事件

### 10.1 连接

- URL：`wss://<host>/v1/ws`
- 握手必须携带有效 Token 和 `contract_version`。
- 服务端发送：

```json
{
  "type": "server.hello",
  "event_id": "evt_hello_1",
  "sequence": 0,
  "server_time": "2026-11-05T13:59:00Z",
  "payload": {
    "connection_id": "conn_123",
    "heartbeat_interval_ms": 25000
  }
}
```

### 10.2 事件信封

```json
{
  "type": "phase.changed",
  "event_id": "evt_88",
  "sequence": 88,
  "game_id": "game_123",
  "server_time": "2026-11-05T14:00:00Z",
  "payload": {
    "phase": "DAY_SPEECH",
    "round_no": 2,
    "deadline_at": "2026-11-05T14:01:00Z"
  }
}
```

### 10.3 事件清单

| 事件 | 方向 | 说明 |
| --- | --- | --- |
| `server.hello` | S→C | 连接成功与心跳配置 |
| `room.updated` | S→C | 席位、准备、房主和房间状态变化 |
| `game.started` | S→C | 对局开始，只含当前玩家私有身份 |
| `phase.changed` | S→C | 阶段、轮次和截止时间 |
| `turn.started` | S→C | 当前行动/发言者 |
| `speech.delta` | S→C | 已审核 AI 文本分段 |
| `speech.completed` | S→C | 最终发言文本 |
| `private.action_result` | S→C | 当前玩家可看的私有结果 |
| `vote.requested` | S→C | 投票开始 |
| `vote.result` | S→C | 公布票型和平票/放逐结果 |
| `player.out` | S→C | 出局公告 |
| `game.ended` | S→C | 胜负结果与全员身份揭晓 |
| `resync.required` | S→C | 客户端版本落后，需要拉快照 |
| `ping` / `pong` | 双向 | 心跳 |

### 10.4 顺序、去重与恢复

- 同一房间的事件序严格递增。
- 客户端维护已应用最大 `sequence`；小于等于当前值的事件忽略。
- 出现缺口时不猜测缺失事件，先暂停业务操作并请求快照。
- 快照响应包含 `last_event_sequence`，之后从该序号继续接收。
- 服务端保留足够事件支持短期增量恢复；更长断线直接返回完整快照。
- 除 AI 流式文本外，所有公共事件都必须在服务端持久化后广播。

---

## 11. 错误码

| 错误码 | 含义 | 客户端行为 |
| --- | --- | --- |
| `AUTH_INVALID` | 登录态无效 | 重新登录 |
| `AUTH_EXPIRED` | 会话过期 | 重新登录并恢复房间 |
| `ROOM_NOT_FOUND` | 房间不存在 | 返回首页 |
| `ROOM_FULL` | 房间满员 | 提示无法加入 |
| `ROOM_ALREADY_STARTED` | 已开局 | 禁止加入 |
| `ROOM_VERSION_CONFLICT` | 房间配置版本冲突 | 拉取最新房间 |
| `GAME_VERSION_CONFLICT` | 游戏版本冲突 | 拉取最新快照 |
| `ACTION_NOT_ALLOWED` | 当前阶段或角色不允许 | 展示服务端原因 |
| `INVALID_TARGET` | 目标非法 | 刷新合法目标 |
| `NOT_CURRENT_SPEAKER` | 非当前发言者 | 禁止提交 |
| `ASR_SESSION_EXPIRED` | 转写会话过期 | 重新录音 |
| `ASR_AUDIO_INVALID` | 音频格式/大小/时长非法 | 提示重新录音 |
| `THEME_MODERATION_BLOCKED` | 主题或角色内容被拦截 | 修改输入 |
| `THEME_GENERATION_TIMEOUT` | 主题生成超时 | 重试或使用兜底 |
| `CONTRACT_VERSION_UNSUPPORTED` | 协议版本不兼容 | 更新客户端 |
| `RATE_LIMITED` | 请求过于频繁 | 延迟重试 |
| `SERVER_MAINTENANCE` | 维护中 | 展示维护页 |

错误响应不得包含上游模型错误原文、栈信息、密钥或私有职业字段。

---

## 12. 联调节点

### CP0：基础连通

- 客户端健康检查通过。
- WSS 握手、`server.hello`、心跳和断开检测正常。
- 契约版本和统一错误处理可用。

### CP1：登录与房间

- 登录、创建单人房和好友房。
- 修改总人数与角色配置。
- 非法配置被拒绝。
- 刷新客户端后能恢复房间。

### CP2：规则与快照

- 客户端能用测试快照展示 6/9/12 人桌。
- 自己的游戏角色可见，其他人的游戏角色不可见。
- 夜间行动、投票和结算的接口契约通过。

### CP3：单人完整对局

- 1 名真人 + 多名 AI 完整完成一局。
- AI 流式发言可见、可重连、可降级。
- 结算和基础复盘正确。

### CP4：主题与多 Agent

- 客户端提交背景和角色，服务端返回角色池。
- 用户角色保留，AI 角色不重复。
- AI 首次指代使用背景角色名，席位数不进入公共文本。
- Prompt Injection 和私有信息测试通过。

### CP5：语音

- 客户端录音、上传、接收转写、编辑、确认。
- 服务端正确清理原始音频。
- ASR 失败时可转文字完成对局。

### CP6：多人实时

- 两台以上设备加入同一好友房。
- 5 真人 + 4 AI 可以完成整局。
- 断线、重连、事件缺口、重复事件和 AI 托管正常。

### CP7：故障与安全

- DS、ASR、Redis、数据库和 WSS 故障注入通过。
- 快照越权检查和 AI 私有信息检查通过。
- 负载测试和降级开关通过。

### CP8：发布

- 客户端、服务端和契约版本一致。
- 体验版与环境地址、域名和密钥配置正确。
- 生产监控、备份和回滚通过。
- 发布检查清单由本人完成并留存证据。

---

## 13. 契约变更流程

每次跨端变更执行以下步骤：

1. 在本文件中写明字段、枚举、事件或错误码变化。
2. 判断是否需要升级主版本。
3. 更新 OpenAPI/JSON Schema 和服务端类型。
4. 生成或同步客户端类型。
5. 修改两端测试和对应联调节点。
6. 在本地用 Mock 和真实服务端各验证一次。
7. 同时更新 `CLIENT_PLAN.md`、`SERVER_PLAN.md` 和 `DEVELOPMENT_PLAN.md` 的状态。

禁止行为：

- 客户端先假定未定义的响应并上线。
- 服务端未经契约变更直接重命名字段。
- 为了兼容旧客户端保留泄漏私有信息的字段。
- 在 AI 发言中直接输出 `seat_no` 或 `target_seat`。

---

## 14. 契约验收清单

- [ ] HTTP 和 WSS 都有统一版本字段。
- [ ] 所有写接口都有幂等键和版本检查。
- [ ] 普通玩家快照不含其他玩家游戏角色。
- [ ] 狼人队友和查验结果只下发合法玩家。
- [ ] AI 公共文本不使用席位编号。
- [ ] 本局名称映射唯一且客户端可见字段不泄露内部策略。
- [ ] ASR 原始音频不进入业务数据库和 AI 上下文。
- [ ] DS/ASR 故障有明确错误码和降级行为。
- [ ] 事件可去重、可检测缺口、可快照恢复。
- [ ] 客户端和服务端根据同一契约版本构建和发布。
