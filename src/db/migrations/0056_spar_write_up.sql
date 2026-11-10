ALTER TABLE `spars` ADD `closing` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `spars` ADD `decisions` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `spars` ADD `open_questions` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `spars` ADD `next_steps` text DEFAULT '' NOT NULL;