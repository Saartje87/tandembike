CREATE TABLE `spars` (
	`id` integer PRIMARY KEY NOT NULL,
	`project_id` integer NOT NULL,
	`topic` text,
	`closed` integer DEFAULT false NOT NULL,
	`outcome_ticket_number` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `spar_command` text;