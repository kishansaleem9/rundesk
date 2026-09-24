/**
 * EVERY PERMISSION KEY THE API KNOWS — what a workspace admin holds — for a
 * suite that stubs `GET /workspaces/:ws/roles/me/permissions`.
 *
 * The web offers what that answer allows (`hooks/use-permissions.ts`), so a
 * suite that stubs the whole API and answers it with `[]` gets a menu with no
 * Space, Folder or Project in it: `space-wizard` could not open its wizard
 * once the Create menu read permissions. Read from the catalog itself rather
 * than copied here, so the stub cannot drift from the keys the API grants.
 */
import fs from 'node:fs'
import path from 'node:path'

const CATALOG = path.resolve(import.meta.dirname, '../../../apps/api/src/modules/custom-roles/permission-catalog.ts')

export const ALL_PERMISSIONS = [...fs.readFileSync(CATALOG, 'utf8').matchAll(/\{ key: '([a-z_.]+)'/g)].map((m) => m[1])

if (ALL_PERMISSIONS.length === 0) throw new Error(`no permission keys read from ${CATALOG}: its shape changed, so this reader must too`)
