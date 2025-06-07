CREATE TABLE IF NOT EXISTS "RateLimitLog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Session" ADD COLUMN "csrfToken" varchar(64);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "RateLimitLog" ADD CONSTRAINT "RateLimitLog_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limit_user_id_idx" ON "RateLimitLog" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limit_endpoint_idx" ON "RateLimitLog" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limit_created_at_idx" ON "RateLimitLog" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limit_user_endpoint_idx" ON "RateLimitLog" USING btree ("userId","endpoint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limit_user_endpoint_time_idx" ON "RateLimitLog" USING btree ("userId","endpoint","createdAt");