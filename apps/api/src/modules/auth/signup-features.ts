import { SIGNUP_FEATURE_FLAGS } from '@rundesk/feature-flags'

/**
 * G08-4 [08:43], [09:02] — the rows the feature picker turns into.
 *
 * A pure function, and separate from `signUp` on purpose. Testing this inside
 * the signup transaction would mean mocking eight inserts to assert one of
 * them; here the thing that can actually be wrong — which flags end up on and
 * which off — is checkable directly, and the transaction only has to be
 * trusted to write what it is handed.
 */
export function signupFeatureRows(
  picked: string[] | undefined,
  workspace: { id: string },
  actorId: string,
) {
  /*
   * An ABSENT list is not an empty one.
   *
   * `undefined` means the caller never went through the picker — an API
   * client, or an older web build — and switching every feature off for them
   * would be a silent, destructive answer to a question they were never asked.
   * An empty array is a real answer: somebody unticked everything.
   */
  if (!Array.isArray(picked)) return []

  const chosen = new Set(picked)
  return Object.entries(SIGNUP_FEATURE_FLAGS).flatMap(([pill, keys]) =>
    keys.map((flagKey) => ({
      flagKey,
      scope: 'workspace' as const,
      scopeId: workspace.id,
      workspaceId: workspace.id,
      enabled: chosen.has(pill),
      updatedBy: actorId,
    })),
  )
}
