ALTER TABLE `projects` ADD `auto_merge` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `claim_merge` text;