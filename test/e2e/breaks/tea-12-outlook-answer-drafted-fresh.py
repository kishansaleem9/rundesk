# AN ANSWER FROM OUTLOOK IS A NEW EMAIL.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "answered by email from Outlook, it is made as Graph’s reply to the answer, in the same conversation"
#
# Graph is not asked for a reply, so the answer is a new conversation. (A condition that
# is false where it runs and typed where it is read: `false && …` left the block unreachable
# to TypeScript, which then read `draft.id` as possibly undefined and refused to build.)
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/mailbox.client.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (answering?.providerMessageId) {',
     "  if (answering?.providerMessageId && answering.providerMessageId === 'never-an-id') {"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-12-outlook-answer-drafted-fresh: AN ANSWER FROM OUTLOOK IS A NEW EMAIL.')
