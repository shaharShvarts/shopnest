import { eq } from "drizzle-orm";
import { controlPlaneDb } from "@/drizzle/db";
import {
  adminSessions,
  adminUsers,
  adminUserTenants,
} from "@/drizzle/control-plane-schema";
import type {
  AdminAuthRepository,
  AdminUserRecord,
  StoredAdminSession,
} from "./core";

export class DrizzleAdminAuthRepository implements AdminAuthRepository {
  async findAdminByEmail(email: string): Promise<AdminUserRecord | null> {
    const [user] = await controlPlaneDb
      .select({
        id: adminUsers.id,
        email: adminUsers.email,
        passwordHash: adminUsers.passwordHash,
        role: adminUsers.role,
        isActive: adminUsers.isActive,
      })
      .from(adminUsers)
      .where(eq(adminUsers.email, email))
      .limit(1);
    return user ?? null;
  }

  async createSession(input: {
    tokenHash: string;
    adminUserId: number;
    expiresAt: Date;
  }) {
    await controlPlaneDb.insert(adminSessions).values(input);
  }

  async findSessionByTokenHash(
    tokenHash: string
  ): Promise<StoredAdminSession | null> {
    const [row] = await controlPlaneDb
      .select({
        tokenHash: adminSessions.tokenHash,
        expiresAt: adminSessions.expiresAt,
        id: adminUsers.id,
        email: adminUsers.email,
        role: adminUsers.role,
        isActive: adminUsers.isActive,
      })
      .from(adminSessions)
      .innerJoin(adminUsers, eq(adminSessions.adminUserId, adminUsers.id))
      .where(eq(adminSessions.tokenHash, tokenHash))
      .limit(1);
    if (!row) return null;

    const assignments = await controlPlaneDb
      .select({ slug: adminUserTenants.tenantSlug })
      .from(adminUserTenants)
      .where(eq(adminUserTenants.adminUserId, row.id));

    return {
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      user: {
        id: row.id,
        email: row.email,
        role: row.role,
        isActive: row.isActive,
        tenantSlugs: assignments.map((assignment) => assignment.slug),
      },
    };
  }

  async deleteSessionByTokenHash(tokenHash: string) {
    await controlPlaneDb
      .delete(adminSessions)
      .where(eq(adminSessions.tokenHash, tokenHash));
  }
}
