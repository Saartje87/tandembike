ALTER TABLE `projects` ADD `triage_command` text DEFAULT '/mattpocock-skills:triage';--> statement-breakpoint
ALTER TABLE `projects` ADD `start_command` text DEFAULT '/mattpocock-skills:implement';--> statement-breakpoint
ALTER TABLE `projects` ADD `start_epic_command` text DEFAULT '/mattpocock-skills:implement-spec';