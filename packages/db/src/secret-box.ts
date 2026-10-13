import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * A SECRET KEPT SO THAT THE DATABASE ALONE DOES NOT GIVE IT BACK
 * (`found-12-oct/task-email-imap-unbuilt`, `found-13-oct/provider-grants-kept-in-the-clear`).
 *
 * A mailbox linked over IMAP is signed in to with its password on every send
 * and every read, so the password has to be kept — and read back. It is kept
 * sealed: AES-256-GCM under `TOKEN_ENCRYPTION_KEY` (the key `oauth.service.ts`
 * names for any provider secret kept at rest), a fresh 12-byte nonce each time,
 * and the row it belongs to as associated data, so a sealed value copied onto
 * another row does not open there. Without the key nothing is sealed: the
 * caller refuses to keep the secret at all, rather than keep it in the clear.
 *
 * `TOKEN_ENCRYPTION_KEY`: 32 bytes, as 64 hex digits or as base64.
 */

const VERSION = 'v1'

export class SecretBoxUnavailable extends Error {
  constructor(message = 'Not set up on this server — missing TOKEN_ENCRYPTION_KEY') {
    super(message)
    this.name = 'SecretBoxUnavailable'
  }
}

/** A sealed value that does not open: another key, another row, or changed. */
export class SecretBoxRefused extends Error {
  constructor(message = 'A secret kept on this server no longer opens: it was sealed under another key, or for another row') {
    super(message)
    this.name = 'SecretBoxRefused'
  }
}

/** The key, or null when none is set or it is not 32 bytes. */
export function secretBoxKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = (env.TOKEN_ENCRYPTION_KEY ?? '').trim()
  if (!raw) return null
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  return key.length === 32 ? key : null
}

/** Whether this server can keep a secret at all, and if not, why. */
export function secretBoxReadiness(env: NodeJS.ProcessEnv = process.env): { available: true } | { available: false; reason: string } {
  const raw = (env.TOKEN_ENCRYPTION_KEY ?? '').trim()
  if (!raw) return { available: false, reason: 'Not set up on this server — missing TOKEN_ENCRYPTION_KEY' }
  if (!secretBoxKey(env)) return { available: false, reason: 'Not set up on this server — TOKEN_ENCRYPTION_KEY is not 32 bytes (64 hex digits, or base64)' }
  return { available: true }
}

/** `v1:<nonce>:<tag>:<sealed>`, each base64url; `context` names the row it is for. */
export function seal(plain: string, context: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = secretBoxKey(env)
  const ready = secretBoxReadiness(env)
  if (!key) throw new SecretBoxUnavailable('reason' in ready ? ready.reason : undefined)
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(Buffer.from(context, 'utf8'))
  const sealed = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [VERSION, nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), sealed.toString('base64url')].join(':')
}

/** The secret, or `SecretBoxRefused` when it does not open under this key for this row. */
export function open(boxed: string, context: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = secretBoxKey(env)
  if (!key) throw new SecretBoxUnavailable()
  const parts = boxed.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) throw new SecretBoxRefused('A secret kept on this server is not one it sealed')
  const [, nonce, tag, sealed] = parts
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'))
    decipher.setAAD(Buffer.from(context, 'utf8'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(sealed, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    throw new SecretBoxRefused()
  }
}

/** Whether a kept value is one this box sealed (as against a value kept in the clear before it). */
export const isSealed = (value: string | null | undefined): value is string => typeof value === 'string' && value.startsWith(`${VERSION}:`)
