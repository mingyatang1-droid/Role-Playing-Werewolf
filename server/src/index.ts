import "dotenv/config";
import { buildApp } from "./app.js";
import { getServerEnvironment } from "./config/environment.js";

const environment = getServerEnvironment();
const app = await buildApp();

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({
    host: environment.host,
    port: environment.port,
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
