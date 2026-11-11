CREATE TABLE `project_agent_models` (
	`project_id` integer NOT NULL,
	`agent_kind` text NOT NULL,
	`run_model` text,
	`triage_model` text,
	PRIMARY KEY(`project_id`, `agent_kind`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `project_agent_models` (`project_id`, `agent_kind`, `run_model`, `triage_model`) SELECT `id`, 'claude-code', `run_model`, `triage_model` FROM `projects` WHERE `run_model` IS NOT NULL OR `triage_model` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `run_model`;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `triage_model`;