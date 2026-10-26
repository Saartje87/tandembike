CREATE TABLE `ticket_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_number` integer NOT NULL,
	`actor` text NOT NULL,
	`changes` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_number`) REFERENCES `tickets`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ticket_activity_ticket_number` ON `ticket_activity` (`ticket_number`);