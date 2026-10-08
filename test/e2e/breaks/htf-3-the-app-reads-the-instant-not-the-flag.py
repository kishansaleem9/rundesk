# The app reads whether a date carries a time from its instant, the task's flag
# given or not (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`).
#
# The flag is stored and answered, and nothing reads it: every UTC midnight is
# a date with no time again, so 17:00 in Los Angeles shows as 00:00 on the 9th,
# and its row on the 9th.
#
# Reddens: task-values:
#   "a time typed in the task sheet is read back as typed though it lands on UTC midnight: 17:00 on 8 October in Los Angeles (stored at 00:00 UTC on the 9th) and 05:00 in Karachi (00:00 UTC on the 8th), as 17:00 in UTC — each stored with its time flag (read by SQL)"
#   "and the list row shows it on its own day in Los Angeles, the 8th, not the 9th its UTC midnight falls on"
import io
p = '/home/user/rundesk/apps/web/src/lib/task-dates.ts'
a = "  if (hasTime !== undefined) return !hasTime\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('htf-3-the-app-reads-the-instant-not-the-flag: the flag is read by nothing')
