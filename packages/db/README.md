# @rundesk/db

Drizzle ORM schema, migrations, and seed for Rundesk.

## Source of truth

The **TypeScript schema in `src/schema/*.ts` is the source of truth** for the
database. The full schema (77 tables, 11 enums) is materialised with
`drizzle-kit push`, which diffs the live database against the schema and applies
the changes directly. This is how both local dev and production are
bootstrapped.

## Fresh database (first-time setup)

```bash
# from the repo root, with infra (Postgres) running and ../../.env populated
pnpm --filter @rundesk/db db:setup
```

`db:setup` runs `drizzle-kit push --force` (creates the entire schema from
`src/schema`) and then seeds an idempotent admin user + demo workspace.

> Do **not** bootstrap a fresh database with `db:migrate`. The numbered SQL
> files in `src/migrations` are **incremental patches layered on top of the
> push baseline**, not a complete, replayable history (e.g. the `notifications`
> table and several enums are only ever created by the schema/push, never by a
> numbered migration). Running `drizzle-kit migrate` against an empty database
> will fail.

## Migrations (`src/migrations`)

Numbered migrations are applied **on top of** a push-created baseline, so they
are written defensively (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT
EXISTS`, `DO $$ … EXCEPTION WHEN duplicate_object … $$`) and are idempotent
against a schema that already matches `src/schema`.

In production (`deploy/deploy.sh`):

1. The schema is first created with `drizzle-kit push`.
2. `deploy/baseline-drizzle-0000-0008.sql` inserts the migration hashes for
   `0000`–`0008` into `drizzle.__drizzle_migrations` so that `drizzle-kit
   migrate` then only applies `0009+`.

### Adding a migration

```bash
pnpm --filter @rundesk/db db:generate   # generate from schema changes
# review the generated SQL, then it is applied via db:migrate on top of push
```

Guardrails (see `docs/integration-branch-workflow.md`):

- Filenames must match `NNNN_name.sql` with a contiguous, gap-free sequence
  (enforced by `scripts/check-migration-order.mjs`).
- Append only — avoid rewriting previously-shipped migrations. The one
  exception applied so far is `0004`, which was made self-healing (it now
  guards the `notification_type` enum it previously assumed) so that it cannot
  hard-fail; the change is a no-op on any already-migrated database.

## Scripts

| Script | Purpose |
|---|---|
| `db:setup` | **First-time bootstrap**: `push --force` + seed. |
| `db:push` | Sync the live DB to `src/schema` (no migration files). |
| `db:generate` | Generate a migration from schema changes. |
| `db:migrate` | Apply numbered migrations (`0009+`) on top of the push baseline. |
| `db:seed` | Idempotent seed (admin user + demo workspace). |
| `db:studio` | Open Drizzle Studio. |
