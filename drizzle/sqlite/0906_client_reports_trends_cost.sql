-- Carlos Ortega fork: what the Google Trends queries (DataForSEO) have cost for each client report, in euros.
ALTER TABLE `client_reports` ADD `trends_cost_eur` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `client_reports` ADD `trends_calls` integer DEFAULT 0 NOT NULL;
