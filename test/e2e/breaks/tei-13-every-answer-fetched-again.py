# WHAT IS ALREADY IN ITS TASK IS FETCHED WHOLE AGAIN, EVERY READ.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "the client’s answer, delivered to the inbox naming the email it answers, lands in the task once, under the email, without its quote — and later reads do not fetch it again (read by SQL and from the server’s fetches)"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/imap-mailbox.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const seen = await known([...idOf.values()])\n',
     '    const seen = new Set<string>()\n    void known\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-13-every-answer-fetched-again: WHAT IS ALREADY IN ITS TASK IS FETCHED WHOLE AGAIN, EVERY READ.')
