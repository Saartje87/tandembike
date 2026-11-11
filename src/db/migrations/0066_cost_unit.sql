ALTER TABLE `conversations` ADD `cost_unit` text DEFAULT 'usd' NOT NULL;--> statement-breakpoint
ALTER TABLE `run_outcomes` ADD `cost_unit` text DEFAULT 'usd' NOT NULL;