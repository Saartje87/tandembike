CREATE TABLE `spar_columns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`spar_id` integer NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	FOREIGN KEY (`spar_id`) REFERENCES `spars`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `spar_columns_spar_id` ON `spar_columns` (`spar_id`);--> statement-breakpoint
CREATE TABLE `spar_stickies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`spar_id` integer NOT NULL,
	`column_id` integer NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`note` text,
	`author` text NOT NULL,
	`ticket_number` integer,
	FOREIGN KEY (`spar_id`) REFERENCES `spars`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`column_id`) REFERENCES `spar_columns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `spar_stickies_spar_id` ON `spar_stickies` (`spar_id`);