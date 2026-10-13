import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CONNECTED_REFUSALS,
  checkedDraft,
  checkedEvent,
  planCalendarEvent,
  planEmailDraft,
  wallTime,
  zonedInstant,
  type ConnectedContext,
} from './ai-connected'
import { planFromToolCalls, type CommandContext } from './ai-command'

/**
 * `ledger-rows/row-2294` — the planner's half of the AI acting in a person's
 * own connected apps: what a model's call becomes before anybody confirms it.
 */

const WS = '11111111-1111-4111-8111-111111111111'
const connected = (over: Partial<ConnectedContext> = {}): ConnectedContext => ({
  calendar: { provider: 'gcal', email: 'olga@gmail.test' },
  mailbox: { id: '22222222-2222-4222-8222-222222222222', provider: 'gmail', address: 'olga@gmail.test' },
  timeZone: 'Asia/Karachi',
  ...over,
})
const ctx = (over: Partial<ConnectedContext> = {}): CommandContext => ({
  today: '2026-10-13',
  lists: [],
  members: [],
  tasks: [],
  workspaceId: WS,
  connected: connected(over),
})

describe('a wall-clock time in the asker’s own zone', () => {
  it('is the instant that time names there', () => {
    assert.equal(zonedInstant('2026-10-14T10:00', 'Asia/Karachi')?.toISOString(), '2026-10-14T05:00:00.000Z')
    assert.equal(zonedInstant('2026-10-14T10:00', 'UTC')?.toISOString(), '2026-10-14T10:00:00.000Z')
    // New York is four hours behind UTC in October, five in December.
    assert.equal(zonedInstant('2026-10-14T10:00', 'America/New_York')?.toISOString(), '2026-10-14T14:00:00.000Z')
    assert.equal(zonedInstant('2026-12-14T10:00', 'America/New_York')?.toISOString(), '2026-12-14T15:00:00.000Z')
    // And half-hour zones are half an hour.
    assert.equal(zonedInstant('2026-10-14T10:00', 'Asia/Kolkata')?.toISOString(), '2026-10-14T04:30:00.000Z')
  })

  it('takes the offset of its own side of a daylight-saving change', () => {
    // 1 November 2026, 03:00 in New York is after the clocks went back (EST, UTC−5).
    assert.equal(zonedInstant('2026-11-01T03:00', 'America/New_York')?.toISOString(), '2026-11-01T08:00:00.000Z')
    // 7 March 2026, 23:00 is before they went forward (EST, UTC−5); 9 March, 09:00 after (EDT, UTC−4).
    assert.equal(zonedInstant('2026-03-07T23:00', 'America/New_York')?.toISOString(), '2026-03-08T04:00:00.000Z')
    assert.equal(zonedInstant('2026-03-09T09:00', 'America/New_York')?.toISOString(), '2026-03-09T13:00:00.000Z')
  })

  it('is no instant when the day, the time or the zone is not one', () => {
    assert.equal(zonedInstant('2026-02-30T10:00', 'UTC'), null)
    assert.equal(zonedInstant('2026-10-14T24:00', 'UTC'), null)
    assert.equal(zonedInstant('tomorrow at ten', 'UTC'), null)
    assert.equal(zonedInstant('2026-10-14T10:00', 'Mars/Olympus'), null)
  })

  it('reads back as the clock reads it there', () => {
    assert.equal(wallTime(new Date('2026-10-14T05:00:00Z'), 'Asia/Karachi'), '2026-10-14 10:00')
    assert.equal(wallTime(new Date('2026-10-14T23:30:00Z'), 'Asia/Karachi'), '2026-10-15 04:30')
  })
})

describe('create_calendar_event, planned', () => {
  it('is an event in the asker’s own calendar, at their local time, said back in their zone', () => {
    const planned = planCalendarEvent(
      { title: 'Design review', start: '2026-10-14T10:00', durationMinutes: 45, attendeeEmails: ['mia@x.test', 'Client@Example.com'], location: 'Room 4' },
      WS,
      connected(),
    )
    assert.ok('action' in planned, JSON.stringify(planned))
    if (!('action' in planned) || planned.action.tool !== 'create_calendar_event') return
    assert.deepEqual(planned.action.args, {
      workspaceId: WS,
      timeZone: 'Asia/Karachi',
      title: 'Design review',
      start: '2026-10-14T05:00:00.000Z',
      end: '2026-10-14T05:45:00.000Z',
      location: 'Room 4',
      attendees: ['mia@x.test', 'client@example.com'],
    })
    assert.equal(
      planned.action.humanLabel,
      'Add “Design review” to your Google Calendar (olga@gmail.test) on 2026-10-14 10:00–10:45 (Asia/Karachi), inviting mia@x.test and client@example.com',
    )
  })

  it('lasts half an hour when nobody said how long', () => {
    const planned = planCalendarEvent({ title: 'Standup', start: '2026-10-14T09:00' }, WS, connected({ timeZone: 'UTC' }))
    assert.ok('action' in planned && planned.action.tool === 'create_calendar_event' && planned.action.args.end === '2026-10-14T09:30:00.000Z')
  })

  it('is refused in words, never guessed: no calendar, no start, an address that is not one, too long', () => {
    const none = planCalendarEvent({ title: 'Standup', start: '2026-10-14T09:00' }, WS, connected({ calendar: null }))
    assert.ok('warning' in none && none.warning.includes(CONNECTED_REFUSALS.noCalendar), JSON.stringify(none))
    const noStart = planCalendarEvent({ title: 'Standup', start: 'soon' }, WS, connected())
    assert.ok('warning' in noStart && noStart.warning.includes('needs a start'), JSON.stringify(noStart))
    const badAddress = planCalendarEvent({ title: 'Standup', start: '2026-10-14T09:00', attendeeEmails: ['mia'] }, WS, connected())
    assert.ok('warning' in badAddress && badAddress.warning.includes('“mia” is not an email address'), JSON.stringify(badAddress))
    const tooLong = planCalendarEvent({ title: 'Retreat', start: '2026-10-14T09:00', durationMinutes: 60 * 25 }, WS, connected())
    assert.ok('warning' in tooLong && tooLong.warning.includes('lasts 5 minutes to 24 hours'), JSON.stringify(tooLong))
  })

  it('takes a zone the runtime does not know as UTC, and says so', () => {
    const planned = planCalendarEvent({ title: 'Standup', start: '2026-10-14T09:00' }, WS, connected({ timeZone: 'Mars/Olympus' }))
    assert.ok('action' in planned && planned.action.tool === 'create_calendar_event')
    if (!('action' in planned)) return
    assert.equal(planned.action.args.start, '2026-10-14T09:00:00.000Z')
    assert.ok(planned.action.humanLabel.includes('(UTC)'))
  })
})

describe('draft_email, planned', () => {
  it('is a draft in a mailbox the asker linked, never a send', () => {
    const planned = planEmailDraft({ to: ['client@example.com'], cc: ['mia@x.test'], subject: 'Quote', body: 'Here it is.' }, WS, connected())
    assert.ok('action' in planned && planned.action.tool === 'draft_email', JSON.stringify(planned))
    if (!('action' in planned) || planned.action.tool !== 'draft_email') return
    assert.deepEqual(planned.action.args, {
      workspaceId: WS,
      accountId: '22222222-2222-4222-8222-222222222222',
      to: ['client@example.com'],
      cc: ['mia@x.test'],
      subject: 'Quote',
      body: 'Here it is.',
    })
    assert.equal(planned.action.humanLabel, 'Save a draft in olga@gmail.test (Gmail) to client@example.com, copying mia@x.test: “Quote”')
  })

  it('is refused in words: no mailbox (and why, where there is a why), nobody to send to, no words', () => {
    const none = planEmailDraft({ to: ['a@x.test'], subject: 'Hi', body: 'Hello' }, WS, connected({ mailbox: null }))
    assert.ok('warning' in none && none.warning.includes(CONNECTED_REFUSALS.noMailbox), JSON.stringify(none))
    const off = planEmailDraft({ to: ['a@x.test'], subject: 'Hi', body: 'Hello' }, WS, connected({ mailbox: null, mailboxRefusal: 'Email is off in this workspace' }))
    assert.ok('warning' in off && off.warning.includes('Email is off in this workspace') && !off.warning.includes(CONNECTED_REFUSALS.noMailbox))
    const nobody = planEmailDraft({ to: [], subject: 'Hi', body: 'Hello' }, WS, connected())
    assert.ok('warning' in nobody && nobody.warning.includes('An email needs somebody to go to'), JSON.stringify(nobody))
    const empty = planEmailDraft({ to: ['a@x.test'], subject: 'Hi', body: '   ' }, WS, connected())
    assert.ok('warning' in empty && empty.warning.includes('A draft needs words'), JSON.stringify(empty))
  })
})

describe('what the executor checks again, as it came back in the body', () => {
  it('an event between 5 minutes and a day, with real addresses', () => {
    const at = (iso: string) => new Date(iso)
    assert.equal(checkedEvent({ title: 'x', start: at('2026-10-14T05:00:00Z'), end: at('2026-10-14T05:04:00Z') }).ok, false)
    assert.equal(checkedEvent({ title: 'x', start: at('2026-10-14T05:00:00Z'), end: at('2026-10-15T05:01:00Z') }).ok, false)
    assert.equal(checkedEvent({ title: '', start: at('2026-10-14T05:00:00Z'), end: at('2026-10-14T06:00:00Z') }).ok, false)
    assert.equal(checkedEvent({ title: 'x', start: at('2026-10-14T05:00:00Z'), end: at('2026-10-14T06:00:00Z'), attendees: ['not an address'] }).ok, false)
    assert.equal(checkedEvent({ title: 'x', start: at('2026-10-14T05:00:00Z'), end: at('2026-10-14T06:00:00Z'), attendees: ['a@x.test'] }).ok, true)
  })

  it('a draft with somebody to go to and words', () => {
    assert.equal(checkedDraft({ to: ['a@x.test'], subject: 'Hi', body: 'Hello' }).ok, true)
    assert.equal(checkedDraft({ to: ['a@x.test<b@y.test>'], subject: 'Hi', body: 'Hello' }).ok, false)
    assert.equal(checkedDraft({ to: ['a@x.test'], subject: 'Hi', body: 'x'.repeat(20_001) }).ok, false)
  })
})

describe('the plan, from the model’s calls', () => {
  it('previews an event and a draft as actions, and keeps what a search found', () => {
    const plan = planFromToolCalls(
      [
        { name: 'create_calendar_event', input: { title: 'Design review', start: '2026-10-14T10:00' } },
        { name: 'draft_email', input: { to: ['client@example.com'], subject: 'Quote', body: 'Here it is.' } },
        {
          name: 'search_connected_apps',
          input: { query: 'roadmap' },
          result: { query: 'roadmap', hits: [{ source: 'drive', title: 'Roadmap', url: 'https://drive.google.test/file/d/r/view', snippet: '' }] },
        },
      ],
      ctx(),
    )
    assert.deepEqual(plan.actions.map((a) => a.tool), ['create_calendar_event', 'draft_email'])
    assert.deepEqual(plan.connectedResults, [{ query: 'roadmap', hits: [{ source: 'drive', title: 'Roadmap', url: 'https://drive.google.test/file/d/r/view', snippet: '' }] }])
    assert.deepEqual(plan.warnings, [])
    assert.equal(plan.summary, 'Proposed 2 changes: 1 calendar event, 1 email draft.')
  })

  it('says what a search found when it is all there is, and why when it searched nothing', () => {
    const found = planFromToolCalls(
      [{ name: 'search_connected_apps', input: { query: 'roadmap' }, result: { query: 'roadmap', hits: [{ source: 'gmail', title: 'Re: roadmap', url: 'https://mail.google.com/x', snippet: 'see attached' }] } }],
      ctx(),
    )
    assert.equal(found.summary, 'Found 1 result in your connected apps. No changes were proposed.')
    const refused = planFromToolCalls(
      [{ name: 'search_connected_apps', input: { query: 'roadmap' }, result: { query: 'roadmap', hits: [], refusal: CONNECTED_REFUSALS.noSearchSource } }],
      ctx(),
    )
    assert.deepEqual(refused.connectedResults, [])
    assert.ok(refused.warnings[0]?.includes(CONNECTED_REFUSALS.noSearchSource), JSON.stringify(refused.warnings))
    const unanswered = planFromToolCalls([{ name: 'search_connected_apps', input: { query: 'roadmap' } }], ctx())
    assert.ok(unanswered.warnings[0]?.includes('it was not answered'), JSON.stringify(unanswered.warnings))
  })

  it('refuses a connected tool where nothing says what the asker has connected', () => {
    const plan = planFromToolCalls([{ name: 'create_calendar_event', input: { title: 'x', start: '2026-10-14T10:00' } }], {
      today: '2026-10-13',
      lists: [],
      members: [],
      tasks: [],
    })
    assert.deepEqual(plan.actions, [])
    assert.ok(plan.warnings[0]?.includes(CONNECTED_REFUSALS.noCalendar), JSON.stringify(plan.warnings))
  })
})
