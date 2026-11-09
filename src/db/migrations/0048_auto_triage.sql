ALTER TABLE `projects` ADD `auto_triage` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `triage_ceiling_usd` real;