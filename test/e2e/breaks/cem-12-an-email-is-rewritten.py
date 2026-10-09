# WHAT AN EMAIL SAID IS EDITED AFTER IT WENT.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: comment-email: "what an email said is what went: an edit is refused in words (400), and the thread offers none"
#
# The task's copy of a sent email can be rewritten, so it no longer says what went.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (existing.channel === 'email') throw new BadRequestException('An email cannot be edited once it is sent')\n",
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-12-an-email-is-rewritten: WHAT AN EMAIL SAID IS EDITED AFTER IT WENT.')
