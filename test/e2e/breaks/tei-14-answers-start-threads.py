# AN ANSWER NAMES NOTHING IT ANSWERS: IT STARTS A THREAD OF ITS OWN.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "answering it by email goes through the same SMTP server in the same thread: In-Reply-To the answer, References the thread’s first email, kept under the same email (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/imap-mailbox.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    inReplyTo: answering?.internetMessageId ?? undefined,\n    references: references.length ? references : undefined,\n',
     '    inReplyTo: undefined,\n    references: undefined,\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-14-answers-start-threads: AN ANSWER NAMES NOTHING IT ANSWERS: IT STARTS A THREAD OF ITS OWN.')
