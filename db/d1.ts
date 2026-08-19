import { env } from "cloudflare:workers";

import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from "./schema";

type RuntimeEnv = {
  DB?: D1Database;
};

let schemaInitialization: Promise<void> | undefined;

export function getD1(): D1Database {
  const database = (env as unknown as RuntimeEnv).DB;
  if (!database) {
    throw new Error("D1_BINDING_UNAVAILABLE");
  }
  return database;
}

export async function ensureSchema(): Promise<D1Database> {
  const database = getD1();

  if (!schemaInitialization) {
    schemaInitialization = (async () => {
      await database.batch(
        SCHEMA_STATEMENTS.map((statement) => database.prepare(statement)),
      );

      const now = new Date().toISOString();
      await database
        .prepare(
          `INSERT INTO taid_schema_migrations (version, applied_at)
           VALUES (?, ?)
           ON CONFLICT(version) DO NOTHING`,
        )
        .bind(SCHEMA_VERSION, now)
        .run();

      await database.prepare("PRAGMA optimize").run();
    })().catch((error) => {
      schemaInitialization = undefined;
      throw error;
    });
  }

  await schemaInitialization;
  return database;
}

