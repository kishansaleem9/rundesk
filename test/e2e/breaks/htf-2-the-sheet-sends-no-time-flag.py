# The task sheet's due box writes its date without the time flag
# (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`).
#
# The API reads a date sent without one from its instant, so 17:00 typed in
# Los Angeles and 05:00 in Karachi, each UTC midnight, are stored as dates with
# no time and come back as 00:00.
#
# Reddens: task-values:
#   "a time typed in the task sheet is read back as typed though it lands on UTC midnight: 17:00 on 8 October in Los Angeles (stored at 00:00 UTC on the 9th) and 05:00 in Karachi (00:00 UTC on the 8th), as 17:00 in UTC — each stored with its time flag (read by SQL)"
#   "and the list row shows it on its own day in Los Angeles, the 8th, not the 9th its UTC midnight falls on"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "            onCommit={(dueDate, dueDateHasTime) => patchTask.mutateAsync({ dueDate, dueDateHasTime })}\n"
b = "            onCommit={(dueDate) => patchTask.mutateAsync({ dueDate })}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('htf-2-the-sheet-sends-no-time-flag: the due box sends its date alone')
