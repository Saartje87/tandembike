ALTER TABLE `tickets` ADD `color` text;--> statement-breakpoint
-- Every Epic has a colour: spread the existing ones through the palette in
-- creation order, per Project, in the order of `paletteColors`.
UPDATE `tickets` SET `color` = (
	CASE (`ranked`.`rank` - 1) % 10
		WHEN 0 THEN 'red'
		WHEN 1 THEN 'orange'
		WHEN 2 THEN 'amber'
		WHEN 3 THEN 'green'
		WHEN 4 THEN 'teal'
		WHEN 5 THEN 'blue'
		WHEN 6 THEN 'indigo'
		WHEN 7 THEN 'purple'
		WHEN 8 THEN 'pink'
		ELSE 'grey'
	END
)
FROM (
	SELECT `number`, row_number() OVER (
		PARTITION BY `project_id` ORDER BY `created_at`, `number`
	) AS `rank`
	FROM `tickets`
	WHERE `type` = 'Epic'
) AS `ranked`
WHERE `tickets`.`number` = `ranked`.`number`;
