CREATE TABLE `run_outcomes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`project_id` integer NOT NULL,
	`ticket_number` integer,
	`stage` text NOT NULL,
	`result` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`cost_usd` real NOT NULL,
	`model` text,
	`command` text,
	`started_by_autopilot` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ticket_number`) REFERENCES `tickets`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `run_outcomes_conversation_id` ON `run_outcomes` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `run_outcomes_project_ended` ON `run_outcomes` (`project_id`,`ended_at`);