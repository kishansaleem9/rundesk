# ANYBODY WHO LEARNS THE ADDRESS WRITES INTO THE TASK.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: comment-email: "a stranger who writes to the same address is refused, and nothing is written in anybody’s name"
#   or "the answer is drawn as from its sender; Reply by email fills in whom and “Re:”, and the email sent names the answer it answers and joins the same thread"
#
# Re-aimed 9 October: the last 1 of these are knock-ons of the same edit, measured on lane 10 — checks that stand on what the first ones lost.
#
# A stranger's mail to an email's own address is taken as its writer's thread.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/email-to-task.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      fromRecipient: [...row.to, ...row.cc, ...row.bcc].some((a) => a.toLowerCase() === from),\n',
     '      fromRecipient: from.length > 0 || [...row.to, ...row.cc, ...row.bcc].some((a) => a.toLowerCase() === from), // BROKEN: anybody\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-7-a-stranger-answers: ANYBODY WHO LEARNS THE ADDRESS WRITES INTO THE TASK.')
