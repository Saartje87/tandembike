ALTER TABLE `conversations` ADD `worktree_kept` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `worktree_removed` integer DEFAULT false NOT NULL;