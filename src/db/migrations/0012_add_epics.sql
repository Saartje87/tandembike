ALTER TABLE `tickets` ADD `type` text DEFAULT 'Ticket' NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `epic_number` integer REFERENCES tickets(number);--> statement-breakpoint
CREATE INDEX `tickets_epic_number` ON `tickets` (`epic_number`);