export const ROLE_KEYS = [
  "werewolf",
  "villager",
  "seer",
  "witch",
  "hunter",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export interface RoleConfig {
  werewolf: number;
  villager: number;
  seer: number;
  witch: number;
  hunter: number;
}

export interface RoleMeta {
  key: RoleKey;
  label: string;
  description: string;
  color: string;
  unique: boolean;
}

export const ROLE_META: readonly RoleMeta[] = [
  {
    key: "werewolf",
    label: "狼人",
    description: "夜晚袭击",
    color: "#b44a55",
    unique: false,
  },
  {
    key: "villager",
    label: "村民",
    description: "白天推理",
    color: "#8d9aab",
    unique: false,
  },
  {
    key: "seer",
    label: "预言家",
    description: "查验阵营",
    color: "#6fa8dc",
    unique: true,
  },
  {
    key: "witch",
    label: "女巫",
    description: "解药与毒药",
    color: "#a984d8",
    unique: true,
  },
  {
    key: "hunter",
    label: "猎人",
    description: "出局开枪",
    color: "#d8a657",
    unique: true,
  },
];

const TEMPLATES: Record<number, RoleConfig> = {
  6: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0 },
  7: { werewolf: 2, villager: 3, seer: 1, witch: 1, hunter: 0 },
  8: { werewolf: 2, villager: 4, seer: 1, witch: 1, hunter: 0 },
  9: { werewolf: 3, villager: 3, seer: 1, witch: 1, hunter: 1 },
  10: { werewolf: 3, villager: 4, seer: 1, witch: 1, hunter: 1 },
  11: { werewolf: 3, villager: 5, seer: 1, witch: 1, hunter: 1 },
  12: { werewolf: 4, villager: 5, seer: 1, witch: 1, hunter: 1 },
};

export function createRoleTemplate(totalSeats: number): RoleConfig {
  const template: RoleConfig =
    TEMPLATES[totalSeats] ?? {
      werewolf: 3,
      villager: 3,
      seer: 1,
      witch: 1,
      hunter: 1,
    };
  return { ...template };
}

export function roleTotal(roles: RoleConfig): number {
  return ROLE_KEYS.reduce((sum, key) => sum + roles[key], 0);
}

export function validateRoleConfig(
  totalSeats: number,
  roles: RoleConfig,
): string | null {
  const assigned = roleTotal(roles);
  if (assigned !== totalSeats) {
    return `已配置 ${assigned} 人，还需要调整 ${Math.abs(totalSeats - assigned)} 人`;
  }
  if (roles.werewolf < 1) {
    return "至少需要 1 名狼人";
  }
  if (roles.villager + roles.seer + roles.witch + roles.hunter < 1) {
    return "至少需要 1 名非狼人";
  }
  if (roles.seer > 1 || roles.witch > 1 || roles.hunter > 1) {
    return "预言家、女巫和猎人最多各 1 名";
  }
  return null;
}
