CREATE TABLE `ticket_attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_number` integer NOT NULL,
	`name` text NOT NULL,
	`media_type` text NOT NULL,
	`size` integer NOT NULL,
	`author` text NOT NULL,
	`content` blob NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_number`) REFERENCES `tickets`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ticket_attachments_ticket_number` ON `ticket_attachments` (`ticket_number`);