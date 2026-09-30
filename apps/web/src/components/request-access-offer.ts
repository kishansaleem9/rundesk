/**
 * WHEN A REFUSED READ OFFERS "REQUEST ACCESS" (§G10 [12:16–12:20]).
 *
 * On the 404, and only there. A task the reader may not open and an id that
 * names nothing are answered alike — 404, in the same words — so that a link
 * does not say whether it leads anywhere (`found-30-sep/private-task-reads-say-403`;
 * RFC 9110 §15.5.4, OWASP's IDOR cheat sheet). The ask is offered on that one
 * answer, as ClickUp offers Request access on a link to a private item, and it
 * confirms nothing: the server records it whatever the id names and carries it
 * only to the people who could grant an object that is there.
 *
 * It was offered on a 403 alone, when the server answered 403 for a private
 * task and 404 for a missing one; that made the card itself the proof that the
 * task existed.
 *
 * Not on anything else: a 400 is an id that cannot be one, a 5xx or a dropped
 * connection is not a refusal, and a 403 is now a refusal of something the
 * reader may open (a write their level does not allow), where there is nothing
 * to ask for.
 */
export function offersRequestAccess(
  error: unknown,
  workspaceId: string | undefined,
  objectId: string | undefined,
): boolean {
  if (!workspaceId || !objectId) return false
  const status = error && typeof error === 'object' ? (error as { status?: unknown }).status : undefined
  return status === 404
}
