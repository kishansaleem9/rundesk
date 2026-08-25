import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/$workspaceId/ai')({
  // §A2.3 — a question asked somewhere else has to survive the jump here,
  // otherwise the user retypes it.
  validateSearch: (search: Record<string, unknown>): { prompt?: string; skillId?: string } => ({
    prompt: typeof search.prompt === 'string' && search.prompt.trim() ? search.prompt : undefined,
    // §15 — "Ask with this skill" hands the skill over the same way §A2.3
    // hands over a question. Unlike `prompt` it is NOT dropped after arrival:
    // the skill scopes the whole conversation, not just its first turn.
    skillId:
      typeof search.skillId === 'string' && search.skillId.trim() ? search.skillId : undefined,
  }),
})
