ALTER TABLE `tickets` ADD `origin_number` integer REFERENCES tickets(number);--> statement-breakpoint
CREATE INDEX `tickets_origin_number` ON `tickets` (`origin_number`);