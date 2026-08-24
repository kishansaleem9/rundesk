import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Walk up to the workspace root: this compiles to CJS, so no import.meta. */
function workspaceRoot(from: string): string {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const up = dirname(dir)
    if (up === dir) throw new Error('workspace root not found')
    dir = up
  }
}
const read = (rel: string) => readFileSync(join(workspaceRoot(process.cwd()), rel), 'utf8')

/**
 * §12 [14:52–15:03] — forwarding a message, and getting back to it.
 *
 * > "main kisi ko FORWARD bhi kar sakti hoon message … see, aap ke yahan pe aa
 * >  gaya hai message ke maine aap ko message forward kiya. Aap 'View Message'
 * >  dekhoge to aap us group mein chale jaoge."
 *
 * Forwarding posted the body text as a new message and kept nothing else, so
 * the recipient got something indistinguishable from a message somebody typed,
 * with no route back. Two things make that a forward instead: the copy records
 * its source, and the source is resolved *for the person reading it*.
 *
 * That second point is the one with teeth. Forwarding is authorised against the
 * forwarder; the recipient may have no business in the source channel at all.
 * Handing them a working link would be an invitation to a room they were never
 * in — a permission leak dressed as a convenience.
 */
/**
 * §14 [16:41] — a reply in a chat thread has to reach the Replies page.
 *
 * > "Ab yahan pe jo REPLY wapas hai — yeh wohi cheez hai … agar aap bhi yahan
 * >  reply karte ho na, koi NEW MESSAGE likhte ho — to phir jo hai woh mujhe
 * >  yahan show hoga UNREAD mein."
 *
 * It could not. Replies filtered on task_commented and doc_commented, and a
 * thread reply was recorded as an ordinary chat_message — so the one surface
 * built for replies was the one place chat replies never appeared. Nothing
 * errored; the page was simply always missing them.
 */
describe('§14 a chat reply is its own kind', () => {
  const service = read('apps/api/src/modules/chat/chat.service.ts')
  const repliesPage = read('apps/web/src/pages/workspace-replies-page.tsx')

  it('types a threaded message as a reply, and a top-level one as a message', () => {
    assert.match(
      service,
      /type: data\.parentMessageId \? 'chat_reply' : 'chat_message'/,
      'every chat message is still recorded as the same kind',
    )
  })

  it('and the Replies page looks for it', () => {
    assert.match(repliesPage, /REPLY_TYPES = new Set\(\[[^\]]*'chat_reply'/, 'Replies still ignores chat')
  })

  it('but not every chat message — Replies is not a second Inbox', () => {
    // Folding plain chat_message in would fill this page with channel traffic
    // nobody replied to, which is the opposite of what it is for.
    const set = /REPLY_TYPES = new Set\(\[([^\]]*)\]/.exec(repliesPage)?.[1] ?? ''
    assert.ok(set, 'could not read REPLY_TYPES')
    assert.ok(!/'chat_message'/.test(set), `Replies swallows all chat: ${set}`)
  })

  it('is offered in the Primary customiser like any other kind', async () => {
    const { PRIMARY_SELECTABLE_TYPES } = await import('../notifications/notifications.service')
    assert.ok(
      (PRIMARY_SELECTABLE_TYPES as readonly string[]).includes('chat_reply'),
      'a kind that cannot be turned off is a kind you are stuck with',
    )
  })
})

/**
 * §12 [15:31] — a saved message, and what you can do with it.
 *
 * > "aap Inbox mein jaoge, LATER mein jaoge, to aap ko woh message show hoga;
 * >  aap us pe click karoge to aap ke paas woh poora message hoga; aap us ko
 * >  EDIT bhi kar sakte ho, aap us ko ASSIGN bhi kar sakte ho, aap us ke THREAD
 * >  mein bhi jaa sakte ho."
 *
 * Those three actions live on the message in chat, and the Later row has always
 * opened it — but silently, with nothing on the row saying so. The frame pass
 * read that as the actions being missing; the honest reading is that they were
 * unreachable-looking rather than unreachable.
 *
 * Fixed by making the row say what it does, not by growing a second edit and
 * assign inside the Inbox: two implementations of the same action drift, and
 * the copy here would be the poorer one.
 */
describe('§12 a saved message opens where its actions are', () => {
  const inbox = read('apps/web/src/pages/workspace-inbox-page.tsx')
  const chat = read('apps/web/src/pages/workspace-chat-page.tsx')

  it('the Later row says it opens the message', () => {
    assert.match(inbox, /data-testid=\{`saved-open-\$\{msg\.id\}`\}/, 'the row gives no affordance')
  })

  it('and opens it at the message, not just the channel', () => {
    const row = /savedMessages\.map\(\(msg\) => \(([\s\S]*?)\n {16}\)\)/.exec(inbox)?.[1] ?? inbox
    assert.match(row, /search: \{ channel: msg\.channelId, message: msg\.id \}/,
      'lands on the channel without finding the message')
  })

  it('where edit, assign and the thread actually are', () => {
    // The claim the row is making on chat's behalf. If these ever move, the
    // affordance above becomes a promise the destination does not keep.
    assert.match(chat, /setEditingBody\(m\.body\)/, 'no edit on a chat message')
    assert.match(chat, /createTaskFromMessage/, 'no assign on a chat message')
    assert.match(chat, /setThreadParentId\(parentId\)/, 'no thread to open')
  })
})

describe('§12 forwarding carries its origin', () => {
  const service = read('apps/api/src/modules/chat/chat.service.ts')
  const controller = read('apps/api/src/modules/chat/chat.controller.ts')
  const page = read('apps/web/src/pages/workspace-chat-page.tsx')
  const schema = read('packages/db/src/schema/chat.ts')

  it('records where a forward came from', () => {
    assert.match(schema, /forwardedFromId: uuid\('forwarded_from_id'\)/)
    assert.match(controller, /forwardedFromId: body\.forwardedFromId/, 'the endpoint drops the source')
    assert.match(service, /forwardedFromId,/, 'the insert does not store the source')
  })

  it('deleting the original does not delete every copy of it', () => {
    // SET NULL, unlike the thread parent's CASCADE. A forward is its own
    // message; it should survive its source and lose only the link.
    const column = /forwarded_from_id[\s\S]{0,200}/.exec(schema)?.[0] ?? ''
    assert.match(column, /onDelete: 'set null'/, `forwards cascade-delete: ${column.slice(0, 120)}`)
    const migration = read('packages/db/src/migrations/0099_message_forwarding.sql')
    assert.match(migration, /ON DELETE SET NULL/i)
  })

  it('will not forward from a channel the sender cannot read', () => {
    /*
     * Without this, forwarding an id you were never allowed to see would mint a
     * permanent, followable reference to it. The source is looked up and access
     * checked before anything is recorded.
     */
    const post = /async postMessage\(([\s\S]*?)\n {2}async /.exec(service)?.[1] ?? ''
    assert.ok(post, 'could not find postMessage')
    assert.match(
      post,
      /if \(data\.forwardedFromId\)[\s\S]{0,600}?assertChannelAccess\(source\.channelId, data\.authorId\)/,
      'the forward source is stored without checking the sender can read it',
    )
  })

  it('resolves the link against the reader, not the forwarder', () => {
    /*
     * The heart of it. These are different people, and the check that mattered
     * at write time answers the wrong question at read time.
     */
    const list = /async listMessages\(([\s\S]*?)\n {2}async /.exec(service)?.[1] ?? ''
    assert.ok(list, 'could not find listMessages')
    assert.match(
      list,
      /chatChannelMembers\.userId, userId/,
      "the reader's own channels are never consulted",
    )
    assert.match(
      list,
      /const reachable = \(!src\.isPrivate && !src\.isDm\) \|\| myChannels\.has\(src\.channelId\)/,
      'reachability is not computed from the reader and the channel',
    )
    assert.match(
      list,
      /reachable \?[\s\S]{0,120}?: null/,
      'an unreachable source still yields a followable link',
    )
  })

  it('still says a message was forwarded when the source is out of reach', () => {
    // The label is true either way; only the link is conditional. Dropping both
    // would misrepresent the message as something the sender wrote.
    assert.match(
      page,
      /m\.forwardedFromId && \([\s\S]{0,600}?m\.forwardedFrom && \(/,
      'the banner and the link are gated on the same thing',
    )
  })

  it('sends the source id, and no longer pastes a prefix', () => {
    assert.match(page, /forwardedFromId: sourceId/, 'the client does not send the source')
    assert.match(page, /sourceId: m\.id/, 'the forward does not name the message being forwarded')
    /*
     * The old version pasted a "Forwarded message:" prefix into the body, which
     * became part of the text as soon as anyone forwarded it onward again.
     * Asserted positively — that the untouched body is what gets sent — because
     * scanning the file for the old prefix also matched the comment explaining
     * why it is gone, and failed on correct code.
     */
    const forwardCall = /forwardMutation\.mutate\(\{([\s\S]*?)\}\)/.exec(page)?.[1] ?? ''
    assert.ok(forwardCall, 'could not find the forward call')
    assert.match(forwardCall, /body: m\.body,/, `the body is being altered: ${forwardCall.trim()}`)
  })
})
