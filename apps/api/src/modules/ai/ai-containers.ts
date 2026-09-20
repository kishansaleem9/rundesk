import type Anthropic from '@anthropic-ai/sdk'

/**
 * §V2-S16 `[17:44]`–`[18:48]` — the AI brings a CONTAINER into existence.
 *
 * She types *"create a folder name as ddddd on rundesk space"* at `[17:44]`,
 * then *"Create a list named ddddd in rundesk instead"*; frame `18:45` shows
 * **Handling** over a two-step log — *"Checking the rundesk setup"*, *"Creating
 * the new rundesk list"* — and `18:48` settles to *"Done, created `rundesk >
 * ddddd` in rundesk with standard task statuses."*
 *
 * Until this file, `COMMAND_TOOLS` was six task-scoped tools and `chatStream`
 * passed no tools at all, so the surface the frames actually use could not act
 * on anything.
 *
 * WHY THIS FILE IS PURE AND DB-FREE. The whole risk of putting a tool in front
 * of a model is the facade with a model on top: a tool the model can call that
 * then fails, or reports success without writing anything, and leaves the
 * transcript of the conversation standing as evidence that it worked. So the
 * two halves are split and each is checkable on its own —
 *
 *   · here: the schemas, the space resolution, the refusal vocabulary, and the
 *     sentence that describes what was made. No I/O, unit-testable outright.
 *   · `AiService.executeOne` / `runContainerTool`: the write, through
 *     `ListsService.createList` / `FoldersService.create` — the SAME services
 *     the REST routes call, permission-checked the same way, so a list the AI
 *     made gets its status pipeline (`seedListStatuses`) exactly like one a
 *     person made. `test/e2e/ai-create-containers.mjs` asserts the ROW, in
 *     Postgres, after the call.
 *
 * Nothing here ever decides that an actor may do something. Resolution answers
 * "which space did they mean"; permission is answered against the database by
 * the executor, and a refusal from there is reported verbatim rather than
 * softened into prose.
 */

/** A space the actor can already see, as the tool catalog presents it. */
export type ContainerSpace = {
  id: string
  name: string
  /** 'public' | 'private' — carried so the executor can re-check access. */
  visibility: string | null
}

export type ContainerToolName = 'create_list' | 'create_folder'

/**
 * Why a container was NOT created. A closed vocabulary rather than free text:
 * the executor, the planner and the panel all branch on it, and an English
 * sentence compared with `includes()` is how three readers quietly drift.
 */
export type ContainerRefusal =
  | 'missing_name'
  | 'unknown_space'
  | 'ambiguous_space'
  | 'no_space'
  | 'no_permission'
  | 'name_taken'
  | 'unavailable'

/** The refusal a person reads. One sentence, and it says what would change it. */
export const CONTAINER_REFUSAL_TEXT: Record<ContainerRefusal, string> = {
  missing_name: 'I need a name for it — nothing was created.',
  unknown_space: 'I could not find that space in this workspace — nothing was created.',
  ambiguous_space: 'More than one space has that name, so I did not guess — nothing was created.',
  no_space: 'Say which space it should go in — nothing was created.',
  no_permission: 'You do not have permission to create that here — nothing was created.',
  name_taken: 'Something with that name is already there — nothing was created.',
  unavailable: 'Container creation is not wired up on this server — nothing was created.',
}

export type ContainerCreated = {
  ok: true
  kind: 'list' | 'folder'
  id: string
  name: string
  spaceId: string
  spaceName: string
  /** "Space > Name", the path the frame's chip shows. */
  path: string
  /** Status keys the new list was seeded with. Empty for a folder. */
  statuses: string[]
}

export type ContainerRefused = {
  ok: false
  kind: 'list' | 'folder'
  reason: ContainerRefusal
  message: string
}

export type ContainerToolResult = ContainerCreated | ContainerRefused

export function refuse(kind: 'list' | 'folder', reason: ContainerRefusal): ContainerRefused {
  return { ok: false, kind, reason, message: CONTAINER_REFUSAL_TEXT[reason] }
}

/**
 * The two tools, described to the model in the terms the frames use.
 *
 * `spaceName` is offered alongside `spaceId` because `[17:44]` is a person
 * typing "on rundesk space" — they name it, they do not paste a uuid. The
 * resolution below is deliberately strict about that convenience: an unknown
 * or ambiguous name REFUSES rather than picking the closest one, because a
 * container created in the wrong space is harder to notice than one that was
 * not created at all.
 */
export const CONTAINER_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'create_list',
    description:
      'Create a new LIST inside a space. Use this when the person asks for a list (a place tasks live). ' +
      'Name the space with spaceName (as the person said it) or spaceId (from "Available spaces"). ' +
      'The list is created immediately with the standard task statuses — say so plainly afterwards, and refer to it as [[list:<id>]] using the id in the tool result.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The list name, exactly as the person gave it.' },
        spaceName: { type: 'string', description: 'The space it belongs in, by name.' },
        spaceId: { type: 'string', description: 'The space it belongs in, by id (from Available spaces).' },
        description: { type: 'string', description: 'Optional one-line description.' },
        visibility: { type: 'string', enum: ['public', 'private'], description: 'Defaults to public.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_folder',
    description:
      'Create a new FOLDER inside a space. A folder groups projects; it does not hold tasks — if the person wants somewhere for tasks, use create_list instead. ' +
      'Name the space with spaceName or spaceId. The folder is created immediately.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The folder name, exactly as the person gave it.' },
        spaceName: { type: 'string', description: 'The space it belongs in, by name.' },
        spaceId: { type: 'string', description: 'The space it belongs in, by id (from Available spaces).' },
        color: { type: 'string', description: 'Optional hex colour, e.g. #354fb0.' },
      },
      required: ['name'],
    },
  },
]

export const CONTAINER_TOOL_NAMES: ReadonlySet<string> = new Set(
  CONTAINER_TOOLS.map((t) => t.name),
)

export function isContainerTool(name: string): name is ContainerToolName {
  return CONTAINER_TOOL_NAMES.has(name)
}

/** Trim a tool string argument; '' when it is anything but a non-blank string. */
export function toolString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Which space did they mean? PURE — the catalog is already filtered to spaces
 * the actor can see, so "not in the catalog" and "not yours" are one answer.
 *
 * Exact id wins, then a case-insensitive exact name. NO prefix or fuzzy match:
 * "rundesk" must not resolve to "Rundesk Archive" because a container quietly
 * created one space over is the kind of mistake nobody goes looking for. Two
 * spaces sharing a name is `ambiguous_space`, not a coin toss.
 */
export function resolveContainerSpace(
  input: { spaceId?: unknown; spaceName?: unknown },
  spaces: ContainerSpace[],
): { space: ContainerSpace } | { refusal: ContainerRefusal } {
  const id = toolString(input.spaceId)
  if (id) {
    const byId = spaces.find((s) => s.id === id)
    return byId ? { space: byId } : { refusal: 'unknown_space' }
  }
  const name = toolString(input.spaceName).toLowerCase()
  if (!name) {
    // One space and no ambiguity is not a guess, it is the only answer.
    if (spaces.length === 1) return { space: spaces[0] }
    return { refusal: 'no_space' }
  }
  const matches = spaces.filter((s) => s.name.trim().toLowerCase() === name)
  if (matches.length === 1) return { space: matches[0] }
  if (matches.length === 0) return { refusal: 'unknown_space' }
  return { refusal: 'ambiguous_space' }
}

/** "Space > Name" — the path the frame's chips read. */
export function containerPath(spaceName: string, name: string): string {
  return `${spaceName} > ${name}`
}

/**
 * The sentence frame `18:48` settles on, composed SERVER-SIDE from the row
 * that was actually written.
 *
 * *"Done, created `▤ rundesk > ddddd` in rundesk with standard task statuses."*
 *
 * Deterministic on purpose. The model is told to say this, but what it says is
 * not evidence of anything; this string is built from the returned id, so the
 * chip in the answer addresses a row that exists. It is used as the tool result
 * the model reads AND is what `runContainerTool` hands back, so a turn where
 * the model adds nothing of its own still tells the truth.
 */
export function describeContainerResult(result: ContainerToolResult): string {
  if (!result.ok) return result.message
  if (result.kind === 'list') {
    const statuses = result.statuses.length
      ? ' with standard task statuses'
      : ' — but with no status pipeline, which is a bug worth reporting'
    return `Done, created [[list:${result.id}]] in ${result.spaceName}${statuses}.`
  }
  return `Done, created the folder ${result.path} in ${result.spaceName}.`
}

/**
 * What the model is told about references, appended to the chat system prompt.
 *
 * The syntax is stable and dumb on purpose: the panel hydrates each ref from
 * the database at render time, so the STATUS BADGE on a task chip is current
 * even when the answer that mentions it is a week old (frame `20:10`, where
 * each chip carries the task's own status). A ref the reader may not see, or
 * that no longer exists, renders as plain text rather than as a broken chip.
 */
export const REFERENCE_INSTRUCTION = [
  'When you mention a task or a list that you know the id of, write it as a reference:',
  '[[task:<id>]] for a task, [[list:<id>]] for a list. The reader sees its real name and',
  'its live status, so do not also write the name or the status in your own words next to it.',
  'Only ever use an id that appeared in the workspace context or in a tool result — never invent one.',
].join('\n')

/**
 * What the model is told about the container tools.
 *
 * "Already happened" rather than "will happen": these execute during the turn,
 * unlike the preview→confirm mutations on `/ai/command`, and a model that
 * believes it is drafting a proposal writes the wrong sentence afterwards.
 */
export const CONTAINER_TOOL_INSTRUCTION = [
  'You can create a list or a folder with the create_list / create_folder tools.',
  'These run IMMEDIATELY — by the time you see the tool result the row exists, or the result',
  'says why it does not. Never claim a container was created unless a tool result said so, and',
  'never re-run a tool that already succeeded. If a tool result refuses, report the refusal as',
  'given and stop; do not try a different space or a different name on the person’s behalf.',
].join('\n')
