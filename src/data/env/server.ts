import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { resolveDatabaseUrl } from "./database-url.mjs";

const validatedEnv = createEnv({
  server: {
    DATABASE_URL: z.string().min(1).optional(),
    DB_PASSWORD: z.string().min(1).optional(),
    DB_USER: z.string().min(1).optional(),
    DB_HOST: z.string().min(1).optional(),
    DB_PORT: z.string().min(1).optional(),
    DB_NAME: z.string().min(1).optional(),
  },
  emptyStringAsUndefined: true,
  experimental__runtimeEnv: process.env,
});

// @t3-oss/env requires Standard Schema validation to stay synchronous.
// Zod transforms expose an async-compatible validator, so derive the final URL
// only after the individual environment fields have been validated.
export const env = {
  ...validatedEnv,
  DATABASE_URL: resolveDatabaseUrl(validatedEnv),
};
