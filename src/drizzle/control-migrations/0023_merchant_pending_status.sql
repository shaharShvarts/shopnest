ALTER TYPE "public"."merchant_status"
  ADD VALUE IF NOT EXISTS 'pending_verification' BEFORE 'active';
