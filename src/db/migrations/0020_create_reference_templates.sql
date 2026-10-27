CREATE TABLE `reference_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`prefix` text NOT NULL,
	`url` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reference_templates_project_prefix` ON `reference_templates` (`project_id`,`prefix`);