# AN ANSWER FROM GMAIL STARTS A NEW THREAD.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "answering it by email goes from the Gmail in the same thread, naming the answer it answers, and is kept under the same email (read by SQL)"
#
# Gmail is not told which thread the answer is in.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/mailbox.client.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      body: JSON.stringify({ raw, ...(answering?.threadId ? { threadId: answering.threadId } : {}) }),',
     '      body: JSON.stringify({ raw }),'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-11-gmail-answer-new-thread: AN ANSWER FROM GMAIL STARTS A NEW THREAD.')
