ALTER TABLE `tickets` ADD `position` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `tickets` AS current
SET `position` = (
  SELECT COUNT(*)
  FROM `tickets` AS earlier
  WHERE earlier.project_id = current.project_id
    AND earlier.status = current.status
    AND (
      earlier.created_at < current.created_at
      OR (
        earlier.created_at = current.created_at
        AND earlier.number < current.number
      )
    )
);