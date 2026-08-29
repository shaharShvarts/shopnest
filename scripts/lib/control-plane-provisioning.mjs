import { Pool } from "pg";
import {
  assertMigrationHash,
  readDrizzleMigrations,
} from "./tenant-provisioning.mjs";

const HISTORY_TABLE = 'public."__shopnest_control_migrations"';

export async function provisionControlPlane({ databaseUrl, migrationsFolder }) {
  const migrations = await readDrizzleMigrations(migrationsFolder);
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('shopnest:control-plane'))"
    );
    await client.query("SET LOCAL search_path TO public, pg_catalog");
    const currentSchema = await client.query(
      "SELECT current_schema() AS schema"
    );
    if (currentSchema.rows[0]?.schema !== "public") {
      throw new Error("Refusing to migrate outside the public schema");
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${HISTORY_TABLE} (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT UNIQUE NOT NULL
      )
    `);

    for (const migration of migrations) {
      const existing = await client.query(
        `SELECT hash FROM ${HISTORY_TABLE} WHERE created_at = $1 LIMIT 1`,
        [migration.createdAt]
      );
      if (existing.rowCount > 0) {
        assertMigrationHash(
          migration.fileName,
          existing.rows[0].hash,
          migration.sql
        );
        continue;
      }

      await client.query(migration.sql);
      await client.query(
        `INSERT INTO ${HISTORY_TABLE} (hash, created_at) VALUES ($1, $2)`,
        [migration.hash, migration.createdAt]
      );
    }

    await client.query("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
