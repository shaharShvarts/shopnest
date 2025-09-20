import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

export const id = (name: string = "id") =>
  uuid(name).primaryKey().defaultRandom().notNull();

export const addedAt = timestamp("added_at", { withTimezone: true })
  .notNull()
  .defaultNow();
export const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();
export const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

export const deletedAt = timestamp("deleted_at", { withTimezone: true })
  .default(sql`null`)
  .$type<Date | null>();
