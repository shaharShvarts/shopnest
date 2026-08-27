const DATABASE_PARTS = [
  "DB_PASSWORD",
  "DB_USER",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
];

export function resolveDatabaseUrl(environment = process.env) {
  const configuredUrl = environment.DATABASE_URL?.trim();
  if (configuredUrl) return configuredUrl;

  const missing = DATABASE_PARTS.filter((key) => !environment[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `DATABASE_URL is required (or provide the existing database variables: ${missing.join(
        ", "
      )})`
    );
  }

  const user = encodeURIComponent(environment.DB_USER);
  const password = encodeURIComponent(environment.DB_PASSWORD);
  const host = environment.DB_HOST;
  const port = environment.DB_PORT;
  const database = encodeURIComponent(environment.DB_NAME);

  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}
