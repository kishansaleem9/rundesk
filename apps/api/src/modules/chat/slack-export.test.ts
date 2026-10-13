import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { zipOf } from '../../common/import/zip-test-kit'
import { compareTs, readSlackExport, slackEmoji, slackText, SlackExportError, SLACK_MESSAGES_PER_CHANNEL } from './slack-export'

/**
 * SLACK'S EXPORT READ AS ITS PUBLIC CHANNELS (`commit-log/log-601eacc-2`): the
 * zip Slack writes — `channels.json`, `users.json`, a folder of days a channel
 * — read into channels and messages; private channels and direct messages
 * counted, not read.
 */
const USERS = [
  { id: 'U1', name: 'ana', real_name: 'Ana Ruiz', profile: { display_name: 'Ana', real_name: 'Ana Ruiz', email: 'Ana@Example.com' } },
  { id: 'U2', name: 'ben', profile: { real_name: 'Ben Okafor', email: 'ben@elsewhere.org' } },
  { id: 'B1', name: 'deploybot', is_bot: true, profile: { real_name: 'Deploy Bot' } },
]
const CHANNELS = [
  { id: 'C1', name: 'general', is_archived: false, topic: { value: 'Company-wide' }, purpose: { value: 'Everyone' }, members: ['U1', 'U2'] },
  { id: 'C2', name: 'old-project', is_archived: true, topic: { value: '' }, purpose: { value: '' }, members: ['U1'] },
]

describe('readSlackExport — the public channels, their messages, threads and reactions', () => {
  it('reads each channel’s messages in order, its threads, its reactions, and leaves out the bookkeeping', async () => {
    const zip = await zipOf({
      'export/users.json': JSON.stringify(USERS),
      'export/channels.json': JSON.stringify(CHANNELS),
      'export/groups.json': JSON.stringify([{ id: 'G1', name: 'secret' }]),
      'export/dms.json': JSON.stringify([{ id: 'D1' }, { id: 'D2' }]),
      'export/mpims.json': JSON.stringify([{ id: 'M1' }]),
      'export/general/2026-10-01.json': JSON.stringify([
        { type: 'message', subtype: 'channel_join', user: 'U2', text: '<@U2> has joined the channel', ts: '1759300000.000100' },
        { type: 'message', user: 'U1', text: 'Kickoff at 10 &amp; bring <https://example.com/agenda|the agenda>', ts: '1759300100.000200', reactions: [{ name: '+1', users: ['U1', 'U2'], count: 2 }] },
        { type: 'message', user: 'U2', text: 'Will do', ts: '1759300200.000300', thread_ts: '1759300100.000200' },
      ]),
      'export/general/2026-10-02.json': JSON.stringify([
        { type: 'message', subtype: 'bot_message', username: 'Deploy Bot', bot_id: 'B1', text: 'Deployed v2', ts: '1759386600.000000' },
        { type: 'message', user: 'U1', text: '', files: [{ name: 'plan.pdf' }], ts: '1759386700.000100' },
      ]),
      'export/old-project/2026-09-01.json': JSON.stringify([{ type: 'message', user: 'U1', text: 'Archived talk', ts: '1756700000.000000' }]),
    })
    const exp = readSlackExport(zip)
    assert.deepEqual(exp.notImported, { privateChannels: 1, directMessages: 3 })
    assert.equal(exp.users.get('U1')!.email, 'ana@example.com')
    assert.equal(exp.users.get('B1')!.bot, true)
    const general = exp.channels.find((c) => c.name === 'general')!
    assert.equal(general.topic, 'Company-wide')
    assert.equal(general.purpose, 'Everyone')
    assert.deepEqual(general.messages.map((m) => [m.name, m.text, m.threadTs]), [
      ['Ana', 'Kickoff at 10 &amp; bring <https://example.com/agenda|the agenda>', null],
      ['Ben Okafor', 'Will do', '1759300100.000200'],
      ['Deploy Bot', 'Deployed v2', null],
      ['Ana', '[File: plan.pdf]', null],
    ])
    assert.deepEqual(general.messages[0].reactions, [{ name: '+1', users: ['U1', 'U2'] }])
    assert.equal(general.messages[0].at.toISOString(), '2025-10-01T06:28:20.000Z')
    assert.equal(exp.channels.find((c) => c.name === 'old-project')!.archived, true)
  })

  it('keeps the newest 10 000 messages of a channel, as ClickUp does, and says how many older ones it left', async () => {
    const many = Array.from({ length: SLACK_MESSAGES_PER_CHANNEL + 3 }, (_, n) => ({ type: 'message', user: 'U1', text: `m${n}`, ts: `${1700000000 + n}.000000` }))
    const zip = await zipOf({ 'users.json': JSON.stringify(USERS), 'channels.json': JSON.stringify([CHANNELS[0]]), 'general/2023-11-14.json': JSON.stringify(many) })
    const general = readSlackExport(zip).channels[0]
    assert.equal(general.messages.length, SLACK_MESSAGES_PER_CHANNEL)
    assert.equal(general.dropped, 3)
    assert.equal(general.messages[0].text, 'm3', 'the three oldest are the ones left behind')
  })

  it('refuses a zip that is no Slack export, saying where Slack makes one', async () => {
    await assert.rejects(async () => readSlackExport(await zipOf({ 'notes.txt': 'x' })), /no channels\.json.*Export/)
    assert.throws(() => readSlackExport(Buffer.from('nope')), SlackExportError)
  })
})

describe('slackText — Slack’s markup as a Chat message holds it', () => {
  const opts = {
    userName: (id: string) => ({ U1: 'Ana', U2: 'Ben' } as Record<string, string>)[id] ?? id,
    memberOf: (id: string) => (id === 'U1' ? '11111111-1111-4111-8111-111111111111' : null),
    channelName: (id: string) => (id === 'C1' ? 'general' : null),
  }

  it('a member here is mentioned as one; anyone else by name; channels, specials and links in words and Markdown', () => {
    const { body, mentions } = slackText(
      'Hi <@U1>, ask <@U2|ben> in <#C1|general> or <#C9>. <!here> &lt;3 &amp; see <https://example.com/x?a=1&amp;b=2|the doc> or <https://example.com/raw> or <mailto:a@b.co|a@b.co>',
      opts,
    )
    assert.equal(
      body,
      'Hi <@11111111-1111-4111-8111-111111111111>, ask @ben in #general or #channel. @here <3 & see [the doc](https://example.com/x?a=1&b=2) or https://example.com/raw or [a@b.co](mailto:a@b.co)',
    )
    assert.deepEqual(mentions, ['11111111-1111-4111-8111-111111111111'])
  })

  it('a reaction’s emoji is the character it draws; one it does not know keeps its :name:', () => {
    assert.equal(slackEmoji('+1'), '👍')
    assert.equal(slackEmoji('thumbsup::skin-tone-3'), '👍')
    assert.equal(slackEmoji('tada'), '🎉')
    assert.equal(slackEmoji('party-parrot'), ':party-parrot:')
  })

  it('ts values are in order by their seconds, then their microseconds', () => {
    assert.ok(compareTs('1759300100.000200', '1759300100.000300') < 0)
    assert.ok(compareTs('1759300101.000000', '1759300100.999999') > 0)
    assert.equal(compareTs('1.5', '1.500000'), 0)
  })
})
