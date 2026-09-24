/**
 * A goal's progress, as a whole percentage from 0 to 100: how far its current
 * value is towards its target. One rule for the goals list and the goal page —
 * the list drew `goal.progress`, a field the API has never sent, so every card
 * read 0% (`found-24-sep/goals-page-reads-fields-the-api-never-sends`).
 */
export function goalProgress(currentValue: number, targetValue: number): number {
  if (!(targetValue > 0) || !Number.isFinite(currentValue)) return 0
  return Math.max(0, Math.min(100, Math.round((currentValue / targetValue) * 100)))
}
