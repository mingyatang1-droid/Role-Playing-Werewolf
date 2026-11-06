import { Pool } from "pg";
import { readMigrationSql } from "./database.js";

export class PostgresDatabase {
  readonly pool: Pool;

  private constructor(pool: Pool) {
    this.pool = pool;
  }

  static async connect(databaseUrl: string): Promise<PostgresDatabase> {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required in postgres mode.");
    }

    const pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      connectionTimeoutMillis: 5_000,
    });
    const database = new PostgresDatabase(pool);

    try {
      await pool.query("SELECT 1");
      await pool.query(readMigrationSql());
    } catch (error) {
      await pool.end();
      throw error;
    }

    return database;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
