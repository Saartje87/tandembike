CREATE TABLE `ticket_blockers` (
	`blocker_number` integer NOT NULL,
	`blocked_number` integer NOT NULL,
	PRIMARY KEY(`blocker_number`, `blocked_number`),
	FOREIGN KEY (`blocker_number`) REFERENCES `tickets`(`number`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`blocked_number`) REFERENCES `tickets`(`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ticket_blockers_blocked_number` ON `ticket_blockers` (`blocked_number`);