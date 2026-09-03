import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
import {
  resolveGlobalAdminPageAccess,
  resolveTenantAdminPageAccess,
} from "../src/lib/admin-auth/navigation.ts";
import { shouldUseSecureAdminCookie } from "../src/lib/admin-auth/cookie.ts";
import { hashAdminPassword } from "../src/lib/admin-auth/password.mjs";
import { resolveConfiguredTenant } from "../src/lib/tenant-validation.mjs";
import { provisionAdminAccount } from "../scripts/lib/admin-account-provisioning.mjs";

const validPassword = "correct horse battery staple";
const passwordHash = await hashAdminPassword(validPassword);

const pandaTenant: TenantControlRecord = {
  slug: "panda-pop",
  schemaName: "panda_pop",
  displayName: "Panda Pop",
  status: "active",
};
const pandaRouteTenant = resolveConfiguredTenant("panda-pop")!;

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

test("missing and expired tenant admin sessions redirect to the tenant login", async () => {
  const missingOutcome = resolveTenantAdminPageAccess({
    decision: "unauthenticated",
    principal: null,
    tenant: pandaRouteTenant,
    controlTenant: pandaTenant,
  });
  assert.deepEqual(missingOutcome, {
    kind: "redirect",
    location: "/panda-pop/admin/login",
  });

  const repository = new FakeAdminRepository([tenantAdmin()]);
  const now = new Date("2026-01-01T00:00:00Z");
  const session = await createAdminSession(repository, 1, now);
  const expiredPrincipal = await resolveAdminSession(
    repository,
    session.token,
    new Date(now.getTime() + ADMIN_SESSION_TTL_MS + 1)
  );
  assert.equal(expiredPrincipal, null);
  assert.deepEqual(
    resolveTenantAdminPageAccess({
      decision: "unauthenticated",
      principal: expiredPrincipal,
      tenant: pandaRouteTenant,
      controlTenant: pandaTenant,
    }),
    { kind: "redirect", location: "/panda-pop/admin/login" }
  );
});

test("authenticated tenant admins load assigned tenants and forbidden stays forbidden", () => {
  const principal = tenantPrincipal();
  assert.deepEqual(
    resolveTenantAdminPageAccess({
      decision: authorizeTenantAdmin(principal, pandaTenant),
      principal,
      tenant: pandaRouteTenant,
      controlTenant: pandaTenant,
    }),
    { kind: "allowed" }
  );

  const giftControlTenant = {
    ...pandaTenant,
    slug: "gift-shop",
    schemaName: "gift_shop",
  };
  const giftRouteTenant = resolveConfiguredTenant("gift-shop")!;
  assert.deepEqual(
    resolveTenantAdminPageAccess({
      decision: authorizeTenantAdmin(principal, giftControlTenant),
      principal,
      tenant: giftRouteTenant,
      controlTenant: giftControlTenant,
    }),
    { kind: "forbidden" }
  );
});

test("global admin pages redirect missing sessions without weakening role checks", () => {
  assert.deepEqual(resolveGlobalAdminPageAccess(null), {
    kind: "redirect",
    location: "/shopnest/admin/login",
  });
  assert.deepEqual(resolveGlobalAdminPageAccess(tenantPrincipal()), {
    kind: "forbidden",
  });
  assert.deepEqual(
    resolveGlobalAdminPageAccess({
      ...tenantPrincipal(),
      role: "super_admin",
      tenantSlugs: [],
    }),
    { kind: "allowed" }
  );
});

test("admin session cookies follow the actual request protocol", () => {
  assert.equal(
    shouldUseSecureAdminCookie({
      origin: "http://192.168.0.184:3000",
      forwardedProto: null,
      nodeEnv: "production",
    }),
    false
  );
  assert.equal(
    shouldUseSecureAdminCookie({
      origin: "https://shop.example.com",
      forwardedProto: "https",
      nodeEnv: "production",
    }),
    true
  );
  assert.equal(
    shouldUseSecureAdminCookie({
      origin: null,
      forwardedProto: "https, http",
      nodeEnv: "production",
    }),
    true
  );
  assert.equal(
    shouldUseSecureAdminCookie({
      origin: null,
      forwardedProto: null,
      nodeEnv: "production",
    }),
    true
  );
});

test("admin page, action, and API boundaries use their intended auth behavior", async () => {
  const [
    server,
    tenantLayout,
    globalLayout,
    globalPage,
    shippingPage,
    categoriesPage,
    shippingActions,
    authActions,
    subcategoriesApi,
  ] = await Promise.all([
    readFile("src/lib/admin-auth/server.ts", "utf8"),
    readFile("src/app/admin/layout.tsx", "utf8"),
    readFile("src/app/shopnest/admin/layout.tsx", "utf8"),
    readFile("src/app/shopnest/admin/page.tsx", "utf8"),
    readFile("src/app/admin/shipping/page.tsx", "utf8"),
    readFile("src/app/admin/categories/page.tsx", "utf8"),
    readFile("src/app/admin/_actions/shipping.ts", "utf8"),
    readFile("src/app/admin/_actions/auth.ts", "utf8"),
    readFile("src/app/api/subcategories/route.ts", "utf8"),
  ]);

  assert.match(server, /resolveTenantAdminPageAccess/);
  assert.match(server, /outcome\.kind === "redirect"\) redirect/);
  assert.match(server, /export async function requireTenantAdminApiDb/);
  assert.match(tenantLayout, /await requireTenantAdmin\(\)/);
  assert.match(globalLayout, /await requireSuperAdminPage\(\)/);
  assert.match(globalPage, /await requireSuperAdminPage\(\)/);

  for (const protectedSource of [shippingPage, categoriesPage, shippingActions]) {
    assert.match(protectedSource, /requireTenantAdminDb/);
  }

  assert.match(authActions, /shouldUseSecureAdminCookie/);
  assert.doesNotMatch(
    authActions,
    /secure:\s*process\.env\.NODE_ENV\s*===\s*["']production["']/
  );

  assert.match(subcategoriesApi, /requireTenantAdminApiDb/);
  assert.match(subcategoriesApi, /NextResponse\.json/);
  assert.match(subcategoriesApi, /status: error\.status/);
  assert.doesNotMatch(subcategoriesApi, /redirect\(|admin\/login/);
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

test("updating a tenant admin replaces panda-pop and gift-shop with panda-pop", async () => {
  const repository = provisioningRepository("tenant_admin", [
    "panda-pop",
    "gift-shop",
  ]);

  await provision(repository, "tenant_admin", ["panda-pop"]);

  assert.deepEqual([...repository.assignments.get(1)!], ["panda-pop"]);
  assert.deepEqual(repository.transactionEvents, ["BEGIN", "COMMIT"]);
});

test("changing tenant_admin to super_admin clears tenant assignments", async () => {
  const repository = provisioningRepository("tenant_admin", [
    "panda-pop",
    "gift-shop",
  ]);

  await provision(repository, "super_admin", []);

  assert.equal(repository.users.get(1)!.role, "super_admin");
  assert.deepEqual([...repository.assignments.get(1)!], []);
});

test("changing super_admin to tenant_admin creates only requested assignments", async () => {
  const repository = provisioningRepository("super_admin", []);

  await provision(repository, "tenant_admin", ["gift-shop"]);

  assert.equal(repository.users.get(1)!.role, "tenant_admin");
  assert.deepEqual([...repository.assignments.get(1)!], ["gift-shop"]);
});

test("assignment replacement revokes existing sessions", async () => {
  const repository = provisioningRepository("tenant_admin", [
    "panda-pop",
    "gift-shop",
  ]);
  const session = await createAdminSession(repository, 1);
  assert.ok(await resolveAdminSession(repository, session.token));

  await provision(repository, "tenant_admin", ["panda-pop"]);

  assert.equal(await resolveAdminSession(repository, session.token), null);
  assert.deepEqual([...repository.assignments.get(1)!], ["panda-pop"]);
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
  assignments = new Map<number, Set<string>>();
  transactionEvents: string[] = [];

  constructor(users: AdminUserRecord[]) {
    for (const user of users) {
      this.users.set(user.id, { ...user });
      this.assignments.set(user.id, new Set(["panda-pop"]));
    }
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
        tenantSlugs: [...(this.assignments.get(user.id) ?? [])],
      },
    });
  }

  async findSessionByTokenHash(tokenHash: string) {
    const session = this.sessions.get(tokenHash);
    if (!session) return null;
    const currentUser = this.users.get(session.user.id)!;
    return {
      ...session,
      user: {
        ...session.user,
        role: currentUser.role,
        isActive: currentUser.isActive,
        tenantSlugs: [...(this.assignments.get(currentUser.id) ?? [])],
      },
    };
  }

  async deleteSessionByTokenHash(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }

  async query(sql: string, parameters: unknown[] = []) {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    if (normalizedSql === "BEGIN" || normalizedSql === "COMMIT") {
      this.transactionEvents.push(normalizedSql);
      return { rows: [] };
    }
    if (normalizedSql === "ROLLBACK") {
      this.transactionEvents.push(normalizedSql);
      return { rows: [] };
    }
    if (normalizedSql.startsWith("INSERT INTO public.admin_users")) {
      const [email, nextPasswordHash, role] = parameters as [
        string,
        string,
        AdminUserRecord["role"],
      ];
      const user = [...this.users.values()].find(
        (candidate) => candidate.email === email
      );
      if (!user) throw new Error("The test expects an existing admin");
      user.passwordHash = nextPasswordHash;
      user.role = role;
      user.isActive = true;
      return { rows: [{ id: user.id }] };
    }
    if (normalizedSql.startsWith("DELETE FROM public.admin_sessions")) {
      const [adminUserId] = parameters as [number];
      for (const [tokenHash, session] of this.sessions) {
        if (session.user.id === adminUserId) this.sessions.delete(tokenHash);
      }
      return { rows: [] };
    }
    if (normalizedSql.startsWith("DELETE FROM public.admin_user_tenants")) {
      const [adminUserId] = parameters as [number];
      this.assignments.set(adminUserId, new Set());
      return { rows: [] };
    }
    if (normalizedSql.startsWith("INSERT INTO public.admin_user_tenants")) {
      const [adminUserId, slug] = parameters as [number, string];
      this.assignments.get(adminUserId)!.add(slug);
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL in test: ${normalizedSql}`);
  }
}

function provisioningRepository(
  role: AdminUserRecord["role"],
  tenantSlugs: string[]
) {
  const repository = new FakeAdminRepository([{ ...tenantAdmin(), role }]);
  repository.assignments.set(1, new Set(tenantSlugs));
  return repository;
}

async function provision(
  repository: FakeAdminRepository,
  role: AdminUserRecord["role"],
  tenantSlugs: string[]
) {
  await provisionAdminAccount(repository, {
    email: "admin@example.com",
    passwordHash,
    role,
    tenantSlugs,
  });
}
