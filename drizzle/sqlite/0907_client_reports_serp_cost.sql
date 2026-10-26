-- Carlos Ortega fork: what the Google results page queries (DataForSEO) have cost for each client report, in euros.
ALTER TABLE `client_reports` ADD `serp_cost_eur` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `client_reports` ADD `serp_calls` integer DEFAULT 0 NOT NULL;
