# A DAY BOX WRITES EVERY WHOLE DAY TYPED (`found-30-sep/sheet-dates-write-as-typed`, as the review found it in the
# sheet's subtask rows and date fields and the list page's row box and Table cell): the day "25" is written as the
# 2nd at its first key, then as the 25th.
# Reddens: task-values: "the sheet’s other date boxes write a day typed key by key once, when it is accepted: a subtask’s due day and a date field, typed “2” then “5”, send nothing while typed and keep their focus, and Enter writes the 25th — the subtask still due at 16:00, one PATCH and one due-date entry; the field one write (read by SQL)"
#   or "the list page’s date boxes write a day typed key by key once, when it is accepted, keeping the time: in a List view row and in the Table view’s due cell, “2” then “5” send nothing while typed — the cell stays open — and Enter writes the 25th, still at 16:00, one PATCH each, and closes the cell (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/components/date-time-box.tsx'
a = '      onChange={(e) => setDraft(e.target.value)}\n'
b = "      onChange={(e) => {\n        setDraft(e.target.value)\n        if (type === 'date' && e.target.value) void onCommit(toValue(e.target.value)).catch(() => undefined)\n      }}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-values-46-a-day-box-writes-each-day-typed: a day box writes at every day typed')
