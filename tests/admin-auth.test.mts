import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_SESSION_TTL_MS,
  authenticateAdmin,
  authorizeSuperAdmin,
  authorizeTenantAdmin,
  createAdminSession,
  logoutAdmin,
  resolveAdminSession,
  type AdminAuthRepository,
  type AdminPrincipal,
  type AdminUserRecord,
  type StoredAdminSession,
  type TenantControlRecord,
} from "../src/lib/admin-auth/core.ts";
import { hashAdminPassword } from "../src/lib/admin-auth/password.mjs";

const validPassword = "correct horse battery staple";
const passwordHash = await hashAdminPassword(validPassword);

const pandaTenant: TenantControlRecord = {
  slug: "panda-pop",
  schemaName: "panda_pop",
  displayName: "Panda Pop",
  status: "active",
};

test("valid admin login succeeds and invalid password is rejected", async () => {
  const repository = new FakeAdminRepository([tenantAdmin()]);
  assert.equal(
    (await authenticateAdmin(repository, " ADMIN@EXAMPLE.COM ", validPassword))
      ?.id,
    1
  );
  assert.equal(
    await authenticateAdmin(repository, "admin@example.com", "wrong password"),
    null
  );
});

test("inactive admin is rejected", async () => {
  const repository = new FakeAdminRepository([
    { ...tenantAdmin(), isActive: false },
  ]);
  assert.equal(
    await authenticateAdmin(repository, "admin@example.com", validPassword),
    null
  );
});

test("session expiration and disabled users invalidate existing sessions", async () => {
  const repository = new FakeAdminRepository([tenantAdmin()]);
  const now = new Date("2026-01-01T00:00:00Z");
  const session = await createAdminSession(repository, 1, now);

  assert.ok(await resolveAdminSession(repository, session.token, now));
  assert.equal(
    await resolveAdminSession(
      repository,
      session.token,
      new Date(now.getTime() + ADMIN_SESSION_TTL_MS + 1)
    ),
    null
  );

  const nextSession = await createAdminSession(repository, 1, now);
  repository.users.get(1)!.isActive = false;
  assert.equal(await resolveAdminSession(repository, nextSession.token, now), null);
});

test("logout invalidates the current server-side session", async () => {
  const repository = new FakeAdminRepository([tenantAdmin()]);
  const session = await createAdminSession(repository, 1);
  assert.ok(await resolveAdminSession(repository, session.token));
  await logoutAdmin(repository, session.token);
  assert.equal(await resolveAdminSession(repository, session.token), null);
});

test("tenant admin can access assigned tenant but not another tenant", () => {
  const principal = tenantPrincipal();
  assert.equal(authorizeTenantAdmin(principal, pandaTenant), "allowed");
  assert.equal(
    authorizeTenantAdmin(principal, {
      ...pandaTenant,
      slug: "gift-shop",
      schemaName: "gift_shop",
    }),
    "forbidden"
  );
});

test("direct admin action authorization cannot cross tenants", () => {
  const directActionTenant = {
    ...pandaTenant,
    slug: "dvorik-collection",
    schemaName: "dvorik_collection",
  };
  assert.equal(
    authorizeTenantAdmin(tenantPrincipal(), directActionTenant),
    "forbidden"
  );
});

test("super admin can access every known tenant", () => {
  const principal: AdminPrincipal = {
    ...tenantPrincipal(),
    role: "super_admin",
    tenantSlugs: [],
  };
  assert.equal(authorizeSuperAdmin(principal), true);
  assert.equal(authorizeTenantAdmin(principal, pandaTenant), "allowed");
  assert.equal(
    authorizeTenantAdmin(principal, { ...pandaTenant, status: "suspended" }),
    "allowed"
  );
});

test("unknown tenant is denied", () => {
  assert.equal(authorizeTenantAdmin(tenantPrincipal(), null), "unknown_tenant");
});

test("suspended and disabled tenants block tenant admins", () => {
  assert.equal(
    authorizeTenantAdmin(tenantPrincipal(), {
      ...pandaTenant,
      status: "suspended",
    }),
    "forbidden"
  );
  assert.equal(
    authorizeTenantAdmin(tenantPrincipal(), {
      ...pandaTenant,
      status: "disabled",
    }),
    "forbidden"
  );
});

function tenantAdmin(): AdminUserRecord {
  return {
    id: 1,
    email: "admin@example.com",
    passwordHash,
    role: "tenant_admin",
    isActive: true,
  };
}

function tenantPrincipal(): AdminPrincipal {
  return {
    id: 1,
    email: "admin@example.com",
    role: "tenant_admin",
    isActive: true,
    tenantSlugs: ["panda-pop"],
  };
}

class FakeAdminRepository implements AdminAuthRepository {
  users = new Map<number, AdminUserRecord>();
  sessions = new Map<string, StoredAdminSession>();

  constructor(users: AdminUserRecord[]) {
    for (const user of users) this.users.set(user.id, { ...user });
  }

  async findAdminByEmail(email: string) {
    return (
      [...this.users.values()].find((candidate) => candidate.email === email) ??
      null
    );
  }

  async createSession(input: {
    tokenHash: string;
    adminUserId: number;
    expiresAt: Date;
  }) {
    const user = this.users.get(input.adminUserId)!;
    this.sessions.set(input.tokenHash, {
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        tenantSlugs: ["panda-pop"],
      },
    });
  }

  async findSessionByTokenHash(tokenHash: string) {
    const session = this.sessions.get(tokenHash);
    if (!session) return null;
    const currentUser = this.users.get(session.user.id)!;
    return {
      ...session,
      user: { ...session.user, isActive: currentUser.isActive },
    };
  }

  async deleteSessionByTokenHash(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
}
