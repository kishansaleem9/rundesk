import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  analyzeSentimentDeterministic,
  formatBriefingFallback,
  briefingHasContent,
  type BriefingData,
} from './ai.service'

/**
 * §7.13 — the project-health comment-sentiment component and §7.11 — the daily
 * briefing both need a deterministic path that works with ANTHROPIC_API_KEY
 * unset. These lock down the keyword sentiment classifier and the briefing
 * template fallback the crons rely on when no model is configured.
 */

describe('analyzeSentimentDeterministic (§7.13)', () => {
  it('is a neutral 50 with no comments', () => {
    const r = analyzeSentimentDeterministic([])
    assert.equal(r.score, 50)
    assert.equal(r.label, 'neutral')
    assert.equal(r.samples, 0)
    assert.equal(r.source, 'deterministic')
  })

  it('ignores blank/whitespace-only comments', () => {
    const r = analyzeSentimentDeterministic(['', '   ', '\n'])
    assert.equal(r.samples, 0)
    assert.equal(r.score, 50)
  })

  it('scores clearly positive discussion high', () => {
    const r = analyzeSentimentDeterministic([
      'Great work, this is done and shipped!',
      'Thanks, looks good — approved.',
      'Nice, works perfectly now.',
    ])
    assert.equal(r.samples, 3)
    assert.equal(r.positive, 3)
    assert.equal(r.label, 'positive')
    assert.ok(r.score >= 60, `expected >=60, got ${r.score}`)
  })

  it('scores clearly negative discussion low', () => {
    const r = analyzeSentimentDeterministic([
      'This is blocked and broken.',
      'Still failing with an error, stuck.',
      'Bug is a blocker, urgent problem.',
    ])
    assert.equal(r.negative, 3)
    assert.equal(r.label, 'negative')
    assert.ok(r.score <= 40, `expected <=40, got ${r.score}`)
  })

  it('treats keyword-free chatter as neutral (score 50)', () => {
    const r = analyzeSentimentDeterministic(['Let us sync at 3pm.', 'Moved the file to the new folder.'])
    assert.equal(r.samples, 2)
    assert.equal(r.positive, 0)
    assert.equal(r.negative, 0)
    assert.equal(r.score, 50)
    assert.equal(r.label, 'neutral')
  })

  it('balances a mixed positive/negative pair to neutral', () => {
    const r = analyzeSentimentDeterministic(['done and great', 'blocked and broken'])
    assert.equal(r.positive, 1)
    assert.equal(r.negative, 1)
    assert.equal(r.score, 50)
  })
})

const emptyBriefing = (over: Partial<BriefingData> = {}): BriefingData => ({
  displayName: 'Ada Lovelace',
  dueToday: [],
  overdue: [],
  blocking: [],
  atRisk: [],
  ...over,
})

describe('formatBriefingFallback (§7.11)', () => {
  it('greets by first name and reassures when nothing is urgent', () => {
    const text = formatBriefingFallback(emptyBriefing())
    assert.match(text, /Ada/)
    assert.match(text, /Nothing urgent/i)
    assert.ok(text.length > 0)
  })

  it('leads with overdue, then blocking, then due-today, then at-risk', () => {
    const text = formatBriefingFallback(
      emptyBriefing({
        overdue: ['Overdue A'],
        blocking: ['Blocker B'],
        dueToday: ['Today C'],
        atRisk: ['Soon D'],
      }),
    )
    const iOverdue = text.indexOf('overdue')
    const iBlocking = text.indexOf('blocking others')
    const iDue = text.indexOf('due today')
    const iRisk = text.indexOf('at risk')
    assert.ok(iOverdue >= 0 && iBlocking > iOverdue && iDue > iBlocking && iRisk > iDue, text)
  })

  it('summarizes counts and lists the titles', () => {
    const text = formatBriefingFallback(emptyBriefing({ overdue: ['Ship release', 'Fix login'] }))
    assert.match(text, /2 overdue tasks/)
    assert.match(text, /Ship release/)
  })

  it('caps the visible titles and shows a +N more suffix', () => {
    const text = formatBriefingFallback(
      emptyBriefing({ dueToday: ['t1', 't2', 't3', 't4', 't5'] }),
    )
    assert.match(text, /\+2 more/)
  })
})

describe('briefingHasContent (§7.11)', () => {
  it('is false for an all-empty briefing', () => {
    assert.equal(briefingHasContent(emptyBriefing()), false)
  })
  it('is true when any bucket is non-empty', () => {
    assert.equal(briefingHasContent(emptyBriefing({ overdue: ['x'] })), true)
    assert.equal(briefingHasContent(emptyBriefing({ blocking: ['x'] })), true)
    assert.equal(briefingHasContent(emptyBriefing({ dueToday: ['x'] })), true)
    assert.equal(briefingHasContent(emptyBriefing({ atRisk: ['x'] })), true)
  })
})
