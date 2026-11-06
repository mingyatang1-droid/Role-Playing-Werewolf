import { PostgresSessionRepository } from "../auth/postgres-session-repository.js";
import type { SessionRepository } from "../auth/session-repository.js";
import type { ServerEnvironment } from "../config/environment.js";
import { PostgresUserRepository } from "../users/postgres-user-repository.js";
import { SqliteUserRepository } from "../users/user-repository.js";
import type { UserRepository } from "../users/user-repository.js";
import { AppDatabase } from "./database.js";
import { PostgresDatabase } from "./postgres-database.js";
import { SqliteSessionRepository } from "../auth/session-repository.js";
import type { RoomRepository } from "../rooms/room-model.js";
import { PostgresRoomRepository } from "../rooms/postgres-room-repository.js";
import { SqliteRoomRepository } from "../rooms/sqlite-room-repository.js";

export interface PersistenceContext {
  users: UserRepository;
  sessions: SessionRepository;
  rooms: RoomRepository;
  close(): Promise<void>;
}

export async function createPersistence(
  environment: ServerEnvironment,
): Promise<PersistenceContext> {
  if (environment.databaseDriver === "postgres") {
    const database = await PostgresDatabase.connect(environment.databaseUrl);
    return {
      users: new PostgresUserRepository(database.pool),
      sessions: new PostgresSessionRepository(database.pool),
      rooms: new PostgresRoomRepository(database.pool),
      close: () => database.close(),
    };
  }

  const database = new AppDatabase(environment.databasePath);
  return {
    users: new SqliteUserRepository(database),
    sessions: new SqliteSessionRepository(database),
    rooms: new SqliteRoomRepository(database),
    close: async () => database.close(),
  };
}
