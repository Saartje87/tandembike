ALTER TABLE `projects` ADD `repository_path` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `parallel_runs` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `max_concurrent_runs` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `agent_mode` integer DEFAULT false NOT NULL;