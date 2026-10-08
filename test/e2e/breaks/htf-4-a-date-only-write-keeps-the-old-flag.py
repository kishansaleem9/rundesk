# A date written without a time flag keeps the flag of the date it replaced
# (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`).
#
# The update writes the flags only when a flag is sent, so a task due at a time
# and then given a date with no time by an API client, an import or the AI
# still says its new date carries a time: in Los Angeles a task due "the 20th"
# shows 17:00 on the 19th.
#
# And a time written alone keeps the no-time flag of what it replaced: a start
# of year 2 at 09:00, PATCHed without a flag on a task that had none, shows in
# the sheet as 00:00.
#
# Reddens: task-values:
#   "the API keeps the flag a write sends, and reads one not sent from the instant: 00:00 UTC sent alone is a date with no time, sent with `dueDateHasTime: true` a time — answered on the task — and 09:30 a time; a later date-only write leaves no time behind; and a flag that is not true or false is refused in words, 400 (read by SQL)"
#   "and the task sheet shows that start as 0002-10-06 09:00, the date it holds, not 10 February 2006 or an empty box"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    Object.assign(set, flags)\n"
b = "    if (patch.startDateHasTime !== undefined || patch.dueDateHasTime !== undefined) Object.assign(set, flags)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('htf-4-a-date-only-write-keeps-the-old-flag: a date written alone keeps the old flag')
