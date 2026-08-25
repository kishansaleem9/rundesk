import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_THREAD_TITLE,
  cleanTitle,
  fallbackTitle,
  shouldAutoTitle,
} from './chat-thread-title'

/**
 * §15 — "New Chat" → "Skill Definition and Ideas" (frames `296_1817`,
 * `297_1820`). The rename is what makes the sidebar list usable; five threads
 * called "New Chat" is the same as no list at all.
 */

const thread = (over: Partial<Parameters<typeof shouldAutoTitle>[0]> = {}) => ({
  title: DEFAULT_THREAD_TITLE,
  titleIsAuto: 'yes' as const,
  messageCount: 2,
  ...over,
})

describe('§15 when a chat gets named', () => {
  it('names it once there is an exchange to name', () => {
    assert.ok(shouldAutoTitle(thread()))
  })

  it('waits for an answer rather than naming from the question alone', () => {
    assert.ok(!shouldAutoTitle(thread({ messageCount: 1 })))
    assert.ok(!shouldAutoTitle(thread({ messageCount: 0 })))
  })

  it('never renames a thread its owner titled', () => {
    // The one that actually loses something: a person names a thread, keeps
    // talking, and the model quietly replaces their words.
    assert.ok(!shouldAutoTitle(thread({ titleIsAuto: 'no' })))
    assert.ok(!shouldAutoTitle(thread({ titleIsAuto: 'no', title: 'My planning notes' })))
  })

  it('does not rename a thread that already has an automatic name', () => {
    // Otherwise the sidebar reshuffles under someone reading it, and the title
    // drifts with every message.
    assert.ok(!shouldAutoTitle(thread({ title: 'Skill Definition and Ideas' })))
  })

  it('stays quiet on a long thread that was already named', () => {
    assert.ok(!shouldAutoTitle(thread({ title: 'Sprint planning', messageCount: 40 })))
  })
})

describe('§15 tidying a generated title', () => {
  it('unwraps the quotes models like to add', () => {
    assert.equal(cleanTitle('"Skill Definition and Ideas"'), 'Skill Definition and Ideas')
    assert.equal(cleanTitle("'Weekly Review'"), 'Weekly Review')
    assert.equal(cleanTitle('`Brand Voice`'), 'Brand Voice')
  })

  it('drops a trailing period, which reads as a cut-off sentence', () => {
    assert.equal(cleanTitle('Skill Definition and Ideas.'), 'Skill Definition and Ideas')
  })

  it('collapses whitespace', () => {
    assert.equal(cleanTitle('  Skill   Definition  '), 'Skill Definition')
  })

  it('truncates rather than letting a row grow', () => {
    const long = cleanTitle('word '.repeat(40))
    assert.ok(long.length <= 60, `${long.length} chars`)
    assert.ok(long.endsWith('…'))
  })

  it('returns empty for nothing usable, so the caller can keep the default', () => {
    assert.equal(cleanTitle('   '), '')
    assert.equal(cleanTitle('""'), '')
  })
})

describe('§15 naming without a model', () => {
  it('uses what they actually asked', () => {
    // Better than "Chat 4": the first thing someone asked is a real name for
    // the conversation, and needs no model to produce.
    assert.equal(
      fallbackTitle('Help me create a skill for triaging inbound bugs'),
      'Create a skill for triaging inbound bugs',
    )
  })

  it('strips the throat-clearing so the title is about the subject', () => {
    // Two openers stacked. Stripping only the first leaves "Help me plan the
    // sprint" — a title about asking rather than about the sprint.
    assert.equal(fallbackTitle('can you help me plan the sprint'), 'Plan the sprint')
    assert.equal(fallbackTitle('Hi, could you please draft the update'), 'Draft the update')
    assert.equal(fallbackTitle('Hey, summarise the release notes'), 'Summarise the release notes')
  })

  it('capitalises, so it does not read as a fragment', () => {
    assert.match(fallbackTitle('draft the client update'), /^Draft/)
  })

  it('keeps the default when there is nothing to name it after', () => {
    assert.equal(fallbackTitle('   '), DEFAULT_THREAD_TITLE)
    assert.equal(fallbackTitle(''), DEFAULT_THREAD_TITLE)
  })
})
