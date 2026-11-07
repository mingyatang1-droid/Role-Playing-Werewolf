import type { RoleConfig } from "../rooms/room-model.js";

export type GameRole =
  | "WEREWOLF"
  | "VILLAGER"
  | "SEER"
  | "WITCH"
  | "HUNTER";

export type GamePhase =
  | "NIGHT_WEREWOLF"
  | "NIGHT_SEER"
  | "NIGHT_WITCH"
  | "DAY_SPEECH"
  | "DAY_VOTE"
  | "HUNTER_SHOOT"
  | "GAME_OVER";

export interface GameParticipant {
  seatNo: number;
  nickname: string;
  isAi: boolean;
}

export interface GamePlayerState extends GameParticipant {
  role: GameRole;
  alive: boolean;
  deathCause: "WOLF" | "POISON" | "VOTE" | null;
}

export interface GameEvent {
  id: string;
  sequence: number;
  round: number;
  type: string;
  message: string;
  visibility: "PUBLIC" | "SELF";
  visibleToSeat?: number;
}

export interface SpeechRecord {
  seatNo: number;
  nickname: string;
  text: string;
  round: number;
}

export interface SeerResult {
  seerSeat: number;
  targetSeat: number;
  isWerewolf: boolean;
  round: number;
}

export interface WitchResources {
  seatNo: number;
  antidoteAvailable: boolean;
  poisonAvailable: boolean;
}

export interface GameState {
  phase: GamePhase;
  round: number;
  humanSeat: number;
  players: GamePlayerState[];
  events: GameEvent[];
  initialVillagerCount: number;
  initialGodCount: number;
  rngSeed: number;
  wolfTargetSeat: number | null;
  seerTargetSeat: number | null;
  witchSaved: boolean;
  poisonTargetSeat: number | null;
  seerResults: SeerResult[];
  witchResources: WitchResources | null;
  votes: Record<string, number | null>;
  revote: boolean;
  tieCandidates: number[];
  pendingHunterSeat: number | null;
  hunterSource: "NIGHT" | "VOTE" | null;
  winner: "GOOD" | "WEREWOLF" | null;
  speechOrder: number[];
  speechIndex: number;
  currentSpeakerSeat: number | null;
  speeches: SpeechRecord[];
  turnDeadlineAt: string | null;
  previousFirstSpeakerSeat: number | null;
}

export interface CreateGameStateInput {
  humanSeat: number;
  participants: GameParticipant[];
  roleConfig: RoleConfig;
  seed: string;
  currentTime?: string;
}

export type HumanAction =
  | { type: "WOLF_KILL"; targetSeat: number }
  | { type: "SEER_CHECK"; targetSeat: number }
  | {
      type: "WITCH_ACTION";
      save: boolean;
      poisonTargetSeat: number | null;
    }
  | { type: "HUNTER_SHOOT"; targetSeat: number }
  | { type: "VOTE"; targetSeat: number | null }
  | { type: "SPEAK"; text: string }
  | { type: "SKIP_SPEECH" };

export interface LegalAction {
  type: HumanAction["type"];
  targetSeats: number[];
  canSave?: boolean;
}

export class RuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RuleError";
  }
}

const GOD_ROLES = new Set<GameRole>(["SEER", "WITCH", "HUNTER"]);
const AI_SPEECH_LINES = [
  "我先听听大家的判断。",
  "目前信息还不够，我暂时保留意见。",
  "请下一位说说自己的看法。",
  "这一轮先别急着下结论，我想再听一轮。",
] as const;
const SPEECH_DURATION_SECONDS = 60;

function hashSeed(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function nextRandom(state: GameState): number {
  state.rngSeed = (state.rngSeed + 0x6d2b79f5) >>> 0;
  let value = state.rngSeed;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
}

function randomItem<T>(state: GameState, values: readonly T[]): T | null {
  if (values.length === 0) {
    return null;
  }
  return values[Math.floor(nextRandom(state) * values.length)] ?? null;
}

function buildRoleDeck(config: RoleConfig): GameRole[] {
  return [
    ...Array<GameRole>(config.werewolf).fill("WEREWOLF"),
    ...Array<GameRole>(config.villager).fill("VILLAGER"),
    ...Array<GameRole>(config.seer).fill("SEER"),
    ...Array<GameRole>(config.witch).fill("WITCH"),
    ...Array<GameRole>(config.hunter).fill("HUNTER"),
  ];
}

function shuffle<T>(state: GameState, values: T[]): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom(state) * (index + 1));
    const current = values[index];
    const target = values[swapIndex];
    if (current === undefined || target === undefined) {
      continue;
    }
    values[index] = target;
    values[swapIndex] = current;
  }
  return values;
}

function addEvent(
  state: GameState,
  type: string,
  message: string,
  visibility: GameEvent["visibility"] = "PUBLIC",
  visibleToSeat?: number,
): void {
  state.events.push({
    id: `event-${state.events.length + 1}`,
    sequence: state.events.length + 1,
    round: state.round,
    type,
    message,
    visibility,
    visibleToSeat,
  });
}

function playerBySeat(state: GameState, seatNo: number): GamePlayerState {
  const player = state.players.find((item) => item.seatNo === seatNo);
  if (!player) {
    throw new RuleError("PLAYER_NOT_FOUND", "席位不存在");
  }
  return player;
}

function alivePlayers(state: GameState): GamePlayerState[] {
  return state.players.filter((player) => player.alive);
}

function aliveOtherPlayers(
  state: GameState,
  seatNo: number,
): GamePlayerState[] {
  return alivePlayers(state).filter((player) => player.seatNo !== seatNo);
}

function markDead(
  state: GameState,
  seatNo: number,
  cause: GamePlayerState["deathCause"],
): void {
  const player = playerBySeat(state, seatNo);
  if (!player.alive) {
    return;
  }
  player.alive = false;
  player.deathCause = cause;
}

function checkWinner(state: GameState): boolean {
  const alive = alivePlayers(state);
  const wolves = alive.filter((player) => player.role === "WEREWOLF");
  const villagers = alive.filter((player) => player.role === "VILLAGER");
  const gods = alive.filter((player) => GOD_ROLES.has(player.role));

  if (wolves.length === 0) {
    state.winner = "GOOD";
    state.phase = "GAME_OVER";
    addEvent(state, "GAME_OVER", "所有狼人出局，好人阵营获胜");
    return true;
  }

  const wolvesEliminatedVillage =
    state.initialVillagerCount > 0 && villagers.length === 0;
  const wolvesEliminatedGods = state.initialGodCount > 0 && gods.length === 0;
  const wolvesOutnumberGood = wolves.length >= alive.length - wolves.length;
  if (
    wolvesEliminatedVillage ||
    wolvesEliminatedGods ||
    wolvesOutnumberGood
  ) {
    state.winner = "WEREWOLF";
    state.phase = "GAME_OVER";
    addEvent(state, "GAME_OVER", "狼人阵营达成屠边，狼人获胜");
    return true;
  }

  return false;
}

function resetNight(state: GameState): void {
  state.wolfTargetSeat = null;
  state.seerTargetSeat = null;
  state.witchSaved = false;
  state.poisonTargetSeat = null;
  state.votes = {};
  state.revote = false;
  state.tieCandidates = [];
  state.pendingHunterSeat = null;
  state.hunterSource = null;
  state.speechOrder = [];
  state.speechIndex = 0;
  state.currentSpeakerSeat = null;
  state.turnDeadlineAt = null;
  state.phase = "NIGHT_WEREWOLF";
}

function beginNextNight(state: GameState): void {
  if (checkWinner(state)) {
    return;
  }

  state.round += 1;
  resetNight(state);
  addEvent(state, "NIGHT_STARTED", `第 ${state.round} 夜开始`);
}

function beginDaySpeech(state: GameState, nowIso: string): void {
  if (checkWinner(state)) {
    return;
  }

  const alive = alivePlayers(state)
    .map((player) => player.seatNo)
    .sort((left, right) => left - right);
  if (alive.length === 0) {
    return;
  }

  let firstSeat: number;
  if (state.previousFirstSpeakerSeat === null) {
    firstSeat = randomItem(state, alive) ?? alive[0] ?? 1;
  } else {
    firstSeat =
      alive.find((seatNo) => seatNo > state.previousFirstSpeakerSeat!) ??
      alive[0] ??
      state.previousFirstSpeakerSeat;
  }
  state.previousFirstSpeakerSeat = firstSeat;
  const firstIndex = alive.indexOf(firstSeat);
  state.speechOrder = [
    ...alive.slice(firstIndex),
    ...alive.slice(0, firstIndex),
  ];
  state.speechIndex = 0;
  state.currentSpeakerSeat = state.speechOrder[0] ?? null;
  state.turnDeadlineAt = null;
  state.phase = "DAY_SPEECH";
  addEvent(
    state,
    "SPEECH_STARTED",
    `第 ${state.round} 天发言开始，发言顺序：${state.speechOrder
      .map((seatNo) => `${seatNo} 号`)
      .join(" → ")}`,
  );
  prepareHumanSpeechDeadline(state, nowIso);
}

function prepareHumanSpeechDeadline(
  state: GameState,
  nowIso: string,
): void {
  const current = state.currentSpeakerSeat;
  if (current === null) {
    state.turnDeadlineAt = null;
    return;
  }
  const speaker = playerBySeat(state, current);
  state.turnDeadlineAt =
    !speaker.isAi && speaker.alive
      ? new Date(
          new Date(nowIso).getTime() + SPEECH_DURATION_SECONDS * 1_000,
        ).toISOString()
      : null;
}

function recordSpeech(
  state: GameState,
  speaker: GamePlayerState,
  text: string,
): void {
  state.speeches.push({
    seatNo: speaker.seatNo,
    nickname: speaker.nickname,
    text,
    round: state.round,
  });
  addEvent(
    state,
    "SPEECH",
    `${speaker.nickname}：${text}`,
    "PUBLIC",
  );
}

function advanceSpeech(state: GameState, nowIso: string): void {
  state.speechIndex += 1;
  const nextSeat = state.speechOrder[state.speechIndex];
  if (nextSeat === undefined) {
    state.currentSpeakerSeat = null;
    state.turnDeadlineAt = null;
    state.phase = "DAY_VOTE";
    state.votes = {};
    state.revote = false;
    state.tieCandidates = [];
    addEvent(
      state,
      "VOTE_STARTED",
      `第 ${state.round} 天放逐投票开始`,
    );
    return;
  }

  state.currentSpeakerSeat = nextSeat;
  prepareHumanSpeechDeadline(state, nowIso);
}

function finishNight(state: GameState, nowIso: string): void {
  const deaths: Array<{ seatNo: number; cause: "WOLF" | "POISON" }> = [];
  if (state.wolfTargetSeat !== null && !state.witchSaved) {
    deaths.push({ seatNo: state.wolfTargetSeat, cause: "WOLF" });
  }
  if (state.poisonTargetSeat !== null) {
    deaths.push({ seatNo: state.poisonTargetSeat, cause: "POISON" });
  }

  for (const death of deaths) {
    const player = playerBySeat(state, death.seatNo);
    const wasAlive = player.alive;
    markDead(state, death.seatNo, death.cause);
    if (wasAlive && player.role === "HUNTER" && death.cause === "WOLF") {
      state.pendingHunterSeat = death.seatNo;
    }
  }

  if (deaths.length === 0) {
    addEvent(state, "DAY_BREAK", `第 ${state.round} 天，昨夜无人出局`);
  } else {
    addEvent(
      state,
      "DAY_BREAK",
      `第 ${state.round} 天，${deaths
        .map((death) => `${death.seatNo} 号`)
        .join("、")}出局`,
    );
  }

  if (state.pendingHunterSeat !== null) {
    state.hunterSource = "NIGHT";
    state.phase = "HUNTER_SHOOT";
    return;
  }

  if (!checkWinner(state)) {
    beginDaySpeech(state, nowIso);
  }
}

function castAiVotes(state: GameState): void {
  for (const player of alivePlayers(state)) {
    if (!player.isAi || Object.hasOwn(state.votes, String(player.seatNo))) {
      continue;
    }

    const candidates = state.revote
      ? alivePlayers(state).filter((candidate) =>
          state.tieCandidates.includes(candidate.seatNo),
        )
      : aliveOtherPlayers(state, player.seatNo);
    const target = randomItem(state, candidates);
    state.votes[String(player.seatNo)] = target?.seatNo ?? null;
  }
}

function finishVote(state: GameState): void {
  castAiVotes(state);
  const tally = new Map<number, number>();
  for (const targetSeat of Object.values(state.votes)) {
    if (targetSeat !== null) {
      tally.set(targetSeat, (tally.get(targetSeat) ?? 0) + 1);
    }
  }

  if (tally.size === 0) {
    addEvent(state, "VOTE_RESULT", "本轮无人形成有效票型，无人出局");
    beginNextNight(state);
    return;
  }

  const highest = Math.max(...tally.values());
  const topSeats = [...tally.entries()]
    .filter(([, count]) => count === highest)
    .map(([seatNo]) => seatNo)
    .sort((left, right) => left - right);

  if (topSeats.length > 1) {
    if (!state.revote) {
      state.revote = true;
      state.tieCandidates = topSeats;
      state.votes = {};
      addEvent(
        state,
        "VOTE_TIED",
        `投票平票：${topSeats.map((seat) => `${seat} 号`).join("、")}，进入再次投票`,
      );
      return;
    }

    addEvent(state, "VOTE_RESULT", "再次投票仍然平票，本轮无人出局");
    beginNextNight(state);
    return;
  }

  const exiledSeat = topSeats[0];
  if (exiledSeat === undefined) {
    return;
  }

  const exiled = playerBySeat(state, exiledSeat);
  markDead(state, exiledSeat, "VOTE");
  addEvent(
    state,
    "VOTE_RESULT",
    `${exiled.nickname} 被放逐，身份是${roleLabel(exiled.role)}`,
  );

  if (exiled.role === "HUNTER") {
    state.pendingHunterSeat = exiledSeat;
    state.hunterSource = "VOTE";
    state.phase = "HUNTER_SHOOT";
    return;
  }

  beginNextNight(state);
}

function resolveAiHunter(state: GameState, nowIso: string): void {
  const hunterSeat = state.pendingHunterSeat;
  if (hunterSeat === null) {
    return;
  }

  const target = randomItem(state, alivePlayers(state));
  state.pendingHunterSeat = null;
  if (target) {
    markDead(state, target.seatNo, null);
    addEvent(
      state,
      "HUNTER_SHOOT",
      `${playerBySeat(state, hunterSeat).nickname} 发动猎枪，${target.nickname} 出局`,
    );
  }
  const source = state.hunterSource;
  state.hunterSource = null;
  if (source === "NIGHT") {
    beginDaySpeech(state, nowIso);
  } else {
    beginNextNight(state);
  }
}

function advanceAutomated(
  state: GameState,
  nowIso: string = new Date().toISOString(),
): void {
  for (let step = 0; step < 200; step += 1) {
    if (state.phase === "GAME_OVER") {
      return;
    }

    const human = state.players.find(
      (player) => player.seatNo === state.humanSeat,
    );

    if (state.phase === "NIGHT_WEREWOLF") {
      if (human?.alive && !human.isAi && human.role === "WEREWOLF") {
        return;
      }
      const target = randomItem(
        state,
        alivePlayers(state).filter((player) => player.role !== "WEREWOLF"),
      );
      state.wolfTargetSeat = target?.seatNo ?? null;
      state.phase = "NIGHT_SEER";
      continue;
    }

    if (state.phase === "NIGHT_SEER") {
      if (human?.alive && !human.isAi && human.role === "SEER") {
        return;
      }
      const seer = alivePlayers(state).find((player) => player.role === "SEER");
      if (seer) {
        const target = randomItem(state, aliveOtherPlayers(state, seer.seatNo));
        if (target) {
          state.seerTargetSeat = target.seatNo;
          const result: SeerResult = {
            seerSeat: seer.seatNo,
            targetSeat: target.seatNo,
            isWerewolf: target.role === "WEREWOLF",
            round: state.round,
          };
          state.seerResults.push(result);
          addEvent(
            state,
            "SEER_CHECK",
            `${target.nickname} 是${result.isWerewolf ? "狼人" : "好人"}`,
            "SELF",
            seer.seatNo,
          );
        }
      }
      state.phase = "NIGHT_WITCH";
      continue;
    }

    if (state.phase === "NIGHT_WITCH") {
      if (human?.alive && !human.isAi && human.role === "WITCH") {
        return;
      }
      const witch = alivePlayers(state).find((player) => player.role === "WITCH");
      if (
        witch &&
        state.witchResources?.seatNo === witch.seatNo
      ) {
        if (
          state.witchResources.antidoteAvailable &&
          state.wolfTargetSeat !== null &&
          state.wolfTargetSeat !== witch.seatNo &&
          nextRandom(state) < 0.3
        ) {
          state.witchSaved = true;
          state.witchResources.antidoteAvailable = false;
        } else if (
          state.witchResources.poisonAvailable &&
          nextRandom(state) < 0.12
        ) {
          const poisonTarget = randomItem(
            state,
            aliveOtherPlayers(state, witch.seatNo),
          );
          if (poisonTarget) {
            state.poisonTargetSeat = poisonTarget.seatNo;
            state.witchResources.poisonAvailable = false;
          }
        }
      }
      finishNight(state, nowIso);
      continue;
    }

    if (state.phase === "DAY_SPEECH") {
      const speakerSeat = state.currentSpeakerSeat;
      if (speakerSeat === null) {
        advanceSpeech(state, nowIso);
        continue;
      }
      const speaker = playerBySeat(state, speakerSeat);
      if (!speaker.isAi) {
        prepareHumanSpeechDeadline(state, nowIso);
        return;
      }

      state.turnDeadlineAt = null;
      const text =
        randomItem(state, AI_SPEECH_LINES) ?? AI_SPEECH_LINES[0];
      recordSpeech(state, speaker, text);
      advanceSpeech(state, nowIso);
      continue;
    }

    if (state.phase === "HUNTER_SHOOT") {
      if (
        human &&
        !human.isAi &&
        state.pendingHunterSeat === state.humanSeat &&
        human.role === "HUNTER"
      ) {
        return;
      }
      resolveAiHunter(state, nowIso);
      continue;
    }

    if (state.phase === "DAY_VOTE") {
      if (human?.alive && !human.isAi) {
        return;
      }
      castAiVotes(state);
      finishVote(state);
      continue;
    }
  }

  throw new RuleError("GAME_STALLED", "游戏状态机未能继续推进");
}

export function createGameState(input: CreateGameStateInput): GameState {
  const roleDeck = buildRoleDeck(input.roleConfig);
  if (roleDeck.length !== input.participants.length) {
    throw new RuleError(
      "ROLE_DECK_MISMATCH",
      "角色数量必须与参与人数一致",
    );
  }

  const initial: GameState = {
    phase: "NIGHT_WEREWOLF",
    round: 1,
    humanSeat: input.humanSeat,
    players: [],
    events: [],
    initialVillagerCount: input.roleConfig.villager,
    initialGodCount:
      input.roleConfig.seer + input.roleConfig.witch + input.roleConfig.hunter,
    rngSeed: hashSeed(input.seed),
    wolfTargetSeat: null,
    seerTargetSeat: null,
    witchSaved: false,
    poisonTargetSeat: null,
    seerResults: [],
    witchResources: null,
    votes: {},
    revote: false,
    tieCandidates: [],
    pendingHunterSeat: null,
    hunterSource: null,
    winner: null,
    speechOrder: [],
    speechIndex: 0,
    currentSpeakerSeat: null,
    speeches: [],
    turnDeadlineAt: null,
    previousFirstSpeakerSeat: null,
  };

  const shuffledRoles = shuffle(initial, [...roleDeck]);
  initial.players = input.participants
    .slice()
    .sort((left, right) => left.seatNo - right.seatNo)
    .map((participant, index) => ({
      ...participant,
      role: shuffledRoles[index] ?? "VILLAGER",
      alive: true,
      deathCause: null,
    }));

  const witch = initial.players.find((player) => player.role === "WITCH");
  if (witch) {
    initial.witchResources = {
      seatNo: witch.seatNo,
      antidoteAvailable: true,
      poisonAvailable: true,
    };
  }

  addEvent(initial, "GAME_STARTED", "身份分配完成，第 1 夜开始");
  advanceAutomated(initial, input.currentTime);
  return initial;
}

function roleLabel(role: GameRole): string {
  const labels: Record<GameRole, string> = {
    WEREWOLF: "狼人",
    VILLAGER: "村民",
    SEER: "预言家",
    WITCH: "女巫",
    HUNTER: "猎人",
  };
  return labels[role];
}

export function getLegalAction(
  state: GameState,
): LegalAction | null {
  const human = playerBySeat(state, state.humanSeat);
  const otherAlive = aliveOtherPlayers(state, human.seatNo);

  if (state.phase === "NIGHT_WEREWOLF" && human.alive && human.role === "WEREWOLF") {
    return {
      type: "WOLF_KILL",
      targetSeats: otherAlive
        .filter((player) => player.role !== "WEREWOLF")
        .map((player) => player.seatNo),
    };
  }

  if (state.phase === "NIGHT_SEER" && human.alive && human.role === "SEER") {
    return {
      type: "SEER_CHECK",
      targetSeats: otherAlive.map((player) => player.seatNo),
    };
  }

  if (state.phase === "NIGHT_WITCH" && human.alive && human.role === "WITCH") {
    return {
      type: "WITCH_ACTION",
      targetSeats: otherAlive.map((player) => player.seatNo),
      canSave:
        state.witchResources?.antidoteAvailable === true &&
        state.wolfTargetSeat !== null &&
        state.wolfTargetSeat !== human.seatNo,
    };
  }

  if (state.phase === "HUNTER_SHOOT" && state.pendingHunterSeat === human.seatNo) {
    return {
      type: "HUNTER_SHOOT",
      targetSeats: alivePlayers(state).map((player) => player.seatNo),
    };
  }

  if (state.phase === "DAY_VOTE" && human.alive) {
    const candidates = state.revote
      ? alivePlayers(state).filter((player) =>
          state.tieCandidates.includes(player.seatNo),
        )
      : otherAlive;
    return {
      type: "VOTE",
      targetSeats: candidates.map((player) => player.seatNo),
    };
  }

  if (
    state.phase === "DAY_SPEECH" &&
    state.currentSpeakerSeat === human.seatNo &&
    human.alive
  ) {
    return {
      type: "SPEAK",
      targetSeats: [],
    };
  }

  return null;
}

function assertTargetAlive(state: GameState, targetSeat: number): void {
  if (!playerBySeat(state, targetSeat).alive) {
    throw new RuleError("TARGET_DEAD", "目标玩家已经出局");
  }
}

export function submitHumanAction(
  state: GameState,
  actorSeat: number,
  action: HumanAction,
  nowIso: string = new Date().toISOString(),
): GameState {
  if (actorSeat !== state.humanSeat) {
    throw new RuleError("NOT_YOUR_ACTION", "不能操作其他席位");
  }

  const legal = getLegalAction(state);
  if (
    !legal ||
    (legal.type !== action.type && action.type !== "SKIP_SPEECH")
  ) {
    throw new RuleError("ACTION_NOT_ALLOWED", "当前阶段不能执行该操作");
  }

  if (action.type === "SPEAK" || action.type === "SKIP_SPEECH") {
    if (
      state.phase !== "DAY_SPEECH" ||
      state.currentSpeakerSeat !== actorSeat
    ) {
      throw new RuleError("NOT_CURRENT_SPEAKER", "当前不是你的发言回合");
    }

    const speaker = playerBySeat(state, actorSeat);
    const text =
      action.type === "SPEAK" ? action.text.trim() : "本轮跳过发言";
    if (text.length < 1 || text.length > 300) {
      throw new RuleError(
        "SPEECH_INVALID",
        "发言内容应为 1～300 个字符",
      );
    }
    recordSpeech(state, speaker, text);
    advanceSpeech(state, nowIso);
  } else if (action.type === "WOLF_KILL") {
    assertTargetAlive(state, action.targetSeat);
    if (playerBySeat(state, action.targetSeat).role === "WEREWOLF") {
      throw new RuleError("TARGET_INVALID", "狼人不能袭击狼人");
    }
    state.wolfTargetSeat = action.targetSeat;
    state.phase = "NIGHT_SEER";
  } else if (action.type === "SEER_CHECK") {
    assertTargetAlive(state, action.targetSeat);
    if (action.targetSeat === actorSeat) {
      throw new RuleError("TARGET_INVALID", "预言家不能查验自己");
    }
    const target = playerBySeat(state, action.targetSeat);
    state.seerTargetSeat = target.seatNo;
    const result: SeerResult = {
      seerSeat: actorSeat,
      targetSeat: target.seatNo,
      isWerewolf: target.role === "WEREWOLF",
      round: state.round,
    };
    state.seerResults.push(result);
    addEvent(
      state,
      "SEER_CHECK",
      `${target.nickname} 是${result.isWerewolf ? "狼人" : "好人"}`,
      "SELF",
      actorSeat,
    );
    state.phase = "NIGHT_WITCH";
  } else if (action.type === "WITCH_ACTION") {
    const resources = state.witchResources;
    if (!resources || resources.seatNo !== actorSeat) {
      throw new RuleError("ACTION_NOT_ALLOWED", "当前玩家不是女巫");
    }
    if (action.save && action.poisonTargetSeat !== null) {
      throw new RuleError("TARGET_INVALID", "一晚只能使用一种药");
    }
    if (action.save) {
      if (
        !resources.antidoteAvailable ||
        state.wolfTargetSeat === null ||
        state.wolfTargetSeat === actorSeat
      ) {
        throw new RuleError("ACTION_NOT_ALLOWED", "当前不能使用解药");
      }
      state.witchSaved = true;
      resources.antidoteAvailable = false;
    }
    if (action.poisonTargetSeat !== null) {
      if (!resources.poisonAvailable) {
        throw new RuleError("ACTION_NOT_ALLOWED", "毒药已经使用");
      }
      assertTargetAlive(state, action.poisonTargetSeat);
      if (action.poisonTargetSeat === actorSeat) {
        throw new RuleError("TARGET_INVALID", "女巫不能毒杀自己");
      }
      state.poisonTargetSeat = action.poisonTargetSeat;
      resources.poisonAvailable = false;
    }
    finishNight(state, nowIso);
  } else if (action.type === "HUNTER_SHOOT") {
    if (state.pendingHunterSeat !== actorSeat) {
      throw new RuleError("ACTION_NOT_ALLOWED", "当前不能发动猎枪");
    }
    assertTargetAlive(state, action.targetSeat);
    const target = playerBySeat(state, action.targetSeat);
    markDead(state, action.targetSeat, null);
    state.pendingHunterSeat = null;
    addEvent(
      state,
      "HUNTER_SHOOT",
      `${playerBySeat(state, actorSeat).nickname} 发动猎枪，${target.nickname} 出局`,
    );
    const source = state.hunterSource;
    state.hunterSource = null;
    if (source === "NIGHT") {
      beginDaySpeech(state, nowIso);
    } else {
      beginNextNight(state);
    }
  } else {
    if (
      action.targetSeat !== null &&
      !legal.targetSeats.includes(action.targetSeat)
    ) {
      throw new RuleError("TARGET_INVALID", "投票目标无效");
    }
    state.votes[String(actorSeat)] = action.targetSeat;
    finishVote(state);
  }

  advanceAutomated(state, nowIso);
  return state;
}

export function createBotGame(input: CreateGameStateInput): GameState {
  const state = createGameState(input);
  advanceAutomated(state, input.currentTime);
  return state;
}

export function expireHumanSpeechTurn(
  state: GameState,
  nowIso: string = new Date().toISOString(),
): boolean {
  if (
    state.phase !== "DAY_SPEECH" ||
    state.currentSpeakerSeat !== state.humanSeat ||
    !state.turnDeadlineAt ||
    new Date(state.turnDeadlineAt).getTime() > new Date(nowIso).getTime()
  ) {
    return false;
  }

  const speaker = playerBySeat(state, state.humanSeat);
  if (speaker.isAi || !speaker.alive) {
    return false;
  }

  recordSpeech(state, speaker, "发言超时，自动跳过");
  advanceSpeech(state, nowIso);
  advanceAutomated(state, nowIso);
  return true;
}
