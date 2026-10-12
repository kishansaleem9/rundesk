# A GUEST SENDS EMAIL FROM A TASK.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: comment-email: "a guest who may comment on the task is told Email is not for guests, and a send is refused in words (403)"
#
# ClickUp keeps Email from guests; here a guest who may comment sends it.
#
# Re-aimed 12 October: a refusal now names the task's workspace too.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/comment-email.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (membership?.role === 'guest') return { task, workspaceId, refusal: { reason: 'guest', message: COMMENT_EMAIL_REFUSALS.guest, status: 403 } }\n",
     "    if (membership?.role === 'guest' && false) return { task, workspaceId, refusal: { reason: 'guest', message: COMMENT_EMAIL_REFUSALS.guest, status: 403 } } // BROKEN: guests send\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-2-a-guest-sends-email: A GUEST SENDS EMAIL FROM A TASK.')
