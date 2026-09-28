import { ForbiddenException, NotFoundException } from '@nestjs/common'

/**
 * A check's answer as a capability: true when it passes, false when it
 * refuses (403, or the 404 a rule answers for what the caller may not see),
 * and anything else thrown.
 *
 * A menu asks the very check its route asks, so it offers a control exactly
 * where the route would accept it
 * (`found-28-sep/delete-and-public-link-offered-to-everyone`).
 */
export function allowedBy(check: Promise<unknown>): Promise<boolean> {
  return check.then(
    () => true,
    (e) => {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) return false
      throw e
    },
  )
}
