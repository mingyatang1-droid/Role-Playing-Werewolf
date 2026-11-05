export interface ServerEnvironment {
  host: string;
  port: number;
  contractVersion: string;
  logLevel: string;
}

function readPort(value: string | undefined): number {
  const parsed = Number(value ?? 3000);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT value: ${value ?? ""}`);
  }

  return parsed;
}

export function getServerEnvironment(): ServerEnvironment {
  return {
    host: process.env.HOST ?? "0.0.0.0",
    port: readPort(process.env.PORT),
    contractVersion: process.env.CONTRACT_VERSION ?? "1.0",
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
