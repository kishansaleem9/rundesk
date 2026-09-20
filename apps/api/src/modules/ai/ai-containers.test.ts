import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CONTAINER_TOOLS,
  describeContainerResult,
  refuse,
  resolveContainerSpace,
  type ContainerSpace,
} from './ai-containers'
import { planFromToolCalls, type CommandContext, type ToolCall } from './ai-command'

/**
 * §V2-S16 `[17:44]`–`[18:48]` — the half of "the AI creates a container" that
 * can be checked without a model, a database or a key.
 *
 * The other half — that the row is really in Postgres, with its status
 * pipeline, and that somebody who may not create it is refused — is
 * `test/e2e/ai-create-containers.mjs`, because only a real database can answer
 * it. What is here is the part where a mistake is silent: resolving "rundesk"
 * to the wrong space, or describing a container that was never made.
 */

const SPACES: ContainerSpace[] = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'rundesk', visibility: 'public' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Rundesk Archive', visibility: 'public' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Ops', visibility: 'private' },
]

describe('§V2-S16 resolving the space a container goes in', () => {
  it('matches a name case-insensitively and exactly', () => {
    const r = resolveContainerSpace({ spaceName: 'RUNDESK' }, SPACES)
    assert.ok('space' in r)
    assert.equal(r.space.id, SPACES[0].id)
  })

  it('refuses a PREFIX rather than picking the closest space', () => {
    /*
     * The mistake this exists to prevent: "rundesk" resolving to "Rundesk
     * Archive" because it starts with the same letters. A container created one
     * space over is harder to notice than one that was never created — nobody
     * goes looking for a list that is exactly where it was asked for.
     */
    const r = resolveContainerSpace({ spaceName: 'rundesk arch' }, SPACES)
    assert.ok('refusal' in r)
    assert.equal(r.refusal, 'unknown_space')
  })

  it('refuses when two spaces share a name instead of guessing', () => {
    const twins: ContainerSpace[] = [
      { id: 'a1111111-1111-4111-8111-111111111111', name: 'Team', visibility: 'public' },
      { id: 'b1111111-1111-4111-8111-111111111111', name: 'team', visibility: 'public' },
    ]
    const r = resolveContainerSpace({ spaceName: 'Team' }, twins)
    assert.ok('refusal' in r)
    assert.equal(r.refusal, 'ambiguous_space')
  })

  it('takes the only space when none was named, and refuses when there are several', () => {
    const one = resolveContainerSpace({}, [SPACES[0]])
    assert.ok('space' in one)
    const many = resolveContainerSpace({}, SPACES)
    assert.ok('refusal' in many)
    assert.equal(many.refusal, 'no_space')
  })

  it('refuses an id that is not in the catalog, even when a name would have matched', () => {
    // An id the caller cannot see must not fall back to a name lookup — that
    // would turn "you may not reach this space" into "here is a space".
    const r = resolveContainerSpace(
      { spaceId: '99999999-9999-4999-8999-999999999999', spaceName: 'rundesk' },
      SPACES,
    )
    assert.ok('refusal' in r)
    assert.equal(r.refusal, 'unknown_space')
  })
})

describe('§V2-S16 the sentence describes the row, not the request', () => {
  it('names the list by id so the chip addresses something that exists', () => {
    const said = describeContainerResult({
      ok: true,
      kind: 'list',
      id: '44444444-4444-4444-8444-444444444444',
      name: 'ddddd',
      spaceId: SPACES[0].id,
      spaceName: 'rundesk',
      path: 'rundesk > ddddd',
      statuses: ['todo', 'done'],
    })
    assert.match(said, /\[\[list:44444444-4444-4444-8444-444444444444\]\]/)
    assert.match(said, /standard task statuses/)
  })

  it('does NOT claim standard statuses when the pipeline came back empty', () => {
    /*
     * The sentence goes to a person, so "with standard task statuses" has to be
     * a fact about THIS row rather than a fact about what createList usually
     * does. A list with no statuses accepts `status = 'done'` while keeping
     * `status_category = 'open'` forever, and the only warning anybody would
     * ever get is this sentence.
     */
    const said = describeContainerResult({
      ok: true,
      kind: 'list',
      id: '44444444-4444-4444-8444-444444444444',
      name: 'ddddd',
      spaceId: SPACES[0].id,
      spaceName: 'rundesk',
      path: 'rundesk > ddddd',
      statuses: [],
    })
    assert.doesNotMatch(said, /standard task statuses/)
    assert.match(said, /bug worth reporting/)
  })

  it('a refusal says nothing was created', () => {
    for (const reason of ['no_permission', 'unknown_space', 'name_taken'] as const) {
      assert.match(describeContainerResult(refuse('list', reason)), /nothing was created/i)
    }
  })
})

describe('§V2-S16 the planner turns a container tool call into a plan, not a write', () => {
  const ctx: CommandContext = {
    today: '2026-09-20',
    lists: [],
    members: [],
    tasks: [],
    spaces: SPACES,
  }

  it('plans a list against the resolved space', () => {
    const calls: ToolCall[] = [{ name: 'create_list', input: { name: 'ddddd', spaceName: 'rundesk' } }]
    const plan = planFromToolCalls(calls, ctx)
    assert.equal(plan.actions.length, 1)
    const action = plan.actions[0]
    assert.equal(action.tool, 'create_list')
    assert.equal(action.tool === 'create_list' && action.args.spaceId, SPACES[0].id)
    assert.match(action.humanLabel, /rundesk > ddddd/)
    assert.deepEqual(plan.warnings, [])
  })

  it('warns instead of planning when the space cannot be resolved', () => {
    const plan = planFromToolCalls(
      [{ name: 'create_folder', input: { name: 'ddddd', spaceName: 'nowhere' } }],
      ctx,
    )
    assert.deepEqual(plan.actions, [])
    assert.equal(plan.warnings.length, 1)
    assert.match(plan.warnings[0], /not in this workspace/)
  })

  it('warns rather than creating something unnamed', () => {
    const plan = planFromToolCalls([{ name: 'create_list', input: { spaceName: 'rundesk' } }], ctx)
    assert.deepEqual(plan.actions, [])
    assert.match(plan.warnings[0], /no name was provided/)
  })

  it('refuses every container call when the catalog is absent', () => {
    // A context built by an older caller carries no `spaces`. It must refuse,
    // not fall back to "the first space I can think of".
    const plan = planFromToolCalls([{ name: 'create_list', input: { name: 'x', spaceName: 'rundesk' } }], {
      ...ctx,
      spaces: undefined,
    })
    assert.deepEqual(plan.actions, [])
    assert.equal(plan.warnings.length, 1)
  })
})

describe('§V2-S16 the tool set the model is offered', () => {
  it('carries exactly the two container tools, each requiring a name', () => {
    assert.deepEqual(CONTAINER_TOOLS.map((t) => t.name), ['create_list', 'create_folder'])
    for (const tool of CONTAINER_TOOLS) {
      assert.deepEqual((tool.input_schema as { required?: string[] }).required, ['name'])
    }
  })

  it('tells the model the tools have ALREADY run by the time it sees a result', () => {
    // The chat surface executes during the turn; `/ai/command` previews. A
    // model that believes it is drafting a proposal writes "I'll create that
    // for you" about a list that already exists, and the person waits for a
    // confirm button that is never coming.
    const listTool = CONTAINER_TOOLS.find((t) => t.name === 'create_list')!
    assert.match(listTool.description ?? '', /created immediately/i)
  })
})
