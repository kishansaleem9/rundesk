# THE DRAFT IS SENT.
# (`ledger-rows/row-2294`)
# Reddens: ai-connected-apps: "confirmed, the email is a draft in her own Gmail — to the client, copying Mia, its subject and words — nothing is sent, and the result says where it is"
#
# Gmail's `messages.send` in place of `drafts.create`: the client has the email before the person read it.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/mailbox.client.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    const res = await call(grant, `${gmailBase()}/users/me/drafts`, { method: 'POST', body: JSON.stringify({ message: { raw } }) })\n    const draft = (await res.json()) as { id?: string; message?: { id?: string } }\n",
     "    const res = await call(grant, `${gmailBase()}/users/me/messages/send`, { method: 'POST', body: JSON.stringify({ raw }) })\n    const sent = (await res.json()) as { id?: string }\n    const draft = { id: sent.id, message: { id: sent.id } }\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-6-the-draft-is-sent: the draft is sent instead of kept')
