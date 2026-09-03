"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { controlPlaneDb } from "@/drizzle/db";
import { adminUserTenants } from "@/drizzle/control-plane-schema";
import { getTenant } from "@/lib/tenant-context";
import {
  authenticateAdmin,
  authorizeTenantAdmin,
  createAdminSession,
  logoutAdmin,
} from "@/lib/admin-auth/core";
import {
  ADMIN_SESSION_COOKIE,
  getAdminAuthRepository,
  getControlTenant,
} from "@/lib/admin-auth/server";
import { shouldUseSecureAdminCookie } from "@/lib/admin-auth/cookie";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export type AdminLoginState = {
  success: false;
  message?: string;
};

const invalidLogin: AdminLoginState = {
  success: false,
  message: "Invalid email or password.",
};

export async function loginTenantAdmin(
  _state: AdminLoginState,
  formData: FormData
): Promise<AdminLoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalidLogin;
  const tenant = await getTenant();
  if (!tenant) return invalidLogin;

  const repository = getAdminAuthRepository();
  const user = await authenticateAdmin(
    repository,
    parsed.data.email,
    parsed.data.password
  );
  const controlTenant = await getControlTenant(tenant.slug);
  if (!user || !controlTenant) return invalidLogin;

  const assignments = await controlPlaneDb
    .select({ slug: adminUserTenants.tenantSlug })
    .from(adminUserTenants)
    .where(eq(adminUserTenants.adminUserId, user.id));
  const decision = authorizeTenantAdmin(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      tenantSlugs: assignments.map((assignment) => assignment.slug),
    },
    controlTenant
  );
  if (decision !== "allowed") return invalidLogin;

  const session = await createAdminSession(repository, user.id);
  await setAdminSessionCookie(session);
  redirect(`${tenant.basePath}/admin`);
}

export async function loginSuperAdmin(
  _state: AdminLoginState,
  formData: FormData
): Promise<AdminLoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalidLogin;
  const repository = getAdminAuthRepository();
  const user = await authenticateAdmin(
    repository,
    parsed.data.email,
    parsed.data.password
  );
  if (!user || user.role !== "super_admin") return invalidLogin;

  const session = await createAdminSession(repository, user.id);
  await setAdminSessionCookie(session);
  redirect("/shopnest/admin");
}

export async function logoutCurrentAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  await logoutAdmin(getAdminAuthRepository(), token);
  cookieStore.delete(ADMIN_SESSION_COOKIE);
  const tenant = await getTenant();
  redirect(tenant ? `${tenant.basePath}/admin/login` : "/shopnest/admin/login");
}

async function setAdminSessionCookie(session: { token: string; expiresAt: Date }) {
  const requestHeaders = await headers();
  (await cookies()).set(ADMIN_SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: shouldUseSecureAdminCookie({
      origin: requestHeaders.get("origin"),
      forwardedProto: requestHeaders.get("x-forwarded-proto"),
      nodeEnv: process.env.NODE_ENV,
    }),
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
}
