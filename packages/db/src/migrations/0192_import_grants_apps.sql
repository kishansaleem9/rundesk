-- IMPORTERS BY SIGN-IN, AS CLICKUP HAS THEM (`found-13-oct/importers-by-sign-in-unbuilt`).
--
--   · `import_grants.provider`: Asana, Jira, Trello, Todoist, Wrike and Monday beside Basecamp —
--     each signed in to from the import page (Monday by its personal API token), the grant kept
--     for the person who signed in, sealed as every kept token is.
ALTER TABLE "import_grants" DROP CONSTRAINT IF EXISTS "import_grants_provider_check";
ALTER TABLE "import_grants" ADD CONSTRAINT "import_grants_provider_check" CHECK ("provider" IN ('basecamp', 'asana', 'jira', 'trello', 'todoist', 'wrike', 'monday'));
