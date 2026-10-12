# EVERY PLAN SCHEDULES.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "on Free a mailbox sends its 100 emails and then is refused in words, nothing sent; and Free does not schedule (403)"
#
# A send time is kept whatever the plan.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/comment-email.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (!email.scheduling) throw new ForbiddenException(EMAIL_PLAN_REFUSALS.scheduling(planLabel))\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-16-every-plan-schedules: EVERY PLAN SCHEDULES.')
