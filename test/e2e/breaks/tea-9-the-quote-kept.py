# AN ANSWER LANDS WITH THE QUOTE OF WHAT IT ANSWERS.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "the client’s answer, read from the Gmail, lands in the task once, under the email, without the quote of what it answers (read by SQL)"
#
# The answer’s words are kept whole.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-email-jobs.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("body: withoutQuote(m.text) || '(empty reply)'",
     "body: m.text || '(empty reply)'"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-9-the-quote-kept: AN ANSWER LANDS WITH THE QUOTE OF WHAT IT ANSWERS.')
