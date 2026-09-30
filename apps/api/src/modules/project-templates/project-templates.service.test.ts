import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import {
  ProjectTemplatesService,
  normalizeTemplateTags,
  TEMPLATE_TAG_MAX_LENGTH,
  TEMPLATE_TAGS_MAX,
} from './project-templates.service'

/**
 * `ledger-rows/row-1874` — the Template Center's Tags facet: a template's tags
 * as they are written, and the route that changes them afterwards.
 *
 * ClickUp (help centre, "Organize templates with tags"): a template is saved
 * with "a template name, description, tags", and "You can add or edit tags in
 * the Template Center at any time". What is under test here is the cleaning —
 * trimmed, one per word whatever its case, refused in words past forty
 * characters or twenty tags — and what `setTags` refuses before it writes.
 * The facet's SQL (`unnest`, `lower()`) and the permission are asked of a real
 * database and a real guard by `test/e2e/template-center.mjs`.
 */

/** A select that resolves to `rows` however it is chained. */
function selectChain(rows: unknown[]) {
  const q = Promise.resolve(rows) as any
  for (const step of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit', 'groupBy']) q[step] = () => q
  return q
}

/** A database that answers its selects in order and keeps what an update set. */
function fakeDb(selects: unknown[][]) {
  const written: { set?: Record<string, unknown> } = {}
  const queue = [...selects]
  const db = {
    select: mock.fn(() => selectChain(queue.shift() ?? [])),
    update: mock.fn(() => ({
      set: (set: Record<string, unknown>) => {
        written.set = set
        return { where: () => ({ returning: async () => [{ id: TPL, ...set }] }) }
      },
    })),
    insert: mock.fn(() => {
      throw new Error('nothing here inserts')
    }),
  }
  return { db, written }
}

const WS = '11111111-1111-4111-8111-111111111111'
const TPL = '22222222-2222-4222-8222-222222222222'
const ME = '33333333-3333-4333-8333-333333333333'

const service = (db: unknown) => new ProjectTemplatesService(db as any, {} as any, {} as any)
const ownTemplate = { id: TPL, workspaceId: WS, isBuiltIn: false, name: 'Sprint', tags: ['Old'] }
const builtIn = { id: TPL, workspaceId: null, isBuiltIn: true, name: 'Software sprint', tags: [] }

/** The refusal's words, or null when nothing was refused. */
function refusal(fn: () => unknown): { status: number; message: string } | null {
  try {
    fn()
    return null
  } catch (err) {
    if (err instanceof BadRequestException || err instanceof NotFoundException) {
      return { status: err.getStatus(), message: err.message }
    }
    throw err
  }
}

describe('normalizeTemplateTags — a template\'s tags, cleaned once where they are written', () => {
  it('trims each tag, makes a run of spaces one, and drops the blanks', () => {
    assert.deepEqual(normalizeTemplateTags(['  Q3 ', 'Launch   day', '   ', '']), ['Q3', 'Launch day'])
  })

  it('keeps one tag per word whatever its case, in the spelling first given', () => {
    assert.deepEqual(normalizeTemplateTags(['Q3', 'client', 'q3', 'CLIENT ', 'Retro']), ['Q3', 'client', 'Retro'])
  })

  it('reads an absent list as no tags', () => {
    assert.deepEqual(normalizeTemplateTags(undefined), [])
    assert.deepEqual(normalizeTemplateTags(null), [])
  })

  it('refuses a tag longer than forty characters, saying the bound and its length, rather than cutting it', () => {
    const long = 'x'.repeat(TEMPLATE_TAG_MAX_LENGTH + 3)
    const said = refusal(() => normalizeTemplateTags(['fine', long]))
    assert.equal(said?.status, 400)
    assert.match(said?.message ?? '', /^A tag can be at most 40 characters, and "x{24}…" has 43$/)
    // Forty exactly is a tag.
    assert.deepEqual(normalizeTemplateTags(['y'.repeat(TEMPLATE_TAG_MAX_LENGTH)]), ['y'.repeat(40)])
  })

  it('counts a tag\'s characters as a person does, so forty emoji are a tag and forty-one are not', () => {
    assert.deepEqual(normalizeTemplateTags(['🚀'.repeat(40)]), ['🚀'.repeat(40)])
    assert.equal(refusal(() => normalizeTemplateTags(['🚀'.repeat(41)]))?.status, 400)
  })

  it('refuses more than twenty tags, saying how many, rather than keeping the first twenty', () => {
    const many = Array.from({ length: TEMPLATE_TAGS_MAX + 1 }, (_, i) => `tag ${i}`)
    const said = refusal(() => normalizeTemplateTags(many))
    assert.equal(said?.status, 400)
    assert.equal(said?.message, 'A template can carry at most 20 tags, and these are 21')
  })

  it('counts the twenty after the duplicates are folded, so a list that only repeats itself is not refused', () => {
    const twenty = Array.from({ length: TEMPLATE_TAGS_MAX }, (_, i) => `tag ${i}`)
    assert.equal(normalizeTemplateTags([...twenty, ...twenty.map((t) => t.toUpperCase())]).length, 20)
  })

  it('refuses a list that is not one, and a tag that is not text', () => {
    assert.equal(refusal(() => normalizeTemplateTags('Q3'))?.message, 'Tags must be a list of words')
    assert.equal(refusal(() => normalizeTemplateTags(['Q3', 3]))?.message, 'Every tag must be text')
  })
})

describe('setTags — a template\'s tags, changed after it was saved', () => {
  it('writes the cleaned list over the one held, and answers with the row', async () => {
    const { db, written } = fakeDb([[ownTemplate]])
    const row = await service(db).setTags(WS, TPL, [' Retro ', 'retro', 'Q3'])
    assert.deepEqual(written.set?.tags, ['Retro', 'Q3'])
    assert.ok(written.set?.updatedAt instanceof Date)
    assert.deepEqual(row.tags, ['Retro', 'Q3'])
  })

  it('clears them when sent an empty list', async () => {
    const { db, written } = fakeDb([[ownTemplate]])
    await service(db).setTags(WS, TPL, [])
    assert.deepEqual(written.set?.tags, [])
  })

  it('refuses a built-in, which every workspace is shown, and writes nothing', async () => {
    const { db } = fakeDb([[builtIn]])
    await assert.rejects(service(db).setTags(WS, TPL, ['Q3']), (err: unknown) =>
      err instanceof BadRequestException && err.message === 'A built-in template cannot be tagged')
    assert.equal(db.update.mock.callCount(), 0)
  })

  it('refuses a body with no list rather than clearing the tags, and writes nothing', async () => {
    const { db } = fakeDb([[ownTemplate]])
    await assert.rejects(service(db).setTags(WS, TPL, undefined), (err: unknown) =>
      err instanceof BadRequestException && err.message === 'Send the tags as a list; an empty list clears them')
    assert.equal(db.update.mock.callCount(), 0)
  })

  it('refuses tags past their bounds and writes nothing', async () => {
    const { db } = fakeDb([[ownTemplate]])
    await assert.rejects(service(db).setTags(WS, TPL, ['z'.repeat(41)]), BadRequestException)
    assert.equal(db.update.mock.callCount(), 0)
  })

  it('answers a malformed id as a template that is not there, without asking the database', async () => {
    const { db } = fakeDb([])
    await assert.rejects(service(db).setTags(WS, 'not-a-uuid', ['Q3']), (err: unknown) =>
      err instanceof NotFoundException && err.message === 'Template not found')
    assert.equal(db.select.mock.callCount(), 0)
  })

  it('answers another workspace\'s template as one that is not there', async () => {
    const { db } = fakeDb([[{ ...ownTemplate, workspaceId: '44444444-4444-4444-8444-444444444444' }]])
    await assert.rejects(service(db).setTags(WS, TPL, ['Q3']), NotFoundException)
    assert.equal(db.update.mock.callCount(), 0)
  })
})

describe('saving a template refuses its tags before it reads anything', () => {
  it('a save from a project with a tag past its bound is refused before the project is looked up', async () => {
    const { db } = fakeDb([])
    await assert.rejects(
      service(db).saveFromProject(WS, { id: ME }, { projectId: TPL, name: 'Sprint', tags: ['w'.repeat(41)] }),
      BadRequestException,
    )
    assert.equal(db.select.mock.callCount(), 0)
  })
})
