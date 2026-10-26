CREATE TABLE `ticket_external_references` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_number` integer NOT NULL,
	`reference` text NOT NULL,
	FOREIGN KEY (`ticket_number`) REFERENCES `tickets`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ticket_external_references_ticket_reference` ON `ticket_external_references` (`ticket_number`,`reference`);