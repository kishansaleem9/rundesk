# THE TASK SHEET WRITES A DATE AT EVERY WHOLE VALUE TYPED (`found-30-sep/sheet-dates-write-as-typed`), as its
# boxes' `onChange` did: the day "25" is written as the 2nd at its first key, a year "2027" as year 2.
# Reddens: task-values: "the task sheet writes a due date typed key by key once, when it is accepted: the day typed “2” then “5” sends nothing while it is typed, the box stays open and keeps its focus, and Enter writes the 25th at 16:00 — one PATCH, one due-date entry in the activity — in UTC and in Los Angeles (read by SQL)"
#   or "a year typed digit by digit is written once, as typed, when the box is left: 2, 0, 2, 7 into the start’s year sends nothing — never year 2 or 20 — until the box is left, and then 6 October 2027 09:00, in UTC and in Los Angeles (read by SQL)"
#   or "the sheet’s due box stays open while its write is out, and a date corrected meanwhile is written after it: Enter on the 25th, and while that write is held the box is enabled and keeps its focus; the 8th typed back then is kept, and Enter writes it once the 25th has landed — two PATCHes, in that order — so the task holds the 8th (read by SQL)"
#
# Re-aimed 6 October, by the review: the sheet's start and due boxes are the date-and-time kind of the `DateBox`
# every date box shares, so it is that kind which writes at each value typed.
import io
p = '/home/user/rundesk/apps/web/src/components/date-time-box.tsx'
a = '      onChange={(e) => setDraft(e.target.value)}\n'
b = "      onChange={(e) => {\n        setDraft(e.target.value)\n        if (type === 'datetime-local' && e.target.value) void onCommit(toValue(e.target.value)).catch(() => undefined)\n      }}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-values-40-the-sheet-writes-as-typed: every whole value typed is written')
