import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "pg";
import { loadProjectEnv } from "../scripts/lib/load-project-env.mjs";
import { resolveDatabaseUrl } from "../src/data/env/database-url.mjs";
import {
  readDrizzleMigrations,
  scopeMigrationSql,
} from "../scripts/lib/tenant-provisioning.mjs";

// Runs only when explicitly invoked. All objects/data are new, randomly named,
// transaction-local fixtures; ROLLBACK removes them even on assertion failure.
test("PostgreSQL tenant migrations, payment constraints and schema isolation", async () => {
  loadProjectEnv();
  const client = new Client({
    connectionString: resolveDatabaseUrl(),
    connectionTimeoutMillis: 5000,
  });
  const suffix = randomUUID().replaceAll("-", "");
  const gift = `payment_test_gift_${suffix}`;
  const panda = `payment_test_panda_${suffix}`;
  const migrations = await readDrizzleMigrations(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/drizzle/migrations",
    ),
  );
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const schema of [gift, panda]) {
      assert.match(schema, /^payment_test_(gift|panda)_[a-f0-9]{32}$/);
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
      for (const migration of migrations.filter(entry => entry.fileName !== "0008_cardcom_charge_reference.sql"))
        await client.query(scopeMigrationSql(migration.sql, schema));
      await client.query(
        "INSERT INTO payment_provider_settings(provider, environment, encrypted_credentials) VALUES ('cardcom', 'test', $1)",
        [schema],
      );
      await client.query(`INSERT INTO orders (session_id,order_number,first_name,last_name,phone_number,shipping_method,"numberOfItems",currency,total_price,payment_method)
        VALUES ('fixture','fixture-1','Test','Only','000','pickup',1,'ILS',100,'pending_payment'), ('fixture','fixture-2','Test','Only','000','pickup',1,'ILS',100,'pending_payment')`);
      // Exercise the additive upgrade against an already-existing payment row.
      const legacy = (await client.query("INSERT INTO payment_transactions(order_id,provider,environment,encrypted_credentials,external_reference,provider_transaction_id,amount,currency) VALUES (1,'cardcom','test','synthetic-legacy','legacy-reference','legacy-profile',100,'ILS') RETURNING *")).rows[0];
      const upgrade = migrations.find(entry => entry.fileName === "0008_cardcom_charge_reference.sql");
      assert.ok(upgrade);
      await client.query(scopeMigrationSql(upgrade.sql, schema));
      const upgraded = (await client.query("SELECT * FROM payment_transactions WHERE id=$1", [legacy.id])).rows[0];
      assert.equal(upgraded.provider_charge_id, null);
      delete upgraded.provider_charge_id;
      assert.deepEqual(upgraded, legacy);
      // Remove only this disposable fixture; all schema changes roll back below.
      await client.query("DELETE FROM payment_transactions WHERE id=$1", [legacy.id]);
    }
    const rejected = async (query, values, expected) => {
      await client.query("SAVEPOINT constraint_check");
      try {
        await assert.rejects(
          client.query(query, values),
          (error) => error.code === expected,
        );
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT constraint_check");
      }
    };
    await client.query(`SET LOCAL search_path TO "${gift}", pg_catalog`);
    assert.equal(
      (
        await client.query(
          "SELECT encrypted_credentials FROM payment_provider_settings",
        )
      ).rows[0].encrypted_credentials,
      gift,
    );
    await rejected(
      "INSERT INTO payment_provider_settings(id,provider,environment,encrypted_credentials) VALUES (2,'cardcom','test','fixture')",
      [],
      "23514",
    );
    await rejected(
      "INSERT INTO payment_provider_settings(provider,environment,encrypted_credentials) VALUES ('tranzila','production','fixture')",
      [],
      "23505",
    );
    const insert =
      "INSERT INTO payment_transactions(order_id,provider,environment,encrypted_credentials,external_reference,provider_transaction_id,amount,currency) VALUES ($1,'cardcom','test','fixture',$2,$3,$4,'ILS') RETURNING id";
    const {
      rows: [payment],
    } = await client.query(insert, [
      1,
      "gift-reference",
      "provider-reference",
      100,
    ]);
    await rejected(
      insert,
      [1, "another-reference", "another-provider-reference", 100],
      "23505",
    );
    await rejected(
      insert,
      [2, "another-reference", "provider-reference", 100],
      "23505",
    );
    await rejected(
      insert,
      [2, "another-reference", "another-provider-reference", -1],
      "23514",
    );
    await rejected(
      "UPDATE payment_transactions SET status='paid' WHERE id=$1",
      [payment.id],
      "23514",
    );
    await rejected(
      "UPDATE orders SET payment_status='paid' WHERE id=1",
      [],
      "23514",
    );
    await client.query("UPDATE payment_transactions SET provider_charge_id=$1 WHERE id=$2", ["9223372036854775807", payment.id]);
    assert.equal((await client.query("SELECT provider_charge_id FROM payment_transactions WHERE id=$1", [payment.id])).rows[0].provider_charge_id, "9223372036854775807");
    for (const invalid of ["9223372036854775808", "0", "-1", "1e3", "01", "1.5"])
      await rejected("UPDATE payment_transactions SET provider_charge_id=$1 WHERE id=$2", [invalid, payment.id], "23514");
    const second = (await client.query(insert, [2, "second-reference", "second-provider-reference", 100])).rows[0];
    await rejected("UPDATE payment_transactions SET provider_charge_id=$1 WHERE id=$2", ["9223372036854775807", second.id], "23505");
    await client.query("UPDATE payment_transactions SET provider_charge_id=$1 WHERE id=$2", ["9223372036854775806", second.id]);
    assert.equal((await client.query("SELECT provider_charge_id FROM payment_transactions WHERE id=$1", [second.id])).rows[0].provider_charge_id, "9223372036854775806");
    await client.query(`SET LOCAL search_path TO "${panda}", pg_catalog`);
    assert.equal(
      (
        await client.query("SELECT * FROM payment_transactions WHERE id=$1", [
          payment.id,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await client.query(
          "UPDATE payment_transactions SET status='failed' WHERE id=$1",
          [payment.id],
        )
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await client.query(
          "SELECT encrypted_credentials FROM payment_provider_settings",
        )
      ).rows[0].encrypted_credentials,
      panda,
    );
    // Identical provider references are independent in another merchant schema.
    await client.query(insert, [
      1,
      "gift-reference",
      "provider-reference",
      100,
    ]);
    await client.query("UPDATE payment_provider_settings SET enabled=true");
    await client.query("UPDATE payment_transactions SET provider_charge_id=$1", ["9223372036854775807"]);
    await client.query(`SET LOCAL search_path TO "${gift}", pg_catalog`);
    assert.equal(
      (await client.query("SELECT enabled FROM payment_provider_settings"))
        .rows[0].enabled,
      false,
    );
    assert.equal(
      (
        await client.query(
          "SELECT status FROM payment_transactions WHERE id=$1",
          [payment.id],
        )
      ).rows[0].status,
      "created",
    );
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
