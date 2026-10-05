/**
 * TAGS NAMED FOR A TASK BEING MADE — what `TasksService.createTask` asks of the
 * names it is handed (`labelsByName`): by `POST /tasks`, the create modal, a
 * task made from a template.
 */

/**
 * `found-30-sep/refused-create-leaves-tags` — tags a task is made with BY NAME,
 * as the create modal types them and a template holds them: each found in the
 * task's workspace whatever its case, as `POST /workspaces/:ws/labels` finds
 * one (`LabelsService.create`), or else made there — and made only once the
 * task is (`TasksService.createTask`). Names are trimmed, blanks dropped, and
 * each kept once, the first spelling winning.
 */
export interface LabelByName {
  name: string
  color?: string
}

/** The neutral colour a tag made without one gets, as a template's always did. */
export const DEFAULT_LABEL_COLOR = '#94a3b8'

export function uniqueLabelNames(labels: ReadonlyArray<LabelByName> | null | undefined): LabelByName[] {
  const seen = new Set<string>()
  const out: LabelByName[] = []
  for (const l of labels ?? []) {
    const name = typeof l?.name === 'string' ? l.name.trim() : ''
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, color: typeof l.color === 'string' && l.color.trim() ? l.color.trim() : DEFAULT_LABEL_COLOR })
  }
  return out
}

/**
 * Which of the names the workspace already holds (their ids), and which would
 * have to be made. A GUEST MAKES NONE: guests "can't create, edit, or delete
 * tags" in ClickUp, and `POST /workspaces/:ws/labels` refuses them (403,
 * `LabelsService.assertNotGuest`), so a name a guest types that is not a tag
 * yet is left off the task rather than made — a tag that cannot be made must
 * not cost the task, the create modal's own rule.
 */
export function planLabelsByName(
  wanted: ReadonlyArray<LabelByName>,
  existing: ReadonlyArray<{ id: string; name: string }>,
  { mayMake }: { mayMake: boolean },
): { foundIds: string[]; toMake: LabelByName[] } {
  const byLower = new Map<string, string>()
  for (const l of existing) if (!byLower.has(l.name.toLowerCase())) byLower.set(l.name.toLowerCase(), l.id)
  const foundIds: string[] = []
  const toMake: LabelByName[] = []
  for (const l of wanted) {
    const id = byLower.get(l.name.toLowerCase())
    if (id) foundIds.push(id)
    else if (mayMake) toMake.push(l)
  }
  return { foundIds, toMake }
}
