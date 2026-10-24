CREATE TABLE `cycle_tickets` (
	`cycle_id` integer NOT NULL,
	`ticket_number` integer NOT NULL,
	PRIMARY KEY(`cycle_id`, `ticket_number`),
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ticket_number`) REFERENCES `tickets`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cycle_tickets_ticket_number` ON `cycle_tickets` (`ticket_number`);