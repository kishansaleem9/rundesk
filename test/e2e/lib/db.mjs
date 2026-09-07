/**
 * A direct database handle, for the few fixtures the API cannot create.
 *
 * WHY THIS EXISTS AT ALL, because reaching past the API in a test is normally
 * the wrong instinct: a fixture built by SQL can be a shape the product could
 * never produce, and a check against it proves nothing about the product.
 *
 * The legitimate case is a row with NO endpoint that writes it. `ai_usage` is
 * exactly that — rows are appended by the AI service as a side effect of
 * calling the model, and with no API key configured a test environment can
 * never produce one. Without this, §V2-11's most important check ("a workspace
 * that has spent money for no saving is shown as LOSING") can only be skipped,
 * and a skipped check reads as a passing one.
 *
 * RESOLVED THROUGH `packages/db`, not through a pinned path into `.pnpm`. The
 * driver is that package's dependency; resolving it from there follows the
 * symlinks pnpm actually laid down and keeps working when the version moves.
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const REPO = path.resolve(import.meta.dirname, '../../..')

/**
 * The connection string, from the environment or the repo's own `.env`.
 *
 * CI sets `DATABASE_URL`; a local run usually does not, and reading the same
 * file the API reads means the suite cannot end up pointed at a different
 * database than the one under test — which would fail in a way that looks like
 * a product bug.
 */
export function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const envFile = path.join(REPO, '.env')
  if (!fs.existsSync(envFile)) return null
  const line = fs.readFileSync(envFile, 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='))
  return line ? line.slice('DATABASE_URL='.length).trim() : null
}

/**
 * Open a handle, or return null when there is no database to reach.
 *
 * Null rather than throwing, so a suite can report "this check could not run"
 * instead of dying — the caller knows whether its checks are essential and this
 * module does not.
 */
export async function openDb() {
  const url = databaseUrl()
  if (!url) return null
  const require = createRequire(pathToFileURL(path.join(REPO, 'packages/db/package.json')))
  const entry = require.resolve('postgres')
  const { default: postgres } = await import(pathToFileURL(entry).href)
  // One connection, and a short timeout: a fixture helper that hangs turns a
  // suite failure into a suite that never finishes.
  return postgres(url, { max: 1, connect_timeout: 10, idle_timeout: 5 })
}
