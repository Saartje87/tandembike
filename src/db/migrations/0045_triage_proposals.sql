CREATE TABLE `triage_proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_number` integer NOT NULL,
	`run_id` text,
	`category` text NOT NULL,
	`state` text NOT NULL,
	`reasoning` text NOT NULL,
	`acceptance_criteria` text,
	`duplicate_of` integer,
	`splits` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`ticket_number`) REFERENCES `tickets`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `triage_proposals_ticket_number` ON `triage_proposals` (`ticket_number`);--> statement-breakpoint
ALTER TABLE `projects` ADD `triage_model` text;