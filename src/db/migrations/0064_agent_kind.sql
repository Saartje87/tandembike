ALTER TABLE `conversations` ADD `agent_kind` text DEFAULT 'claude-code' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `default_agent_kind` text DEFAULT 'claude-code' NOT NULL;