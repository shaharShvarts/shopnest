import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const SAFE_SCHEMA_PATTERN = /^[a-z0-9_]+$/;
const MIGRATIONS_TABLE = "__drizzle_migrations";

export function assertSafeTenantSchema(schema) {
  if (
    typeof schema !== "string" ||
    !SAFE_SCHEMA_PATTERN.test(schema) ||
    schema.length > 63 ||
    schema === "public"
  ) {
    throw new Error(`Unsafe tenant schema: ${String(schema)}`);
  }
}

function quoteIdentifier(identifier) {
  assertSafeTenantSchema(identifier);
  return `"${identifier}"`;
}

export function scopeMigrationSql(sql, schema) {
  assertSafeTenantSchema(schema);

  const scopedSql = sql.replaceAll('"public".', `${quoteIdentifier(schema)}.`);
  if (/\bpublic\s*\./i.test(scopedSql)) {
    throw new Error("Migration still contains a public-schema reference");
  }

  return scopedSql;
}

export function normalizeMigrationSql(sql) {
  return sql.replace(/\r\n?/g, "\n");
}

export function hashMigrationSql(sql) {
  return createHash("sha256")
    .update(normalizeMigrationSql(sql))
    .digest("hex");
}

export function assertMigrationHash(fileName, storedHash, sql) {
  if (storedHash !== hashMigrationSql(sql)) {
    throw new Error(`Migration ${fileName} changed after it was applied`);
  }
}

export async function readDrizzleMigrations(migrationsFolder) {
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  const journalByTag = new Map(
    journal.entries.map((entry) => [entry.tag, entry])
  );
  const fileNames = (await readdir(migrationsFolder))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  if (fileNames.length === 0) {
    throw new Error(`No Drizzle SQL migrations found in ${migrationsFolder}`);
  }

  return Promise.all(
    fileNames.map(async (fileName) => {
      const tag = fileName.slice(0, -".sql".length);
      const journalEntry = journalByTag.get(tag);
      if (!journalEntry) {
        throw new Error(`Migration ${fileName} is missing from the journal`);
      }

      const sql = await readFile(path.join(migrationsFolder, fileName), "utf8");
      return {
        fileName,
        hash: hashMigrationSql(sql),
        createdAt: journalEntry.when,
        sql,
      };
    })
  );
}

export async function provisionTenant({
  tenant,
  databaseUrl,
  migrationsFolder,
}) {
  assertSafeTenantSchema(tenant.schema);

  const migrations = await readDrizzleMigrations(migrationsFolder);
  const schemaIdentifier = quoteIdentifier(tenant.schema);
  const historyTable = `${schemaIdentifier}."${MIGRATIONS_TABLE}"`;
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `shopnest:tenant:${tenant.schema}`,
    ]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaIdentifier}`);
    await client.query(
      `SET LOCAL search_path TO ${schemaIdentifier}, pg_catalog`
    );

    const currentSchema = await client.query(
      "SELECT current_schema() AS schema"
    );
    if (currentSchema.rows[0]?.schema !== tenant.schema) {
      throw new Error(
        `Refusing to migrate unexpected schema: ${String(
          currentSchema.rows[0]?.schema
        )}`
      );
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${historyTable} (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT
      )
    `);

    for (const migration of migrations) {
      const existing = await client.query(
        `SELECT hash FROM ${historyTable} WHERE created_at = $1 LIMIT 1`,
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

      await client.query(scopeMigrationSql(migration.sql, tenant.schema));
      await client.query(
        `INSERT INTO ${historyTable} (hash, created_at) VALUES ($1, $2)`,
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
