import {
  pgTable,
  serial,
  uniqueIndex,
  varchar,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createdAt, updatedAt } from "../schemaHelpers";
import { carts } from "./cart";
import { orders } from "./order";
import { likes } from "./like";

export const userStatus = ["active", "inactive"] as const;
export type UserStatus = (typeof userStatus)[number];
export const userStatusEnum = pgEnum("user_status", userStatus);

// USERS
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: varchar("name").notNull(),
    email: varchar("email").unique().notNull(),
    phone: varchar("phone").unique().notNull(),
    passwordHash: varchar("password_hash").notNull(),
    status: userStatusEnum().notNull().default("active"),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("email_lower_idx").on(sql`lower(${table.email})`)]
);

// User Relations
export const usersRelations = relations(users, ({ many }) => ({
  cartItems: many(carts),
  orders: many(orders),
  likes: many(likes),
}));
