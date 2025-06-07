-- Add rate limit logging table
CREATE TABLE IF NOT EXISTS "RateLimitLog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "rate_limit_user_id_idx" ON "RateLimitLog" ("userId");
CREATE INDEX IF NOT EXISTS "rate_limit_endpoint_idx" ON "RateLimitLog" ("endpoint");
CREATE INDEX IF NOT EXISTS "rate_limit_created_at_idx" ON "RateLimitLog" ("createdAt");
CREATE INDEX IF NOT EXISTS "rate_limit_user_endpoint_idx" ON "RateLimitLog" ("userId", "endpoint");
CREATE INDEX IF NOT EXISTS "rate_limit_user_endpoint_time_idx" ON "RateLimitLog" ("userId", "endpoint", "createdAt");

-- Add CSRF token to session table
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "csrfToken" varchar(64);