# EMAIL IS NEVER OFFERED, WHATEVER THE CLICKAPP SAYS.
# Re-aimed 9 October (`resume-defects/s4-composer-email`): this was
# tmn-7-email-selectable, which made the disabled Email row selectable while
# nothing could send a comment as email. Email sends now; the break is the
# working mode never offered, a workspace that turned it on finding it dead.
# Reddens: task-mentions: "Comment carries the tick, and Email — on in this workspace — is offered, with no reason against it"
#   or "choosing Email turns the box into an email — its fields over the words, and Send in place of Comment"
#
# Re-aimed 9 October: the last 1 of these are knock-ons of the same edit, measured on lane 10 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """  const emailAvailable = emailSetup.data?.available === true
"""
b = """  const emailAvailable = emailSetup.data?.available === true && !emailSetup.data // BROKEN: never offered
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: Email is never offered.")
