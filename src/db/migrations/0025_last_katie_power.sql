ALTER TABLE `conversations` ADD `hidden` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `default_cycle_id` integer;--> statement-breakpoint
ALTER TABLE `conversations` ADD `default_epic_number` integer;--> statement-breakpoint
ALTER TABLE `conversations` ADD `default_type` text;