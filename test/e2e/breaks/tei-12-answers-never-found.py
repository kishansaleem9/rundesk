# THE INBOX IS SEARCHED FOR NOTHING: NO ANSWER IS EVER READ.
# (`found-12-oct/task-email-imap-unbuilt`)
# Reddens: task-email-imap: "the client’s answer, delivered to the inbox naming the email it answers, lands in the task once, under the email, without its quote — and later reads do not fetch it again (read by SQL and from the server’s fetches)"
#   or "answering it by email goes through the same SMTP server in the same thread: In-Reply-To the answer, References the thread’s first email, kept under the same email (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/imap-mailbox.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const uids = await s.uidSearch(`OR HEADER References "${id}" HEADER In-Reply-To "${id}"`)\n',
     '    const uids = await s.uidSearch(`HEADER Message-ID "${id}"`)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tei-12-answers-never-found: THE INBOX IS SEARCHED FOR NOTHING: NO ANSWER IS EVER READ.')
