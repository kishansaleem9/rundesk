# AN ANSWER LANDS ON ITS OWN, UNDER NO EMAIL.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: comment-email: "an answer from somebody it went to lands in the task, under the email, as an email that came in from them (read by SQL)"
#   or "the answer is drawn as from its sender; Reply by email fills in whom and “Re:”, and the email sent names the answer it answers and joins the same thread"
#
# Re-aimed 9 October: the last 1 of these are knock-ons of the same edit, measured on lane 10 — checks that stand on what the first ones lost.
#
# The answer is kept, but not in the thread of the email it answers.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/email-to-task.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        ...(thread ? { channel: 'email', parentCommentId: thread.rootId } : {}),\n",
     "        ...(thread ? { channel: 'email' } : {}), // BROKEN: no thread\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-8-an-answer-joins-no-thread: AN ANSWER LANDS ON ITS OWN, UNDER NO EMAIL.')
