export async function provisionAdminAccount(
  client,
  { email, passwordHash, role, tenantSlugs }
) {
  await client.query("BEGIN");

  try {
    const userResult = await client.query(
      `INSERT INTO public.admin_users (email, password_hash, role, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         is_active = true,
         updated_at = now()
       RETURNING id`,
      [email, passwordHash, role]
    );
    const adminUserId = userResult.rows[0].id;

    await client.query(
      "DELETE FROM public.admin_sessions WHERE admin_user_id = $1",
      [adminUserId]
    );
    await client.query(
      "DELETE FROM public.admin_user_tenants WHERE admin_user_id = $1",
      [adminUserId]
    );

    if (role === "tenant_admin") {
      for (const slug of tenantSlugs) {
        await client.query(
          `INSERT INTO public.admin_user_tenants (admin_user_id, tenant_slug)
           VALUES ($1, $2)`,
          [adminUserId, slug]
        );
      }
    }

    await client.query("COMMIT");
    return adminUserId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
