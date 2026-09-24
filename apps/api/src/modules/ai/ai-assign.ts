/**
 * §V2-S17 frame `15:50` — **"⚡ Assign with AI"**, and the part of it that did
 * not exist.
 *
 * WHAT WAS THERE. `assign_task` in `ai-command.ts`, whose schema is
 * `required: ['taskId', 'assigneeEmail']` and whose resolution is an exact
 * case-insensitive match on that email (`resolveMember`). So the AI could
 * PERFORM an assignment that a person had already decided. The frame's menu
 * item is the other half: you press it *because* you do not know who should
 * take it. Choosing is the row.
 *
 * WHAT MAKES A CHOICE A CHOICE. A function that returns `members[0]` satisfies
 * every test of the form "it picked somebody", assigns the same person to
 * everything for ever, and photographs identically to a real one. So this file
 * is built so that cannot pass:
 *
 *   · the pick is made from PER-CANDIDATE NUMBERS — how much of this list's
 *     work they already carry, how much open work they carry overall, how much
 *     of it is late — and those numbers come back with it;
 *   · the reason names those numbers, so "why them" is answerable without
 *     trusting the ranking;
 *   · a RUNNER-UP comes back too, with its own numbers, so the pick can be
 *     seen to be a comparison rather than a selection of one;
 *   · and `test/e2e/ai-assign.mjs` seeds two members who differ only in load
 *     and asserts the less-loaded one is chosen — which `members[0]` fails
 *     exactly half the time, so the suite also asserts the ORDER the candidates
 *     arrive in does not decide the answer, by ranking the same set twice.
 *
 * PURE, I/O-FREE AND IMPORT-FREE, the same split as `ai-containers.ts`: the
 * evidence is gathered by `AiService.suggestAssignee` against Postgres, under
 * the same visibility filters as everything else, and the judgement is made
 * here where it can be tested outright.
 *
 * The capacity gate's input is PASSED IN rather than computed here, and that is
 * deliberate: "overloaded" already has a definition in this product —
 * `findOverloadedAssignees`, which the §7.12 workload alert uses — and a second
 * one living here is how the alert and the assignment start disagreeing about
 * the same person. The caller hands the answer in; importing it would make this
 * file and `ai.service.ts` import each other.
 */

import type Anthropic from '@anthropic-ai/sdk'

/**
 * The tool the assistant reaches for when the person has NOT named anybody.
 *
 * Deliberately separate from `assign_task`, which keeps its required
 * `assigneeEmail`: "assign this to Ana" and "who should take this" are
 * different questions, and one tool that answered both by making the email
 * optional would let a vague turn quietly pick somebody and assign them in the
 * same breath. This one only recommends.
 */
export const ASSIGN_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'suggest_assignee',
    description:
      'Recommend WHO should take a task, when the person has not named anybody. Returns a ranked list with each ' +
      'candidate\'s open workload, how much of this list\'s work they already carry, and how much of it is late. ' +
      'It does NOT assign anyone — report the recommendation and the reason, and use assign_task only if they then say to.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The id of the task that needs an assignee.' },
      },
      required: ['taskId'],
    },
  },
]

export function isAssignTool(name: string): boolean {
  return ASSIGN_TOOLS.some((t) => t.name === name)
}

/** A person who could take this task, with the evidence for and against. */
export type AssigneeCandidate = {
  userId: string
  email: string
  displayName: string | null
  /**
   * Open tasks assigned to them anywhere in this workspace that the ASKER may
   * open. Capacity, as far as the asker may see it: a colleague's load in a
   * space the asker is refused is not theirs to read, as a number or otherwise.
   */
  openTasks: number
  /**
   * Open tasks assigned to them IN THIS TASK'S LIST. Context — the argument
   * for giving a piece of work to someone already holding the thread of it.
   */
  inList: number
  /** How many of their open tasks are already late. Capacity, sharpened. */
  overdue: number
}

/** Why no suggestion was made. A closed vocabulary, as with containers. */
export type AssignRefusal =
  | 'unknown_task'
  | 'no_permission'
  | 'no_candidates'
  | 'already_assigned'

export const ASSIGN_REFUSAL_TEXT: Record<AssignRefusal, string> = {
  unknown_task: 'I could not find that task in this workspace — nothing was assigned.',
  no_permission: 'You do not have permission to assign that task — nothing was assigned.',
  no_candidates:
    'Nobody in this workspace can be assigned to that task, so there was nothing to choose between — nothing was assigned.',
  already_assigned: 'That task already has everyone who could take it — nothing was assigned.',
}

export type RankedAssignee = AssigneeCandidate & {
  /**
   * The sentence a person reads, built from this candidate's own numbers.
   *
   * Composed here rather than by the model for the same reason
   * `describeContainerResult` is: what the model says about a choice is not
   * evidence that the choice was made that way.
   */
  reason: string
  /** True when the capacity gate kept them out of contention. */
  overloaded: boolean
}

export type AssignSuggestion = {
  ok: true
  taskId: string
  pick: RankedAssignee
  /** The next-best, so the pick is visibly a comparison. `null` when alone. */
  runnerUp: RankedAssignee | null
  /** Everyone considered, best first. */
  ranked: RankedAssignee[]
  /** The team's average open load, the number the capacity gate is drawn from. */
  teamAverage: number
}

export type AssignRefused = { ok: false; reason: AssignRefusal; message: string }
export type AssignResult = AssignSuggestion | AssignRefused

export function refuseAssign(reason: AssignRefusal): AssignRefused {
  return { ok: false, reason, message: ASSIGN_REFUSAL_TEXT[reason] }
}

/**
 * One candidate's argument, in numbers.
 *
 * Every clause is conditional on the number it reports being interesting, so
 * two candidates cannot end up with the same sentence unless their evidence is
 * genuinely identical — a reason that reads the same for everybody is a label,
 * not a justification.
 */
export function explainCandidate(c: AssigneeCandidate, overloaded: boolean, teamAverage: number): string {
  const parts: string[] = []
  parts.push(
    c.inList > 0
      ? `already on ${c.inList} open task${c.inList === 1 ? '' : 's'} in this list`
      : 'not working in this list yet',
  )
  parts.push(`${c.openTasks} open task${c.openTasks === 1 ? '' : 's'} overall`)
  if (c.overdue > 0) parts.push(`${c.overdue} of them late`)
  if (overloaded) parts.push(`which is above the team average of ${teamAverage}`)
  return `${c.displayName || c.email}: ${parts.join(', ')}.`
}

/**
 * Choose, from evidence.
 *
 * THE RULE, and why it is this one.
 *
 *   1. CAPACITY IS A GATE, NOT A TIE-BREAK. Anyone in `overloadedUserIds` —
 *      which the caller sources from `findOverloadedAssignees`, the same
 *      function the §7.12 workload alert uses — drops out of contention.
 *   2. AMONG THE REST, CONTEXT WINS. Most `inList` first: the argument for a
 *      person is that they are already holding this thread.
 *   3. THEN THE LIGHTER LOAD, then the fewer late tasks.
 *   4. THEN EMAIL, ascending. A tie has to break somewhere, and it must not
 *      break on the order the rows arrived in — that is precisely the
 *      "returns the first member" failure wearing a sort's clothes.
 *
 * If EVERYONE is overloaded the gate opens again, because a team that is
 * uniformly busy still has a best person for the job, and refusing to answer
 * there would make the feature useless exactly when it is most wanted.
 */
export function rankAssignees(
  candidates: AssigneeCandidate[],
  taskId: string,
  overloadedUserIds: ReadonlySet<string> = new Set(),
): AssignResult {
  if (candidates.length === 0) return refuseAssign('no_candidates')

  // Reported whatever the gate does, so the reason can cite it.
  const teamAverage =
    Math.round((candidates.reduce((s, c) => s + c.openTasks, 0) / candidates.length) * 10) / 10
  // The gate must never empty the field.
  const flagged = [...overloadedUserIds].filter((id) => candidates.some((c) => c.userId === id))
  const gated = flagged.length >= candidates.length ? new Set<string>() : new Set(flagged)

  const ranked = [...candidates]
    .sort((a, b) => {
      const aOut = gated.has(a.userId) ? 1 : 0
      const bOut = gated.has(b.userId) ? 1 : 0
      if (aOut !== bOut) return aOut - bOut
      if (a.inList !== b.inList) return b.inList - a.inList
      if (a.openTasks !== b.openTasks) return a.openTasks - b.openTasks
      if (a.overdue !== b.overdue) return a.overdue - b.overdue
      return a.email.localeCompare(b.email)
    })
    .map((c) => ({
      ...c,
      overloaded: gated.has(c.userId),
      reason: explainCandidate(c, gated.has(c.userId), teamAverage),
    }))

  return {
    ok: true,
    taskId,
    pick: ranked[0],
    runnerUp: ranked[1] ?? null,
    ranked,
    teamAverage,
  }
}

/**
 * The sentence the assistant says about a suggestion, composed server-side.
 *
 * Names the person, the reason, and — when there was one — who they were
 * preferred OVER, because "Ana, because she has 2 open tasks" is a fact about
 * Ana and "preferred over Ben, who has 9" is the decision.
 */
export function describeAssignSuggestion(result: AssignResult): string {
  if (!result.ok) return result.message
  const { pick, runnerUp } = result
  const who = pick.displayName || pick.email
  const head = `I would give this to ${who} — ${pick.reason.replace(/^[^:]+:\s*/, '')}`
  if (!runnerUp) return `${head} They are the only person who can take it.`
  const other = runnerUp.displayName || runnerUp.email
  return `${head} Ahead of ${other}, who is ${runnerUp.reason.replace(/^[^:]+:\s*/, '')}`
}
