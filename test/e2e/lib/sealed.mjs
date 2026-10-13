/**
 * A SECRET AS THE API KEEPS IT (`found-13-oct/provider-grants-kept-in-the-clear`).
 *
 * Provider tokens and the other kept secrets are sealed (AES-256-GCM under
 * `TOKEN_ENCRYPTION_KEY`, the column's name as associated data;
 * `packages/db/src/secret-box.ts`, `sealed-text.ts`). A check that reads one by
 * SQL opens it here, so "the token kept is the one given" means the same
 * sealed or not. The key is the API's: `TOKEN_ENCRYPTION_KEY` where the suite
 * has it, else the one every lane and CI set (`lane_mail_env`), nobody's secret.
 */
import { createDecipheriv } from 'node:crypto'

const LANE_KEY = '6c616e652d6b65792d6e6f742d612d7365637265742d72756e6465736b2d3031'

const keyOf = (env = process.env) => {
  const raw = String(env.TOKEN_ENCRYPTION_KEY ?? LANE_KEY).trim()
  return /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
}

/** A value the box sealed: `v1:<nonce>:<tag>:<sealed>`. */
export const isSealed = (value) => typeof value === 'string' && /^v1:[^:]+:[^:]+:[^:]*$/.test(value)

/** The value kept, opened when it is sealed: as given in the clear, or null when it does not open. */
export function openKept(value, context) {
  if (!isSealed(value)) return value
  try {
    const [, nonce, tag, sealed] = value.split(':')
    const d = createDecipheriv('aes-256-gcm', keyOf(), Buffer.from(nonce, 'base64url'))
    d.setAAD(Buffer.from(context, 'utf8'))
    d.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([d.update(Buffer.from(sealed, 'base64url')), d.final()]).toString('utf8')
  } catch {
    return null
  }
}
