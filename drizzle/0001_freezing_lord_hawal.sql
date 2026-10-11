CREATE TABLE "brand_profiles" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"feed_published_at" timestamp with time zone,
	"feed_previous" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visibility_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visibility_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"engine" text NOT NULL,
	"mentioned" boolean NOT NULL,
	"cited" boolean NOT NULL,
	"cited_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excerpt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "ai_score" integer;--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "ai_readiness" jsonb;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visibility_prompts" ADD CONSTRAINT "visibility_prompts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visibility_prompts" ADD CONSTRAINT "visibility_prompts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visibility_results" ADD CONSTRAINT "visibility_results_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visibility_results" ADD CONSTRAINT "visibility_results_prompt_id_visibility_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."visibility_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visibility_prompts_site_idx" ON "visibility_prompts" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "visibility_results_site_idx" ON "visibility_results" USING btree ("site_id","created_at");