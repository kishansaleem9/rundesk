# A task date's time flag is read from its instant even when a write sends one
# (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`).
#
# `taskDateTimeFlags` takes the instant's word over the sender's: 17:00 typed
# in Los Angeles is UTC midnight, so it is stored as a date with no time and
# read back as 00:00 on the 9th, as before the flag was kept.
#
# Reddens: task-values:
#   "a time typed in the task sheet is read back as typed though it lands on UTC midnight: 17:00 on 8 October in Los Angeles (stored at 00:00 UTC on the 9th) and 05:00 in Karachi (00:00 UTC on the 8th), as 17:00 in UTC — each stored with its time flag (read by SQL)"
#   "and the list row shows it on its own day in Los Angeles, the 8th, not the 9th its UTC midnight falls on"
#   "the API keeps the flag a write sends, and reads one not sent from the instant: 00:00 UTC sent alone is a date with no time, sent with `dueDateHasTime: true` a time — answered on the task — and 09:30 a time; a later date-only write leaves no time behind; and a flag that is not true or false is refused in words, 400 (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-date-input.ts'
a = "    return sent ?? !isUtcMidnight(date)\n"
b = "    return !isUtcMidnight(date)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('htf-1-a-sent-time-flag-is-not-kept: the instant decides the flag')
