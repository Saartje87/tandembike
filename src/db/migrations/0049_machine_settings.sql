CREATE TABLE `machine_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`max_concurrent_runs` integer DEFAULT 3 NOT NULL
);
