ALTER TABLE "public"."tenants"
  ALTER COLUMN "plan" TYPE varchar(64)
  USING "plan"::text;
