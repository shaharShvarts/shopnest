import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { resolveDatabaseUrl } from "./database-url.mjs";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1).optional(),
    DB_PASSWORD: z.string().min(1).optional(),
    DB_USER: z.string().min(1).optional(),
    DB_HOST: z.string().min(1).optional(),
    DB_PORT: z.string().min(1).optional(),
    DB_NAME: z.string().min(1).optional(),
  },
  createFinalSchema: (env) => {
    return z.object(env).transform((val) => {
      return {
        ...val,
        DATABASE_URL: resolveDatabaseUrl(val),
      };
    });
  },
  emptyStringAsUndefined: true,
  experimental__runtimeEnv: process.env,
});
