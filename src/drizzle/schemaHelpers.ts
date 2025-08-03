import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

export const id = (name: string = "id") =>
  uuid(name).primaryKey().defaultRandom().notNull();

export const createdAt = timestamp({ withTimezone: true })
  .notNull()
  .defaultNow();
export const updatedAt = timestamp({ withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

export const deletedAt = timestamp("deleted_at", { withTimezone: true })
  .default(sql`null`)
  .$type<Date | null>();
