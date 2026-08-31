WITH "ranked_unresolved_alerts" AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "product_id"
			ORDER BY
				CASE "alert_type"
					WHEN 'out_of_stock' THEN 3
					WHEN 'critical_stock' THEN 2
					WHEN 'low_stock' THEN 1
				END DESC,
				"created_at" DESC,
				"id" DESC
		) AS "severity_rank"
	FROM "inventory_alerts"
	WHERE "resolved_at" IS NULL
)
UPDATE "inventory_alerts"
SET "resolved_at" = now()
FROM "ranked_unresolved_alerts"
WHERE "inventory_alerts"."id" = "ranked_unresolved_alerts"."id"
	AND "ranked_unresolved_alerts"."severity_rank" > 1;--> statement-breakpoint
DROP INDEX "inventory_alert_unresolved_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_alert_unresolved_product_unique" ON "inventory_alerts" USING btree ("product_id") WHERE "inventory_alerts"."resolved_at" is null;
