CREATE TABLE `ticket_labels` (
	`ticket_number` integer NOT NULL,
	`label` text NOT NULL,
	PRIMARY KEY(`ticket_number`, `label`),
	FOREIGN KEY (`ticket_number`) REFERENCES `tickets`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ticket_labels_label` ON `ticket_labels` (`label`);