import { customType } from 'drizzle-orm/pg-core'
import { isSealed, open, secretBoxKey, seal } from '../secret-box'

/**
 * A TEXT COLUMN WHOSE VALUE IS KEPT SEALED (`found-13-oct/provider-grants-kept-in-the-clear`).
 *
 * The tokens kept for Google, Microsoft and the other providers, a TOTP secret,
 * an OIDC client secret and a webhook's signing secret are each a lasting key
 * to somebody's account or to a workspace's integrations; whoever reads the
 * database — a backup, a replica, a dump — read them all. Each is kept here:
 * sealed (AES-256-GCM, `secret-box.ts`) whenever `TOKEN_ENCRYPTION_KEY` is
 * set, under the column's own name as associated data, so a value moved to
 * another column does not open there; and given back in the clear to the code
 * that reads it, so nothing above the schema changes.
 *
 * A value kept before the key was set is read as it is, and sealed when it is
 * next written (`SecretsAtRestService` seals what is left at boot). A sealed
 * value that does not open — the key changed — reads as empty: the provider
 * refuses it, and the grant is asked for again, as a revoked one is.
 *
 * Still `text` to Postgres: no migration, and a column is compared by nothing
 * (a sealed value differs every time it is written).
 */
let warned = false
export const sealedText = (name: string, context: string) =>
  customType<{ data: string; driverData: string }>({
    dataType: () => 'text',
    toDriver: (value) => (secretBoxKey() ? seal(value, context) : value),
    fromDriver: (value) => {
      if (!isSealed(value)) return value
      try {
        return open(value, context)
      } catch (err) {
        if (!warned) {
          warned = true
          console.warn(`[sealed-text] ${context}: a sealed value does not open on this server (${err instanceof Error ? err.message : String(err)}); it reads as empty`)
        }
        return ''
      }
    },
  })(name)
