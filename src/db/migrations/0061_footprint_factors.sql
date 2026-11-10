CREATE TABLE `footprint_factors` (
	`id` integer PRIMARY KEY NOT NULL,
	`haiku_wh_per_million` real NOT NULL,
	`sonnet_wh_per_million` real NOT NULL,
	`opus_wh_per_million` real NOT NULL,
	`grid_grams_per_kwh` real NOT NULL
);
