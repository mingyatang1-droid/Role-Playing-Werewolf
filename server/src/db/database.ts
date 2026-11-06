import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const migrationsDirectory = fileURLToPath(
  new URL("../../migrations/", import.meta.url),
);

export function readMigrationSql(): string {
  return readdirSync(migrationsDirectory)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => readFileSync(join(migrationsDirectory, fileName), "utf8"))
    .join("\n");
}

export class AppDatabase {
  readonly connection: DatabaseSync;

  constructor(databasePath: string) {
    if (databasePath === ":memory:") {
      this.connection = new DatabaseSync(databasePath);
    } else {
      const resolvedPath = resolve(process.cwd(), databasePath);
      mkdirSync(dirname(resolvedPath), { recursive: true });
      this.connection = new DatabaseSync(resolvedPath);
    }

    this.connection.exec("PRAGMA foreign_keys = ON;");
    this.connection.exec(readMigrationSql());
  }

  close(): void {
    this.connection.close();
  }
}
