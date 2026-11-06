export interface ServerEnvironment {
  host: string;
  port: number;
  contractVersion: string;
  logLevel: string;
  databaseDriver: "sqlite" | "postgres";
  databasePath: string;
  databaseUrl: string;
  sessionTtlDays: number;
  wechatAuthMode: "mock" | "live";
  wechatAppId: string;
  wechatAppSecret: string;
  wechatMockOpenId: string;
}

function readInteger(
  value: string | undefined,
  fallback: number,
  field: string,
  min: number,
  max: number,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid ${field} value: ${value ?? ""}`);
  }

  return parsed;
}

function readWechatAuthMode(value: string | undefined): "mock" | "live" {
  const mode = value ?? "mock";
  if (mode !== "mock" && mode !== "live") {
    throw new Error(`WECHAT_AUTH_MODE must be "mock" or "live": ${mode}`);
  }

  return mode;
}

function readDatabaseDriver(value: string | undefined): "sqlite" | "postgres" {
  const driver = value ?? "sqlite";
  if (driver !== "sqlite" && driver !== "postgres") {
    throw new Error(
      `DATABASE_DRIVER must be "sqlite" or "postgres": ${driver}`,
    );
  }

  return driver;
}

export function getServerEnvironment(): ServerEnvironment {
  const wechatAuthMode = readWechatAuthMode(process.env.WECHAT_AUTH_MODE);
  const databaseDriver = readDatabaseDriver(process.env.DATABASE_DRIVER);

  return {
    host: process.env.HOST ?? "0.0.0.0",
    port: readInteger(process.env.PORT, 3000, "PORT", 1, 65535),
    contractVersion: process.env.CONTRACT_VERSION ?? "1.0",
    logLevel: process.env.LOG_LEVEL ?? "info",
    databaseDriver,
    databasePath: process.env.DATABASE_PATH ?? "./data/werewolf.db",
    databaseUrl: process.env.DATABASE_URL ?? "",
    sessionTtlDays: readInteger(
      process.env.SESSION_TTL_DAYS,
      30,
      "SESSION_TTL_DAYS",
      1,
      365,
    ),
    wechatAuthMode,
    wechatAppId: process.env.WECHAT_APP_ID ?? "",
    wechatAppSecret: process.env.WECHAT_APP_SECRET ?? "",
    wechatMockOpenId:
      process.env.WECHAT_MOCK_OPENID ?? "mock-openid-local",
  };
}
