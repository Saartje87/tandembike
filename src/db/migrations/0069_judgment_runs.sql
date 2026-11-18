ALTER TABLE `conversations` ADD `auto_reply_entry_id` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `overlap_planning` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `auto_reply` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `reply_rules` text;